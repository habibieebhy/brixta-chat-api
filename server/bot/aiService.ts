interface AIExtractionResult {
  extracted: boolean;
  confidence: number;
  data: {
    userType?: 'buyer' | 'vendor';
    city?: string;
    material?: 'cement' | 'tmt';
    brand?: string;
    quantity?: string;
    vendorName?: string;
    vendorPhone?: string;
    materials?: string[];
  };
  suggestedStep: string;
}

interface SaleExtractionResult {
  extracted: boolean;
  confidence: number;
  data: {
    sales_type?: 'cement' | 'tmt' | 'both';
    cement_company?: string;
    cement_qty?: string;
    cement_price?: number;
    tmt_company?: string;
    tmt_sizes?: string;
    tmt_prices?: string;
    tmt_quantities?: string;
    project_owner?: string;
    project_name?: string;
    project_location?: string;
    completion_time?: number;
    contact_number?: string;
    sales_rep_name?: string;
    platform?: string;
  };
  suggestedStep: string;
}

export class AIService {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extractStandardQuotes(message: string): Promise<{
    extracted: boolean;
    confidence: number;
    data: {
      cement_rate?: number;
      tmt_rate?: number;
      gst?: number;
      delivery?: number;
      action?: 'set' | 'update' | 'same';
    };
    suggestedStep: string;
  }> {
    try {
      const prompt = `Extract standard quote information from: "${message}"

IMPORTANT RULES:
- Look for cement rates: "cement 350", "cement is 380 per bag", "cement rate 400"
- Look for TMT rates: "tmt 48", "tmt is 52 per kg", "tmt rate 55"
- Look for GST: "gst 18%", "gst is 12", "18% gst"
- Look for delivery: "delivery 50", "delivery free", "delivery charges 100"
- Look for actions: "same as yesterday", "keep same", "update rates", "change my rates"

Return JSON:
{
  "cement_rate": numeric_rate or null,
  "tmt_rate": numeric_rate or null,
  "gst": numeric_percentage or null,
  "delivery": numeric_amount or null (0 for free),
  "action": "set" or "update" or "same" or null,
  "confidence": 0.0-1.0,
  "suggestedStep": "quote_confirm" or "get_missing_rates" or "apply_same"
}

Examples:
"My cement is 350 per bag today, tmt 48 per kg, gst 18%, delivery 50" → cement_rate: 350, tmt_rate: 48, gst: 18, delivery: 50
"Cement 380 today" → cement_rate: 380
"Same as yesterday" → action: "same"
"Update my rates" → action: "update"
"TMT 52, delivery free" → tmt_rate: 52, delivery: 0`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 200
        })
      });

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        extracted: parsed.confidence > 0.7,
        confidence: parsed.confidence || 0,
        data: {
          cement_rate: parsed.cement_rate,
          tmt_rate: parsed.tmt_rate,
          gst: parsed.gst,
          delivery: parsed.delivery,
          action: parsed.action
        },
        suggestedStep: parsed.suggestedStep || 'quote_confirm'
      };

    } catch (error) {
      console.error('Quote extraction failed:', error);
      return {
        extracted: false,
        confidence: 0,
        data: {},
        suggestedStep: 'get_missing_rates'
      };
    }
  }

  async extractInformation(message: string, currentStep: string): Promise<AIExtractionResult> {
    try {
      const prompt = `Extract info from: "${message}"

IMPORTANT RULES:
- If message contains "I supply", "I sell", "vendor", "supplier", "dealer", "store", "business" → userType: "vendor"
- If message contains "I need", "I want", "looking for", "require", "buy" → userType: "buyer"

Return JSON:
{
  "userType": "buyer" or "vendor" or null,
  "city": "Guwahati" or "Mumbai" or "Delhi" or null,
  "material": "cement" or "tmt" or null,
  "quantity": "amount" or null,
  "brand": "brand name" or null,
  "vendorName": "company name" or null,
  "vendorPhone": "phone" or null,
  "materials": ["cement","tmt"] or null,
  "confidence": 0.0-1.0,
  "suggestedStep": "confirm" or "vendor_confirm" or "get_city" etc
}

Examples:
"I supply cement" → userType: "vendor", suggestedStep: "vendor_confirm"
"I need cement" → userType: "buyer", suggestedStep: "confirm"`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 200
        })
      });

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        extracted: parsed.confidence > 0.7,
        confidence: parsed.confidence || 0,
        data: parsed,
        suggestedStep: parsed.suggestedStep || 'user_type'
      };

    } catch (error) {
      console.error('AI failed:', error);
      return {
        extracted: false,
        confidence: 0,
        data: {},
        suggestedStep: currentStep
      };
    }
  }

  async classifyMessageType(message: string): Promise<{
    messageType: 'customer_inquiry' | 'vendor_rate_update' | 'vendor_registration' | 'general_chat' | 'sale_entry';
    confidence: number;
    reasoning?: string;
  }> {
    try {
      const prompt = `Classify this message type: "${message}"

IMPORTANT RULES:
- "customer_inquiry": Customer asking for prices/quotes (contains "I need", "looking for", "require", "want to buy")
- "vendor_rate_update": Vendor providing/updating rates (contains specific prices like "cement 350", "rate 380", "my rates")  
- "vendor_registration": Vendor introducing business (contains "I supply", "I sell", "dealer", "business")
- "sale_entry": Recording completed sales (contains "sold", "delivered", "supplied", "transaction")
- "general_chat": Greetings, help requests, casual conversation

Return JSON:
{
  "messageType": "customer_inquiry" or "vendor_rate_update" or "vendor_registration" or "sale_entry" or "general_chat",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Examples:
"Hey I will need 34 bags of cement Right now in Guwahati Beltola" → messageType: "customer_inquiry"
"My cement rate is 350 per bag today" → messageType: "vendor_rate_update"  
"I supply cement and TMT in Mumbai" → messageType: "vendor_registration"
"Sold 50 bags to ABC company yesterday" → messageType: "sale_entry"`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 150
        })
      });

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        messageType: parsed.messageType,
        confidence: parsed.confidence || 0,
        reasoning: parsed.reasoning
      };

    } catch (error) {
      console.error('Message classification failed:', error);
      return {
        messageType: 'general_chat',
        confidence: 0,
        reasoning: 'Classification failed'
      };
    }
  }

  async extractSaleInformation(message: string): Promise<SaleExtractionResult> {
    try {
      const prompt = `Extract sale information from: "${message}"

IMPORTANT RULES:
- Look for sale keywords: "sold", "delivered", "supplied", "transaction", "sale", "deal"
- Extract company/buyer name, material type, quantity, price, location
- For cement: extract company name, quantity (bags/tons), price per unit
- For TMT: extract company name, sizes, quantities, prices
- Extract project details if mentioned

Return JSON:
{
  "sales_type": "cement" or "tmt" or "both" or null,
  "cement_company": "company name" or null,
  "cement_qty": "quantity with unit" or null,
  "cement_price": numeric_price or null,
  "tmt_company": "company name" or null,
  "tmt_sizes": "sizes like 8mm,10mm,12mm" or null,
  "tmt_prices": "prices array" or null,
  "tmt_quantities": "quantities array" or null,
  "project_owner": "owner name" or null,
  "project_name": "project name" or null,
  "project_location": "location" or null,
  "completion_time": days_number or null,
  "contact_number": "phone number" or null,
  "sales_rep_name": "sales person name" or null,
  "platform": "telegram" or "web" or null,
  "confidence": 0.0-1.0,
  "suggestedStep": "sale_confirm" or "get_missing_info" or "complete"
}

Examples:
"Sold 50 bags cement to ABC company for 350 per bag" → sales_type: "cement", cement_company: "ABC company", cement_qty: "50 bags", cement_price: 350
"Delivered TMT bars 8mm 2 tons to XYZ project" → sales_type: "tmt", tmt_company: "XYZ project", tmt_sizes: "8mm", tmt_quantities: "2 tons"`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 300
        })
      });

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        extracted: parsed.confidence > 0.7,
        confidence: parsed.confidence || 0,
        data: {
          sales_type: parsed.sales_type,
          cement_company: parsed.cement_company,
          cement_qty: parsed.cement_qty,
          cement_price: parsed.cement_price,
          tmt_company: parsed.tmt_company,
          tmt_sizes: parsed.tmt_sizes,
          tmt_prices: parsed.tmt_prices,
          tmt_quantities: parsed.tmt_quantities,
          project_owner: parsed.project_owner,
          project_name: parsed.project_name,
          project_location: parsed.project_location,
          completion_time: parsed.completion_time,
          contact_number: parsed.contact_number,
          sales_rep_name: parsed.sales_rep_name,
          platform: parsed.platform || 'telegram'
        },
        suggestedStep: parsed.suggestedStep || 'sale_confirm'
      };

    } catch (error) {
      console.error('Sale extraction failed:', error);
      return {
        extracted: false,
        confidence: 0,
        data: {},
        suggestedStep: 'get_missing_info'
      };
    }
  }
}