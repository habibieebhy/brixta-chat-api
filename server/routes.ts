import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVendorSchema, insertInquirySchema, insertPriceResponseSchema, insertBotConfigSchema } from "@shared/schema";
import { z } from "zod";
import { whatsappBot } from "./bot/whatsapp";
//import { telegramBot } from "./bot/telegram";
//import { Router } from 'express';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { TelegramBotService, sendTelegramMessage } from "./bot/telegram";

//tele bot accessor
const telegramBot = new TelegramBotService({ token: process.env.TELEGRAM_BOT_TOKEN });
const REAL_CHAT_ID = '6924933952';
// API key validation middleware
const validateApiKey = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  let token;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (apiKeyHeader) {
    token = apiKeyHeader;
  } else {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  try {
    const apiKey = await storage.getApiKey(token);
    if (!apiKey || !apiKey.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }
    req.apiKey = apiKey; // Store for later use
    await storage.updateApiKeyLastUsed(token);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Start both bots
  await whatsappBot.start();
  await telegramBot.start();

  // WhatsApp webhook endpoint for incoming messages
  app.post("/webhook/whatsapp", async (req, res) => {
    try {
      const { From, Body } = req.body;

      if (From && Body) {
        await whatsappBot.handleIncomingMessage(From, Body);
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('WhatsApp webhook error:', error);
      res.status(500).send('Error processing message');
    }
  });

  // Telegram webhook endpoint for incoming messages
  app.post('/webhook/telegram', async (req, res) => {
    try {
      if (req.body.message && req.body.message.text) {
        const message = req.body.message.text;
        const chatId = req.body.message.chat.id;

        // Only process messages from your chat ID
        if (chatId == 6924933952) {

          // Check if this is a reply to a web user (contains session ID)
          const sessionMatch = message.match(/🔗 Session: ([a-f0-9-]+)/);

          if (sessionMatch) {
            const sessionId = sessionMatch[1];

            // Extract the actual reply (remove session prefix)
            const botReply = message.replace(/🔗 Session: [a-f0-9-]+\n/, '');

            // Send reply back to the specific web user
            global.io.to(`session-${sessionId}`).emit("bot-reply", {
              sessionId,
              message: botReply
            });

            console.log(`✅ Reply routed to session ${sessionId}`);
          }
        }
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Bot status endpoints
  app.get("/api/admin/whatsapp-status", async (req, res) => {
    try {
      const status = whatsappBot.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get WhatsApp bot status" });
    }
  });

  app.get("/api/admin/telegram-status", async (req, res) => {
    try {
      const status = telegramBot.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get Telegram bot status" });
    }
  });

  // Test endpoint to setup Telegram webhook
  // Create new chat session (standard endpoint)
  app.post("/api/chat/sessions", validateApiKey, async (req, res) => {
    try {
      const { userId } = req.body;
      const authHeader = req.headers.authorization || req.headers['x-api-key'];
      let token;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else {
        token = req.headers['x-api-key'];
      }

      const apiKey = await storage.getApiKey(token);
      const sessionId = uuidv4();

      console.log("🔍 Creating session for userId:", userId);
      await storage.createChatSession({
        apiKeyId: apiKey.id,
        sessionId,
        status: 'active'
      });
      console.log("✅ Session created:", sessionId);

      res.json({
        success: true,
        sessionId,
        message: "Chat session created successfully"
      });
    } catch (error) {
      console.error('Failed to create chat session:', error);
      res.status(500).json({ error: "Failed to create chat session" });
    }
  });
  app.get('/setup-webhook', async (req, res) => {
    try {
      // Use your ngrok URL
      //const webhookUrl = 'https://b47f-2405-201-a805-30d9-c573-2d92-1f65-7434.ngrok-free.app/webhook/telegram';
      const webhookUrl = 'https://telegram-chat-api.onrender.com/webhook/telegram';
      console.log('🔗 Setting up webhook for:', webhookUrl);

      const info = await telegramBot.setupWebhook(webhookUrl);

      res.json({
        success: true,
        webhookUrl,
        info
      });
    } catch (error) {
      console.error('❌ Setup webhook error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Combined bot status endpoint
  app.get("/api/admin/bot-status", async (req, res) => {
    try {
      const whatsappStatus = whatsappBot.getStatus();
      const telegramStatus = telegramBot.getStatus();

      res.json({
        whatsapp: whatsappStatus,
        telegram: telegramStatus,
        totalActiveSessions: (whatsappStatus.activeSessions || 0) + (telegramStatus.activeSessions || 0)
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get bot status" });
    }
  });

  // Dashboard metrics endpoint
  app.get("/api/metrics", async (req, res) => {
    try {
      const metrics = await storage.getMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  // Get latest pricing data - public endpoint with API key
  app.get("/api/rates", validateApiKey, async (req, res) => {
    try {
      const { city, material, limit } = req.query;
      const rates = await storage.getVendorRates(
        undefined, // vendorId
        material as string
      );

      // Filter by city if provided
      let filteredRates = rates;
      if (city) {
        filteredRates = rates.filter(rate => rate.city === city);
      }

      // Limit results
      if (limit) {
        filteredRates = filteredRates.slice(0, parseInt(limit as string));
      }

      res.json({
        status: "success",
        data: filteredRates
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch rates" });
    }
  });

  // Submit vendor response
  app.post("/api/vendor-response", validateApiKey, async (req, res) => {
    try {
      const responseData = insertPriceResponseSchema.parse(req.body);
      const response = await storage.createPriceResponse(responseData);

      // Update vendor last quoted time
      const vendors = await storage.getVendors();
      const vendor = vendors.find(v => v.vendorId === responseData.vendorId);
      if (vendor) {
        await storage.updateVendor(vendor.id, {
          lastQuoted: new Date(),
          responseCount: (vendor.responseCount || 0) + 1
        });
      }

      res.json({
        status: "success",
        data: response
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to submit response" });
      }
    }
  });

  // Get top vendors
  app.get("/api/top-vendors", validateApiKey, async (req, res) => {
    try {
      const { material, limit } = req.query;
      const vendors = await storage.getVendors(undefined, material as string);

      // Sort by response count and rate
      const sortedVendors = vendors.sort((a, b) => {
        return (b.responseCount || 0) - (a.responseCount || 0);
      });

      const limitedVendors = limit ?
        sortedVendors.slice(0, parseInt(limit as string)) :
        sortedVendors;

      res.json({
        status: "success",
        data: limitedVendors
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch top vendors" });
    }
  });
  // Send message to bot with session ID
  app.post("/api/send-telegram-message", validateApiKey, async (req, res) => {
    try {
      const { sessionId, message } = req.body;
      if (!sessionId || !message) {
        return res.status(400).json({
          error: "Missing required fields: sessionId and message"
        });
      }
      // 🆕 NEW: Format as API message for bot to handle differently
      const apiMessage = `[API] Session: ${sessionId} | User: api_user
${message}`;

      // Send to your bot (your chat ID: 6924933952)
      await telegramBot.sendMessage(6924933952, apiMessage);
      res.json({
        status: "success",
        message: "Message sent to bot successfully",
        sessionId: sessionId
      });
    } catch (error) {
      console.error('Failed to send message to bot:', error);
      res.status(500).json({
        error: "Failed to send message",
        details: error.message
      });
    }
  });
  // ========================================
  // TWO-WAY CHAT SYSTEM
  // ========================================

  // Create new chat session
  app.post("/api/chat/create-session", validateApiKey, async (req, res) => {
    try {
      const { userId } = req.body; // ADD THIS LINE TO EXTRACT userId
      const authHeader = req.headers.authorization;
      const token = authHeader.substring(7);
      const apiKey = await storage.getApiKey(token);

      const sessionId = uuidv4();

      // Create session in database
      console.log("🔍 Creating session for userId:", userId);
      await storage.createChatSession({
        apiKeyId: apiKey.id,
        sessionId,
        status: 'active'
      });
      console.log("✅ Session created:", sessionId);

      res.json({
        success: true,
        sessionId,
        message: "Chat session created successfully"
      });
    } catch (error) {
      console.error('Failed to create chat session:', error);
      res.status(500).json({ error: "Failed to create chat session" });
    }
  });

  // Send message in existing session
  app.post("/api/chat/send-message", validateApiKey, async (req, res) => {
    try {
      const { sessionId, userId, message } = req.body;

      if (!message) {
        return res.status(400).json({
          error: "Missing required field: message"
        });
      }

      // Auto-generate userId from IP if not provided
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      const finalUserId = userId || `ip_${clientIP.replace(/[.:]/g, '_')}_${Date.now()}`;

      let finalSessionId = sessionId;
      let session;

      // If sessionId provided, use it directly
      if (sessionId) {
        session = await storage.getChatSession(sessionId);
        console.log("🔍 Looking for session:", sessionId);
        console.log("📋 Session found:", session);

        if (!session) {
          return res.status(404).json({ error: "Chat session not found" });
        }
        finalSessionId = sessionId;
      }
      // Find or create session using finalUserId (auto-generated from IP if needed)
      else {
        console.log("🔍 Looking for session by userId:", finalUserId);

        // Try to find existing session for this userId
        session = await storage.getChatSessionByUserId(finalUserId);

        if (session) {
          console.log("📋 Found existing session:", session.sessionId);
          finalSessionId = session.sessionId;
        } else {
          // Auto-create new session
          const authHeader = req.headers.authorization || req.headers['x-api-key'];
          const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
          const apiKey = await storage.getApiKey(token);

          finalSessionId = uuidv4();
          console.log("🆕 Auto-creating session:", finalSessionId, "for userId:", finalUserId);

          await storage.createChatSession({
            apiKeyId: apiKey.id,
            sessionId: finalSessionId,
            userId: finalUserId,
            status: 'active'
          });

          console.log("✅ Session auto-created successfully");
        }
      }

      // Save message to database
      await storage.createChatMessage({
        sessionId: finalSessionId,
        senderType: 'developer',
        message,
        senderId: 'api-user'
      });

      // Send to Telegram with session formatting
      const formattedMessage = `🔗 Session: ${finalSessionId}\n👤 User: ${finalUserId}\n📝 ${message}`;
      await telegramBot.sendMessage(6924933952, formattedMessage);

      // Emit to WebSocket clients
      global.io.to(`session-${finalSessionId}`).emit('new-message', {
        sessionId: finalSessionId,
        senderType: 'developer',
        message,
        timestamp: new Date()
      });

      res.json({
        success: true,
        sessionId: finalSessionId,
        userId: finalUserId,
        message: "Message sent successfully"
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  // Get chat history
  app.get("/api/chat/history/:sessionId", validateApiKey, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const messages = await storage.getChatMessages(sessionId);

      res.json({
        success: true,
        messages
      });
    } catch (error) {
      console.error('Failed to get chat history:', error);
      res.status(500).json({ error: "Failed to get chat history" });
    }
  });

  // Telegram webhook endpoint - receives messages from bot owner
  app.post("/api/telegram-webhook", async (req, res) => {
    try {
      const update = req.body;

      // Check if it's a text message
      if (update.message && update.message.text) {
        const message = update.message.text;
        const chatId = update.message.chat.id;

        // Only process messages from bot owner (6924933952)
        if (chatId === 6924933952) {
          // Extract session ID from message (if it's a reply)
          const sessionMatch = message.match(/🔗 Session: ([a-f0-9-]+)/);

          if (sessionMatch) {
            const sessionId = sessionMatch[1];

            // Save message to database
            await storage.createChatMessage({
              sessionId,
              senderType: 'bot_owner',
              message,
              senderId: 'telegram-owner',
              telegramMessageId: update.message.message_id
            });

            // Emit to WebSocket clients
            global.io.to(`session-${sessionId}`).emit('new-message', {
              sessionId,
              senderType: 'bot_owner',
              message,
              timestamp: new Date()
            });
          }
        }
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
  // Log inquiry
  app.post("/api/inquiry-log", async (req, res) => {
    try {
      const inquiryData = insertInquirySchema.parse(req.body);
      const inquiry = await storage.createInquiry(inquiryData);

      res.json({
        status: "success",
        data: inquiry
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to log inquiry" });
      }
    }
  });

  // ========================================
  // ADMIN ENDPOINTS - INQUIRIES MANAGEMENT
  // ========================================

  // Get all inquiries
  app.get("/api/admin/inquiries", async (req, res) => {
    try {
      const { limit } = req.query;
      const inquiries = await storage.getInquiries(limit ? parseInt(limit as string) : undefined);
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  // Update inquiry status
  app.put("/api/admin/inquiries/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      const validStatuses = ["pending", "responded", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const inquiry = await storage.updateInquiryStatus(id, status);
      if (!inquiry) {
        return res.status(404).json({ error: "Inquiry not found" });
      }

      res.json({ success: true, inquiry });
    } catch (error) {
      console.error("Error updating inquiry status:", error);
      res.status(500).json({ error: "Failed to update inquiry status" });
    }
  });

  // Delete single inquiry
  app.delete("/api/admin/inquiries/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const result = await storage.deleteInquiry(id);
      if (!result) {
        return res.status(404).json({ error: "Inquiry not found" });
      }

      res.json({ success: true, message: "Inquiry deleted successfully" });
    } catch (error) {
      console.error("Error deleting inquiry:", error);
      res.status(500).json({ error: "Failed to delete inquiry" });
    }
  });

  // Bulk operations
  app.post("/api/admin/inquiries/bulk", async (req, res) => {
    try {
      const { inquiryIds, action } = req.body;

      if (!Array.isArray(inquiryIds) || inquiryIds.length === 0) {
        return res.status(400).json({ error: "Invalid inquiry IDs" });
      }

      let result;
      switch (action) {
        case "completed":
          result = await storage.bulkUpdateInquiryStatus(inquiryIds, "completed");
          break;
        case "cancelled":
          result = await storage.bulkUpdateInquiryStatus(inquiryIds, "cancelled");
          break;
        case "delete":
          result = await storage.bulkDeleteInquiries(inquiryIds);
          break;
        default:
          return res.status(400).json({ error: "Invalid action" });
      }

      res.json({
        success: true,
        message: `${action} operation completed successfully`,
        affected: result.count
      });
    } catch (error) {
      console.error("Error in bulk operation:", error);
      res.status(500).json({ error: "Failed to complete bulk operation" });
    }
  });

  // ========================================
  // ADMIN ENDPOINTS - VENDORS MANAGEMENT
  // ========================================

  // Get all vendors with latest quotes
  app.get("/api/admin/vendors", async (req, res) => {
    try {
      const vendorsWithQuotes = await storage.getVendorsWithLatestQuotes();
      res.json(vendorsWithQuotes);
    } catch (error) {
      console.error('Error fetching vendors with quotes:', error);
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

  // Create vendor
  app.post("/api/admin/vendors", async (req, res) => {
    try {
      const vendorData = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(vendorData);
      res.json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid vendor data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create vendor" });
      }
    }
  });

  // Update vendor
  app.put("/api/admin/vendors/:id", async (req, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      const updates = req.body;
      const vendor = await storage.updateVendor(vendorId, updates);
      res.json(vendor);
    } catch (error) {
      console.error('Error updating vendor:', error);
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });

  // Delete vendor
  app.delete("/api/admin/vendors/:id", async (req, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      await storage.deleteVendor(vendorId);
      res.json({ success: true, message: 'Vendor deleted successfully' });
    } catch (error) {
      console.error('Error deleting vendor:', error);
      res.status(500).json({ error: "Failed to delete vendor" });
    }
  });

  // Get vendor by ID
  app.get("/api/admin/vendors/:id", async (req, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      const vendors = await storage.getAllVendors();
      const vendor = vendors.find(v => v.id === vendorId);

      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      res.json(vendor);
    } catch (error) {
      console.error('Error fetching vendor:', error);
      res.status(500).json({ error: "Failed to fetch vendor" });
    }
  });

  // ========================================
  // NOTIFICATIONS MANAGEMENT
  // ========================================

  // Get all notifications
  app.get("/api/admin/notifications", async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.put("/api/admin/notifications/:id/read", async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      await storage.markNotificationAsRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read
  app.put("/api/admin/notifications/mark-all-read", async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead();
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Clear all notifications
  app.delete("/api/admin/notifications/clear-all", async (req, res) => {
    try {
      await storage.clearAllNotifications();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      res.status(500).json({ error: "Failed to clear all notifications" });
    }
  });

  // FIXED: Delete single notification
  app.delete("/api/admin/notifications/:notificationId", async (req, res) => {
    try {
      const { notificationId } = req.params;
      await storage.deleteNotification(parseInt(notificationId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // ========================================
  // API KEYS MANAGEMENT
  // ========================================
  // Generate secure API key
  function generateApiKey(type: 'vendor_rates' | 'telegram_bot'): string {
    const prefix = type === 'vendor_rates' ? 'vr_' : 'tb_';
    const randomKey = crypto.randomBytes(32).toString('hex');
    return `${prefix}${randomKey}`;
  }

  // Get all API keys
  app.get("/api/admin/api-keys", async (req, res) => {
    try {
      const apiKeys = await storage.getApiKeys();
      res.json(apiKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  // Create new API key
  app.post('/api/admin/api-keys', async (req, res) => {
    try {
      const { name, keyType = 'vendor_rates', permissions = [], rateLimitPerHour = 1000 } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      const keyValue = generateApiKey(keyType);

      const apiKey = await storage.createApiKey({
        name,
        keyValue,
        keyType,
        permissions,
        rateLimitPerHour,
        isActive: true
      });
      res.status(201).json({
        success: true,
        apiKey: {
          ...apiKey,
          keyValue // Show the key only once on creation
        }
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });
  // Update API key (activate/deactivate)
  app.put("/api/admin/api-keys/:keyId", async (req, res) => {
    try {
      const { keyId } = req.params;
      const updates = req.body;

      const apiKey = await storage.updateApiKey(parseInt(keyId), updates);
      res.json(apiKey);
    } catch (error) {
      console.error("Error updating API key:", error);
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  // Delete API key
  app.delete("/api/admin/api-keys/:keyId", async (req, res) => {
    try {
      const { keyId } = req.params;
      await storage.deleteApiKey(parseInt(keyId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // ========================================
  // BOT CONFIGURATION
  // ========================================

  // Get bot configuration
  app.get("/api/admin/bot-config", async (req, res) => {
    try {
      const config = await storage.getBotConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching bot config:', error);
      res.status(500).json({ error: "Failed to fetch bot configuration" });
    }
  });

  // Update bot configuration
  app.put("/api/admin/bot-config", async (req, res) => {
    try {
      const configData = req.body; // Don't parse with schema for partial updates
      const config = await storage.updateBotConfig(configData);
      res.json(config);
    } catch (error) {
      console.error('Error updating bot config:', error);
      res.status(500).json({ error: "Failed to update bot configuration" });
    }
  });
  // Replace your current endpoint with this debug version:
  app.post("/api/admin/request-vendor-rates", async (req, res) => {
    try {
      const { city, material, inquiryId } = req.body;
      const botConfig = await storage.getBotConfig();
      const botConfigData = await storage.getBotConfig();
      console.log("🐛 DEBUG: Bot config loaded:", botConfigData);
      console.log("🐛 DEBUG: vendorRateRequestTemplate:", botConfigData?.vendorRateRequestTemplate);

      const vendors = await storage.getVendors(city, material);
      console.log(`Found ${vendors.length} vendors:`, vendors.map(v => ({ id: v.id, telegramId: v.telegramId, name: v.vendorId })));

      if (vendors.length === 0) {
        return res.json({
          success: false,
          message: "No vendors found for this location and material"
        });
      }

      let successCount = 0;
      for (const vendor of vendors) {
        console.log(`Processing vendor ${vendor.id} with telegramId: ${vendor.telegramId}`);

        try {
          if (vendor.telegramId) {
            const message = botConfigData?.vendorRateRequestTemplate
              ? botConfigData.vendorRateRequestTemplate
                .replace(/\[Material\]/g, material || 'undefined')
                .replace(/\[City\]/g, city || 'undefined')
                .replace(/\[Inquiry ID\]/g, inquiryId || 'undefined')
              : `🔔 New Rate Request
Material: ${material || 'undefined'}
Location: ${city || 'undefined'}
Inquiry ID: ${inquiryId || 'undefined'}
Please reply with:
RATE: [your rate per unit]
GST: [GST percentage]
DELIVERY: [delivery time]
Inquiry ID: ${inquiryId || 'undefined'}`;
            console.log(`Attempting to send message to ${vendor.telegramId}`);
            await telegramBot.sendMessage(parseInt(vendor.telegramId), message);
            console.log(`✅ Message sent successfully to ${vendor.telegramId}`);
            successCount++;
          } else {
            console.log(`❌ No telegramId for vendor ${vendor.id}`);
          }
        } catch (error) {
          console.error(`❌ Failed to send message to vendor ${vendor.id}:`, error);
        }
      }

      res.json({
        success: true,
        vendorsContacted: successCount,
        totalVendors: vendors.length
      });

    } catch (error) {
      console.error('Error sending rate requests:', error);
      res.status(500).json({ error: "Failed to send rate requests" });
    }
  });
  const httpServer = createServer(app);

  // Add Socket.IO support
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-session', (sessionId) => {
      socket.join(`session-${sessionId}`);
      console.log(`Client ${socket.id} joined session: ${sessionId}`);
    });

    socket.on('message', async ({ sessionId, message }) => {
      console.log(`📩 Message from session ${sessionId}:`, message);

      try {
        // Format message with session ID for your Telegram bot
        const formattedMessage = `🔗 Session: ${sessionId}\n📝 ${message}`;

        // Send to your Telegram chat ID (6924933952)
        await sendTelegramMessage(REAL_CHAT_ID, formattedMessage);

        console.log(`✅ Message sent to Telegram for session ${sessionId}`);

        // Don't send immediate reply - wait for bot response via webhook

      } catch (error) {
        console.error('❌ Error sending to Telegram:', error);

        // Send error message back to user
        io.to(`session-${sessionId}`).emit("bot-reply", {
          sessionId,
          message: "❌ Sorry, there was an error sending your message. Please try again."
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Make io available globally for routes
  global.io = io;

  return httpServer;
}