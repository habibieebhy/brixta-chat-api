import { storage } from "../storage";
import twilio from "twilio";

export interface WhatsAppBotConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export class WhatsAppBot {
  private client: twilio.Twilio;
  private phoneNumber: string;
  private isActive: boolean = true;
  private userSessions: Map<string, any> = new Map();

  constructor(config: WhatsAppBotConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = `whatsapp:+${config.phoneNumber}`;
  }

  async start() {
    this.isActive = true;
    console.log("WhatsApp bot started with number:", this.phoneNumber);
  }

  async stop() {
    this.isActive = false;
    console.log("WhatsApp bot stopped");
  }

  async handleIncomingMessage(from: string, body: string) {
    if (!this.isActive) return;

    const userPhone = from.replace('whatsapp:', '');
    const userSession = this.userSessions.get(userPhone) || { step: 'start' };

    let response = '';

    switch (userSession.step) {
      case 'start':
        if (body.toLowerCase().includes('hello') || body.toLowerCase().includes('hi') || body.toLowerCase().includes('start')) {
          response = `🏗️ Welcome to PriceBot! 

I help you get instant pricing for cement and TMT bars from verified vendors in your city.

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
          userSession.step = 'user_type';
        } else {
          response = `👋 Hello! Send "hi" to get started with pricing inquiries.`;
        }
        break;

      case 'user_type':
        if (body === '1' || body.toLowerCase().includes('buyer')) {
          userSession.userType = 'buyer';
          userSession.step = 'get_city';
          response = `Great! I'll help you find prices in your city.

📍 Which city are you in?

Available cities: Guwahati, Mumbai, Delhi

Please enter your city name:`;
        } else if (body === '2' || body.toLowerCase().includes('vendor')) {
          response = `👨‍💼 Thank you for your interest in providing quotes! 

Please contact our admin team to register as a vendor and start receiving inquiry requests.

For buyer inquiries, send "start" anytime.`;
          this.userSessions.delete(userPhone);
        } else {
          response = `Please reply with:
1 - if you're a Buyer
2 - if you're a Vendor`;
        }
        break;

      case 'get_city':
        userSession.city = body.trim();
        userSession.step = 'get_material';
        response = `📍 City: ${userSession.city}

What are you looking for?

1️⃣ Cement
2️⃣ TMT Bars

Reply with 1 or 2:`;
        break;

      case 'get_material':
        if (body === '1' || body.toLowerCase().includes('cement')) {
          userSession.material = 'cement';
        } else if (body === '2' || body.toLowerCase().includes('tmt')) {
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
        userSession.brand = body.toLowerCase() === 'any' ? null : body.trim();
        userSession.step = 'get_quantity';
        response = `📦 How much quantity do you need?

Examples:
- 50 bags
- 2 tons
- 100 pieces

Enter quantity:`;
        break;

      case 'get_quantity':
        userSession.quantity = body.trim();
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
        if (body.toLowerCase() === 'confirm') {
          await this.processInquiry(userPhone, userSession);
          response = `🚀 Your inquiry has been sent!

We've contacted vendors in ${userSession.city} for ${userSession.material} pricing. You should receive quotes shortly via WhatsApp.

📊 Inquiry ID: INQ-${Date.now()}

Send "start" for a new inquiry anytime!`;
          this.userSessions.delete(userPhone);
        } else if (body.toLowerCase() === 'restart') {
          this.userSessions.delete(userPhone);
          response = `🔄 Let's start over!

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
          userSession.step = 'user_type';
        } else {
          response = `Please reply "confirm" to send your inquiry or "restart" to start over.`;
        }
        break;

      default:
        response = `👋 Hello! Send "start" to begin a new pricing inquiry.`;
        this.userSessions.delete(userPhone);
    }

    this.userSessions.set(userPhone, userSession);
    await this.sendMessage(from, response);
  }

  private async processInquiry(userPhone: string, session: any) {
    const inquiryId = `INQ-${Date.now()}`;
    
    // Find suitable vendors
    const vendors = await storage.getVendors(session.city, session.material);
    const selectedVendors = vendors.slice(0, 3);

    if (selectedVendors.length > 0) {
      // Create inquiry record
      await storage.createInquiry({
        inquiryId,
        userName: "WhatsApp User",
        userPhone,
        city: session.city,
        material: session.material,
        brand: session.brand,
        quantity: session.quantity,
        vendorsContacted: selectedVendors.map(v => v.vendorId),
        responseCount: 0,
        status: "pending"
      });

      // Send messages to vendors
      await this.sendVendorMessages(selectedVendors, session, inquiryId);
    }
  }

  private async sendVendorMessages(vendors: any[], inquiry: any, inquiryId: string) {
    const botConfig = await storage.getBotConfig();
    let template = botConfig?.messageTemplate || `Hi [Vendor Name], 

New inquiry from WhatsApp:
- Material: [Material]
- City: [City]
- Quantity: [Quantity]
- Brand: [Brand]

Please provide your best rate including GST and delivery charges.

Inquiry ID: ${inquiryId}`;

    for (const vendor of vendors) {
      const message = template
        .replace(/\[Vendor Name\]/g, vendor.name)
        .replace(/\[Material\]/g, inquiry.material)
        .replace(/\[City\]/g, inquiry.city)
        .replace(/\[Quantity\]/g, inquiry.quantity || "Not specified")
        .replace(/\[Brand\]/g, inquiry.brand || "Any");

      // In a real implementation, you'd send SMS or email to vendors
      console.log(`Would send to vendor ${vendor.name} (${vendor.phone}):`, message);

      // Update vendor last contacted time
      await storage.updateVendor(vendor.id, { 
        lastQuoted: new Date() 
      });
    }
  }

  async sendMessage(to: string, message: string) {
    try {
      const result = await this.client.messages.create({
        from: this.phoneNumber,
        to: to,
        body: message
      });
      console.log(`WhatsApp message sent to ${to}: ${result.sid}`);
      return result;
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  }

  async sendBulkMessage(recipients: string[], message: string) {
    const results = [];
    for (const recipient of recipients) {
      try {
        const result = await this.sendMessage(recipient, message);
        results.push({ recipient, success: true, sid: result.sid });
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return results;
  }

  getStatus() {
    return {
      isActive: this.isActive,
      platform: "whatsapp",
      phoneNumber: this.phoneNumber,
      activeSessions: this.userSessions.size,
      lastUpdate: new Date()
    };
  }
}

// Export singleton instance using environment variables
export const whatsappBot = new WhatsAppBot({
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER!
});