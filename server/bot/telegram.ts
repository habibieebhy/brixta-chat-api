import TelegramBot from 'node-telegram-bot-api';
import { storage } from "../storage";
import axios from 'axios';

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

  async start(useWebhook = true) {
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
        const chatId = update.message.chat.id;
        const text = update.message.text;

        console.log('🔵 Webhook message received from:', chatId, ':', text);

        // ✅ NEW: Handle messages from your web chat (6924933952)
        if (chatId == 6924933952) {

          // Check if this is a reply to a web user session
          const sessionMatch = text.match(/🔗 Session: ([a-f0-9-]+)/);

          if (sessionMatch) {
            const sessionId = sessionMatch[1];

            // Extract the actual reply (remove session prefix)
            const botReply = text.replace(/🔗 Session: [a-f0-9-]+\n📝 /, '');

            // Route reply back to the web user
            if (global.io) {
              global.io.to(`session-${sessionId}`).emit("bot-reply", {
                sessionId,
                message: botReply
              });

              console.log(`✅ Reply routed to web session ${sessionId}: ${botReply}`);
            }

            // Don't send auto-reply back to yourself
            return res.status(200).json({ ok: true });
          }
        }

        // Continue with your existing business logic for other users...
        if (chatId != 6924933952) {
          // Your existing notification logic
          if (text === '/start' || !this.userSessions.get(chatId.toString())) {
            try {
              await storage.createNotification({
                message: `🔍 New inquiry started by user ${chatId}`,
                type: 'new_inquiry_started'
              });
            } catch (err) {
              console.error('❌ Failed to create notification:', err);
            }
          }

          await this.handleIncomingMessage(update.message);
        }
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
      // Send to buyer via their platform (telegram in this case)
      if (inquiry.platform === 'telegram') {
        await this.sendMessage(parseInt(inquiry.userPhone), buyerMessage);
      }
      // Add WhatsApp buyer notification here later

      console.log(`✅ Quote sent to buyer for inquiry ${inquiry.inquiryId}`);
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
  async handleIncomingMessage(msg: any) {
    if (!this.isActive || !this.bot) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    // 🆕 NEW: Check if this is an API message first
    if (text?.startsWith('[API]')) {
      await this.handleApiMessage(chatId, text);
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

    // Handle /help command
    if (text === '/help') {
      await this.sendMessage(chatId, `🤖 PriceBot Help:

Commands:
/start - Start a new pricing inquiry
/help - Show this help message

For Vendors: To submit a quote, use this format:
**RATE: [Price] per [Unit]**
**GST: [Percentage]%**
**DELIVERY: [Charges]**

Example:
RATE: 350 per bag
GST: 18%
DELIVERY: 50
Inquiry ID: INQ-123456789

Simply send /start to begin!`);
      return;
    }

    // First check if this is a vendor rate response
    const isRateResponse = await this.handleVendorRateResponse(msg);
    if (isRateResponse) {
      return; // Don't process as regular conversation
    }

    // Continue with existing conversation flow
    const userSession = this.userSessions.get(chatId.toString()) || { step: 'start' };

    console.log(`🔄 Processing message from ${chatId}: "${text}" (step: ${userSession.step})`);

    let response = '';

    switch (userSession.step) {
      case 'start':
        if (text?.toLowerCase().includes('hello') || text?.toLowerCase().includes('hi')) {
          response = `🏗️ Welcome to CemTemBot! 

I help you get instant pricing for cement and TMT bars from verified vendors in your city.

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
          userSession.step = 'user_type';
        } else {
          response = `👋 Hello! Send /start to get started with pricing inquiries.`;
        }
        break;

      case 'user_type':
        if (text === '1' || text?.toLowerCase().includes('buyer')) {
          userSession.userType = 'buyer';
          userSession.step = 'get_city';
          response = `Great! I'll help you find prices in your city.

📍 Which city are you in?

Available cities: Guwahati, Mumbai, Delhi

Please enter your city name:`;
        } else if (text === '2' || text?.toLowerCase().includes('vendor')) {
          userSession.userType = 'vendor';
          userSession.step = 'vendor_name';
          response = `👨‍💼 Great! Let's register you as a vendor.

What's your business/company name?`;
        } else {
          response = `Please reply with:
1 - if you're a Buyer
2 - if you're a Vendor`;
        }
        break;

      case 'vendor_name':
        userSession.vendorName = text?.trim();
        userSession.step = 'vendor_city';
        response = `📍 Business Name: ${userSession.vendorName}

Which city do you operate in?

Available cities: Guwahati, Mumbai, Delhi

Enter your city:`;
        break;

      case 'vendor_city':
        userSession.vendorCity = text?.trim();
        userSession.step = 'vendor_materials';
        response = `📍 City: ${userSession.vendorCity}

What materials do you supply?

1️⃣ Cement only
2️⃣ TMT Bars only  
3️⃣ Both Cement and TMT Bars

Reply with 1, 2, or 3:`;
        break;

      case 'vendor_materials':
        if (text === '1') {
          userSession.materials = ['cement'];
        } else if (text === '2') {
          userSession.materials = ['tmt'];
        } else if (text === '3') {
          userSession.materials = ['cement', 'tmt'];
        } else {
          response = `Please select:
1 - Cement only
2 - TMT Bars only
3 - Both materials`;
          break;
        }
        userSession.step = 'vendor_phone';
        response = `📋 Materials: ${userSession.materials.join(', ').toUpperCase()}

What's your contact phone number?

Enter your phone number (with country code if international):`;
        break;

      case 'vendor_phone':
        userSession.vendorPhone = text?.trim();
        userSession.step = 'vendor_confirm';

        const materialsText = userSession.materials.join(' and ').toUpperCase();
        response = `✅ Please confirm your vendor registration:

🏢 Business: ${userSession.vendorName}
📍 City: ${userSession.vendorCity}
🏗️ Materials: ${materialsText}
📞 Phone: ${userSession.vendorPhone}

Reply "confirm" to register or "restart" to start over:`;
        break;

      case 'vendor_confirm':
        if (text?.toLowerCase().trim() === 'confirm') {
          try {
            await this.processVendorRegistration(chatId, userSession);
            response = `🎉 Vendor registration successful!

Welcome to our vendor network, ${userSession.vendorName}!

📋 Vendor ID: VEN-${Date.now()}

You'll start receiving pricing inquiries for ${userSession.materials.join(' and ').toUpperCase()} in ${userSession.vendorCity} via Telegram.

When you receive an inquiry, reply with your quote in this format:

**RATE: [Price] per [Unit]**
**GST: [Percentage]%**  
**DELIVERY: [Charges]**

Example:
RATE: 350 per bag
GST: 18%
DELIVERY: 50
Inquiry ID: INQ-123456789

Send /start anytime for help or to update your information.`;
            // Clear session after successful registration
            this.userSessions.delete(chatId.toString());
          } catch (error) {
            console.error('Vendor registration failed:', error);
            response = `❌ Registration failed. Please try again by sending /start`;
            this.userSessions.delete(chatId.toString());
          }
        } else if (text?.toLowerCase().trim() === 'restart') {
          userSession.step = 'user_type';
          response = `🔄 Let's start over!

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
        } else {
          response = `Please reply "confirm" to complete registration or "restart" to start over.`;
        }
        break;

      case 'get_city':
        userSession.city = text?.trim();
        userSession.step = 'get_material';
        response = `📍 City: ${userSession.city}

What are you looking for?

1️⃣ Cement
2️⃣ TMT Bars

Reply with 1 or 2:`;
        break;

      case 'get_material':
        if (text === '1' || text?.toLowerCase().includes('cement')) {
          userSession.material = 'cement';
        } else if (text === '2' || text?.toLowerCase().includes('tmt')) {
          userSession.material = 'tmt';
        } else {
          response = `Please select:
1 - for Cement
2 - for TMT Bars`;
          break;
        }
        userSession.step = 'get_brand';
        response = `🏷️ Any specific brand preference?

For ${userSession.material}:
- Enter brand name (e.g., ACC, Ambuja, UltraTech)
- Or type "any" for any brand`;
        break;

      case 'get_brand':
        userSession.brand = text?.toLowerCase() === 'any' ? null : text?.trim();
        userSession.step = 'get_quantity';
        response = `📦 How much quantity do you need?

Examples:
- 50 bags
- 2 tons
- 100 pieces

Enter quantity:`;
        break;

      case 'get_quantity':
        userSession.quantity = text?.trim();
        userSession.step = 'confirm';

        const brandText = userSession.brand ? `Brand: ${userSession.brand}` : 'Brand: Any';
        response = `✅ Please confirm your inquiry:

📍 City: ${userSession.city}
🏗️ Material: ${userSession.material.toUpperCase()}
${brandText}
📦 Quantity: ${userSession.quantity}

Reply "confirm" to send to vendors or "restart" to start over:`;
        break;

      case 'confirm':
        if (text?.toLowerCase().trim() === 'confirm') {
          await this.processInquiry(chatId, userSession);
          response = `🚀 Your inquiry has been sent!

We've contacted vendors in ${userSession.city} for ${userSession.material} pricing. You should receive quotes shortly via Telegram.

📊 Inquiry ID: INQ-${Date.now()}

Vendors will reply directly to you with quotes in this format:
💰 Rate: ₹X per unit
📊 GST: X%
🚚 Delivery: ₹X

Send /start for a new inquiry anytime!`;
          this.userSessions.delete(chatId.toString());
        } else if (text?.toLowerCase().trim() === 'restart') {
          userSession.step = 'user_type';
          response = `🔄 Let's start over!

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
        } else {
          response = `Please reply "confirm" to send your inquiry or "restart" to start over.`;
        }
        break;

      default:
        response = `👋 Hello! Send /start to begin a new pricing inquiry.`;
        this.userSessions.delete(chatId.toString());
    }

    this.userSessions.set(chatId.toString(), userSession);
    await this.sendMessage(chatId, response);
  }

  // 🆕 NEW: Handle API messages separately
  async handleApiMessage(chatId: number, fullText: string) {
    try {
      // Extract the real message (remove [API] prefix and parse metadata)
      const parts = fullText.split('\n');
      const apiPart = parts[0]; // [API] Session: xxx | User: xxx
      const actualMessage = parts.slice(1).join('\n');

      // Parse session and user info
      const sessionMatch = apiPart.match(/Session: ([\w-]+)/);
      const userMatch = apiPart.match(/User: ([\w_]+)/);

      const sessionId = sessionMatch ? sessionMatch[1] : 'unknown';
      const userId = userMatch ? userMatch[1] : 'unknown';

      console.log(`📱 API Message received - Session: ${sessionId}, User: ${userId}`);

      // Format response for API messages
      const response = `💬 **Customer Support Message**

**Session ID:** \`${sessionId}\`
**User ID:** \`${userId}\`
**Message:** ${actualMessage}

---
*This message was sent via API. Reply to this chat to respond to the customer.*`;

      await this.sendMessage(chatId, response);
    } catch (error) {
      console.error('Error handling API message:', error);
      await this.sendMessage(chatId, '❌ Error processing API message');
    }
  }
  private async processInquiry(chatId: number, session: any) {
    const inquiryId = `INQ-${Date.now()}`;

    console.log(`🔍 DEBUG: Looking for vendors in ${session.city} for ${session.material}`);

    // Find suitable vendors
    const vendors = await storage.getVendors(session.city, session.material);
    console.log(`🔍 DEBUG: Found ${vendors.length} vendors:`, vendors.map(v => ({
      name: v.name,
      city: v.city,
      materials: v.materials,
      telegramId: v.telegramId
    })));

    const selectedVendors = vendors.slice(0, 3);
    console.log(`🔍 DEBUG: Selected ${selectedVendors.length} vendors for messaging`);

    if (selectedVendors.length > 0) {
      // Create inquiry record
      await storage.createInquiry({
        inquiryId,
        userName: "Telegram User",
        userPhone: chatId.toString(),
        city: session.city,
        material: session.material,
        brand: session.brand,
        quantity: session.quantity,
        vendorsContacted: selectedVendors.map(v => v.vendorId),
        responseCount: 0,
        status: "pending",
        platform: "telegram"
      });

      // Send messages to vendors
      await this.sendVendorMessages(selectedVendors, session, inquiryId);
    } else {
      console.log(`❌ No vendors found for ${session.material} in ${session.city}`);
    }
  }

  private async processVendorRegistration(chatId: number, session: any) {
    const vendorId = `VEN-${Date.now()}`;

    console.log(`🔍 DEBUG: Registering vendor with chatId: ${chatId}`);

    try {
      // Register the vendor in the database
      const vendorData = {
        vendorId,
        name: session.vendorName,
        phone: session.vendorPhone,
        telegramId: chatId.toString(),
        city: session.vendorCity,
        materials: session.materials,
        status: 'active',
        registeredAt: new Date(),
        lastQuoted: null
      };

      console.log(`🔍 DEBUG: Vendor data to save:`, vendorData);

      const savedVendor = await storage.createVendor(vendorData);
      console.log(`🔍 DEBUG: Saved vendor:`, savedVendor);

      console.log(`✅ New vendor registered: ${session.vendorName} (${vendorId}) in ${session.vendorCity}`);
    } catch (error) {
      console.error('Failed to register vendor:', error);
      throw error;
    }
  }

  private async sendVendorMessages(vendors: any[], inquiry: any, inquiryId: string) {
    const botConfig = await storage.getBotConfig();
    let template = botConfig?.vendorRateRequestTemplate || `Hi [Vendor Name], 

New inquiry from Telegram:
- Material: [Material]
- City: [City]
- Quantity: [Quantity]
- Brand: [Brand]

Please provide your best rate including GST and delivery charges.

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

      console.log(`📨 Sending inquiry to vendor ${vendor.name} (${vendor.phone}):`, message);

      // Send actual Telegram message to the vendor if they have a telegramId
      if (vendor.telegramId && this.bot) {
        try {
          await this.bot.sendMessage(parseInt(vendor.telegramId), `🔔 **New Price Inquiry**

${message}

Reply with your quote in this format:
**RATE: [Price] per [Unit]**
**GST: [Percentage]%**
**DELIVERY: [Charges if any]**

Inquiry ID: ${inquiryId}`);

          console.log(`✅ Telegram message sent to vendor ${vendor.name} (Chat ID: ${vendor.telegramId})`);
        } catch (error) {
          console.error(`❌ Failed to send Telegram message to vendor ${vendor.name}:`, error);
          // Fallback to logging
          console.log(`📨 Would send to vendor ${vendor.name} (${vendor.phone}):`, message);
        }
      } else {
        // Fallback for vendors without Telegram ID
        console.log(`📨 Would send to vendor ${vendor.name} (${vendor.phone}):`, message);
      }

      // Update vendor last contacted time
      await storage.updateVendor(vendor.id, {
        lastQuoted: new Date()
      });
    }
  }

  async sendMessage(chatId: number, message: string) {
    try {
      if (!this.bot) {
        throw new Error("Bot not initialized");
      }
      // Always send real messages in Telegram (it's free!)
      const result = await this.bot.sendMessage(chatId, message);
      console.log(`📨 Telegram message sent to ${chatId}`);
      return result;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      throw error;
    }
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

// Create the bot instance with empty token initially
export const telegramBot = new TelegramBotService({
  token: "" // Will be loaded when start() is called
});