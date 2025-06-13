import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVendorSchema, insertInquirySchema, insertPriceResponseSchema, insertBotConfigSchema } from "@shared/schema";
import { z } from "zod";
import { whatsappBot } from "./bot/whatsapp";
import { telegramBot } from "./bot/telegram";
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { LocationManager } from './locationManager';


declare global {
  var io: SocketIOServer | undefined;
}
export { };
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
    req.apiKey = apiKey;
    await storage.updateApiKeyLastUsed(token);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize Socket.IO
  const socketIO = new SocketIOServer(httpServer, {
    cors: {
      origin: ["*", "https://mycoco.site", "http://localhost:3000"],
      methods: ["GET", "POST"]
    }
  });

  // Make io globally available
  global.io = socketIO;

  // Socket.IO connection handling for web users
  socketIO.on('connection', (socket) => {
    console.log('🌐 New web user connected:', socket.id);
    socket.on('join-session', (sessionId) => {
      console.log(`🔗 User ${socket.id} joined session: ${sessionId}`);
      socket.join(`session-${sessionId}`);
    });
    socket.on('send-message', async (data) => {
      const { sessionId, message } = data;
      console.log(`💬 Web message from ${sessionId}: ${message}`);

      try {
        // FIXED: Process directly through bot instead of sending to Telegram chat
        // Create a mock telegram message object for the bot to process
        const mockTelegramMessage = {
          text: `[API] Session: ${sessionId} | User: ${socket.id}\n${message}`,
          chat: { id: 6924933952 } // This triggers the web user message handler
        };

        // Process through the bot's handleWebUserMessage method directly
        await telegramBot.handleWebUserMessage(mockTelegramMessage);

        // Emit user message to session room (for display)
        socketIO.to(`session-${sessionId}`).emit('new-message', {
          sessionId,
          senderType: 'user',
          message,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Error processing web message:', error);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Web user disconnected:', socket.id);
    });
  });

  // Start both bots
  await whatsappBot.start();
  await telegramBot.start(false); // Use polling mode

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
      console.log('🔵 Telegram webhook received:', JSON.stringify(req.body, null, 2));

      if (req.body.message) {
        await telegramBot.processWebhookUpdate(req.body);
        res.status(200).json({ ok: true, source: 'telegram' });
      } else {
        res.status(200).json({ ok: true, source: 'unknown' });
      }
    } catch (error) {
      console.error('❌ Telegram webhook error:', error);
      res.status(500).json({ error: 'Telegram webhook processing failed' });
    }
  });

  // Create web chat session - Simple version using memory
  app.post("/api/chat/create-web-session", validateApiKey, async (req, res) => {
    try {
      const { userId } = req.body;
      const sessionId = uuidv4();

      console.log("🌐 Creating web session for userId:", userId || 'anonymous');

      res.json({
        success: true,
        sessionId,
        message: "Web chat session created successfully"
      });
    } catch (error) {
      console.error('Failed to create web chat session:', error);
      res.status(500).json({ error: "Failed to create web chat session" });
    }
  });

  // Get chat session messages - Using telegram bot's memory storage
  app.get("/api/chat/messages/:sessionId", validateApiKey, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const messages = telegramBot.getWebSessionMessages(sessionId);

      res.json({
        success: true,
        messages
      });
    } catch (error) {
      console.error('Failed to get chat messages:', error);
      res.status(500).json({ error: "Failed to get chat messages" });
    }
  });

  // Send message to web session
  app.post("/api/chat/send-web-message", validateApiKey, async (req, res) => {
    try {
      const { sessionId, message } = req.body;

      if (!sessionId || !message) {
        return res.status(400).json({
          error: "Missing required fields: sessionId and message"
        });
      }

      // Send to telegram bot for processing
      const apiMessage = `[API] Session: ${sessionId} | User: api_user
${message}`;

      await telegramBot.sendMessage(6924933952, apiMessage);

      res.json({
        success: true,
        message: "Message sent successfully",
        sessionId: sessionId
      });
    } catch (error) {
      console.error('Failed to send web message:', error);
      res.status(500).json({
        error: "Failed to send message",
        details: error.message
      });
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
  app.get('/setup-webhook', async (req, res) => {
    try {
      const webhookUrl = 'https://tele-bot-test.onrender.com/webhook/telegram';
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

      const apiMessage = `[API] Session: ${sessionId} | User: api_user
${message}`;

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

  // Create new chat session (standard endpoint)
  app.post("/api/chat/sessions", validateApiKey, async (req, res) => {
    try {
      const { userId } = req.body;
      const sessionId = uuidv4();

      console.log("🔍 Creating session for userId:", userId);

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

      // If no sessionId provided, create a new one
      if (!sessionId) {
        finalSessionId = uuidv4();
        console.log("🆕 Auto-creating session:", finalSessionId, "for userId:", finalUserId);
      }

      // Send to Telegram with session formatting
      const formattedMessage = `🔗 Session: ${finalSessionId}\n👤 User: ${finalUserId}\n📝 ${message}`;
      await telegramBot.sendMessage(6924933952, formattedMessage);

      // Emit to WebSocket clients
      socketIO.to(`session-${finalSessionId}`).emit('new-message', {
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

  // Admin endpoints
  app.get("/api/admin/vendors", async (req, res) => {
    try {
      const vendors = await storage.getVendorsWithLatestQuotes();
      res.json(vendors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

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

  app.get("/api/admin/inquiries", async (req, res) => {
    try {
      const inquiries = await storage.getInquiries();
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  app.post("/api/admin/inquiries", async (req, res) => {
    try {
      const inquiryData = insertInquirySchema.parse(req.body);
      const inquiry = await storage.createInquiry(inquiryData);
      res.json(inquiry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid inquiry data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create inquiry" });
      }
    }
  });

  app.get("/api/admin/price-responses", async (req, res) => {
    try {
      const responses = await storage.getPriceResponses();
      res.json(responses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch price responses" });
    }
  });

  app.get("/api/admin/notifications", async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.put("/api/admin/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markNotificationAsRead(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.post("/api/admin/notifications/mark-all-read", async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Fix: Add individual delete endpoint that frontend expects
  app.delete("/api/admin/notifications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteNotification(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  app.delete("/api/admin/notifications/clear-all", async (req, res) => {
    try {
      await storage.clearAllNotifications();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  app.get("/api/admin/bot-config", async (req, res) => {
    try {
      const config = await storage.getBotConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot config" });
    }
  });

  app.post("/api/admin/bot-config", async (req, res) => {
    try {
      const configData = insertBotConfigSchema.parse(req.body);
      const config = await storage.updateBotConfig(configData);
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid config data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update bot config" });
      }
    }
  });

  app.get("/api/admin/vendor-rates", async (req, res) => {
    try {
      const rates = await storage.getVendorRates();
      res.json(rates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendor rates" });
    }
  });

  app.get("/api/admin/api-keys", async (req, res) => {
    try {
      const apiKeys = await storage.getApiKeys();
      res.json(apiKeys);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/admin/api-keys", async (req, res) => {
    try {
      const { name, keyType, permissions, rateLimitPerHour } = req.body;

      if (!name) {
        return res.status(400).json({ error: "API key name is required" });
      }

      const keyValue = crypto.randomBytes(32).toString('hex');

      const apiKey = await storage.createApiKey({
        name,
        keyValue,
        keyType: keyType || 'vendor_rates',
        permissions: permissions || [],
        rateLimitPerHour: rateLimitPerHour || 1000,
        isActive: true
      });

      res.json(apiKey);
    } catch (error) {
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.patch("/api/admin/api-keys/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const apiKey = await storage.updateApiKey(parseInt(id), updates);
      res.json(apiKey);
    } catch (error) {
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.delete("/api/admin/api-keys/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteApiKey(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // Get all locations for dropdown
  app.get("/api/locations", async (req, res) => {
    try {
      const locationData = LocationManager.getLocationData();
      res.json(locationData);
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });
  // Get localities for a specific city (optional endpoint)
  app.get("/api/locations/:cityId/localities", async (req, res) => {
    try {
      const { cityId } = req.params;
      const localities = LocationManager.getLocalitiesByCity(cityId);
      res.json(localities);
    } catch (error) {
      console.error('Error fetching localities:', error);
      res.status(500).json({ error: "Failed to fetch localities" });
    }
  });

  return httpServer;
}