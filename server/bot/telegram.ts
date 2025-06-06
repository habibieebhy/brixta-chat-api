import TelegramBot from 'node-telegram-bot-api';
import { storage } from "../storage";
import { conversationFlow, type ConversationContext } from "../conversationFlow";

export interface TelegramBotConfig {
  token: string;
}

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private isActive: boolean = true;
  private userSessions: Map<string, any> = new Map();
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
          
          // Check if this is an API message from web user
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
          
          // Create notifications for important business events
          try {
            if (msg.text.includes('$') || msg.text.includes('rate') || msg.text.includes('quote') || msg.text.includes('price')) {
              await storage.createNotification({
                message: `💰 Vendor responded with quote: "${msg.text}"`,
                type: 'vendor_response'
              });
            } else if (msg.text.includes('need') || msg.text.includes('looking for') || msg.text.includes('inquiry') || msg.text.includes('quote me')) {
              await storage.createNotification({
                message: `🔍 New inquiry received: "${msg.text}"`,
                type: 'new_inquiry'
              });
            }
          } catch (err) {
            console.error('Failed to create notification:', err);
          }
          
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

  // NEW: Handle web user messages from API
  async handleWebUserMessage(msg: any) {
    const text = msg.text;
    const match = text.match(/\[API\] Session: ([^|]+) \| User: ([^\n]+)\n(.+)/s);
    
    if (match) {
      const [, sessionId, userId, userMessage] = match;
      console.log('🌐 Processing web user message:', { sessionId, userId, userMessage });
      
      // Get or create session for web user
      let session = this.userSessions.get(sessionId);
      if (!session) {
        session = { step: 'user_type', userType: 'web', sessionId };
        this.userSessions.set(sessionId, session);
      }

      // Process message through conversation flow
      const context: ConversationContext = {
        chatId: sessionId,
        userType: 'web',
        sessionId,
        step: session.step,
        data: session.data
      };

      const response = await conversationFlow.processMessage(context, userMessage);
      
      // Update session
      session.step = response.nextStep;
      session.data = { ...session.data, ...response.data };
      this.userSessions.set(sessionId, session);

      // Handle completion actions
      if (response.action) {
        await this.handleCompletionAction(response.action, response.data, sessionId, 'web');
      }

      // Send response via Socket.io to web user
      if (global.io) {
        global.io.to(`session-${sessionId}`).emit('bot-message', {
          message: response.message,
          timestamp: new Date(),
          senderType: 'bot'
        });
        
        console.log('✅ Response sent to web user via Socket.io');
      }

      // Also save message to database
      try {
        await storage.createChatMessage({
          sessionId,
          senderType: 'bot',
          message: response.message,
          senderId: 'cemtem-bot'
        });
      } catch (error) {
        console.error('Failed to save web chat message:', error);
      }
    }
  }

  async handleIncomingMessage(msg: any) {
    if (!this.isActive || !this.bot) return;

    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Handle vendor rate response first
    if (await this.handleVendorRateResponse(msg)) {
      return;
    }

    // Get or create session
    let session = this.userSessions.get(chatId.toString());
    if (!session || text === '/start') {
      session = { step: 'user_type', userType: 'telegram' };
      this.userSessions.set(chatId.toString(), session);
    }

    // Process message through conversation flow
    const context: ConversationContext = {
      chatId: chatId.toString(),
      userType: 'telegram',
      step: session.step,
      data: session.data
    };

    const response = await conversationFlow.processMessage(context, text);
    
    // Update session
    session.step = response.nextStep;
    session.data = { ...session.data, ...response.data };
    this.userSessions.set(chatId.toString(), session);

    // Handle completion actions
    if (response.action) {
      await this.handleCompletionAction(response.action, response.data, chatId, 'telegram');
    }

    // Send response
    await this.sendMessage(chatId, response.message);
  }

  // NEW: Handle completion actions for both web and telegram users
  async handleCompletionAction(action: string, data: any, chatIdOrSessionId: string | number, platform: 'telegram' | 'web') {
    try {
      if (action === 'create_inquiry') {
        const inquiryId = `INQ-${Date.now()}`;
        
        // For web users, store sessionId as userPhone for tracking
        const userPhone = platform === 'web' ? chatIdOrSessionId.toString() : data.phone;
        
         await storage.createInquiry({
        inquiryId,
        userName: platform === 'web' ? 'Web User' : `User ${chatIdOrSessionId}`,
        userPhone,
        material: data.material,
        quantity: data.quantity || 'Not specified',
        city: data.city,
        platform,
        status: 'active',
        vendorsContacted: [], // Initialize as empty array
        responseCount: 0
      });

        // Notify vendors
        await this.notifyVendorsOfNewInquiry(inquiryId, data);
        
        console.log(`✅ Inquiry ${inquiryId} created and vendors notified`);
        
      } else if (action === 'register_vendor') {
        const vendorId = `VEN-${Date.now()}`;
        
        await storage.createVendor({
          vendorId,
          name: data.company,
          phone: data.phone,
          city: data.city,
          materials: data.materials,
          telegramId: platform === 'telegram' ? chatIdOrSessionId.toString() : null,
          isActive: true,
          responseCount: 0
        });
        
        console.log(`✅ Vendor ${vendorId} registered successfully`);
      }
    } catch (error) {
      console.error(`Error handling ${action}:`, error);
    }
  }

  // NEW: Send message to web user via Socket.io
  async sendMessageToWebUser(sessionId: string, message: string) {
    if (global.io) {
      global.io.to(`session-${sessionId}`).emit('bot-message', {
        message,
        timestamp: new Date(),
        senderType: 'bot'
      });
      
      console.log(`✅ Message sent to web session: ${sessionId}`);
      
      // Save to database
      try {
        await storage.createChatMessage({
          sessionId,
          senderType: 'bot',
          message,
          senderId: 'cemtem-bot'
        });
      } catch (error) {
        console.error('Failed to save web message:', error);
      }
    } else {
      console.error('❌ Socket.io not available for web message');
    }
  }

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
      
      console.log(`📋 Rate response received from ${chatId}:`, {
        rate, unit, gst, delivery, inquiryId
      });
      
      await this.processVendorRateSubmission(chatId, {
        inquiryId,
        rate,
        unit,
        gst,
        delivery
      });
      
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
      const vendor = await storage.getVendorByTelegramId(chatId.toString());
      if (!vendor) {
        console.log(`❌ Vendor not found for chat ID: ${chatId}`);
        return;
      }
      
      const inquiry = await storage.getInquiryById(rateData.inquiryId);
      if (!inquiry) {
        console.log(`❌ Inquiry not found: ${rateData.inquiryId}`);
        return;
      }
      
      await storage.createPriceResponse({
        vendorId: vendor.vendorId,
        inquiryId: rateData.inquiryId,
        material: inquiry.material,
        price: rateData.rate.toString(),
        gst: rateData.gst.toString(),
        deliveryCharge: rateData.delivery.toString()
      });
      
      console.log(`✅ Rate saved for vendor ${vendor.name}`);
      
      await storage.incrementInquiryResponses(rateData.inquiryId);
      
      // Send to buyer (both web and telegram)
      await this.sendCompiledQuoteToBuyer(inquiry, rateData, vendor);
      
    } catch (error) {
      console.error('Error processing vendor rate:', error);
    }
  }

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
        await this.sendMessage(parseInt(inquiry.userPhone), buyerMessage);
      } else if (inquiry.platform === 'web') {
        // For web users, userPhone contains the sessionId
        const sessionId = inquiry.userPhone;
        await this.sendMessageToWebUser(sessionId, buyerMessage);
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

  private async notifyVendorsOfNewInquiry(inquiryId: string, inquiryData: any) {
    try {
      const vendors = await storage.getVendors(inquiryData.city, inquiryData.material);
      
      for (const vendor of vendors) {
        if (vendor.telegramId) {
          const vendorMessage = `🆕 **NEW INQUIRY ALERT!**

📋 Inquiry ID: ${inquiryId}
🏗️ Material: ${inquiryData.material.toUpperCase()}
📍 City: ${inquiryData.city}
📦 Quantity: ${inquiryData.quantity}
📱 Buyer Contact: ${inquiryData.phone}

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
        }
      }
      
      console.log(`✅ Notified ${vendors.length} vendors about inquiry ${inquiryId}`);
    } catch (error) {
      console.error('Error notifying vendors:', error);
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

  getStatus() {
    return {
      isActive: this.isActive,
      activeSessions: this.userSessions.size,
      botConnected: !!this.bot
    };
  }
}

export const telegramBot = new TelegramBotService({
  token: process.env.TELEGRAM_BOT_TOKEN || ""
});