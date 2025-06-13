import TelegramBot from 'node-telegram-bot-api';
import { storage } from "../storage";
import { conversationFlowB, type ConversationContextB } from "../conversationFlowB";
import { conversationFlowV, type ConversationContextV } from "../conversationFlowV";
import { vendorResponseFlow } from "../vResponseFlow";
import { Server as SocketIOServer } from 'socket.io';

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
  private webSessions: Map<string, any> = new Map();
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

          if (msg.text?.startsWith('[API]')) {
            await this.handleWebUserMessage(msg);
            return;
          }

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

          this.handleIncomingMessage(msg);
        });

        this.bot.on('callback_query', async (query) => {
          try {
            const data = query.data;
            const chatId = query.message.chat.id;

            console.log(`🔘 Callback query received from ${chatId}:`, data);

            if (data.startsWith('rate_custom_')) {
              await this.handleVendorRateStart(query, data);
            } else if (data.startsWith('rate_cement_') || data.startsWith('rate_tmt_')) {
              await this.handleVendorTypeRateEntry(query, data);
            } else if (data.startsWith('rates_complete_')) {
              await this.handleVendorRatesComplete(query, data);
            } else if (data.startsWith('gst_')) {
              await this.handleVendorGstSelection(query, data);
            } else if (data.startsWith('delivery_')) {
              await this.handleVendorDeliverySelection(query, data);
            } else if (data.startsWith('vcity_') || data.startsWith('vloc_') || data.startsWith('vmat_') || data.startsWith('bcity_') || data.startsWith('bloc_')) {
              await this.handleLocationCallback(query, data);
            }

            await this.bot.answerCallbackQuery(query.id);
          } catch (error) {
            console.error('❌ Error handling callback query:', error);
          }
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

  private async handleLocationCallback(query: any, data: string) {
    const chatId = query.message.chat.id;
    
    console.log(`🔘 Location callback: ${data}`);

    let session = this.userSessions.get(chatId.toString());
    if (!session) {
      session = { step: 'user_type', userType: 'telegram' };
      this.userSessions.set(chatId.toString(), session);
    }

    const context: ConversationContextV = {
      chatId: chatId.toString(),
      userType: 'telegram',
      step: session.step,
      data: session.data
    };

    const response = await conversationFlowV.processMessage(context, data);

    session.step = response.nextStep;
    session.data = { ...session.data, ...response.data };
    this.userSessions.set(chatId.toString(), session);

    if (response.action) {
      await this.handleCompletionAction(response.action, response.data, chatId, 'telegram');
    }

    const messageOptions: any = {};
    if (response.inlineKeyboard) {
      messageOptions.reply_markup = {
        inline_keyboard: response.inlineKeyboard
      };
    }

    await this.sendMessage(chatId, response.message, messageOptions);
  }

  public async handleWebUserMessage(msg: any) {
    const text = msg.text;
    const match = text.match(/\[API\] Session: ([^|]+) \| User: ([^\n]+)\n(.+)/);

    if (match) {
      const [, sessionId, userId, userMessage] = match;
      console.log('🌐 Processing web user message:', { sessionId, userId, userMessage });

      let session = this.webSessions.get(sessionId);
      if (!session) {
        session = { step: 'user_type', userType: 'web', sessionId, messages: [] };
        this.webSessions.set(sessionId, session);
      }

      session.messages.push({
        senderType: 'user',
        message: userMessage,
        timestamp: new Date()
      });

      const context: ConversationContextB = {
        chatId: sessionId,
        userType: 'web',
        sessionId,
        step: session.step,
        data: session.data
      };

      const response = await conversationFlowB.processMessage(context, userMessage);

      session.step = response.nextStep;
      session.data = { ...session.data, ...response.data };

      session.messages.push({
        senderType: 'bot',
        message: response.message,
        timestamp: new Date()
      });

      this.webSessions.set(sessionId, session);

      if (response.action) {
        await this.handleCompletionAction(response.action, response.data, sessionId, 'web');
      }

      if (global.io) {
        global.io.to(`session-${sessionId}`).emit('bot-message', {
          sessionId,
          message: response.message,
          timestamp: new Date(),
          senderType: 'bot'
        });

        console.log('✅ Response sent to web user via Socket.io');
      } else {
        console.error('❌ Socket.io not available');
      }
    }
  }

  async handleIncomingMessage(msg: any) {
    if (!this.isActive || !this.bot) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    const vendorState = vendorResponseFlow.getVendorState(chatId.toString());
    if (vendorState) {
      const response = await vendorResponseFlow.processTextInput(chatId.toString(), text);
      await this.sendVendorResponse(chatId, response);
      return;
    }

    let session = this.userSessions.get(chatId.toString());
    if (!session || text === '/start') {
      session = { step: 'user_type', userType: 'telegram' };
      this.userSessions.set(chatId.toString(), session);
    }

    const context: ConversationContextV = {
      chatId: chatId.toString(),
      userType: 'telegram',
      step: session.step,
      data: session.data
    };

    const response = await conversationFlowV.processMessage(context, text);

    session.step = response.nextStep;
    session.data = { ...session.data, ...response.data };
    this.userSessions.set(chatId.toString(), session);

    if (response.action) {
      await this.handleCompletionAction(response.action, response.data, chatId, 'telegram');
    }

    const messageOptions: any = {};
    if (response.inlineKeyboard) {
      messageOptions.reply_markup = {
        inline_keyboard: response.inlineKeyboard
      };
    }
    await this.sendMessage(chatId, response.message, messageOptions);
  }

  async sendMessage(chatId: number | string, message: string, options?: any) {
    if (!this.bot || !this.isActive) return;

    try {
      const messageOptions: any = {
        parse_mode: 'Markdown'
      };

      if (options?.reply_markup) {
        messageOptions.reply_markup = options.reply_markup;
      }

      await this.bot.sendMessage(chatId, message, messageOptions);
      console.log(`✅ Message sent to ${chatId}`);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  private async sendVendorResponse(chatId: number, response: any) {
    if (response.action === 'send_quote_to_buyer') {
      await this.processCompleteQuoteSubmission(response.data);
    }

    if (!this.bot) return;

    if (response.keyboard) {
      await this.bot.sendMessage(chatId, response.message, {
        reply_markup: response.keyboard,
        parse_mode: 'Markdown'
      });
    } else {
      await this.bot.sendMessage(chatId, response.message, {
        parse_mode: 'Markdown'
      });
    }

    if (response.action === 'send_quote_to_buyer' && response.data) {
      console.log('🔍 Processing send_quote_to_buyer action:', response.data);
      await this.notifyBuyerOfVendorResponse(response.data);
    }
  }

  private async notifyBuyerOfVendorResponse(data: any) {
    try {
      const { inquiryId, rates, gst, delivery, vendorTelegramId } = data;

      const inquiry = await storage.getInquiryById(inquiryId);
      if (!inquiry) {
        console.error('❌ Inquiry not found:', inquiryId);
        return;
      }

      const vendor = await storage.getVendorByTelegramId(vendorTelegramId);
      if (!vendor) {
        console.error('❌ Vendor not found:', vendorTelegramId);
        return;
      }

      let message = `🎯 **New Quote Received!**\n\n`;
      message += `👤 **Vendor:** ${vendor.name}\n`;
      message += `📱 **Contact:** ${vendor.phone}\n`;
      message += `📍 **City:** ${vendor.city}\n\n`;
      message += `💰 **Quote Details:**\n`;

      Object.keys(rates).forEach(material => {
        const materialRates = rates[material];
        message += `\n**${material.toUpperCase()}:**\n`;
        Object.keys(materialRates).forEach(item => {
          const rate = materialRates[item];
          if (rate === 0) {
            message += `• ${item}: Not available\n`;
          } else {
            message += `• ${item}: ₹${rate} per unit\n`;
          }
        });
      });

      message += `\n📊 **GST:** ${gst}%`;
      message += `\n🚚 **Delivery:** ${delivery === 0 ? 'Free' : '₹' + delivery}`;
      message += `\n\n💡 Contact the vendor directly for further negotiations.`;

      if (inquiry.platform === 'telegram' && inquiry.buyerTeleId) {
        console.log('📱 Sending to telegram buyer chat ID:', inquiry.buyerTeleId);
        await this.bot.sendMessage(inquiry.buyerTeleId, message, {
          parse_mode: 'Markdown'
        });
        console.log('✅ Quote sent to buyer successfully');
      } else {
        console.log('❌ No telegram chat ID for buyer');
      }
    } catch (error) {
      console.error('❌ Error notifying buyer:', error);
    }
  }

  // Add the missing vendor callback handlers
  private async handleVendorRateStart(query: any, data: string) {
    const chatId = query.message.chat.id;
    const inquiryId = data.replace('rate_custom_', '');
    console.log(`🎯 Starting vendor rate flow for inquiry: ${inquiryId}`);
    const response = await vendorResponseFlow.startRateFlow(chatId.toString(), inquiryId);
    await this.sendVendorResponse(chatId, response);
  }

  private async handleVendorTypeRateEntry(query: any, data: string) {
    const chatId = query.message.chat.id;
    const parts = data.split('_');
    const materialType = parts[1];
    const itemName = decodeURIComponent(parts[2]);
    const inquiryId = parts[3];
    console.log(`🎯 Vendor entering rate for ${materialType}: ${itemName}`);
    const response = await vendorResponseFlow.handleRateEntry(
      chatId.toString(),
      materialType as 'cement' | 'tmt',
      itemName,
      inquiryId
    );
    await this.sendVendorResponse(chatId, response);
  }

  private async handleVendorRatesComplete(query: any, data: string) {
    const chatId = query.message.chat.id;
    const inquiryId = data.replace('rates_complete_', '');
    console.log(`🎯 Vendor completing rates for inquiry: ${inquiryId}`);
    const response = await vendorResponseFlow.handleRatesComplete(chatId.toString(), inquiryId);
    await this.sendVendorResponse(chatId, response);
  }

  private async handleVendorGstSelection(query: any, data: string) {
    const chatId = query.message.chat.id;
    const parts = data.split('_');
    const gst = parts[1];
    const inquiryId = parts[2];
    console.log(`🎯 Vendor GST selection: ${gst}% for inquiry: ${inquiryId}`);
    const response = await vendorResponseFlow.handleGstSelection(chatId.toString(), gst, inquiryId);
    await this.sendVendorResponse(chatId, response);
  }

  private async handleVendorDeliverySelection(query: any, data: string) {
    const chatId = query.message.chat.id;
    const parts = data.split('_');
    const delivery = parts[1];
    const inquiryId = parts[2];
    console.log(`🎯 Vendor delivery selection: ${delivery} for inquiry: ${inquiryId}`);
    const response = await vendorResponseFlow.handleDeliverySelection(chatId.toString(), delivery, inquiryId);
    await this.sendVendorResponse(chatId, response);
  }

  private async processCompleteQuoteSubmission(data: any) {
    try {
      console.log(`📤 Processing complete quote submission:`, data);

      const vendor = await storage.getVendorByTelegramId(data.vendorTelegramId);
      if (!vendor) {
        console.error(`❌ Vendor not found for Telegram ID: ${data.vendorTelegramId}`);
        return;
      }

      let originalInquiryId = data.inquiryId;
      if (originalInquiryId.includes('-CEMENT') || originalInquiryId.includes('-TMT')) {
        originalInquiryId = originalInquiryId.replace('-CEMENT', '').replace('-TMT', '');
      }

      const inquiry = await storage.getInquiryById(originalInquiryId);
      if (!inquiry) {
        console.error(`❌ Inquiry not found: ${originalInquiryId}`);
        return;
      }

      for (const material of Object.keys(data.rates)) {
        const materialRates = data.rates[material];
        for (const item of Object.keys(materialRates)) {
          const rate = materialRates[item];
          if (rate > 0) {
            await storage.createPriceResponse({
              vendorId: vendor.vendorId,
              inquiryId: originalInquiryId,
              material: `${material} - ${item}`,
              price: rate.toString(),
              gst: data.gst.toString(),
              deliveryCharge: data.delivery.toString()
            });
          }
        }
      }

      console.log(`✅ Price responses stored for vendor ${vendor.name}`);
      await storage.incrementInquiryResponses(originalInquiryId);
      await this.sendDetailedQuoteToBuyer(inquiry, data, vendor);

      try {
        await storage.createNotification({
          message: `✅ Detailed vendor quote received for inquiry #${originalInquiryId}`,
          type: 'vendor_quote_confirmed'
        });
      } catch (err) {
        console.error('Failed to create notification:', err);
      }

    } catch (error) {
      console.error('❌ Error processing complete quote submission:', error);
    }
  }

  private async sendDetailedQuoteToBuyer(inquiry: any, quoteData: any, vendor: any) {
    let buyerMessage = `🏗️ **New Quote Received!**

For your inquiry in ${inquiry.city}
📦 Quantity: ${inquiry.quantity}

💼 **Vendor: ${vendor.name}**
📞 Contact: ${vendor.phone}

💰 **Rates:**`;

    Object.keys(quoteData.rates).forEach(material => {
      const materialRates = quoteData.rates[material];
      buyerMessage += `\n\n**${material.toUpperCase()}:**`;
      Object.keys(materialRates).forEach(item => {
        const rate = materialRates[item];
        if (rate === 0) {
          buyerMessage += `\n• ${item}: **Unavailable**`;
        } else {
          buyerMessage += `\n• ${item}: **₹${rate} per unit**`;
        }
      });
    });

    buyerMessage += `\n\n📊 GST: ${quoteData.gst}%`;
    buyerMessage += `\n🚚 Delivery: ${quoteData.delivery === 0 ? 'Free' : '₹' + quoteData.delivery}`;
    buyerMessage += `\n\nInquiry ID: ${inquiry.inquiryId}`;
    buyerMessage += `\n\nMore quotes may follow from other vendors!`;

    try {
      if (inquiry.platform === 'telegram') {
        await this.sendMessage(parseInt(inquiry.userPhone), buyerMessage);
      } else if (inquiry.platform === 'web') {
        const sessionId = inquiry.userPhone;
        console.log(`🌐 Sending detailed quote to web session: ${sessionId}`);

        if (global.io) {
          global.io.to(`session-${sessionId}`).emit('bot-message', {
            sessionId,
            message: buyerMessage,
            timestamp: new Date(),
            senderType: 'bot'
          });
          console.log(`✅ Detailed quote sent to web session: ${sessionId}`);

          const session = this.webSessions.get(sessionId);
          if (session) {
            session.messages.push({
              senderType: 'bot',
              message: buyerMessage,
              timestamp: new Date()
            });
            this.webSessions.set(sessionId, session);
          }
        } else {
          console.error('❌ Socket.io not available for quote delivery');
        }
      }

      console.log(`✅ Detailed quote sent to buyer for inquiry ${inquiry.inquiryId} via ${inquiry.platform}`);

    } catch (error) {
      console.error('Error sending detailed quote to buyer:', error);
    }
  }

  async handleCompletionAction(action: string, data: any, chatIdOrSessionId: string | number, platform: 'telegram' | 'web') {
    console.log(`🎯 handleCompletionAction called:`, { action, data, chatIdOrSessionId, platform });

    try {
      if (action === 'create_inquiry') {
        const inquiryId = `INQ-${Date.now()}`;
        console.log(`📝 Creating inquiry with ID: ${inquiryId}`);

        const userPhone = platform === 'web' ? chatIdOrSessionId.toString() : data.phone;
        console.log(`📞 User phone/session: ${userPhone}, Platform: ${platform}`);

        const inquiryData = {
          inquiryId,
          userName: platform === 'web' ? 'Web User' : `User ${chatIdOrSessionId}`,
          userPhone,
          material: data.material,
          cementCompany: data.cementCompany || null,
          cementTypes: data.cementTypes || null,
          tmtCompany: data.tmtCompany || null,
          tmtSizes: data.tmtSizes || null,
          quantity: data.quantity || 'Not specified',
          city: data.city,
          platform,
          status: 'active',
          vendorsContacted: [],
          responseCount: 0,
          buyerTeleId: platform === 'telegram' ? chatIdOrSessionId.toString() : null,
        };

        console.log(`💾 Creating inquiry in storage:`, inquiryData);
        await storage.createInquiry(inquiryData);
        console.log(`✅ Inquiry created in storage`);

        if (data.material === 'both') {
          console.log(`📢 Material is "both" - finding and deduplicating vendors`);

          const cementVendors = await storage.getVendorsByMaterialAndCity('cement', data.city);
          const tmtVendors = await storage.getVendorsByMaterialAndCity('tmt', data.city);

          const allVendors = [...cementVendors, ...tmtVendors];
          const uniqueVendors = allVendors.filter((vendor, index, self) =>
            index === self.findIndex(v => v.vendorId === vendor.vendorId)
          );

          console.log(`📋 Found ${cementVendors.length} cement + ${tmtVendors.length} TMT = ${uniqueVendors.length} unique vendors`);

          await this.notifyVendorsOfNewInquiry(inquiryId, inquiryData, uniqueVendors);

        } else {
          console.log(`📢 Finding vendors for material "${data.material}" in location "${data.city}"`);
          
          const vendors = await storage.getVendorsByMaterialAndCity(data.material, data.city);
          console.log(`📋 Found ${vendors.length} vendors for ${data.material}`);
          
          if (vendors.length === 0) {
            console.log(`⚠️ No vendors found for material "${data.material}" in city "${data.city}"`);
            const cityOnly = data.city.split(', ').pop() || data.city;
            const fallbackVendors = await storage.getVendorsByMaterialAndCity(data.material, cityOnly);
            console.log(`🔍 Fallback search found ${fallbackVendors.length} vendors in ${cityOnly}`);
            
            if (fallbackVendors.length > 0) {
              await this.notifyVendorsOfNewInquiry(inquiryId, inquiryData, fallbackVendors);
            }
          } else {
            await this.notifyVendorsOfNewInquiry(inquiryId, inquiryData, vendors);
          }
        }

      } else if (action === 'register_vendor') {
        const vendorId = `VEN-${Date.now()}`;
        console.log(`🏢 Registering vendor with ID: ${vendorId}`);
        const vendorData = {
          vendorId,
          name: data.company,
          phone: data.phone,
          city: data.city,
          materials: data.materials,
          telegramId: platform === 'telegram' ? chatIdOrSessionId.toString() : null,
          isActive: true,
          responseCount: 0
        };

        console.log(`💾 Creating vendor in storage:`, vendorData);
        await storage.createVendor(vendorData);
        console.log(`✅ Vendor ${vendorId} registered successfully`);
      }
    } catch (error) {
      console.error(`❌ Error handling ${action}:`, error);
      console.error(`❌ Error details:`, error.stack);
    }
  }

  private async notifyVendorsOfNewInquiry(inquiryId: string, inquiryData: any, vendorsOverride?: any[]) {
    try {
      console.log(`🔍 notifyVendorsOfNewInquiry called with:`, { inquiryId, inquiryData });

      let vendors = vendorsOverride;
      if (!vendors) {
        vendors = await storage.getVendors(inquiryData.city, inquiryData.material);
      }

      console.log(`📋 Found ${vendors.length} vendors:`, vendors.map(v => ({ name: v.name, telegramId: v.telegramId })));

      if (vendors.length === 0) {
        console.log(`⚠️ No vendors found for material "${inquiryData.material}" in city "${inquiryData.city}"`);
        return;
      }

      for (const vendor of vendors) {
        if (vendor.telegramId) {
          console.log(`📤 Sending inquiry to vendor: ${vendor.name} (Telegram ID: ${vendor.telegramId})`);

          let materialDetails = '';
          if (inquiryData.material === 'cement') {
            materialDetails = `🏗️ **Cement Required:**
Company: ${inquiryData.cementCompany}
Types: ${inquiryData.cementTypes.join(', ')}`;
          } else if (inquiryData.material === 'tmt') {
            materialDetails = `🔧 **TMT Required:**
Company: ${inquiryData.tmtCompany}
Sizes: ${inquiryData.tmtSizes.join(', ')}`;
          } else if (inquiryData.material === 'both') {
            materialDetails = `🏗️ **Cement Required:**
Company: ${inquiryData.cementCompany}
Types: ${inquiryData.cementTypes.join(', ')}

🔧 **TMT Required:**
Company: ${inquiryData.tmtCompany}
Sizes: ${inquiryData.tmtSizes.join(', ')}`;
          }

          const vendorMessage = `🆕 **NEW INQUIRY ALERT!**
📋 Inquiry ID: ${inquiryId}
📍 City: ${inquiryData.city}
📦 Quantity: ${inquiryData.quantity}
📱 Buyer Contact: ${inquiryData.phone || 'Web User'}

${materialDetails}

Please provide your detailed quote:`;

          const rateKeyboard = {
            inline_keyboard: [
              [
                { text: "💰 Enter Rate Amount", callback_data: `rate_custom_${inquiryId}` }
              ]
            ]
          };

          try {
            await this.bot.sendMessage(parseInt(vendor.telegramId), vendorMessage, {
              reply_markup: rateKeyboard,
              parse_mode: 'Markdown'
            });
            console.log(`✅ Message sent successfully to vendor ${vendor.name}`);
          } catch (msgError) {
            console.error(`❌ Failed to send message to vendor ${vendor.name}:`, msgError);
          }
        } else {
          console.log(`⚠️ Vendor ${vendor.name} has no Telegram ID`);
        }
      }
      console.log(`✅ Notification process completed for ${vendors.length} vendors`);
    } catch (error) {
      console.error('❌ Error in notifyVendorsOfNewInquiry:', error);
      console.error('❌ Error stack:', error.stack);
    }
  }

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

        if (update.message.text?.startsWith('[API]')) {
          await this.handleWebUserMessage(update.message);
          return;
        }

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