import TelegramBot from 'node-telegram-bot-api';
import { storage } from "../storage";
import { Server as SocketIOServer } from 'socket.io';

// Add global Socket.io declaration
declare global {
  var io: SocketIOServer | undefined;
}

export interface TelegramBotConfig {
  token: string;
}

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private isActive: boolean = true;
  private userSessions: Map<string, any> = new Map();
  private webSessions: Map<string, any> = new Map(); // NEW: Web session storage
  private token: string;

  constructor(config: TelegramBotConfig) {
    this.token = config.token;
  }

  private initializeBot() {
    if (this.bot) return;
    
    const token = this.token || process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token || token === "demo_token" || token === "") {
      console.error("❌ No valid Telegram bot token found!");
      console.error("Expected format: 1234567890:ABC...");
      console.error("Current token:", token ? token.substring(0, 10) + "..." : "undefined");
      console.error("Make sure TELEGRAM_BOT_TOKEN is set in your .env file");
      throw new Error("Telegram bot token is required");
    }
    
    console.log("🤖 Initializing Telegram bot with token:", token.substring(0, 10) + "...");
    
    try {
      // Enable polling to receive messages with better error handling
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
    // Initialize the bot when starting
    this.initializeBot();
    
    if (!this.bot) {
      throw new Error("Failed to initialize Telegram bot");
    }

    this.isActive = true;
    
    // Test the bot first
    const me = await this.bot.getMe();
    console.log('✅ Bot verified:', me.username, `(@${me.username})`);

    if (!useWebhook) {
      // Force stop any existing polling first
      try {
        if (this.bot.isPolling) {
          await this.bot.stopPolling();
          console.log('🛑 Stopped existing polling');
          // Wait a moment for cleanup
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.log('No existing polling to stop');
      }

      // Start fresh polling
      await this.bot.startPolling();
      console.log('✅ Telegram bot started with polling');

      // ONLY ONE MESSAGE LISTENER - NO DUPLICATES
      this.bot.on('message', async (msg) => {
        // Skip non-text messages
        if (!msg.text) return;
        
        console.log('🔵 Telegram message received from:', msg.chat.id, ':', msg.text);
        
        // NEW: Check if this is an API message from web user
        if (msg.text?.startsWith('[API]')) {
          await this.handleWebUserMessage(msg);
          return;
        }
        
        // Check if this is a new user starting an inquiry
        if (msg.text === '/start' || !this.userSessions.get(msg.chat.id.toString())) {
          try {
            await storage.createNotification({
              message: `🔍 New inquiry started by user ${msg.chat.id}`,
              type: 'new_inquiry_started'
            });
            console.log('✅ New inquiry notification created');
          } catch (err) {
            console.error('❌ Failed to create new inquiry notification:', err);
          }
        }
        
        // Only create notifications for important business events
        try {
          // Vendor responding with quote/rate
          if (msg.text.includes('$') || msg.text.includes('rate') || msg.text.includes('quote') || msg.text.includes('price')) {
            await storage.createNotification({
              message: `💰 Vendor responded with quote: "${msg.text}"`,
              type: 'vendor_response'
            });
          }
          // New inquiry from potential customer
          else if (msg.text.includes('need') || msg.text.includes('looking for') || msg.text.includes('inquiry') || msg.text.includes('quote me')) {
            await storage.createNotification({
              message: `🔍 New inquiry received: "${msg.text}"`,
              type: 'new_inquiry'
            });
          }
          // No notification for random chit-chat!
          
        } catch (err) {
          console.error('Failed to create notification:', err);
        }
        
        this.handleIncomingMessage(msg);
      });

      // Error handling
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

  // NEW: Handle web user messages from API
  public async handleWebUserMessage(msg: any) {
    const text = msg.text;
    const match = text.match(/\[API\] Session: ([^|]+) \| User: ([^\n]+)\n(.+)/s);

    if (match) {
      const [, sessionId, userId, userMessage] = match;
      console.log('🌐 Processing web user message:', { sessionId, userId, userMessage });

      // Get or create session for web user (stored in memory)
      let session = this.webSessions.get(sessionId);
      if (!session) {
        session = { step: 'user_type', userType: 'web', sessionId, messages: [] };
        this.webSessions.set(sessionId, session);
      }

      // Store user message
      session.messages.push({
        senderType: 'user',
        message: userMessage,
        timestamp: new Date()
      });

      // Process message through existing conversation flow
      const response = await this.processConversationStep(session, userMessage, sessionId, 'web');

      // Store bot response
      session.messages.push({
        senderType: 'bot',
        message: response,
        timestamp: new Date()
      });

      this.webSessions.set(sessionId, session);

      // Send response via Socket.io to web user
      if (global.io) {
        global.io.to(`session-${sessionId}`).emit('bot-message', {
          sessionId,
          message: response,
          timestamp: new Date(),
          senderType: 'bot'
        });

        console.log('✅ Response sent to web user via Socket.io');
      } else {
        console.error('❌ Socket.io not available');
      }
    }
  }

  // NEW: Get web session messages (for API)
  getWebSessionMessages(sessionId: string): any[] {
    const session = this.webSessions.get(sessionId);
    return session ? session.messages : [];
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

      // Stop polling if it's running
      if (this.bot.isPolling) {
        await this.bot.stopPolling();
        console.log('🛑 Stopped polling');
      }

      // Set the webhook
      await this.bot.setWebHook(webhookUrl);
      console.log('✅ Webhook set to:', webhookUrl);
      
      // Verify webhook
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
        
        // Check for API messages first
        if (update.message.text?.startsWith('[API]')) {
          await this.handleWebUserMessage(update.message);
          return;
        }
        
        // Your existing notification logic
        if (update.message.text === '/start' || !this.userSessions.get(update.message.chat.id.toString())) {
          try {
            await storage.createNotification({
              message: `🔍 New inquiry started by user ${update.message.chat.id}`,
              type: 'new_inquiry_started'
            });
          } catch (err) {
            console.error('❌ Failed to create notification:', err);
          }
        }
        
        // Process business events  
        if (update.message.text.includes('$') || update.message.text.includes('rate') || update.message.text.includes('quote') || update.message.text.includes('price')) {
          await storage.createNotification({
            message: `💰 Vendor responded with quote: "${update.message.text}"`,
            type: 'vendor_response'
          });
        } else if (update.message.text.includes('need') || update.message.text.includes('looking for') || update.message.text.includes('inquiry') || update.message.text.includes('quote me')) {
          await storage.createNotification({
            message: `🔍 New inquiry received: "${update.message.text}"`,
            type: 'new_inquiry'
          });
        }
        
        // Handle the message using existing logic
        await this.handleIncomingMessage(update.message);
      }
    } catch (error) {
      console.error('❌ Error processing webhook update:', error);
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

  async handleVendorRateResponse(msg: any) {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Check if this is a rate response (contains RATE keyword and inquiry ID)
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
      
      console.log(`📋 Rate response received from ${chatId}:`, {
        rate, unit, gst, delivery, inquiryId
      });
      
      // Process the rate submission
      await this.processVendorRateSubmission(chatId, {
        inquiryId,
        rate,
        unit,
        gst,
        delivery
      });
      
      // Confirm receipt to vendor
      await this.sendMessage(chatId, `✅ Thank you! Your quote has been received and sent to the buyer.
      
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

  private async processVendorRateSubmission(chatId: number, rateData: any) {
    try {
      // Find the vendor by telegram ID
      const vendor = await storage.getVendorByTelegramId(chatId.toString());
      if (!vendor) {
        console.log(`❌ Vendor not found for chat ID: ${chatId}`);
        return;
      }
      
      // Find the inquiry
      const inquiry = await storage.getInquiryById(rateData.inquiryId);
      if (!inquiry) {
        console.log(`❌ Inquiry not found: ${rateData.inquiryId}`);
        return;
      }
      
      // Save the rate response
      await storage.createPriceResponse({
        vendorId: vendor.vendorId,
        inquiryId: rateData.inquiryId,
        material: inquiry.material,
        price: rateData.rate.toString(),
        gst: rateData.gst.toString(),
        deliveryCharge: rateData.delivery.toString()
      });
      
      console.log(`✅ Rate saved for vendor ${vendor.name}`);
      
      // Update inquiry response count
      await storage.incrementInquiryResponses(rateData.inquiryId);
      
      // Send compiled quote to buyer
      await this.sendCompiledQuoteToBuyer(inquiry, rateData, vendor);
      
    } catch (error) {
      console.error('Error processing vendor rate:', error);
    }
  }

  // UPDATED: Now handles both telegram and web users
  private async sendCompiledQuoteToBuyer(inquiry: any, rateData: any, vendor: any) {
    const buyerMessage = `🏗️ **New Quote Received!**

For your inquiry: ${inquiry.material.toUpperCase()}
📍 City: ${inquiry.city}
📦 Quantity: ${inquiry.quantity}

💼 **Vendor: ${vendor.name}**
💰 Rate: ₹${rateData.rate} per ${rateData.unit}
📊 GST: ${rateData.gst}%
🚚 Delivery: ₹${rateData.delivery}
📞 Contact: ${vendor.phone}

Inquiry ID: ${inquiry.inquiryId}

More quotes may follow from other vendors!`;

    try {
      if (inquiry.platform === 'telegram') {
        // Send to telegram buyer
        await this.sendMessage(parseInt(inquiry.userPhone), buyerMessage);
      } else if (inquiry.platform === 'web') {
        // NEW: Send to web buyer via Socket.io
        const sessionId = inquiry.userPhone; // For web users, userPhone contains sessionId
        console.log(`🌐 Sending quote to web session: ${sessionId}`);

        if (global.io) {
          global.io.to(`session-${sessionId}`).emit('bot-message', {
            sessionId,
            message: buyerMessage,
            timestamp: new Date(),
            senderType: 'bot'
          });
          console.log(`✅ Quote sent to web session: ${sessionId}`);

          // Also store in web session
          const session = this.webSessions.get(sessionId);
          if (session) {
            session.messages.push({
              senderType: 'bot',
              message: buyerMessage,
              timestamp: new Date()
            });
            this.webSessions.set(sessionId, session);
            console.log(`💾 Quote stored in web session: ${sessionId}`);
          }
        } else {
          console.error('❌ Socket.io not available for quote delivery');
        }
      }
      
      console.log(`✅ Quote sent to buyer for inquiry ${inquiry.inquiryId} via ${inquiry.platform}`);
      
      try {
        await storage.createNotification({
          message: `📤 Quote forwarded to buyer for inquiry #${inquiry.inquiryId}`,
          type: 'quote_sent_to_buyer'
        });
      } catch (err) {
        console.error('Failed to create notification:', err);
      }
    } catch (error) {
      console.error('Error sending quote to buyer:', error);
    }
  }

  // Continue with the rest of your existing conversation flow...
  async handleIncomingMessage(msg: any) {
    if (!this.isActive || !this.bot) return;

    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Handle vendor rate response first
    if (await this.handleVendorRateResponse(msg)) {
      return;
    }
    
    // Handle /start command first - ALWAYS reset session
    if (text === '/start') {
      this.userSessions.delete(chatId.toString());
      const userSession = { step: 'user_type' };
      
      const response = `🏗️ Welcome to CemTemBot! 

I help you get instant pricing for cement and TMT bars from verified vendors in your city.

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
      
      this.userSessions.set(chatId.toString(), userSession);
      await this.sendMessage(chatId, response);
      return;
    }
    
    // Get or create session for telegram users
    let session = this.userSessions.get(chatId.toString());
    if (!session) {
      session = { step: 'user_type' };
      this.userSessions.set(chatId.toString(), session);
    }
    
    // Process conversation step
    const response = await this.processConversationStep(session, text, chatId, 'telegram');
    
    // Send response
    await this.sendMessage(chatId, response);
  }

  // NEW: Unified conversation processing for both platforms
  private async processConversationStep(session: any, text: string, chatIdOrSessionId: string | number, platform: 'telegram' | 'web'): Promise<string> {
    const step = session.step;
    
    // Handle /help command
    if (text === '/help') {
      return `🆘 **CemTemBot Help**

**For Buyers:**
1️⃣ Select "1" to start as buyer
2️⃣ Choose material (cement/TMT)
3️⃣ Specify quantity needed
4️⃣ Enter your city
5️⃣ Provide contact details
6️⃣ Get instant quotes from vendors!

**For Vendors:**
1️⃣ Select "2" to register as vendor
2️⃣ Provide company details
3️⃣ Specify materials you supply
4️⃣ Enter your city coverage
5️⃣ Start receiving buyer inquiries!

Type /start to begin or restart anytime.`;
    }
    
    switch (step) {
      case 'user_type':
        if (text === '1') {
          session.step = 'buyer_material';
          session.userType = 'buyer';
          return `🛒 **Buyer Mode Selected**

What material do you need pricing for?

1️⃣ Cement (OPC/PPC)
2️⃣ TMT Bars (Fe415/Fe500/Fe550)

Reply with 1 or 2`;
        } else if (text === '2') {
          session.step = 'vendor_company';
          session.userType = 'vendor';
          return `🏢 **Vendor Registration**

Please provide your company/business name:`;
        } else {
          return `❌ Invalid choice. Please reply:

1️⃣ for Buyer
2️⃣ for Vendor`;
        }
        
      case 'buyer_material':
        if (text === '1') {
          session.material = 'cement';
          session.step = 'buyer_quantity';
          return `🏗️ **Cement Selected**

How much cement do you need?

Examples:
• 100 bags
• 50 tonnes  
• 2000 bags

Please specify quantity:`;
        } else if (text === '2') {
          session.material = 'tmt';
          session.step = 'buyer_quantity';
          return `🔩 **TMT Bars Selected**

How much TMT do you need?

Examples:
• 5 tonnes
• 100 pieces
• 2000 kg

Please specify quantity:`;
        } else {
          return `❌ Invalid choice. Please reply:

1️⃣ for Cement
2️⃣ for TMT Bars`;
        }
        
      case 'buyer_quantity':
        session.quantity = text;
        session.step = 'buyer_city';
        return `📍 **Quantity Noted: ${text}**

Which city do you need this delivered to?

Examples: Mumbai, Delhi, Bangalore, Chennai, etc.

Enter your city:`;
        
      case 'buyer_city':
        session.city = text;
        session.step = 'buyer_phone';
        return `🏙️ **City: ${text}**

Please provide your contact number:

Example: 9876543210`;
        
      case 'buyer_phone':
        if (!/^[6-9]\d{9}$/.test(text.replace(/\s+/g, ''))) {
          return `❌ Invalid phone number format.

Please provide a valid 10-digit Indian mobile number:
Example: 9876543210`;
        }
        
        session.phone = text.replace(/\s+/g, '');
        
        // Create inquiry and notify vendors
        await this.createInquiryAndNotifyVendors(session, chatIdOrSessionId, platform);
        
        return `✅ **Inquiry Created Successfully!**

📋 **Your Details:**
🏗️ Material: ${session.material.toUpperCase()}
📦 Quantity: ${session.quantity}
📍 City: ${session.city}
📞 Contact: ${session.phone}

🔄 **Next Steps:**
• Your inquiry has been sent to verified vendors
• You'll receive quotes directly here
• Multiple vendors may respond
• Compare and choose the best offer

Inquiry ID: ${session.inquiryId}

💡 **Tip:** Keep this chat open to receive vendor quotes!`;
        
      case 'vendor_company':
        session.company = text;
        session.step = 'vendor_phone';
        return `🏢 **Company: ${text}**

Please provide your contact number:

Example: 9876543210`;
        
      case 'vendor_phone':
        if (!/^[6-9]\d{9}$/.test(text.replace(/\s+/g, ''))) {
          return `❌ Invalid phone number format.

Please provide a valid 10-digit Indian mobile number:
Example: 9876543210`;
        }
        
        session.phone = text.replace(/\s+/g, '');
        session.step = 'vendor_city';
        return `📞 **Contact: ${session.phone}**

Which city/cities do you serve?

Examples: Mumbai, Delhi, Bangalore
(You can list multiple cities separated by commas)

Enter your service cities:`;
        
      case 'vendor_city':
        session.city = text;
        session.step = 'vendor_materials';
        return `🏙️ **Service Areas: ${text}**

What materials do you supply?

1️⃣ Cement only
2️⃣ TMT Bars only  
3️⃣ Both Cement and TMT

Reply with 1, 2, or 3`;
        
      case 'vendor_materials':
        let materials: string[];
        if (text === '1') {
          materials = ['cement'];
        } else if (text === '2') {
          materials = ['tmt'];
        } else if (text === '3') {
          materials = ['cement', 'tmt'];
        } else {
          return `❌ Invalid choice. Please reply:

1️⃣ for Cement only
2️⃣ for TMT Bars only
3️⃣ for Both materials`;
        }
        
        session.materials = materials;
        
        // Register vendor
        await this.registerVendor(session, chatIdOrSessionId, platform);
        
        return `✅ **Vendor Registration Successful!**

🏢 **Your Details:**
📞 Contact: ${session.phone}
🏙️ Service Areas: ${session.city}
📦 Materials: ${materials.map(m => m.toUpperCase()).join(', ')}

🔔 **You're now active!**
• You'll receive buyer inquiries via this chat
• Reply with exact format to submit quotes
• Earn by providing competitive pricing

Welcome to the CemTemBot vendor network! 🎉`;
        
      default:
        return `❌ I didn't understand that. Type /start to begin or /help for assistance.`;
    }
  }

  private async createInquiryAndNotifyVendors(session: any, chatIdOrSessionId: string | number, platform: 'telegram' | 'web') {
    try {
      const inquiryId = `INQ-${Date.now()}`;
      session.inquiryId = inquiryId;
      
      // For web users, store sessionId as userPhone for tracking
      const userPhone = platform === 'web' ? chatIdOrSessionId.toString() : session.phone;
      
      await storage.createInquiry({
        inquiryId,
        userName: platform === 'web' ? 'Web User' : `User ${chatIdOrSessionId}`,
        userPhone,
        material: session.material,
        quantity: session.quantity,
        city: session.city,
        platform,
        status: 'active',
        vendorsContacted: [],
        responseCount: 0
      });
      
      // Notify vendors - THIS IS THE CRITICAL PART THAT MUST WORK
      await this.notifyVendorsOfNewInquiry(inquiryId, session);
      
      console.log(`✅ Inquiry ${inquiryId} created and vendors notified`);
      
    } catch (error) {
      console.error('Error creating inquiry:', error);
    }
  }

  // PRESERVE THIS EXACTLY - This is what was working for vendor notifications
  private async notifyVendorsOfNewInquiry(inquiryId: string, inquiryData: any) {
    try {
      console.log(`🔍 Looking for vendors in city: "${inquiryData.city}", material: "${inquiryData.material}"`);
      
      const vendors = await storage.getVendors(inquiryData.city, inquiryData.material);
      console.log(`📋 Found ${vendors.length} vendors`);

      for (const vendor of vendors) {
        if (vendor.telegramId) {
          const vendorMessage = `🆕 **NEW INQUIRY ALERT!**

📋 Inquiry ID: ${inquiryId}
🏗️ Material: ${inquiryData.material.toUpperCase()}
📍 City: ${inquiryData.city}
📦 Quantity: ${inquiryData.quantity}
📱 Buyer Contact: ${inquiryData.phone || 'Web User'}

To submit your quote, reply with:
RATE: [your rate] per [unit]
GST: [gst percentage]%
DELIVERY: [delivery charge]
Inquiry ID: ${inquiryId}

Example:
RATE: 350 per bag
GST: 18%
DELIVERY: 500
Inquiry ID: ${inquiryId}`;

          await this.sendMessage(parseInt(vendor.telegramId), vendorMessage);
          console.log(`✅ Inquiry sent to vendor: ${vendor.name}`);
        }
      }

      console.log(`✅ Notified ${vendors.length} vendors about inquiry ${inquiryId}`);
    } catch (error) {
      console.error('Error notifying vendors:', error);
    }
  }

  private async registerVendor(session: any, chatIdOrSessionId: string | number, platform: 'telegram' | 'web') {
    try {
      const vendorId = `VEN-${Date.now()}`;

      await storage.createVendor({
        vendorId,
        name: session.company,
        phone: session.phone,
        city: session.city,
        materials: session.materials,
        telegramId: platform === 'telegram' ? chatIdOrSessionId.toString() : null,
        isActive: true,
        responseCount: 0
      });

      console.log(`✅ Vendor ${vendorId} registered successfully`);
    } catch (error) {
      console.error('Error registering vendor:', error);
    }
  }

  async sendMessage(chatId: number | string, message: string) {
    if (!this.bot || !this.isActive) return;

    try {
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  getStatus() {
    return {
      isActive: this.isActive,
      activeSessions: this.userSessions.size + this.webSessions.size,
      telegramSessions: this.userSessions.size,
      webSessions: this.webSessions.size,
      botConnected: !!this.bot
    };
  }
}

export const telegramBot = new TelegramBotService({
  token: process.env.TELEGRAM_BOT_TOKEN || ""
});