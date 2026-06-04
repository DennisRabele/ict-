export const ICT_CATEGORIES = [
  "Hardware",
  "Peripherals",
  "Accessories",
  "Audio & Wearables",
  "Spare Parts",
  "Software"
];

export const PRODUCT_CONDITIONS = ["New", "Used"];

const categoryAliases = new Map([
  ["laptop", "Hardware"],
  ["laptops", "Hardware"],
  ["phone", "Hardware"],
  ["phones", "Hardware"],
  ["mobile", "Hardware"],
  ["smartphone", "Hardware"],
  ["smartphones", "Hardware"],
  ["tablet", "Hardware"],
  ["tablets", "Hardware"],
  ["desktop", "Hardware"],
  ["desktops", "Hardware"],
  ["computer", "Hardware"],
  ["computers", "Hardware"],
  ["hardware", "Hardware"],
  ["router", "Peripherals"],
  ["routers", "Peripherals"],
  ["printer", "Peripherals"],
  ["printers", "Peripherals"],
  ["keyboard", "Peripherals"],
  ["mouse", "Peripherals"],
  ["monitor", "Peripherals"],
  ["peripheral", "Peripherals"],
  ["peripherals", "Peripherals"],
  ["network", "Peripherals"],
  ["networking", "Peripherals"],
  ["accessory", "Accessories"],
  ["accessories", "Accessories"],
  ["add-on", "Accessories"],
  ["add-ons", "Accessories"],
  ["audio", "Audio & Wearables"],
  ["wearable", "Audio & Wearables"],
  ["wearables", "Audio & Wearables"],
  ["headset", "Audio & Wearables"],
  ["headphones", "Audio & Wearables"],
  ["spare", "Spare Parts"],
  ["spare part", "Spare Parts"],
  ["spare parts", "Spare Parts"],
  ["parts", "Spare Parts"],
  ["software", "Software"],
  ["license", "Software"],
  ["licence", "Software"],
  ["gaming", "Hardware"],
  ["gaming device", "Hardware"],
  ["gaming devices", "Hardware"],
  ["server", "Hardware"],
  ["servers", "Hardware"],
  ["workstation", "Hardware"]
]);

export function slug(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeCategory(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Accessories";
  return categoryAliases.get(raw.toLowerCase()) || raw;
}

export function inferBrand(name, brand) {
  if (brand) return String(brand).trim();
  const [firstWord] = String(name || "ICT").trim().split(/\s+/);
  return firstWord || "ICT";
}

export function formatMoney(value) {
  return `M${Number(value || 0).toLocaleString()}`;
}

export function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function objectSpecs(raw) {
  if (raw.specifications && typeof raw.specifications === "object" && !Array.isArray(raw.specifications)) {
    return Object.fromEntries(
      Object.entries(raw.specifications)
        .map(([key, value]) => [String(key).trim(), value])
        .filter(([key, value]) => key && value != null && String(value).trim() && !/^n\/?a$/i.test(String(value).trim()))
    );
  }

  const details = raw.details || raw.specs || raw.description || raw.lifecycle || "";
  return details ? { Details: String(details) } : {};
}

function specText(raw) {
  if (raw.specs) return String(raw.specs);
  return Object.values(objectSpecs(raw)).filter(Boolean).join(", ");
}

export function normalizeProduct(raw = {}) {
  const id = String(raw.productId || raw.sku || raw.id || raw.docId || slug(raw.name)).trim();
  const name = raw.name || raw.asset || raw.title || "ICT Product";
  const stock = Math.max(Number(raw.available ?? raw.stock ?? raw.quantity ?? 0), 0);
  const availability = raw.availability || raw.status || (stock > 0 ? "Available" : "Out of stock");
  const price = Number(raw.price ?? raw.unitPrice ?? raw.salePrice ?? 0);
  const brand = inferBrand(name, raw.brand);
  const category = normalizeCategory(raw.category || raw.type || raw.group);
  const specifications = objectSpecs(raw);

  return {
    ...raw,
    id,
    sku: String(raw.sku || raw.productId || id),
    productId: String(raw.productId || raw.sku || id),
    name,
    brand,
    category,
    condition: raw.condition || raw.newUsed || "New",
    description: raw.description || raw.lifecycle || specText(raw) || `${brand} ${category} product`,
    specifications,
    specs: specText({ ...raw, specifications }),
    price,
    stock,
    availability,
    imageUrl: raw.imageUrl || raw.photoUrl || "",
    photoUrl: raw.photoUrl || raw.imageUrl || "",
    popularity: Number(raw.popularity || raw.sales || 0),
    createdSort: timestampMillis(raw.createdAt || raw.updatedAt || raw.seededAt)
  };
}

function inventoryKey(item) {
  return String(item.productId || item.sku || item.id || item.docId || slug(item.name));
}

function inventoryGroupSummary(rows) {
  const first = rows[0] || {};
  const stock = rows.reduce((sum, row) => sum + Math.max(Number(row.stock ?? row.available ?? 0), 0), 0);
  return {
    ...first,
    stock,
    availability: stock > 0 ? "Available" : "Out of stock",
    inventoryIds: rows.map((row) => row.id || row.docId).filter(Boolean),
    inventoryDocIds: rows.map((row) => row.docId).filter(Boolean)
  };
}

export function mergeCatalogAndInventory(catalogRows = [], inventoryRows = []) {
  const inventoryGroups = new Map();
  inventoryRows.forEach((row) => {
    const key = inventoryKey(row);
    inventoryGroups.set(key, [...(inventoryGroups.get(key) || []), row]);
  });

  const products = new Map();

  catalogRows.forEach((row) => {
    const key = String(row.productId || row.sku || row.id || row.docId);
    const inventory = inventoryGroups.get(key);
    const inventorySummary = inventory ? inventoryGroupSummary(inventory) : {};
    products.set(key, normalizeProduct({
      ...row,
      ...inventorySummary,
      id: key,
      sku: row.sku || row.id || key,
      productId: row.productId || row.id || key,
      name: inventorySummary.name || row.name,
      imageUrl: row.imageUrl || inventorySummary.photoUrl,
      photoUrl: inventorySummary.photoUrl || row.imageUrl,
      price: inventorySummary.price ?? row.price,
      brand: inventorySummary.brand || row.brand,
      category: inventorySummary.category || row.category,
      condition: inventorySummary.condition || row.condition,
      description: inventorySummary.description || row.description,
      specs: inventorySummary.specs || row.specs
    }));
  });

  inventoryGroups.forEach((rows, key) => {
    if (products.has(key)) return;
    products.set(key, normalizeProduct({
      ...inventoryGroupSummary(rows),
      id: key,
      sku: key,
      productId: key
    }));
  });

  return [...products.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesProduct(product, filters = {}) {
  const search = String(filters.search || "").toLowerCase();
  const text = [
    product.name,
    product.brand,
    product.category,
    product.description,
    product.specs,
    product.sku,
    product.condition
  ].join(" ").toLowerCase();

  const price = Number(product.price || 0);
  const min = Number(filters.priceMin || 0);
  const max = Number(filters.priceMax || 0);

  return (!search || text.includes(search))
    && (!filters.category || filters.category === "all" || product.category === filters.category)
    && (!filters.brand || filters.brand === "all" || product.brand === filters.brand)
    && (!filters.availability || filters.availability === "all" || product.availability === filters.availability)
    && (!filters.condition || filters.condition === "all" || product.condition === filters.condition)
    && (!min || price >= min)
    && (!max || price <= max);
}

export function sortProducts(products, sortBy = "newest") {
  return [...products].sort((a, b) => {
    if (sortBy === "lowest") return Number(a.price || 0) - Number(b.price || 0);
    if (sortBy === "highest") return Number(b.price || 0) - Number(a.price || 0);
    if (sortBy === "popularity") return Number(b.popularity || 0) - Number(a.popularity || 0);
    return Number(b.createdSort || 0) - Number(a.createdSort || 0) || a.name.localeCompare(b.name);
  });
}
