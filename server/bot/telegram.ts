import TelegramBot from 'node-telegram-bot-api';
import { storage } from "../storage";
import axios from 'axios';
import { conversationFlow } from '../conversationFlow';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramBotConfig {
  token: string;
}

export const sendTelegramMessage = async (chatId: string, text: string) => {
  try {
    const res = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
    });

    console.log(`✅ Message sent to Telegram user ${chatId}: ${text}`);
    return res.data;
  } catch (error: any) {
    console.error("❌ Telegram message send failed:", error.response?.data || error.message);
    throw error;
  }
};

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private isActive: boolean = true;
  private userSessions: Map<string, any> = new Map();
  private webSessionMapping: Map<number, string> = new Map(); // Maps numeric IDs to session UUIDs
  private inquirySessionMapping = new Map<string, string>(); // 🆕 ADD THIS LINE
  private token: string;
  private isStarted = false;

  constructor(config: TelegramBotConfig) {
    this.token = config.token;
  }

  private initializeBot() {
    if (this.bot) return;

    const token = this.token || process.env.TELEGRAM_BOT_TOKEN;

    if (!token || token === "demo_token" || token === "") {
      console.error("❌ No valid Telegram bot token found!");
      throw new Error("Telegram bot token is required");
    }

    console.log("🤖 Initializing Telegram bot with token:", token.substring(0, 10) + "...");

    try {
      this.bot = new TelegramBot(token, {
        polling: {
          interval: 300,
          autoStart: false,
          params: {
            timeout: 10
          }
        }
      });
    } catch (error) {
      console.error("❌ Failed to create Telegram bot:", error);
      throw error;
    }
  }

  async start(useWebhook = false) {
    try {
      this.initializeBot();

      if (!this.bot) {
        throw new Error("Failed to initialize Telegram bot");
      }

      this.isActive = true;
      const me = await this.bot.getMe();
      console.log('✅ Bot verified:', me.username, `(@${me.username})`);

      if (!useWebhook) {
        try {
          if (this.bot.isPolling) {
            await this.bot.stopPolling();
            console.log('🛑 Stopped existing polling');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err) {
          console.log('No existing polling to stop');
        }

        await this.bot.startPolling();
        console.log('✅ Telegram bot started with polling');

        this.bot.on('message', async (msg) => {
          if (!msg.text) return;
          console.log('🔵 Telegram message received from:', msg.chat.id, ':', msg.text);
          await this.handleIncomingMessage(msg);
        });

        this.bot.on('error', (error) => {
          console.error('Telegram bot error:', error);
        });

        this.bot.on('polling_error', (error) => {
          console.error('Telegram polling error:', error);
        });
      } else {
        console.log('✅ Telegram bot initialized (webhook mode)');
      }

    } catch (error) {
      console.error("❌ Failed to start Telegram bot:", error);
      this.isActive = false;
      throw error;
    }
  }

  async stop() {
    this.isActive = false;
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        console.log("Telegram bot stopped");
      } catch (error) {
        console.error("Error stopping bot:", error);
      }
    }
  }

  async setupWebhook(webhookUrl: string) {
    try {
      this.initializeBot();

      if (!this.bot) {
        throw new Error("Bot not initialized");
      }

      if (this.bot.isPolling) {
        await this.bot.stopPolling();
        console.log('🛑 Stopped polling');
      }

      await this.bot.setWebHook(webhookUrl);
      console.log('✅ Webhook set to:', webhookUrl);

      const info = await this.bot.getWebHookInfo();
      console.log('🔗 Webhook info:', info);

      return info;
    } catch (error) {
      console.error('❌ Failed to setup webhook:', error);
      throw error;
    }
  }

  async processWebhookUpdate(update: any) {
    try {
      if (update.message && update.message.text) {
        console.log('🔵 Webhook message received from:', update.message.chat.id, ':', update.message.text);
        await this.handleIncomingMessage(update.message);
      }
    } catch (error) {
      console.error('❌ Error processing webhook update:', error);
    }
  }

  // Web session mapping methods
  setWebSessionMapping(numericId: number, sessionId: string) {
    this.webSessionMapping.set(numericId, sessionId);
    console.log(`🔗 Mapped numeric ID ${numericId} to session ${sessionId}`);
  }

  getWebSessionId(numericId: number): string | undefined {
    return this.webSessionMapping.get(numericId);
  }

  isWebSession(chatId: number): boolean {
    return this.webSessionMapping.has(chatId);
  }



  async handleIncomingMessage(msg: any) {
    if (!this.isActive) return;

    const chatId = msg.chat.id;
    const text = msg.text;
    const messageId = msg.message_id;

    console.log(`🔄 Processing message from ${chatId}: "${text}"`);

    // 🆕 NEW: Check if this is a vendor quote first
    if (text && text.includes('RATE:') && text.includes('Inquiry ID:')) {
      await this.handleVendorQuote(chatId, text, messageId);
      return;
    }
    

    // 🆕 NEW: Handle web user messages
    const webSessionId = this.webSessionMapping.get(chatId);
    if (webSessionId) {
      // Use conversation flow for web users too
      if (text === '/start') {
        const { message } = conversationFlow.startConversation(chatId.toString());
        if (global.io) {
          global.io.to(`session-${webSessionId}`).emit("bot-reply", {
            sessionId: webSessionId,
            message: message
          });
        }
        return;
      }

      // Process other web messages through conversation flow
      const { message, session, isComplete } = await conversationFlow.processMessage(chatId.toString(), text);

      // Handle completion actions for web users
      if (isComplete && session) {
        if (session.userType === 'vendor' && text?.toLowerCase().trim() === 'confirm') {
          try {
            console.log("🏢 VENDOR REGISTRATION CONFIRMED for web user:", {
              chatId,
              session: {
                vendorName: session.vendorName,
                vendorCity: session.vendorCity,
                materials: session.materials,
                vendorPhone: session.vendorPhone
              }
            });

            await this.processVendorRegistration(chatId, session);

            const materialsText = session.materials?.join(' and ').toUpperCase() || 'your materials';
            const successMessage = `🎉 Vendor registration successful!

Welcome to our vendor network, ${session.vendorName}!

You'll start receiving pricing inquiries for ${materialsText} in ${session.vendorCity}.

Send /start anytime for help.`;

            if (global.io) {
              global.io.to(`session-${webSessionId}`).emit("bot-reply", {
                sessionId: webSessionId,
                message: successMessage
              });
            }
            return; // 🔧 IMPORTANT: Return early to avoid sending message twice

          } catch (error) {
            console.error('Vendor registration failed:', error);
            const errorMessage = `❌ Registration failed. Please try again by sending /start`;

            if (global.io) {
              global.io.to(`session-${webSessionId}`).emit("bot-reply", {
                sessionId: webSessionId,
                message: errorMessage
              });
            }
            return; // 🔧 IMPORTANT: Return early
          }

        } else if (session.userType === 'buyer' && text?.toLowerCase().trim() === 'confirm') {
          console.log("🎯 BUYER INQUIRY CONFIRMED for web user:", {
            chatId,
            session,
            webSessionId
          });

          const inquiryId = `INQ_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          this.inquirySessionMapping.set(inquiryId, webSessionId);

          try {
            await this.processInquiry(chatId, session, inquiryId);

            // Send success message after inquiry processing
            const successMessage = `🚀 Your inquiry has been sent!

We've contacted vendors in ${session.city} for ${session.material} pricing. You should receive quotes shortly.

📊 Inquiry ID: ${inquiryId}

Send /start for a new inquiry anytime!`;

            if (global.io) {
              global.io.to(`session-${webSessionId}`).emit("bot-reply", {
                sessionId: webSessionId,
                message: successMessage
              });
            }
            return; // 🔧 IMPORTANT: Return early

          } catch (error) {
            console.error('Inquiry processing failed:', error);
            const errorMessage = `❌ Failed to process inquiry. Please try again.`;

            if (global.io) {
              global.io.to(`session-${webSessionId}`).emit("bot-reply", {
                sessionId: webSessionId,
                message: errorMessage
              });
            }
            return; // 🔧 IMPORTANT: Return early
          }
        }
      }

      // 🔧 ONLY send message if we didn't return early from completion actions
      if (global.io) {
        global.io.to(`session-${webSessionId}`).emit("bot-reply", {
          sessionId: webSessionId,
          message: message
        });

      }
      return;
    }

    // Handle /start command for Telegram users
    if (text === '/start') {
      const { message } = conversationFlow.startConversation(chatId.toString());
      await this.sendMessage(chatId, message);
      return;
    }

    // Handle /help command
    if (text === '/help') {
      const helpMessage = conversationFlow.getHelpMessage();
      await this.sendMessage(chatId, helpMessage);
      return;
    }

    // Check if this is a vendor rate response (legacy)
    const isRateResponse = await this.handleVendorRateResponse(msg);
    if (isRateResponse) {
      return;
    }

    // Process all other messages through conversation flow
    const { message, session, isComplete } = await conversationFlow.processMessage(chatId.toString(), text);
   
    // Handle completion actions for Telegram users
    if (isComplete && session) {
      if (session.userType === 'vendor' && text?.toLowerCase().trim() === 'confirm') {

        // Validate session has required fields
        if (!session.materials || !session.vendorName || !session.vendorCity) {
          console.error('❌ Invalid vendor session - missing required fields:', {
        materials: session.materials,
        vendorName: session.vendorName,
        vendorCity: session.vendorCity
      });
         await this.sendMessage(chatId, `❌ Registration incomplete. Please try again by sending /start`);
      return;
    }



        try {
          await this.processVendorRegistration(chatId, session);

          const materialsText = session.materials?.join(' and ').toUpperCase() || 'your materials';
          const successMessage = `🎉 Vendor registration successful!
Welcome to our vendor network, ${session.vendorName}!
You'll start receiving pricing inquiries for ${materialsText} in ${session.vendorCity}.
Send /start anytime for help.`;

          await this.sendMessage(chatId, successMessage);
          return;
        } catch (error) {
          console.error('Vendor registration failed:', error);
          await this.sendMessage(chatId, `❌ Registration failed. Please try again by sending /start`);
          return;
        }
      } else if (session.userType === 'buyer' && text?.toLowerCase().trim() === 'confirm') {
        // Validate session has required fields for buyer
    if (!session.city || !session.material) {
      console.error('Invalid buyer session - missing required fields');
      await this.sendMessage(chatId, `❌ Inquiry incomplete. Please try again by sending /start`);
      return;
    }
    
    const inquiryId = `INQ_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        try {
          await this.processInquiry(chatId, session, inquiryId);
          const successMessage = `🚀 Your inquiry has been sent!
We've contacted vendors in ${session.city} for ${session.material} pricing. You should receive quotes shortly.
📊 Inquiry ID: ${inquiryId}
Send /start for a new inquiry anytime!`;

          await this.sendMessage(chatId, successMessage);
          return;
        } catch (error) {
          console.error('Inquiry processing failed:', error);
          await this.sendMessage(chatId, `❌ Failed to process inquiry. Please try again.`);
          return;
        }
      }
    }
    // Only send message if we didn't return early
    await this.sendMessage(chatId, message);
  }

  // 🆕 ADD: New method for handling vendor quotes
  private async handleVendorQuote(chatId: number, message: string, messageId: number) {
    try {
      console.log('🏢 Processing vendor quote from chatId:', chatId);

      // Parse vendor quote format
      const rateMatch = message.match(/RATE:\s*([0-9.]+)/i);
      const gstMatch = message.match(/GST:\s*([0-9.]+)%?/i);
      const deliveryMatch = message.match(/DELIVERY:\s*(.+?)(?:\n|Inquiry|$)/i);
      const inquiryMatch = message.match(/Inquiry ID:\s*([^\n\s]+)/i);

      if (!rateMatch || !inquiryMatch) {
        await this.sendMessage(chatId, "❌ Please use the correct format:\nRATE: [amount]\nGST: [percentage]\nDELIVERY: [timeframe]\nInquiry ID: [id]");
        return;
      }

      const inquiryId = inquiryMatch[1];

      // Find vendor by telegram ID
      const vendors = await storage.getAllVendors();
      const vendor = vendors.find(v => v.telegramId === chatId.toString());

      if (!vendor) {
        await this.sendMessage(chatId, "❌ Vendor not found. Please contact admin.");
        return;
      }

      // Create vendor quote response
      const quoteData = {
        vendorId: vendor.vendorId,
        inquiryId: inquiryId,
        rate: parseFloat(rateMatch[1]),
        gst: gstMatch ? parseFloat(gstMatch[1]) : 0,
        delivery: deliveryMatch ? deliveryMatch[1].trim() : 'Not specified',
        message: message,
        telegramMessageId: messageId
      };

      // Save to database
      await storage.createPriceResponse(quoteData);

      // Send quote to buyer's chat session
      const buyerSessionId = this.inquirySessionMapping.get(inquiryId);
      if (buyerSessionId && global.io) {
        const quoteMessage = `📊 **New Quote Received!**
        
🏢 **Vendor**: ${vendor.vendorId}
💰 **Rate**: ₹${quoteData.rate} per unit
📋 **GST**: ${quoteData.gst}%
🚚 **Delivery**: ${quoteData.delivery}
📍 **Location**: ${vendor.city || 'Not specified'}
📝 **Inquiry ID**: ${inquiryId}

---
${message}`;

        global.io.to(`session-${buyerSessionId}`).emit("bot-reply", {
          sessionId: buyerSessionId,
          message: quoteMessage
        });

        console.log(`✅ Quote sent to buyer session: ${buyerSessionId}`);
      }

      // Send confirmation to vendor
      await this.sendMessage(chatId, `✅ Quote submitted successfully!\n\nRate: ₹${quoteData.rate}\nGST: ${quoteData.gst}%\nDelivery: ${quoteData.delivery}\nInquiry ID: ${quoteData.inquiryId}\n\n📤 Your quote has been sent to the buyer!`);

    } catch (error) {
      console.error('❌ Error processing vendor quote:', error);
      await this.sendMessage(chatId, "❌ Error processing your quote. Please try again.");
    }
  }

  // 🆕 RESTORE: Your original handleVendorRateResponse method
  async handleVendorRateResponse(msg: any) {
    const chatId = msg.chat.id;
    const text = msg.text;

    const ratePattern = /RATE:\s*([0-9]+(?:\.[0-9]+)?)\s*per\s*(\w+)/i;
    const gstPattern = /GST:\s*([0-9]+(?:\.[0-9]+)?)%/i;
    const deliveryPattern = /DELIVERY:\s*([0-9]+(?:\.[0-9]+)?)/i;
    const inquiryPattern = /Inquiry ID:\s*(INQ-[0-9]+)/i;

    const rateMatch = text.match(ratePattern);
    const gstMatch = text.match(gstPattern);
    const deliveryMatch = text.match(deliveryPattern);
    const inquiryMatch = text.match(inquiryPattern);

    if (rateMatch && inquiryMatch) {
      const rate = parseFloat(rateMatch[1]);
      const unit = rateMatch[2];
      const gst = gstMatch ? parseFloat(gstMatch[1]) : 0;
      const delivery = deliveryMatch ? parseFloat(deliveryMatch[1]) : 0;
      const inquiryId = inquiryMatch[1];

      await this.sendMessage(chatId, `✅ Thank you! Your quote has been received.
      
📋 Your Quote:
💰 Rate: ₹${rate} per ${unit}
📊 GST: ${gst}%
🚚 Delivery: ₹${delivery}
      
Inquiry ID: ${inquiryId}`);

      try {
        await storage.createNotification({
          message: `✅ Vendor quote received: ${rate} per ${unit} (Inquiry #${inquiryId})`,
          type: 'vendor_quote_confirmed'
        });
      } catch (err) {
        console.error('Failed to create notification:', err);
      }
      return true;
    }

    return false;
  }

  // 🆕 RESTORE: Your original processInquiry method
  private async processInquiry(chatId: number, session: any, inquiryId?: string) {
    // Use provided inquiryId or generate new one
    const finalInquiryId = inquiryId || `INQ-${Date.now()}`;
    try {
      const vendors = await storage.getVendors(session.city, session.material);
      const selectedVendors = vendors.slice(0, 3);
      if (selectedVendors.length > 0) {
        await storage.createInquiry({
          inquiryId: finalInquiryId, // 🔧 Use the finalInquiryId here
          userName: this.isWebSession(chatId) ? "Web User" : "Telegram User",
          userPhone: chatId.toString(),
          city: session.city,
          material: session.material,
          brand: session.brand,
          quantity: session.quantity,
          vendorsContacted: selectedVendors.map(v => v.vendorId),
          responseCount: 0,
          status: "pending",
          platform: this.isWebSession(chatId) ? "web" : "telegram"
        });
        // Send messages to vendors with the correct inquiry ID
        await this.sendVendorMessages(selectedVendors, session, finalInquiryId);
      }
    } catch (error) {
      console.error('Error processing inquiry:', error);
    }
  }

  // 🆕 RESTORE: Your original processVendorRegistration method
 private async processVendorRegistration(chatId: number, session: any) {
    const vendorId = `VEN-${Date.now()}`;
    console.log("🏢 processVendorRegistration STARTED:", {
      chatId,
      vendorId,
      session: {
        vendorName: session.vendorName,
        vendorCity: session.vendorCity,
        materials: session.materials,
        vendorPhone: session.vendorPhone
      }
    });
    try {
      // ✅ FIXED: Match exact database column names
      const vendorData = {
        vendorId: vendorId,                          // DB column: vendor_id
        name: session.vendorName,                     // DB column: name
        phone: session.vendorPhone,                   // DB column: phone
        city: session.vendorCity,                     // DB column: city
        materials: session.materials,                 // DB column: materials
        lastQuoted: null,                            // DB column: last_quoted
        isActive: true,                              // DB column: is_active
        responseCount: 0,                            // DB column: response_count
        responseRate: "0.00",                        // DB column: response_rate
        rank: 0,                                      // DB column: rank
        created_at: new Date(),                       // DB column: created_at
        telegramId: chatId.toString(),               // DB column: telegram_id
        status: 'active',                             // DB column: status
        registered_at: new Date(),                    // DB column: registered_at
      };
      console.log("💾 VENDOR DATA PREPARED:", vendorData);
      console.log("🎯 CALLING storage.createVendor...");
      
      const createdVendor = await storage.createVendor(vendorData);
      console.log(`✅ VENDOR CREATED SUCCESSFULLY:`, createdVendor);
      
      // Verify creation
      console.log("🔍 VERIFYING vendor creation...");
      const verifyVendor = await storage.getVendorByTelegramId(chatId.toString());
      console.log("✅ VERIFICATION RESULT:", verifyVendor);
      
      return createdVendor;
      
    } catch (error) {
      console.error('❌ processVendorRegistration FAILED:', error);
      
      if (error instanceof Error) {
        console.error('❌ Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      } else {
        console.error('❌ Unknown error:', error);
      }
      
      throw error;
    }
  }

  // 🆕 RESTORE: Your original sendVendorMessages method
  private async sendVendorMessages(vendors: any[], inquiry: any, inquiryId: string) {
    const botConfig = await storage.getBotConfig();
    let template = botConfig?.vendorRateRequestTemplate || `Hi [Vendor Name], 

New inquiry:
- Material: [Material]
- City: [City]
- Quantity: [Quantity]
- Brand: [Brand]

Please provide your best rate.

Reply with:
**RATE: [Price] per [Unit]**
**GST: [Percentage]%**
**DELIVERY: [Charges]**

Inquiry ID: ${inquiryId}`;

    for (const vendor of vendors) {
      const message = template
        .replace(/\[Vendor Name\]/g, vendor.name)
        .replace(/\[Material\]/g, inquiry.material)
        .replace(/\[City\]/g, inquiry.city)
        .replace(/\[Quantity\]/g, inquiry.quantity || "Not specified")
        .replace(/\[Brand\]/g, inquiry.brand || "Any");

      if (vendor.telegramId && this.bot) {
        try {
          await this.bot.sendMessage(parseInt(vendor.telegramId), `🔔 **New Price Inquiry**

${message}`);
          console.log(`✅ Message sent to vendor ${vendor.name}`);
        } catch (error) {
          console.error(`❌ Failed to send message to vendor ${vendor.name}:`, error);
        }
      }

      try {
        await storage.updateVendor(vendor.id, {
          lastQuoted: new Date()
        });
      } catch (error) {
        console.error('Error updating vendor:', error);
      }
    }
  }

  async sendMessage(chatId: number, message: string) {
    try {
      if (!this.bot) {
        throw new Error("Bot not initialized");
      }

      // Check if this is a web session
      const originalSessionId = this.getWebSessionId(chatId);

      if (originalSessionId) {
        // Send to web user via Socket.io
        if (global.io) {
          global.io.to(`session-${originalSessionId}`).emit("bot-reply", {
            sessionId: originalSessionId,
            message: message
          });
          console.log(`📱 Web reply sent to session ${originalSessionId}`);
        }
      } else {
        // Send normal Telegram message
        const result = await this.bot.sendMessage(chatId, message);
        console.log(`📨 Telegram message sent to ${chatId}`);
        return result;
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  async testBot() {
    try {
      this.initializeBot();
      if (!this.bot) {
        throw new Error("Bot not initialized");
      }
      const me = await this.bot.getMe();
      console.log('🤖 Bot info:', me);
      return me;
    } catch (error) {
      console.error('❌ Bot token error:', error);
      return null;
    }
  }

  // 🆕 ADD: Helper methods
  public setInquirySessionMapping(inquiryId: string, sessionId: string) {
    this.inquirySessionMapping.set(inquiryId, sessionId);
    console.log(`🔗 Mapped inquiry ${inquiryId} to session ${sessionId}`);
  }

  public getSessionByInquiry(inquiryId: string): string | undefined {
    return this.inquirySessionMapping.get(inquiryId);
  }

  getStatus() {
    return {
      isActive: this.isActive,
      platform: "telegram",
      activeSessions: this.userSessions.size,
      lastUpdate: new Date()
    };
  }
}

export const telegramBot = new TelegramBotService({
  token: "" // Will be loaded when start() is called
});