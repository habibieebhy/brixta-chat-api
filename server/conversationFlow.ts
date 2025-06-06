//server/conversationFLow.ts
//import { storage } from "./storage";

export interface UserSession {
  step: string;
  userType?: string;
  vendorName?: string;
  vendorCity?: string;
  vendorPhone?: string;
  materials?: string[];
  city?: string;
  material?: string;
  brand?: string;
  quantity?: string;
}

export class ConversationFlow {
  private userSessions: Map<string, UserSession> = new Map();

  // Initialize conversation with /start
  public startConversation(chatId: string): { message: string; session: UserSession } {
    this.userSessions.delete(chatId);
    const userSession: UserSession = { step: 'user_type' };

    const message = `🏗️ Welcome to CemTemBot! 

I help you get instant pricing for cement and TMT bars from verified vendors in your city.

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;

    this.userSessions.set(chatId, userSession);
    return { message, session: userSession };
  }

  // Process user message and return response
  public async processMessage(chatId: string, text: string): Promise<{ message: string; session: UserSession | null; isComplete?: boolean }> {
    const userSession = this.userSessions.get(chatId) || { step: 'start' };
    let message = '';
    let isComplete = false;

    switch (userSession.step) {
      case 'start':
        message = `👋 Hello! Send /start to get started with pricing inquiries.`;
        break;

      case 'user_type':
        if (text === '1' || text?.toLowerCase().includes('buyer')) {
          userSession.userType = 'buyer';
          userSession.step = 'get_city';
          message = `Great! I'll help you find prices in your city.

📍 Which city are you in?

Available cities: Guwahati, Mumbai, Delhi

Please enter your city name:`;
        } else if (text === '2' || text?.toLowerCase().includes('vendor')) {
          userSession.userType = 'vendor';
          userSession.step = 'vendor_name';
          message = `👨‍💼 Great! Let's register you as a vendor.

What's your business/company name?`;
        } else {
          message = `Please reply with:
1 - if you're a Buyer
2 - if you're a Vendor`;
        }
        break;

      case 'vendor_name':
        userSession.vendorName = text?.trim();
        userSession.step = 'vendor_city';
        message = `📍 Business Name: ${userSession.vendorName}

Which city do you operate in?

Available cities: Guwahati, Mumbai, Delhi

Enter your city:`;
        break;

      case 'vendor_city':
        userSession.vendorCity = text?.trim();
        userSession.step = 'vendor_materials';
        message = `📍 City: ${userSession.vendorCity}

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
          message = `Please select:
1 - Cement only
2 - TMT Bars only
3 - Both materials`;
          break;
        }
        userSession.step = 'vendor_phone';
        message = `📋 Materials: ${userSession.materials.join(', ').toUpperCase()}

What's your contact phone number?

Enter your phone number:`;
        break;

      case 'vendor_phone':
        userSession.vendorPhone = text?.trim();
        userSession.step = 'vendor_confirm';

        const materialsText = userSession.materials!.join(' and ').toUpperCase();
        message = `✅ Please confirm your vendor registration:

🏢 Business: ${userSession.vendorName}
📍 City: ${userSession.vendorCity}
🏗️ Materials: ${materialsText}
📞 Phone: ${userSession.vendorPhone}

Reply "confirm" to register or "restart" to start over:`;
        break;

      case 'vendor_confirm':
        if (text?.toLowerCase().trim() === 'confirm') {
          // Vendor registration will be handled by the calling service
          message = `🎉 Vendor registration successful!

Welcome to our vendor network, ${userSession.vendorName}!

You'll start receiving pricing inquiries for ${userSession.materials!.join(' and ').toUpperCase()} in ${userSession.vendorCity}.

Send /start anytime for help.`;
          this.userSessions.delete(chatId);
          isComplete = true;
        } else if (text?.toLowerCase().trim() === 'restart') {
          userSession.step = 'user_type';
          message = `🔄 Let's start over!

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
        } else {
          message = `Please reply "confirm" to complete registration or "restart" to start over.`;
        }
        break;

      case 'get_city':
        userSession.city = text?.trim();
        userSession.step = 'get_material';
        message = `📍 City: ${userSession.city}

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
          message = `Please select:
1 - for Cement
2 - for TMT Bars`;
          break;
        }
        userSession.step = 'get_brand';
        message = `🏷️ Any specific brand preference?

For ${userSession.material}:
- Enter brand name (e.g., ACC, Ambuja, UltraTech)
- Or type "any" for any brand`;
        break;

      case 'get_brand':
        userSession.brand = text?.toLowerCase() === 'any' ? null : text?.trim();
        userSession.step = 'get_quantity';
        message = `📦 How much quantity do you need?

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
        message = `✅ Please confirm your inquiry:

📍 City: ${userSession.city}
🏗️ Material: ${userSession.material!.toUpperCase()}
${brandText}
📦 Quantity: ${userSession.quantity}

Reply "confirm" to send to vendors or "restart" to start over:`;
        break;

      case 'confirm':
        if (text?.toLowerCase().trim() === 'confirm') {
          // Inquiry processing will be handled by the calling service
          const inquiryId = `INQ_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          
          message = `🚀 Your inquiry has been sent!

We've contacted vendors in ${userSession.city} for ${userSession.material} pricing. You should receive quotes shortly.

📊 Inquiry ID: ${inquiryId}

Send /start for a new inquiry anytime!`;
          this.userSessions.delete(chatId);
          isComplete = true;
        } else if (text?.toLowerCase().trim() === 'restart') {
          userSession.step = 'user_type';
          message = `🔄 Let's start over!

Are you a:
1️⃣ Buyer (looking for prices)
2️⃣ Vendor (want to provide quotes)

Reply with 1 or 2`;
        } else {
          message = `Please reply "confirm" to send your inquiry or "restart" to start over.`;
        }
        break;

      default:
        message = `👋 Hello! Send /start to begin a new pricing inquiry.`;
        this.userSessions.delete(chatId);
    }

    // Update session if conversation is not complete
    if (!isComplete && userSession.step !== 'start') {
      this.userSessions.set(chatId, userSession);
    }

    return { 
      message, 
      session: isComplete ? null : userSession,
      isComplete 
    };
  }

  // Get current session
  public getSession(chatId: string): UserSession | null {
    return this.userSessions.get(chatId) || null;
  }

  // Clear session
  public clearSession(chatId: string): void {
    this.userSessions.delete(chatId);
  }

  // Helper to check if user is in conversation
  public hasActiveSession(chatId: string): boolean {
    return this.userSessions.has(chatId);
  }

  // Get help message
  public getHelpMessage(): string {
    return `🤖 CemTemBot Help:

Commands:
/start - Start a new pricing inquiry
/help - Show this help message

Simply send /start to begin!`;
  }
}

// Export singleton instance
export const conversationFlow = new ConversationFlow();