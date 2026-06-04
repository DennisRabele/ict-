import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { firebaseConfig, firebaseDatabases, hasFirebaseConfig } from "./config.js";

if (!hasFirebaseConfig()) {
  console.error("Paste your Firebase project values into firebase/config.js before seeding.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const customerDb = getFirestore(app, firebaseDatabases.customer);
const adminDb = getFirestore(app, firebaseDatabases.admin);

async function setDocs(db, name, rows) {
  await Promise.all(
    rows.map(({ id, ...data }) => setDoc(doc(collection(db, name), id), {
      ...data,
      seededAt: serverTimestamp()
    }))
  );
}

const customerId = "customer-prime-logistics";

await setDocs(customerDb, "customerProfiles", [
  {
    id: customerId,
    name: "Prime Logistics",
    email: "customer@company.test",
    accountType: "B2B Customer",
    paymentMethod: "Visa ending 1044",
    mrr: 6740,
    nextRenewal: "2026-06-14"
  }
]);

await setDocs(customerDb, "catalogProducts", [
  {
    id: "LT-T14",
    productId: "LT-T14",
    sku: "LT-T14",
    name: "Lenovo ThinkPad T14",
    brand: "Lenovo",
    category: "Laptops",
    description: "Business laptop with enterprise warranty and strong portable performance.",
    cpu: "13th Gen",
    ram: "32GB",
    ssd: "1TB SSD",
    form: "14 inch",
    price: 18900,
    stock: 18,
    availability: "Available",
    condition: "New",
    imageUrl: ""
  },
  {
    id: "SV-R350",
    productId: "SV-R350",
    sku: "SV-R350",
    name: "Dell PowerEdge R350",
    brand: "Dell",
    category: "Servers",
    description: "Rack server for branch workloads, storage, and office infrastructure.",
    cpu: "Xeon E",
    ram: "64GB ECC",
    ssd: "RAID SSD",
    form: "1U Rack",
    price: 38900,
    stock: 3,
    availability: "Available",
    condition: "New",
    imageUrl: ""
  },
  {
    id: "SW-48P",
    productId: "SW-48P",
    sku: "SW-48P",
    name: "Ubiquiti 48 Port PoE Switch",
    brand: "Ubiquiti",
    category: "Routers",
    description: "Managed PoE switching for office networks, cameras, and access points.",
    cpu: "Switch ASIC",
    ram: "2GB",
    ssd: "N/A",
    form: "Rack",
    price: 14900,
    stock: 7,
    availability: "Available",
    condition: "New",
    imageUrl: ""
  },
  {
    id: "WK-CTO",
    productId: "WK-CTO",
    sku: "WK-CTO",
    name: "Creator Workstation CTO",
    brand: "ICT",
    category: "Gaming Devices",
    description: "Configurable high-performance workstation for creators and gaming labs.",
    cpu: "14th Gen",
    ram: "32GB DDR5",
    ssd: "2TB NVMe",
    form: "Tower",
    price: 27400,
    stock: 0,
    availability: "Out of stock",
    condition: "New",
    imageUrl: ""
  }
]);

await setDocs(customerDb, "pcComponents", [
  { id: "CPU-I5-13400", group: "cpu", name: "Intel i5 13400", socket: "LGA1700", price: 2450 },
  { id: "CPU-I7-14700", group: "cpu", name: "Intel i7 14700", socket: "LGA1700", price: 5200 },
  { id: "CPU-R7-7700", group: "cpu", name: "AMD Ryzen 7 7700", socket: "AM5", price: 4600 },
  { id: "MB-B760-PRO", group: "board", name: "B760 Pro Workstation", socket: "LGA1700", ram: "DDR5", price: 2350 },
  { id: "MB-X670-CREATOR", group: "board", name: "X670 Creator", socket: "AM5", ram: "DDR5", price: 3900 },
  { id: "MB-H610-OFFICE", group: "board", name: "H610 Office", socket: "LGA1700", ram: "DDR4", price: 1450 },
  { id: "RAM-16-DDR4", group: "ram", name: "16GB DDR4 3200", type: "DDR4", price: 780 },
  { id: "RAM-32-DDR5", group: "ram", name: "32GB DDR5 5600", type: "DDR5", price: 1690 },
  { id: "RAM-64-DDR5", group: "ram", name: "64GB DDR5 6000", type: "DDR5", price: 3400 },
  { id: "SSD-1TB-G4", group: "storage", name: "1TB NVMe Gen4", read: "7,000 MB/s", price: 1650 },
  { id: "SSD-2TB-G4", group: "storage", name: "2TB NVMe Gen4", read: "7,300 MB/s", price: 2950 },
  { id: "SSD-4TB-SATA", group: "storage", name: "4TB SATA SSD", read: "560 MB/s", price: 4100 }
]);

await setDocs(customerDb, "customerAssets", [
  { id: "asset-vps-business", customerId, name: "Prime VPS Business", type: "Hosting", expires: "2026-10-18", action: "Open cPanel", target: "cPanel" },
  { id: "asset-domain-prime", customerId, name: "primelogistics.co.ls", type: "Domain", expires: "2027-02-04", action: "Open Plesk", target: "Plesk" },
  { id: "asset-windows-11", customerId, name: "Windows 11 Pro License", type: "Software", expires: "Lifetime", action: "View key", target: "License" },
  { id: "asset-poweredge-r350", customerId, productId: "SV-R350", name: "Dell PowerEdge R350", type: "Warranty", expires: "2028-08-12", action: "Start RMA", target: "RMA" }
]);

await setDocs(customerDb, "subscriptions", [
  { id: "sub-vps-business", customerId, assetId: "asset-vps-business", name: "VPS Business", cycle: "Monthly", renewal: "2026-06-14", autoRenew: true, tier: "Shared", amount: 1850 },
  { id: "sub-domain-renewal", customerId, assetId: "asset-domain-prime", name: "Domain Renewal", cycle: "Yearly", renewal: "2027-02-04", autoRenew: true, tier: "Standard", amount: 690 },
  { id: "sub-endpoint-security", customerId, assetId: "asset-windows-11", name: "Endpoint Security", cycle: "Yearly", renewal: "2026-11-22", autoRenew: false, tier: "Team", amount: 4200 }
]);

await setDocs(customerDb, "invoices", [
  { id: "INV-1440", customerId, subscriptionId: "sub-vps-business", amount: 1850, status: "Paid" },
  { id: "INV-1412", customerId, subscriptionId: "sub-domain-renewal", amount: 690, status: "Paid" },
  { id: "INV-1377", customerId, subscriptionId: "sub-endpoint-security", amount: 4200, status: "Paid" }
]);

await setDocs(customerDb, "tickets", [
  { id: "TCK-901", customerId, assetId: "asset-vps-business", title: "Bandwidth spike", asset: "Prime VPS Business", status: "Investigating", attachmentUrl: "" },
  { id: "RMA-448", customerId, assetId: "asset-poweredge-r350", title: "Server fan warning", asset: "Dell PowerEdge R350", status: "Parts reserved", attachmentUrl: "" }
]);

await setDocs(customerDb, "cartItems", [
  { id: "cart-cat6", customerId, sku: "CBL-CAT6-2M", name: "Cat6 Patch Cable", qty: 24 }
]);

await setDocs(adminDb, "adminRoles", [
  { id: "role-support-agent", role: "Support Agent", permissions: { Tickets: true, Quotes: false, Provisioning: false, Inventory: true } },
  { id: "role-sales-rep", role: "Sales Rep", permissions: { Tickets: false, Quotes: true, Provisioning: false, Inventory: true } },
  { id: "role-it-manager", role: "IT Manager", permissions: { Tickets: true, Quotes: false, Provisioning: true, Inventory: true } }
]);

await setDocs(adminDb, "adminUsers", [
  { id: "admin-mokoena", name: "A. Mokoena", email: "admin@ictcommerce.test", roleId: "role-it-manager" }
]);

await setDocs(adminDb, "companies", [
  { id: "company-prime-logistics", name: "Prime Logistics", tier: "Contract Gold", terms: "Net 30", users: ["Procurement Manager", "IT Admin", "Finance Lead"] },
  { id: "company-blue-peak", name: "Blue Peak Clinic", tier: "Healthcare SLA", terms: "Net 60", users: ["Operations Lead", "Systems Admin"] },
  { id: "company-roma-tech", name: "Roma Tech College", tier: "Education Bulk", terms: "PO required", users: ["Department Buyer", "Lab Technician"] }
]);

await setDocs(adminDb, "warehouses", [
  { id: "warehouse-main", name: "Maseru main", type: "main" },
  { id: "warehouse-external", name: "External supplier", type: "external" }
]);

await setDocs(adminDb, "suppliers", [
  { id: "supplier-direct", name: "Direct supplier feed" }
]);

await setDocs(adminDb, "serviceProvisioning", [
  { id: "prov-prime-vps", companyId: "company-prime-logistics", client: "Prime Logistics", type: "VPS + SSL", status: "Ready", domain: "primelogistics.co.ls" },
  { id: "prov-blue-wordpress", companyId: "company-blue-peak", client: "Blue Peak Clinic", type: "Managed WordPress", status: "Queued", domain: "bluepeakhealth.com" },
  { id: "prov-maseru-email", companyId: "company-maseru-foods", client: "Maseru Foods", type: "Domain + Email", status: "Ready", domain: "maserufoods.co.ls" }
]);

await setDocs(adminDb, "adminBilling", [
  { id: "bill-prime-vps", companyId: "company-prime-logistics", account: "Prime Logistics", plan: "VPS Business", amount: "M1,850/mo", status: "Paid" },
  { id: "bill-blue-cloud", companyId: "company-blue-peak", account: "Blue Peak Clinic", plan: "Managed Cloud", amount: "M4,200/mo", status: "Retry 2" },
  { id: "bill-maseru-email", companyId: "company-maseru-foods", account: "Maseru Foods", plan: "Email Suite", amount: "M690/mo", status: "Invoice sent" }
]);

await setDocs(adminDb, "quotaMonitors", [
  { id: "quota-prime-domain", companyId: "company-prime-logistics", service: "primelogistics.co.ls", bandwidth: 82, storage: 64 },
  { id: "quota-blue-domain", companyId: "company-blue-peak", service: "bluepeakhealth.com", bandwidth: 51, storage: 88 },
  { id: "quota-maseru-domain", companyId: "company-maseru-foods", service: "maserufoods.co.ls", bandwidth: 36, storage: 42 }
]);

await setDocs(adminDb, "inventoryItems", [
  { id: "inv-thinkpad-t14", productId: "LT-T14", sku: "LT-T14", name: "Lenovo ThinkPad T14", brand: "Lenovo", category: "Laptops", condition: "New", price: 18900, serial: "PF49-8812-LS", specs: "i7 13th Gen, 32GB RAM, 1TB SSD", description: "Business laptop with enterprise warranty and strong portable performance.", stock: 18, warehouse: "main", warehouseId: "warehouse-main", lifecycle: "Warranty 28 months", photoUrl: "" },
  { id: "inv-poweredge-r350", productId: "SV-R350", sku: "SV-R350", name: "Dell PowerEdge R350", brand: "Dell", category: "Servers", condition: "New", price: 38900, serial: "SVR-R350-2290", specs: "Xeon E-2388G, 64GB ECC, RAID SSD", description: "Rack server for branch workloads, storage, and office infrastructure.", stock: 3, warehouse: "external", warehouseId: "warehouse-external", supplierId: "supplier-direct", lifecycle: "RMA eligible", photoUrl: "" },
  { id: "inv-hp-elite-mini", productId: "HP-ELITE-MINI", sku: "HP-ELITE-MINI", name: "HP Elite Mini 800", brand: "HP", category: "Desktops", condition: "New", price: 8500, serial: "IMEI-4471-2201", specs: "i5 12th Gen, 16GB RAM, 512GB SSD", description: "Compact desktop for office users and point-of-sale counters.", stock: 22, warehouse: "main", warehouseId: "warehouse-main", lifecycle: "Warranty 21 months", photoUrl: "" },
  { id: "inv-switch-48p", productId: "SW-48P", sku: "SW-48P", name: "Ubiquiti 48 Port PoE Switch", brand: "Ubiquiti", category: "Routers", condition: "New", price: 14900, serial: "SW-48P-9811", specs: "PoE+, 10Gb uplink, rack mount", description: "Managed PoE switching for office networks, cameras, and access points.", stock: 7, warehouse: "external", warehouseId: "warehouse-external", supplierId: "supplier-direct", lifecycle: "Standard support", photoUrl: "" }
]);

await setDocs(adminDb, "quoteRequests", [
  { id: "RFQ-2041", companyId: "company-roma-tech", quote: "RFQ-2041", client: "Roma Tech College", value: "M178,400", status: "Awaiting PO" },
  { id: "RFQ-2048", companyId: "company-prime-logistics", quote: "RFQ-2048", client: "Prime Logistics", value: "M64,900", status: "Legal review" },
  { id: "RFQ-2052", companyId: "company-blue-peak", quote: "RFQ-2052", client: "Blue Peak Clinic", value: "M91,200", status: "Ready to approve" }
]);

await setDocs(adminDb, "supportTickets", [
  { id: "TCK-901", companyId: "company-prime-logistics", client: "Prime Logistics", link: "VPS Business", issue: "Bandwidth spike alert", status: "Investigating" },
  { id: "TCK-914", companyId: "company-blue-peak", client: "Blue Peak Clinic", link: "Dell PowerEdge R350", issue: "RMA fan warning", status: "Parts reserved" },
  { id: "TCK-922", companyId: "company-maseru-foods", client: "Maseru Foods", link: "Email Suite", issue: "DNS propagation", status: "Customer updated" }
]);

await setDocs(adminDb, "knowledgeArticles", [
  { id: "kb-plesk-mailbox", title: "Plesk mailbox setup", body: "DNS, mailbox, and SSL checklist." },
  { id: "kb-rma-intake", title: "Hardware RMA intake", body: "Serial validation and warranty triage." }
]);

await setDocs(adminDb, "auditLogs", [
  { id: "audit-quota-threshold", message: "A. Mokoena changed VPS Business quota threshold" },
  { id: "audit-refund-approved", message: "D. Ralebese approved refund RF-4401" },
  { id: "audit-contract-price", message: "S. Moremi updated ThinkPad contract price" },
  { id: "audit-ssl-provisioned", message: "L. Ntlama provisioned SSL for maserufoods.co.ls" }
]);

await setDocs(adminDb, "analyticsSnapshots", [
  { id: "2026-01", month: "Jan", mrr: 72, sales: 58 },
  { id: "2026-02", month: "Feb", mrr: 78, sales: 66 },
  { id: "2026-03", month: "Mar", mrr: 85, sales: 79 },
  { id: "2026-04", month: "Apr", mrr: 91, sales: 64 },
  { id: "2026-05", month: "May", mrr: 96, sales: 88 }
]);

console.log("Firebase seed data created for customer and admin databases.");
