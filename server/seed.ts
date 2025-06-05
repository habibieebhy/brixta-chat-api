import { db } from "./db";
import { vendors, inquiries, botConfig, apiKeys } from "@shared/schema";

async function seedDatabase() {
  console.log("Seeding database...");

  // Clear existing data
  await db.delete(inquiries);
  await db.delete(vendors);
  await db.delete(botConfig);
  await db.delete(apiKeys);

  // Insert sample vendors
  const vendorData = [
    {
      vendorId: "vendor_001",
      name: "Kumar Construction Supplies",
      phone: "+91 98765 43210",
      city: "Guwahati",
      materials: ["cement", "tmt"],
      responseCount: 47,
      responseRate: "92.5",
      rank: 1,
      isActive: true
    },
    {
      vendorId: "vendor_002", 
      name: "Mumbai Steel Center",
      phone: "+91 98765 43211",
      city: "Mumbai",
      materials: ["tmt"],
      responseCount: 35,
      responseRate: "78.2",
      rank: 2,
      isActive: true
    },
    {
      vendorId: "vendor_003",
      name: "Delhi Building Materials",
      phone: "+91 98765 43212", 
      city: "Delhi",
      materials: ["cement", "tmt"],
      responseCount: 28,
      responseRate: "85.1",
      rank: 3,
      isActive: true
    }
  ];

  await db.insert(vendors).values(vendorData);

  // Insert sample inquiries
  const inquiryData = [
    {
      inquiryId: "INQ-001",
      userName: "Rajesh Kumar",
      userPhone: "+91 98765 43213",
      city: "Guwahati",
      material: "cement",
      brand: "ACC",
      quantity: "50 bags",
      vendorsContacted: ["vendor_001"],
      responseCount: 1,
      status: "responded"
    },
    {
      inquiryId: "INQ-002", 
      userName: "Priya Sharma",
      userPhone: "+91 98765 43214",
      city: "Mumbai",
      material: "tmt",
      brand: "Tata Steel",
      quantity: "2 tons",
      vendorsContacted: ["vendor_002"],
      responseCount: 0,
      status: "pending"
    },
    {
      inquiryId: "INQ-003",
      userName: "Amit Singh",
      userPhone: null,
      city: "Delhi", 
      material: "cement",
      brand: null,
      quantity: null,
      vendorsContacted: ["vendor_003"],
      responseCount: 1,
      status: "completed"
    }
  ];

  await db.insert(inquiries).values(inquiryData);

  // Insert bot configuration
  await db.insert(botConfig).values({
    messageTemplate: `Hi [Vendor Name], I'm [User Name] from [City].

I'm looking for today's rate for [Material].
Can you please share:
- Latest Rate
- GST %  
- Delivery Charges (if any)

Thanks!`,
    maxVendorsPerInquiry: 3,
    messagesPerMinute: 20,
    autoResponseEnabled: true,
    botActive: true
  });

  // Insert API key
  await db.insert(apiKeys).values({
    keyName: "Production API",
    keyValue: "pk_live_1234567890abcdef",
    isActive: true
  });

  console.log("Database seeded successfully!");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().catch(console.error);
}

export { seedDatabase };