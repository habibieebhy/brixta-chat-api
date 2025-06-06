import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { desc, eq, and, inArray, sql } from 'drizzle-orm';
import {
  vendors,
  inquiries,
  priceResponses,
  botConfig,
  vendorRates,
  apiKeys,
  notifications, // 🆕 ADD THIS IMPORT
  type Vendor,
  type InsertVendor,
  type Inquiry,
  type InsertInquiry,
  type PriceResponse,
  type InsertPriceResponse,
  type BotConfig,
  type InsertBotConfig,
  type VendorRate,
  type InsertVendorRate,
  type ApiKey,
  type InsertApiKey
} from "../shared/schema";

export class DatabaseStorage {
  private db: any;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    const connection = neon(databaseUrl);
    this.db = drizzle(connection);
  }

  // Vendor operations
  async createVendor(vendorData: InsertVendor): Promise<Vendor> {
    const [vendor] = await this.db.insert(vendors).values(vendorData).returning();
    return vendor;
  }

  async getVendors(city?: string, material?: string): Promise<Vendor[]> {
    let query = this.db.select().from(vendors).where(eq(vendors.isActive, true));

    if (city && material) {
      query = this.db.select().from(vendors).where(
        and(
          eq(vendors.isActive, true),
          eq(vendors.city, city),
          sql`${vendors.materials} && ARRAY[${material}]`
        )
      );
    }

    return await query;
  }

  async getVendorByTelegramId(telegramId: string): Promise<Vendor | null> {
    const [vendor] = await this.db
      .select()
      .from(vendors)
      .where(eq(vendors.telegramId, telegramId))
      .limit(1);

    return vendor || null;
  }

  async updateVendor(vendorId: number, updates: Partial<Vendor>): Promise<Vendor> {
    const [vendor] = await this.db
      .update(vendors)
      .set(updates)
      .where(eq(vendors.id, vendorId))
      .returning();

    return vendor;
  }

  async deleteVendor(vendorId: number): Promise<void> {
    await this.db.delete(vendors).where(eq(vendors.id, vendorId));
  }

  async getAllVendors(): Promise<Vendor[]> {
    return await this.db.select().from(vendors).orderBy(vendors.createdAt);
  }

  async getVendorsWithLatestQuotes() {
    console.log("Starting getVendorsWithLatestQuotes");

    // Get all vendors using Drizzle
    const allVendors = await this.getAllVendors();
    console.log(`Found ${allVendors.length} vendors`);

    // For each vendor, get their latest price response
    for (let vendor of allVendors) {
      console.log(`Processing vendor: ${vendor.vendorId}`);
      try {
        const latestQuotes = await this.db
          .select()
          .from(priceResponses)
          .where(eq(priceResponses.vendorId, vendor.vendorId))
          .orderBy(sql`${priceResponses.timestamp} DESC`)
          .limit(1);

        // Add the latest quote data to vendor object
        if (latestQuotes.length > 0) {
          vendor.latest_quote = latestQuotes[0];
          console.log(`Found quote for ${vendor.vendorId}`);
        } else {
          vendor.latest_quote = null;
          console.log(`No quotes for ${vendor.vendorId}`);
        }
      } catch (error) {
        console.error(`Error fetching quote for vendor ${vendor.vendorId}:`, error);
        vendor.latest_quote = null;
      }
    }

    return allVendors;
  }

  // Inquiry operations
  async createInquiry(inquiryData: InsertInquiry): Promise<Inquiry> {
    const [inquiry] = await this.db.insert(inquiries).values(inquiryData).returning();
    return inquiry;
  }

  async getInquiries(limit?: number): Promise<Inquiry[]> {
    let query = this.db.select().from(inquiries).orderBy(sql`${inquiries.timestamp} DESC`);

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  async getInquiryById(inquiryId: string): Promise<Inquiry | null> {
    const [inquiry] = await this.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.inquiryId, inquiryId))
      .limit(1);

    return inquiry || null;
  }

  async incrementInquiryResponses(inquiryId: string): Promise<void> {
    await this.db
      .update(inquiries)
      .set({
        responseCount: sql`${inquiries.responseCount} + 1`,
        status: 'responded'
      })
      .where(eq(inquiries.inquiryId, inquiryId));
  }

  // Enhanced inquiry management functions
  async updateInquiryStatus(inquiryId: string, status: string): Promise<Inquiry | null> {
    try {
      const [inquiry] = await this.db
        .update(inquiries)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(inquiries.id, inquiryId))
        .returning();

      return inquiry || null;
    } catch (error) {
      console.error("Error updating inquiry status:", error);
      throw error;
    }
  }

  async deleteInquiry(inquiryId: string): Promise<Inquiry | null> {
    try {
      const [inquiry] = await this.db
        .delete(inquiries)
        .where(eq(inquiries.id, inquiryId))
        .returning();

      return inquiry || null;
    } catch (error) {
      console.error("Error deleting inquiry:", error);
      throw error;
    }
  }

  async bulkUpdateInquiryStatus(inquiryIds: string[], status: string) {
    try {
      const result = await this.db
        .update(inquiries)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(inArray(inquiries.id, inquiryIds))
        .returning();

      return { count: result.length, inquiries: result };
    } catch (error) {
      console.error("Error bulk updating inquiry status:", error);
      throw error;
    }
  }

  async bulkDeleteInquiries(inquiryIds: string[]) {
    try {
      const result = await this.db
        .delete(inquiries)
        .where(inArray(inquiries.id, inquiryIds))
        .returning();

      return { count: result.length };
    } catch (error) {
      console.error("Error bulk deleting inquiries:", error);
      throw error;
    }
  }

  // Price response operations
  async createPriceResponse(responseData: InsertPriceResponse): Promise<PriceResponse> {
    const [response] = await this.db.insert(priceResponses).values(responseData).returning();
    
    // 🆕 NEW: Update inquiry response count when price response is created
    if (responseData.inquiryId) {
      await this.incrementInquiryResponses(responseData.inquiryId);
    }
    
    return response;
  }

  async getPriceResponses(): Promise<PriceResponse[]> {
    return await this.db.select().from(priceResponses).orderBy(priceResponses.timestamp);
  }

  async getPriceResponsesByInquiry(inquiryId: string): Promise<PriceResponse[]> {
    return await this.db
      .select()
      .from(priceResponses)
      .where(eq(priceResponses.inquiryId, inquiryId))
      .orderBy(priceResponses.timestamp);
  }

  async getPriceResponsesByVendor(vendorId: string): Promise<PriceResponse[]> {
    return await this.db
      .select()
      .from(priceResponses)
      .where(eq(priceResponses.vendorId, vendorId))
      .orderBy(priceResponses.timestamp);
  }

  // Bot configuration
  async getBotConfig(): Promise<BotConfig | null> {
    const [config] = await this.db.select().from(botConfig).limit(1);
    return config || null;
  }

  async updateBotConfig(configData: Partial<InsertBotConfig>): Promise<BotConfig> {
    const existingConfig = await this.getBotConfig();

    if (existingConfig) {
      const [updated] = await this.db
        .update(botConfig)
        .set(configData)
        .where(eq(botConfig.id, existingConfig.id))
        .returning();
      return updated;
    } else {
      const [created] = await this.db.insert(botConfig).values(configData as InsertBotConfig).returning();
      return created;
    }
  }

  async createBotConfig(configData: InsertBotConfig): Promise<BotConfig> {
    const [config] = await this.db.insert(botConfig).values(configData).returning();
    return config;
  }

  // Vendor rates operations
  async createVendorRate(rateData: InsertVendorRate): Promise<VendorRate> {
    const [rate] = await this.db.insert(vendorRates).values(rateData).returning();
    return rate;
  }

  async getVendorRates(vendorId?: string, material?: string): Promise<VendorRate[]> {
    let query = this.db.select().from(vendorRates);

    if (vendorId && material) {
      query = query.where(
        and(
          eq(vendorRates.vendorId, vendorId),
          eq(vendorRates.material, material)
        )
      );
    } else if (vendorId) {
      query = query.where(eq(vendorRates.vendorId, vendorId));
    } else if (material) {
      query = query.where(eq(vendorRates.material, material));
    }

    return await query.orderBy(vendorRates.submittedAt);
  }

  async updateVendorRate(rateId: number, updates: Partial<VendorRate>): Promise<VendorRate> {
    const [rate] = await this.db
      .update(vendorRates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(vendorRates.id, rateId))
      .returning();

    return rate;
  }

  async deleteVendorRate(rateId: number): Promise<void> {
    await this.db.delete(vendorRates).where(eq(vendorRates.id, rateId));
  }

  // API Keys operations
  async createApiKey(keyData: any): Promise<ApiKey> {
    const [apiKey] = await this.db.insert(apiKeys).values({
      keyName: keyData.name,
      keyValue: keyData.keyValue,
      isActive: keyData.isActive,
      keyType: keyData.keyType || 'vendor_rates',
      permissions: keyData.permissions || [],
      rateLimitPerHour: keyData.rateLimitPerHour || 1000,
      usageCount: 0
    }).returning();
    return apiKey;
  }

  async getApiKeys(): Promise<ApiKey[]> {
    return await this.db.select().from(apiKeys).orderBy(apiKeys.createdAt);
  }

  async getActiveApiKeys(): Promise<ApiKey[]> {
    return await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.isActive, true))
      .orderBy(apiKeys.createdAt);
  }

  async getApiKey(keyValue: string): Promise<ApiKey | null> {
    const [apiKey] = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyValue, keyValue))
      .limit(1);

    return apiKey || null;
  }

  async updateApiKey(keyId: number, updates: Partial<ApiKey>): Promise<ApiKey> {
    const [apiKey] = await this.db
      .update(apiKeys)
      .set(updates)
      .where(eq(apiKeys.id, keyId))
      .returning();

    return apiKey;
  }

  async deactivateApiKey(keyValue: string): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.keyValue, keyValue));
  }

  async deleteApiKey(keyId: number): Promise<void> {
    await this.db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  }

  async updateApiKeyLastUsed(keyValue: string): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ lastUsed: new Date() })
      .where(eq(apiKeys.keyValue, keyValue));
  }

  async validateApiKey(keyValue: string): Promise<ApiKey | null> {
    const [apiKey] = await this.db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.keyValue, keyValue),
        eq(apiKeys.isActive, true)
      ));
    return apiKey || null;
  }

  async updateApiKeyUsage(keyValue: string): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ 
        usageCount: sql`${apiKeys.usageCount} + 1`,
        lastUsed: new Date()
      })
      .where(eq(apiKeys.keyValue, keyValue));
  }

  // 🆕 FIXED: Notification operations
  async getNotifications(): Promise<any[]> {
    try {
      const result = await this.db.select().from(notifications).orderBy(desc(notifications.createdAt));
      return result || [];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  async createNotification(notification: { message: string, type: string }) {
    try {
      const [result] = await this.db.insert(notifications).values({
        message: notification.message,
        type: notification.type,
        isRead: false,
        createdAt: new Date()
      }).returning();
      return result;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  async markNotificationAsRead(notificationId: number): Promise<void> {
    try {
      await this.db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, notificationId));
      console.log(`Marking notification ${notificationId} as read`);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    try {
      await this.db.update(notifications).set({ isRead: true });
      console.log("Marking all notifications as read");
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      await this.db.delete(notifications);
      console.log("All notifications cleared");
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  async deleteNotification(notificationId: number): Promise<void> {
    try {
      await this.db.delete(notifications).where(eq(notifications.id, notificationId));
      console.log(`Deleting notification ${notificationId}`);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }

  // Analytics and metrics
  async getMetrics() {
    const totalInquiries = await this.db.select({ count: sql`count(*)` }).from(inquiries);
    const activeVendors = await this.db.select({ count: sql`count(*)` }).from(vendors).where(eq(vendors.isActive, true));
    const totalResponses = await this.db.select({ count: sql`count(*)` }).from(priceResponses);

    // Calculate response rate
    const totalInquiriesCount = Number(totalInquiries[0]?.count || 0);
    const totalResponsesCount = Number(totalResponses[0]?.count || 0);
    const responseRate = totalInquiriesCount > 0 ? Math.round((totalResponsesCount / totalInquiriesCount) * 100) : 0;

    return {
      totalInquiries: totalInquiriesCount,
      activeVendors: Number(activeVendors[0]?.count || 0),
      messagesSent: totalResponsesCount + 150, // Mock additional messages
      responseRate: responseRate
    };
  }

  async getVendorStats(vendorId: string) {
    const inquiriesReceived = await this.db
      .select({ count: sql`count(*)` })
      .from(inquiries)
      .where(sql`${vendorId} = ANY(${inquiries.vendorsContacted})`);

    const responsesSubmitted = await this.db
      .select({ count: sql`count(*)` })
      .from(priceResponses)
      .where(eq(priceResponses.vendorId, vendorId));

    const inquiriesCount = Number(inquiriesReceived[0]?.count || 0);
    const responsesCount = Number(responsesSubmitted[0]?.count || 0);
    const responseRate = inquiriesCount > 0 ? (responsesCount / inquiriesCount * 100).toFixed(2) : "0.00";

    return {
      inquiriesReceived: inquiriesCount,
      responsesSubmitted: responsesCount,
      responseRate: `${responseRate}%`
    };
  }

  async getRecentActivity(limit: number = 10) {
    const recentInquiries = await this.db
      .select()
      .from(inquiries)
      .orderBy(sql`${inquiries.timestamp} DESC`)
      .limit(limit);

    const recentResponses = await this.db
      .select()
      .from(priceResponses)
      .orderBy(sql`${priceResponses.timestamp} DESC`)
      .limit(limit);

    return {
      recentInquiries,
      recentResponses
    };
  }

  // Utility functions
  async searchVendors(searchTerm: string): Promise<Vendor[]> {
    return await this.db
      .select()
      .from(vendors)
      .where(
        sql`${vendors.name} ILIKE ${'%' + searchTerm + '%'} OR ${vendors.city} ILIKE ${'%' + searchTerm + '%'}`
      );
  }

  // ========================================
  // CHAT SESSION OPERATIONS
  // ========================================

  async createChatSession(sessionData: {
    apiKeyId: number;
    sessionId: string;
    userId?: string;
    status?: string;
    telegramChatId?: number;
  }) {
    try {
      console.log("💾 Attempting to save session to DB:", sessionData);
      const result = await this.db.execute(sql`
        INSERT INTO chat_sessions (api_key_id, session_id, user_id, status, telegram_chat_id, created_at, updated_at)
        VALUES (${sessionData.apiKeyId}, ${sessionData.sessionId}, ${sessionData.userId || null}, ${sessionData.status || 'active'}, ${sessionData.telegramChatId || null}, NOW(), NOW())
        RETURNING *
      `);
      console.log("✅ Session saved successfully:", result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error("❌ Database error saving session:", error);
      throw error;
    }
  }

  async getChatSession(sessionId: string) {
    try {
      console.log("🔍 Querying DB for session:", sessionId);
      const result = await this.db.execute(sql`
        SELECT * FROM chat_sessions 
        WHERE session_id = ${sessionId}
        LIMIT 1
      `);
      console.log("📋 DB query result:", result.rows[0] || "NOT FOUND");
      return result.rows[0] || null;
    } catch (error) {
      console.error("❌ Database error getting session:", error);
      return null;
    }
  }

  async getChatSessionByUserId(userId: string) {
    try {
      console.log("🔍 Querying DB for session by userId:", userId);
      const result = await this.db.execute(sql`
        SELECT * FROM chat_sessions 
        WHERE user_id = ${userId} AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      console.log("📋 DB query result by userId:", result.rows[0] || "NOT FOUND");
      return result.rows[0] || null;
    } catch (error) {
      console.error("❌ Database error getting session by userId:", error);
      return null;
    }
  }

  async createChatMessage(messageData: {
    sessionId: string;
    senderType: string;
    message: string;
    senderId?: string;
    telegramMessageId?: number;
  }) {
    const result = await this.db.execute(sql`
      INSERT INTO chat_messages (session_id, sender_type, sender_id, message, telegram_message_id, created_at)
      VALUES (${messageData.sessionId}, ${messageData.senderType}, ${messageData.senderId || null}, ${messageData.message}, ${messageData.telegramMessageId || null}, NOW())
      RETURNING *
    `);
    return result.rows[0];
  }

  async getChatMessages(sessionId: string) {
    const result = await this.db.execute(sql`
      SELECT * FROM chat_messages 
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `);
    return result.rows || [];
  }
}

export const storage = new DatabaseStorage();