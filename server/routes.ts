import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVendorSchema, insertInquirySchema, insertPriceResponseSchema, insertBotConfigSchema } from "@shared/schema";
import { z } from "zod";
import { whatsappBot } from "./bot/whatsapp";
import { telegramBot } from "./bot/telegram";
import { Router } from 'express';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { sql } from "drizzle-orm";
import { LocationManager } from './locationManager';

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

export async function registerRoutes(app: Express): Promise<void> {

  // Start both bots
  await whatsappBot.start();
  await telegramBot.start();

  // 🌐 ADD Socket.IO setup (new code)

  // Connect Socket.IO to telegram bot(TEST UI CODE FOR testing bot connection w/ socket io)

  //   app.get('/socket-test', (req, res) => {
  //     res.send(`<!DOCTYPE html>
  // <html lang="en">
  // <head>
  //     <meta charset="UTF-8">
  //     <meta name="viewport" content="width=device-width, initial-scale=1.0">
  //     <title>Socket.IO Chat Test</title>
  //     <style>
  //         * { margin: 0; padding: 0; box-sizing: border-box; }
  //         body { 
  //             font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  //             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  //             min-height: 100vh;
  //             display: flex;
  //             align-items: center;
  //             justify-content: center;
  //         }
  //         .chat-container {
  //             background: white;
  //             border-radius: 20px;
  //             box-shadow: 0 20px 40px rgba(0,0,0,0.1);
  //             width: 90%;
  //             max-width: 500px;
  //             height: 600px;
  //             display: flex;
  //             flex-direction: column;
  //             overflow: hidden;
  //         }
  //         .chat-header {
  //             background: #4a90e2;
  //             color: white;
  //             padding: 20px;
  //             text-align: center;
  //             font-weight: 600;
  //         }
  //         .status {
  //             padding: 10px 20px;
  //             font-size: 14px;
  //             font-weight: 500;
  //         }
  //         .status.connected { background: #d4edda; color: #155724; }
  //         .status.disconnected { background: #f8d7da; color: #721c24; }
  //         .messages {
  //             flex: 1;
  //             padding: 20px;
  //             overflow-y: auto;
  //             background: #f8f9fa;
  //         }
  //         .message {
  //             margin-bottom: 15px;
  //             padding: 12px 16px;
  //             border-radius: 18px;
  //             max-width: 80%;
  //             word-wrap: break-word;
  //         }
  //         .message.sent {
  //             background: #4a90e2;
  //             color: white;
  //             margin-left: auto;
  //             text-align: right;
  //         }
  //         .message.received {
  //             background: white;
  //             color: #333;
  //             border: 1px solid #e1e5e9;
  //         }
  //         .message-time {
  //             font-size: 11px;
  //             opacity: 0.7;
  //             margin-top: 4px;
  //         }
  //         .input-area {
  //             padding: 20px;
  //             border-top: 1px solid #e1e5e9;
  //             background: white;
  //         }
  //         .input-group {
  //             display: flex;
  //             gap: 10px;
  //         }
  //         #messageInput {
  //             flex: 1;
  //             padding: 12px 16px;
  //             border: 2px solid #e1e5e9;
  //             border-radius: 25px;
  //             outline: none;
  //             font-size: 14px;
  //         }
  //         #messageInput:focus {
  //             border-color: #4a90e2;
  //         }
  //         #sendButton {
  //             padding: 12px 20px;
  //             background: #4a90e2;
  //             color: white;
  //             border: none;
  //             border-radius: 25px;
  //             cursor: pointer;
  //             font-weight: 500;
  //             transition: background 0.3s;
  //         }
  //         #sendButton:hover {
  //             background: #357abd;
  //         }
  //         #sendButton:disabled {
  //             background: #ccc;
  //             cursor: not-allowed;
  //         }
  //         .typing-indicator {
  //             padding: 10px 20px;
  //             font-style: italic;
  //             color: #666;
  //             font-size: 13px;
  //         }
  //     </style>
  // </head>
  // <body>
  //     <div class="chat-container">
  //         <div class="chat-header">
  //             <h2>🤖 Bot Chat Test</h2>
  //         </div>

  //         <div id="status" class="status disconnected">
  //             🔴 Connecting...
  //         </div>

  //         <div id="messages" class="messages">
  //             <div class="message received">
  //                 <div>Welcome! Send a message to test the bot.</div>
  //                 <div class="message-time">System</div>
  //             </div>
  //         </div>

  //         <div id="typingIndicator" class="typing-indicator" style="display: none;">
  //             Bot is typing...
  //         </div>

  //         <div class="input-area">
  //             <div class="input-group">
  //                 <input 
  //                     type="text" 
  //                     id="messageInput" 
  //                     placeholder="Type your message here..." 
  //                     disabled
  //                 />
  //                 <button id="sendButton" disabled>Send</button>
  //             </div>
  //         </div>
  //     </div>

  //     <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  //     <script>
  //         const socket = io('/', { 
  //           transports: ['polling', 'websocket'],
  //           forceNew: true 
  //         });

  //         const status = document.getElementById('status');
  //         const messages = document.getElementById('messages');
  //         const messageInput = document.getElementById('messageInput');
  //         const sendButton = document.getElementById('sendButton');
  //         const typingIndicator = document.getElementById('typingIndicator');

  //         let isTyping = false;

  //         // Connection status
  //         socket.on('connect', () => {
  //             console.log('✅ Connected to server');
  //             status.textContent = '🟢 Connected';
  //             status.className = 'status connected';
  //             messageInput.disabled = false;
  //             sendButton.disabled = false;
  //             messageInput.focus();
  //         });

  //         socket.on('disconnect', () => {
  //             console.log('❌ Disconnected from server');
  //             status.textContent = '🔴 Disconnected';
  //             status.className = 'status disconnected';
  //             messageInput.disabled = true;
  //             sendButton.disabled = true;
  //         });

  //         // Message handling
  //         function addMessage(text, type = 'received', sender = 'Bot') {
  //             const messageDiv = document.createElement('div');
  //             messageDiv.className = \`message \${type}\`;

  //             const now = new Date();
  //             const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  //             messageDiv.innerHTML = \`
  //                 <div>\${text}</div>
  //                 <div class="message-time">\${sender} • \${time}</div>
  //             \`;

  //             messages.appendChild(messageDiv);
  //             messages.scrollTop = messages.scrollHeight;
  //         }

  //         function sendMessage() {
  //             const message = messageInput.value.trim();
  //             if (!message) return;

  //             // Add sent message to UI
  //             addMessage(message, 'sent', 'You');

  //             // Show typing indicator
  //             showTyping();

  //             // Send to server
  //             socket.emit('web_message', { text: message });

  //             messageInput.value = '';
  //         }

  //         function showTyping() {
  //             if (!isTyping) {
  //                 isTyping = true;
  //                 typingIndicator.style.display = 'block';

  //                 // Hide after 3 seconds
  //                 setTimeout(() => {
  //                     hideTyping();
  //                 }, 3000);
  //             }
  //         }

  //         function hideTyping() {
  //             isTyping = false;
  //             typingIndicator.style.display = 'none';
  //         }

  //         // Listen for bot responses
  //         socket.on('bot_response', (data) => {
  //             hideTyping();
  //             addMessage(data.text || 'Bot received your message!');
  //         });

  //         // Event listeners
  //         sendButton.addEventListener('click', sendMessage);

  //         messageInput.addEventListener('keypress', (e) => {
  //             if (e.key === 'Enter' && !e.shiftKey) {
  //                 e.preventDefault();
  //                 sendMessage();
  //             }
  //         });

  //         // Auto-focus input when page loads
  //         window.addEventListener('load', () => {
  //             if (!messageInput.disabled) {
  //                 messageInput.focus();
  //             }
  //         });
  //     </script>
  // </body>
  // </html>`);
  //   });
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


  // Bot status endpoints
  app.get("/api/admin/whatsapp-status", async (req, res) => {
    try {
      const status = whatsappBot.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get WhatsApp bot status" });
    }
  });

  // Get all vendor activity (quotes + sales) for CSV download
  app.get('/api/vendor-activity/:vendorName', async (req, res) => {
    try {
      const { vendorName } = req.params;

      // Get quotes
      const quotes = await storage.db.execute(sql`
      SELECT 
        timestamp,
        'QUOTE' as type,
        material,
        price,
        gst,
        delivery_charge,
        inquiry_id
      FROM price_responses pr
      JOIN vendors v ON pr.vendor_id = v.vendor_id
      WHERE v.name = ${vendorName}
    `);

      // Get sales
      const sales = await storage.db.execute(sql`
      SELECT 
        recorded_at as timestamp,
        'SALE' as type,
        sales_type as material,
        cement_price as price,
        cement_company as company,
        cement_qty as quantity,
        project_location
      FROM sales_records 
      WHERE sales_rep_name = ${vendorName}
    `);

      // Combine and sort by timestamp
      const allActivity = [
        ...quotes.rows.map(q => ({
          timestamp: q.timestamp,
          type: q.type,
          material: q.material,
          price: q.price,
          company: '',
          quantity: '',
          details: `GST: ${q.gst}%, Delivery: ₹${q.delivery_charge}`,
          inquiry_id: q.inquiry_id
        })),
        ...sales.rows.map(s => ({
          timestamp: s.timestamp,
          type: s.type,
          material: s.material,
          price: s.price,
          company: s.company || '',
          quantity: s.quantity || '',
          details: s.project_location || '',
          inquiry_id: ''
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json(allActivity);
    } catch (error) {
      console.error('Error fetching vendor activity:', error);
      res.status(500).json({ error: 'Failed to fetch vendor activity' });
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
      const webhookUrl = 'https://temtembot-api-ai.onrender.com/webhook/telegram';
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

  // Add this to your telegram bot processing in routes.ts
  app.post('/webhook/telegram', async (req, res) => {
    try {
      console.log('🔵 Telegram webhook received:', JSON.stringify(req.body, null, 2));

      // First: Process general Telegram functionality (from first webhook)
      if (req.body.message) {
        await telegramBot.processWebhookUpdate(req.body);
      }

      // Second: Check for vendor responses (from second webhook)
      if (req.body.message && req.body.message.text) {
        const messageText = req.body.message.text;
        const chatId = req.body.message.chat.id;

        // Check if this is a vendor response (contains RATE, GST, DELIVERY, Session)
        if (messageText.includes('RATE:') && messageText.includes('GST:') && messageText.includes('Session:')) {
          console.log('💰 Vendor response detected!');

          // Extract session ID
          const sessionMatch = messageText.match(/Session:\s*([a-f0-9-]+)/i);
          if (sessionMatch) {
            const sessionId = sessionMatch[1];
            console.log('🔍 Found session ID:', sessionId);

            // Save vendor response to session
            await storage.createChatMessage({
              sessionId,
              senderType: 'vendor',
              message: messageText,
              senderId: `telegram-${chatId}`,
              telegramMessageId: req.body.message.message_id
            });

            console.log('✅ Vendor response saved to session:', sessionId);

            // Emit to WebSocket clients
            if (global.io) {
              global.io.to(`session-${sessionId}`).emit('new-message', {
                sessionId,
                senderType: 'vendor',
                message: messageText,
                timestamp: new Date()
              });
              console.log('📡 Response sent via WebSocket');
            }
          }
        }
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('❌ Telegram webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
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

  // Add this MAIN chat endpoint that handles inquiries
  // Replace your /api/chat route with this simple test version
  app.post("/api/chat", validateApiKey, async (req, res) => {
    console.log("🔥 /api/chat route HIT!");
    console.log("Request body:", req.body);

    try {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({
          error: "Missing required field: message"
        });
      }

      // Auto-generate session and user from IP
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      const userId = `ip_${clientIP.replace(/[.:]/g, '_')}_${Date.now()}`;
      const sessionId = uuidv4();

      console.log("🔧 Generated userId:", userId);
      console.log("🔧 Generated sessionId:", sessionId);

      // Get API key for session creation
      const authHeader = req.headers.authorization || req.headers['x-api-key'];
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      const apiKey = await storage.getApiKey(token);

      console.log("🔧 API key found:", apiKey?.name);

      // Create session
      await storage.createChatSession({
        apiKeyId: apiKey.id,
        sessionId,
        userId: userId,
        status: 'active'
      });

      console.log("✅ Session created successfully");

      // Send notification to Telegram
      const inquiryMessage = `🏗️ NEW WEB INQUIRY

📱 From: Web Customer (${userId})
📝 Message: ${message}
🆔 Session: ${sessionId}

Please respond with:
RATE: [Price] per [Unit]
GST: [Percentage]%
DELIVERY: [Charges]
Session: ${sessionId}`;

      console.log("📨 Sending to Telegram...");
      await telegramBot.sendMessage(6924933952, inquiryMessage);
      console.log("✅ Telegram message sent!");

      res.json({
        success: true,
        sessionId,
        userId,
        message: "Inquiry sent to vendors successfully"
      });

    } catch (error) {
      console.error('❌ API chat error:', error);
      res.status(500).json({
        error: "Failed to process inquiry",
        details: error.message
      });
    }
  });

  // Helper function to process inquiries
  async function processInquiry(message: string, userId: string, sessionId: string) {
    try {
      // Create inquiry in database
      const inquiryId = `INQ-${Date.now()}`;

      await storage.createInquiry({
        inquiryId,
        userName: "Web Customer",
        userPhone: userId, // Use IP-based user ID
        city: "Auto-detected", // You can enhance this
        material: extractMaterial(message), // Extract from message
        brand: null,
        quantity: extractQuantity(message), // Extract from message
        vendorsContacted: [],
        responseCount: 0,
        status: "pending",
        platform: "web"
      });

      // Find vendors and notify them
      const vendors = await storage.getVendors(); // Get all vendors for now
      const selectedVendors = vendors.slice(0, 3); // Limit to 3

      if (selectedVendors.length > 0) {
        // Send to vendors via Telegram
        const inquiryMessage = `🏗️ NEW WEB INQUIRY

📱 From: Web Customer (${userId})
📝 Message: ${message}
🆔 Inquiry ID: ${inquiryId}

Please respond with:
RATE: [Price] per [Unit]
GST: [Percentage]%
DELIVERY: [Charges]
Inquiry ID: ${inquiryId}`;

        for (const vendor of selectedVendors) {
          if (vendor.telegramId) {
            await telegramBot.sendMessage(parseInt(vendor.telegramId), inquiryMessage);
          }
        }

        console.log(`✅ Inquiry sent to ${selectedVendors.length} vendors`);
      }

    } catch (error) {
      console.error('Error processing inquiry:', error);
      throw error;
    }
  }

  // Helper functions
  function extractMaterial(message: string): string {
    const msg = message.toLowerCase();
    if (msg.includes('cement')) return 'cement';
    if (msg.includes('tmt') || msg.includes('steel') || msg.includes('bar')) return 'tmt';
    return 'general';
  }

  function extractQuantity(message: string): string {
    const match = message.match(/(\d+)\s*(bags?|tons?|pieces?|kg|kgs?)/i);
    return match ? match[0] : 'Not specified';
  }

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

  //location Manager api
  app.get("/api/locations", (req, res) => {
    try {
      const locationData = LocationManager.getLocationData();
      res.json(locationData);
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });
  const httpServer = createServer(app);

  // WebSocket connection handling

  // Make io available globally for routes

  return httpServer;
}