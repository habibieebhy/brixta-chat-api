import { pgTable, text, serial, varchar, integer, boolean, timestamp, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  vendorId: text("vendor_id").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  telegramId: text("telegram_id"), // ADDED THIS FIELD
  city: text("city").notNull(),
  materials: text("materials").array().notNull(), // ["cement", "tmt"]
  status: text("status").default("active"), // ADDED THIS FIELD
  registeredAt: timestamp("registered_at").defaultNow(), // ADDED THIS FIELD
  lastQuoted: timestamp("last_quoted"),
  isActive: boolean("is_active").default(true),
  responseCount: integer("response_count").default(0),
  responseRate: decimal("response_rate", { precision: 5, scale: 2 }).default("0"),
  rank: integer("rank").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inquiries = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  inquiryId: text("inquiry_id").notNull().unique(),
  userName: text("user_name").notNull(),
  userPhone: text("user_phone"),
  city: text("city").notNull(),
  material: text("material").notNull(), // "cement" | "tmt"
  brand: text("brand"),
  quantity: text("quantity"),
  vendorsContacted: text("vendors_contacted").array().notNull(),
  responseCount: integer("response_count").default(0),
  status: text("status").notNull().default("pending"), // "pending" | "responded" | "completed"
  platform: text("platform").default("whatsapp"), // ADDED THIS FIELD
  timestamp: timestamp("timestamp").defaultNow(),
  cementCompany: text("cement_company"),
  cementTypes: text("cement_types"), // JSON string of array
  tmtCompany: text("tmt_company"),
  tmtSizes: text("tmt_sizes"), // JSON string of array
  buyerTeleId: text("buyer_tele_id"),
});

export const priceResponses = pgTable("price_responses", {
  id: serial("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  inquiryId: text("inquiry_id").notNull(),
  material: text("material").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  gst: decimal("gst", { precision: 5, scale: 2 }).notNull(),
  deliveryCharge: decimal("delivery_charge", { precision: 10, scale: 2 }).default("0"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const botConfig = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  messageTemplate: text("message_template").notNull(),
  vendorRateRequestTemplate: text("vendor_rate_request_template").notNull().default("Hi [Vendor Name], please share your current rates for [Material] in [City]. Include: Rate per unit, GST %, Delivery charges, Brand details. Reply in format: RATE [Material] [Brand] [Rate] [Unit] [GST%] [DeliveryCharges]"),
  vendorInquiryTemplate: text("vendor_inquiry_template").notNull().default("Hi [Vendor Name], I'm [User Name] from [City]. I'm looking for today's rate for [Material]. Can you please share: Latest Rate, GST %, Delivery Charges (if any). Thanks!"),
  maxVendorsPerInquiry: integer("max_vendors_per_inquiry").default(3),
  messagesPerMinute: integer("messages_per_minute").default(20),
  autoResponseEnabled: boolean("auto_response_enabled").default(true),
  botActive: boolean("bot_active").default(true),
});

export const vendorRates = pgTable("vendor_rates", {
  id: serial("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  material: text("material").notNull(), // cement, tmt
  brand: text("brand"),
  ratePerUnit: decimal("rate_per_unit", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(), // bag, metric_ton, piece
  gstPercentage: decimal("gst_percentage", { precision: 5, scale: 2 }),
  deliveryCharges: decimal("delivery_charges", { precision: 10, scale: 2 }),
  city: text("city").notNull(),
  validUntil: timestamp("valid_until"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  keyName: text('key_name').notNull(),
  keyValue: text('key_value').notNull(),
  isActive: boolean('is_active').default(true),
  lastUsed: timestamp('last_used'),
  createdAt: timestamp('created_at').defaultNow(),
  keyType: varchar('key_type', { length: 50 }).default('vendor_rates'),
  permissions: text('permissions').array().default([]),
  rateLimitPerHour: integer('rate_limit_per_hour').default(1000),
  usageCount: integer('usage_count').default(0)
});

// Insert schemas
export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
});

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
  timestamp: true,
});

export const insertPriceResponseSchema = createInsertSchema(priceResponses).omit({
  id: true,
  timestamp: true,
});

export const insertBotConfigSchema = createInsertSchema(botConfig).omit({
  id: true,
});

export const insertVendorRateSchema = createInsertSchema(vendorRates).omit({
  id: true,
  submittedAt: true,
  updatedAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
});

// Relations
export const vendorsRelations = relations(vendors, ({ many }) => ({
  priceResponses: many(priceResponses),
  vendorRates: many(vendorRates),
}));

export const inquiriesRelations = relations(inquiries, ({ many }) => ({
  priceResponses: many(priceResponses),
}));

export const priceResponsesRelations = relations(priceResponses, ({ one }) => ({
  vendor: one(vendors, {
    fields: [priceResponses.vendorId],
    references: [vendors.vendorId],
  }),
  inquiry: one(inquiries, {
    fields: [priceResponses.inquiryId],
    references: [inquiries.inquiryId],
  }),
}));

export const vendorRatesRelations = relations(vendorRates, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorRates.vendorId],
    references: [vendors.vendorId],
  }),
}));

// Types
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Inquiry = typeof inquiries.$inferSelect;
export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type PriceResponse = typeof priceResponses.$inferSelect;
export type InsertPriceResponse = z.infer<typeof insertPriceResponseSchema>;
export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type VendorRate = typeof vendorRates.$inferSelect;
export type InsertVendorRate = z.infer<typeof insertVendorRateSchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;