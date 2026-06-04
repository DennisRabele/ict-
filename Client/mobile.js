import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { customerDb, firebaseReady } from "./firebase.js";
import {
  ICT_CATEGORIES,
  formatMoney,
  matchesProduct,
  mergeCatalogAndInventory,
  sortProducts
} from "../firebase/catalog.js";

const SESSION_KEY = "ict-mobile-session";
const DEFAULT_CUSTOMER = {
  id: "customer-prime-logistics",
  firstName: "Prime",
  secondName: "Logistics",
  email: "customer@company.test"
};

const DEFAULT_PRODUCT_IDS = new Set(["LT-T14", "SV-R350", "SW-48P", "WK-CTO", "HP-ELITE-MINI", "HP-ELITE-840", "SAM-A15", "UBQ-48P", "DEMO-LAPTOP"]);

let assets = [
  { id: "asset-vps-business", name: "Prime VPS Business", type: "Hosting", expires: "2026-10-18", action: "Open cPanel" },
  { id: "asset-domain-prime", name: "primelogistics.co.ls", type: "Domain", expires: "2027-02-04", action: "Open Plesk" }
];
let cpus = [
  { name: "Intel i5 13400", socket: "LGA1700", price: 2450 },
  { name: "Intel i7 14700", socket: "LGA1700", price: 5200 },
  { name: "AMD Ryzen 7 7700", socket: "AM5", price: 4600 }
];
let boards = [
  { name: "B760 Pro Workstation", socket: "LGA1700", ram: "DDR5", price: 2350 },
  { name: "X670 Creator", socket: "AM5", ram: "DDR5", price: 3900 },
  { name: "H610 Office", socket: "LGA1700", ram: "DDR4", price: 1450 }
];
let ram = [
  { name: "16GB DDR4 3200", type: "DDR4", price: 780 },
  { name: "32GB DDR5 5600", type: "DDR5", price: 1690 },
  { name: "64GB DDR5 6000", type: "DDR5", price: 3400 }
];
let storage = [
  { name: "1TB NVMe Gen4", read: "7,000 MB/s", price: 1650 },
  { name: "2TB NVMe Gen4", read: "7,300 MB/s", price: 2950 },
  { name: "4TB SATA SSD", read: "560 MB/s", price: 4100 }
];
let subscriptions = [];
let tickets = [];
let catalog = [];
let selectedProduct = catalog[0];
let cart = [];
let orders = [];

const $ = (selector) => document.querySelector(selector);
const customer = readSession() || DEFAULT_CUSTOMER;
const plainTextPattern = /^[A-Za-z0-9 ]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\d{7,15}$/;
const moneyPattern = /^\d+(\.\d{1,2})?$/;
const wholeNumberPattern = /^\d+$/;

if (!readSession()) {
  window.location.href = "mobile-login.html";
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function customerName() {
  return [customer.firstName, customer.secondName].filter(Boolean).join(" ") || customer.name || "Customer";
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validatePlainText(label, value, { required = true, max = 80 } = {}) {
  const text = cleanText(value);
  if (!text) return required ? `${label} is required.` : "";
  if (!plainTextPattern.test(text)) return `${label} must contain only letters, numbers, and spaces.`;
  if (text.length > max) return `${label} must be ${max} characters or fewer.`;
  return "";
}

function showMobileView(viewId, title) {
  document.querySelectorAll(".bottom-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  document.querySelectorAll(".mobile-view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $("#mobileTitle").textContent = title;
}

function clearCatalogFilters() {
  $("#mobileCatalogSearch").value = "";
  $("#mobileCategoryFilter").value = "all";
  $("#mobileBrandFilter").value = "all";
  $("#mobileAvailabilityFilter").value = "all";
  $("#mobileConditionFilter").value = "all";
  $("#mobilePriceMin").value = "";
  $("#mobilePriceMax").value = "";
  $("#mobileSortFilter").value = "newest";
}

function resetMobileDeliveryForm() {
  $("#mobileDeliveryForm").reset();
  $("#mobileFullName").value = customerName();
  $("#mobileDistrict").value = "Maseru";
  $("#mobilePickupPoint").value = "Maseru Mall";
  $("#mobilePaymentAmount").value = "";
}

function optionList(select, items, valueKey = "name") {
  select.innerHTML = items.map((item) => `<option>${item[valueKey]}</option>`).join("");
}

function selected(select, list) {
  return list.find((item) => item.name === select.value) || list[0];
}

function orderDate(order) {
  const value = order.createdAt;
  if (value?.toDate) return value.toDate().toLocaleDateString();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toLocaleDateString();
  return new Date(value || Date.now()).toLocaleDateString();
}

function mobileRow(title, meta, actionLabel, onClick, imageUrl) {
  const row = document.createElement("article");
  row.className = "mobile-row";

  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "mobile-thumb";
    image.src = imageUrl;
    image.alt = title;
    row.append(image);
  }

  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = meta;
  row.append(strong, span);

  if (actionLabel) {
    const button = document.createElement("button");
    button.className = "primary-button";
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", onClick);
    row.append(button);
  }

  return row;
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
}

function sameCartItem(entry, item) {
  return item.docId ? entry.docId === item.docId : entry.sku === item.sku;
}

function renderAssets() {
  $("#mobileAssets").replaceChildren(...(assets.length ? assets.map((asset) => mobileRow(asset.name, `${asset.type} - expires ${asset.expires}`, asset.action, () => {
    $("#mobileCheckoutStatus").textContent = `${asset.action} opened`;
  })) : [mobileRow("No assets", "Registered customer profile is ready")]));
  $("#mobileTicketAsset").innerHTML = assets.map((asset) => `<option>${asset.name}</option>`).join("");
}

function renderBuilder() {
  if (!cpus.length || !boards.length || !ram.length || !storage.length) return;
  const cpu = selected($("#mobileCpu"), cpus);
  const board = selected($("#mobileBoard"), boards);
  const memory = selected($("#mobileRam"), ram);
  const drive = selected($("#mobileStorage"), storage);
  const compatible = cpu.socket === board.socket && board.ram === memory.type;
  const total = Number(cpu.price || 0) + Number(board.price || 0) + Number(memory.price || 0) + Number(drive.price || 0);
  $("#buildTotal").textContent = formatMoney(total);
  $("#buildStatus").textContent = compatible ? "Compatible" : "Check parts";
  $("#buildStatus").className = compatible ? "status-pill" : "status-pill warn";
  $("#addMobileBuild").disabled = !compatible;
}

function renderSubscriptions() {
  $("#mobileSubscriptions").replaceChildren(...(subscriptions.length ? subscriptions.map((sub) => mobileRow(sub.name, `${sub.cycle || "Monthly"} - ${sub.renewal || "Renewal"} - ${sub.autoRenew ?? sub.auto ? "Auto-renew on" : "Auto-renew off"}`)) : []));
}

function renderTickets() {
  $("#mobileTickets").replaceChildren(...(tickets.length ? tickets.map((ticket) => {
    const row = mobileRow(
      `${ticket.id} - ${ticket.title || ticket.requestType || "Question"}`,
      `${ticket.anonymous ? "Anonymous" : ticket.contacts || customerName()} - ${ticket.requestType || "Question"} - ${ticket.status || "Submitted"}`
    );
    const customerMessage = document.createElement("div");
    customerMessage.className = "message-block";
    const customerTitle = document.createElement("strong");
    customerTitle.textContent = "Customer message";
    const customerText = document.createElement("span");
    customerText.textContent = ticket.message || "No message supplied";
    customerMessage.append(customerTitle, customerText);
    const adminResponse = document.createElement("div");
    adminResponse.className = "message-block admin-message";
    const adminTitle = document.createElement("strong");
    adminTitle.textContent = "Admin response";
    const adminText = document.createElement("span");
    adminText.textContent = ticket.response || "Awaiting admin response";
    adminResponse.append(adminTitle, adminText);
    row.append(customerMessage, adminResponse);
    return row;
  }) : [mobileRow("No tickets", "Customer support requests will appear here")]));
}

function renderFilterOptions() {
  const brandSelect = $("#mobileBrandFilter");
  const categorySelect = $("#mobileCategoryFilter");
  const currentBrand = brandSelect.value || "all";
  const currentCategory = categorySelect.value || "all";
  const brands = [...new Set(catalog.map((product) => product.brand).filter(Boolean))].sort();
  brandSelect.innerHTML = `<option value="all">All brands</option>${brands.map((brand) => `<option>${brand}</option>`).join("")}`;
  categorySelect.innerHTML = `<option value="all">All categories</option>${ICT_CATEGORIES.map((category) => `<option>${category}</option>`).join("")}`;
  brandSelect.value = brands.includes(currentBrand) ? currentBrand : "all";
  categorySelect.value = ICT_CATEGORIES.includes(currentCategory) ? currentCategory : "all";
}

function catalogFilters() {
  return {
    search: $("#mobileCatalogSearch").value,
    category: $("#mobileCategoryFilter").value,
    brand: $("#mobileBrandFilter").value,
    availability: $("#mobileAvailabilityFilter").value,
    condition: $("#mobileConditionFilter").value,
    priceMin: $("#mobilePriceMin").value,
    priceMax: $("#mobilePriceMax").value,
    sort: $("#mobileSortFilter").value
  };
}

function renderCatalog() {
  renderFilterOptions();
  const products = sortProducts(catalog.filter((product) => matchesProduct(product, catalogFilters())), $("#mobileSortFilter").value);

  $("#mobileCatalog").replaceChildren(...(products.length ? products.map((product) => {
    const row = mobileRow(
      product.name,
      `${product.brand} - ${product.category} - ${formatMoney(product.price)} - ${product.stock > 0 ? "Available" : "Out of stock"}`,
      "",
      undefined,
      product.imageUrl
    );
    const actions = document.createElement("div");
    actions.className = "total-row";

    const detailButton = document.createElement("button");
    detailButton.className = "ghost-button";
    detailButton.type = "button";
    detailButton.textContent = "Details";
    detailButton.addEventListener("click", () => {
      selectedProduct = product;
      renderProductDetails();
    });

    const cartButton = document.createElement("button");
    cartButton.className = "primary-button";
    cartButton.type = "button";
    cartButton.disabled = product.stock <= 0;
    cartButton.textContent = "Add cart";
    cartButton.addEventListener("click", () => addProductToCart(product));

    actions.append(detailButton, cartButton);
    row.append(actions);
    return row;
  }) : [mobileRow("No products found", "Try another search or filter")]));

  if (!products.includes(selectedProduct)) selectedProduct = products[0] || catalog[0];
  renderProductDetails();
}

function renderProductDetails() {
  if (!selectedProduct) {
    $("#mobileCompare").replaceChildren(mobileRow("Select a product", "Details will appear here"));
    return;
  }

  const specs = selectedProduct.specifications || {};
  const detail = mobileRow(
    selectedProduct.name,
    `${selectedProduct.description || "ICT product"} - ${formatMoney(selectedProduct.price)}`,
    "",
    undefined,
    selectedProduct.imageUrl
  );
  Object.entries(specs).forEach(([label, value]) => {
    if (value == null || !String(value).trim() || /^n\/?a$/i.test(String(value).trim())) return;
    const line = document.createElement("span");
    line.textContent = `${label}: ${value}`;
    detail.append(line);
  });
  const stock = document.createElement("span");
  stock.textContent = `Stock: ${selectedProduct.stock > 0 ? "Available" : "Out of stock"} (${selectedProduct.stock})`;
  detail.append(stock);
  $("#mobileCompare").replaceChildren(detail);
}

async function addProductToCart(product) {
  const existing = cart.find((item) => item.sku === product.sku);
  if (existing) {
    await updateCartQuantity(existing, Number(existing.qty || 1) + 1);
    $("#mobileCheckoutStatus").textContent = `${product.name} qty updated`;
    clearCatalogFilters();
    renderCatalog();
    showMobileView("billingView", "Cart & Orders");
    return;
  }

  const item = {
    customerId: customer.id,
    sku: product.sku,
    productId: product.productId || product.id,
    name: product.name,
    qty: 1,
    price: Number(product.price || 0),
    imageUrl: product.imageUrl
  };

  try {
    if (firebaseReady) {
      const ref = await addDoc(collection(customerDb, "cartItems"), {
        ...item,
        createdAt: serverTimestamp()
      });
      item.docId = ref.id;
    }
  } catch (error) {
    console.error(error);
    $("#mobileCheckoutStatus").textContent = `${product.name} added. Confirm order to save it.`;
  }

  cart.push(item);
  if (item.docId || !firebaseReady) $("#mobileCheckoutStatus").textContent = `${product.name} added`;
  clearCatalogFilters();
  renderCatalog();
  renderCart();
  showMobileView("billingView", "Cart & Orders");
}

async function updateCartQuantity(item, qty) {
  item.qty = Math.max(1, Number(qty) || 1);
  try {
    if (firebaseReady && item.docId) {
      await updateDoc(doc(customerDb, "cartItems", item.docId), {
        qty: item.qty,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error(error);
    $("#mobileCheckoutStatus").textContent = "Quantity updated. Confirm order to save it.";
  }
  renderCart();
}

async function removeCartItem(item) {
  cart = cart.filter((entry) => !sameCartItem(entry, item));
  if (firebaseReady && item.docId) {
    await deleteDoc(doc(customerDb, "cartItems", item.docId));
  }
  renderCart();
}

function renderCart() {
  $("#mobileCartSummary").textContent = `${cart.length} item(s) - ${formatMoney(cartTotal())}`;
  $("#mobilePaymentDue").textContent = formatMoney(cartTotal());
  $("#mobilePaymentAmount").placeholder = String(cartTotal());
  $("#mobileCheckout").disabled = !cart.length;
  $("#mobileCart").replaceChildren(...(cart.length ? cart.map((item) => {
    const row = mobileRow(item.name, `${item.sku} - Qty ${item.qty} - ${formatMoney(Number(item.price || 0) * Number(item.qty || 1))}`, "", undefined, item.imageUrl);
    const controls = document.createElement("div");
    controls.className = "cart-controls";
    const minus = document.createElement("button");
    minus.className = "ghost-button";
    minus.type = "button";
    minus.textContent = "-";
    minus.addEventListener("click", () => updateCartQuantity(item, Number(item.qty || 1) - 1));
    const qty = document.createElement("input");
    qty.value = item.qty || 1;
    qty.setAttribute("aria-label", `${item.name} quantity`);
    qty.addEventListener("change", () => updateCartQuantity(item, qty.value));
    const plus = document.createElement("button");
    plus.className = "ghost-button";
    plus.type = "button";
    plus.textContent = "+";
    plus.addEventListener("click", () => updateCartQuantity(item, Number(item.qty || 1) + 1));
    const remove = document.createElement("button");
    remove.className = "ghost-button";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeCartItem(item));
    controls.append(minus, qty, plus, remove);
    row.append(controls);
    return row;
  }) : [mobileRow("Cart is empty", "Add products from Shop")]));
}

function renderOrders() {
  $("#mobileOrders").replaceChildren(...(orders.length ? orders.map((order) => mobileRow(
    `${order.id} - ${formatMoney(order.total)}`,
    `${order.paymentStatus || "Payment Successful"} - ${order.paymentMethod || "Payment simulated"} - ${order.status || "Processing"} - ${orderDate(order)} - Receipt ${order.receiptNumber || "generated"} - Phone ${order.customerPhone || order.delivery?.phone || "Not recorded"}`
  )) : [mobileRow("No orders yet", "Checkout receipts will appear here")]));
}

function deliveryDetails() {
  return {
    fullName: cleanText($("#mobileFullName").value),
    phone: cleanText($("#mobilePhone").value),
    district: cleanText($("#mobileDistrict").value),
    town: cleanText($("#mobileTown").value),
    address: cleanText($("#mobileAddress").value),
    deliveryOption: $("#mobileDeliveryOption").value,
    pickupPoint: cleanText($("#mobilePickupPoint").value),
    paymentMethod: $("#mobilePayment").value,
    paymentAmount: Number($("#mobilePaymentAmount").value || 0),
    paymentAmountRaw: String($("#mobilePaymentAmount").value || "").trim()
  };
}

function validateCheckoutDetails(delivery) {
  const errors = [];
  [
    validatePlainText("Full name", delivery.fullName, { max: 60 }),
    validatePlainText("District", delivery.district, { max: 40 }),
    validatePlainText("Town", delivery.town, { max: 40 }),
    validatePlainText("Address", delivery.address, { max: 120 }),
    validatePlainText("Pickup point", delivery.pickupPoint, { required: false, max: 60 })
  ].filter(Boolean).forEach((error) => errors.push(error));
  if (!delivery.phone) errors.push("Phone number is required for the order receipt.");
  else if (!phonePattern.test(delivery.phone)) errors.push("Phone number must contain digits only and be 7 to 15 digits long.");
  if (!delivery.paymentAmountRaw) errors.push("Payment amount is required.");
  else if (!moneyPattern.test(delivery.paymentAmountRaw)) errors.push("Payment amount must be a number with up to 2 decimal places.");
  else if (Number(delivery.paymentAmountRaw) !== cartTotal()) errors.push(`Payment amount must equal the cart total of ${formatMoney(cartTotal())}.`);
  return errors;
}

async function checkoutMobileCart() {
  if (!cart.length) {
    $("#mobileCheckoutStatus").textContent = "Cart empty";
    return;
  }

  const rawDelivery = deliveryDetails();
  const delivery = {
    ...rawDelivery,
    fullName: rawDelivery.fullName || customerName(),
    phone: rawDelivery.phone,
    district: rawDelivery.district || "Maseru",
    town: rawDelivery.town,
    address: rawDelivery.address,
    paymentMethod: rawDelivery.paymentMethod || "M-Pesa",
    paymentAmount: cartTotal()
  };
  const checkoutErrors = validateCheckoutDetails(delivery);
  if (checkoutErrors.length) {
    $("#mobileCheckoutStatus").textContent = `Order not completed: ${checkoutErrors.join(" ")}`;
    return;
  }

  const order = {
    id: `ORD-${Date.now()}`,
    receiptNumber: `INV-${Date.now().toString().slice(-6)}`,
    customerId: customer.id,
    customer: customerName(),
    total: cartTotal(),
    amountPaid: delivery.paymentAmount,
    customerPhone: delivery.phone,
    customerLocation: `${delivery.town}, ${delivery.district}`,
    customerAddress: delivery.address,
    status: "Processing",
    paymentStatus: "Payment Successful",
    paymentMethod: delivery.paymentMethod,
    delivery,
    createdAt: new Date().toISOString(),
    items: cart.map((item) => ({
      productId: item.productId || item.sku,
      sku: item.sku || item.productId,
      name: item.name,
      qty: Number(item.qty || 1),
      price: Number(item.price || 0)
    }))
  };

  $("#mobileCheckoutStatus").textContent = "Saving order...";

  try {
    if (firebaseReady) {
      const orderRef = await addDoc(collection(customerDb, "orders"), {
        id: order.id,
        receiptNumber: order.receiptNumber,
        customerId: order.customerId,
        customer: order.customer,
        total: order.total,
        amountPaid: order.amountPaid,
        customerPhone: order.customerPhone,
        customerLocation: order.customerLocation,
        customerAddress: order.customerAddress,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        delivery,
        items: order.items,
        createdAt: serverTimestamp()
      });

      const itemWrites = order.items.map((item) => addDoc(collection(customerDb, "orderItems"), {
        orderId: order.id,
        orderDocId: orderRef.id,
        customerId: order.customerId,
        productId: item.productId || item.sku,
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        price: item.price || 0,
        createdAt: serverTimestamp()
      }));

      await Promise.allSettled(itemWrites);
      await Promise.allSettled([addDoc(collection(customerDb, "invoices"), {
        id: order.receiptNumber,
        orderId: order.id,
        customerId: order.customerId,
        amount: order.total,
        paymentMethod: order.paymentMethod,
        customerPhone: order.customerPhone,
        status: "Paid",
        createdAt: serverTimestamp()
      })]);

      await Promise.allSettled(cart.filter((item) => item.docId).map((item) => deleteDoc(doc(customerDb, "cartItems", item.docId))));
    }
  } catch (error) {
    console.error(error);
    $("#mobileCheckoutStatus").textContent = "Order not completed. Please try again.";
    return;
  }

  orders.unshift(order);
  cart = [];
  resetMobileDeliveryForm();
  $("#mobileCheckoutStatus").textContent = `Order placed successfully: ${order.id}`;
  renderCart();
  renderOrders();
  showMobileView("billingView", "Cart & Orders");
}

function bindTabs() {
  document.querySelectorAll(".bottom-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      showMobileView(tab.dataset.view, tab.dataset.title);
    });
  });
}

function hydrateSelectors() {
  optionList($("#mobileCpu"), cpus);
  optionList($("#mobileBoard"), boards);
  optionList($("#mobileRam"), ram);
  optionList($("#mobileStorage"), storage);
  $("#mobileFullName").value = customerName();
}

async function readRows(name) {
  const snapshot = await getDocs(collection(customerDb, name));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return { ...data, docId: item.id, id: data.id || item.id };
  });
}

async function loadFirebaseData() {
  if (!firebaseReady) {
    renderAll();
    return;
  }

  try {
    const [loadedAssets, loadedComponents, loadedProducts, loadedInventory, loadedSubscriptions, loadedTickets, loadedCart, loadedOrders, loadedOrderItems] = await Promise.all([
      readRows("customerAssets"),
      readRows("pcComponents"),
      readRows("catalogProducts"),
      readRows("inventoryItems"),
      readRows("subscriptions"),
      readRows("tickets"),
      readRows("cartItems"),
      readRows("orders"),
      readRows("orderItems")
    ]);

    if (loadedAssets.length) assets = loadedAssets.filter((item) => !item.customerId || item.customerId === customer.id);
    if (loadedProducts.length || loadedInventory.length) {
      catalog = mergeCatalogAndInventory(loadedProducts, loadedInventory)
        .filter((product) => !DEFAULT_PRODUCT_IDS.has(product.productId) && !DEFAULT_PRODUCT_IDS.has(product.sku));
    }
    if (loadedSubscriptions.length) subscriptions = loadedSubscriptions.filter((item) => !item.customerId || item.customerId === customer.id);
    if (loadedTickets.length) tickets = loadedTickets.filter((item) => !item.customerId || item.customerId === customer.id);
    if (loadedCart.length) cart = loadedCart.filter((item) => item.customerId === customer.id);
    if (loadedOrders.length) {
      orders = loadedOrders
        .filter((order) => !order.customerId || order.customerId === customer.id)
        .map((order) => ({
          ...order,
          items: order.items || loadedOrderItems.filter((item) => item.orderId === order.id || item.orderDocId === order.docId)
        }));
    }

    const nextCpus = loadedComponents.filter((item) => item.group === "cpu");
    const nextBoards = loadedComponents.filter((item) => item.group === "board");
    const nextRam = loadedComponents.filter((item) => item.group === "ram");
    const nextStorage = loadedComponents.filter((item) => item.group === "storage");
    if (nextCpus.length && nextBoards.length && nextRam.length && nextStorage.length) {
      cpus = nextCpus;
      boards = nextBoards;
      ram = nextRam;
      storage = nextStorage;
      hydrateSelectors();
    }

  } catch (error) {
    console.error(error);
  }

  renderAll();
}

function bindActions() {
  $("#mobileLogout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "mobile-login.html";
  });

  ["mobileCpu", "mobileBoard", "mobileRam", "mobileStorage"].forEach((id) => $("#" + id).addEventListener("change", renderBuilder));
  $("#addMobileBuild").addEventListener("click", () => {
    const cpu = selected($("#mobileCpu"), cpus);
    const price = Number($("#buildTotal").textContent.replace(/[^0-9.]/g, "")) || 0;
    addProductToCart({ id: "CTO-PC", sku: "CTO-PC", productId: "CTO-PC", name: `${cpu.name} custom rig`, price, stock: 1, brand: "Custom", category: "Gaming Devices", imageUrl: "" });
  });

  $("#addMobileBulk").addEventListener("click", async () => {
    const lines = $("#mobileBulk").value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      $("#mobileRfqStatus").textContent = "Bulk order not added: enter at least one SKU and quantity.";
      return;
    }
    const bulkErrors = [];
    const items = lines.map((line) => {
      const [sku, qty = "1"] = line.split(",").map((part) => part.trim());
      if (!sku) bulkErrors.push("SKU is required on every bulk line.");
      else if (!plainTextPattern.test(sku)) bulkErrors.push(`SKU "${sku}" must contain only letters, numbers, and spaces.`);
      if (!wholeNumberPattern.test(qty) || Number(qty) < 1) bulkErrors.push(`Quantity for ${sku || "a bulk item"} must be a whole number of at least 1.`);
      const product = catalog.find((item) => item.sku === sku || item.productId === sku);
      return {
        customerId: customer.id,
        sku,
        productId: sku,
        name: product?.name || `Bulk SKU ${sku}`,
        qty: Number(qty) || 1,
        price: product?.price || 0,
        imageUrl: product?.imageUrl || ""
      };
    });
    if (bulkErrors.length) {
      $("#mobileRfqStatus").textContent = `Bulk order not added: ${bulkErrors.join(" ")}`;
      return;
    }
    for (const item of items) {
      if (firebaseReady) {
        const ref = await addDoc(collection(customerDb, "cartItems"), { ...item, createdAt: serverTimestamp() });
        item.docId = ref.id;
      }
      cart.push(item);
    }
    $("#mobileRfqStatus").textContent = `${items.length} bulk item(s) added`;
    renderCart();
  });

  $("#mobileTicketForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = cleanText($("#mobileTicketTitle").value);
    const message = cleanText($("#mobileTicketMessage").value);
    const contacts = cleanText($("#mobileTicketContacts").value);
    const anonymous = $("#mobileTicketAnonymous").checked;
    const titleError = validatePlainText("Ticket title", title, { max: 60 });
    const messageError = validatePlainText("Ticket message", message, { max: 240 });
    if (titleError || messageError) {
      $("#mobileRfqStatus").textContent = `Ticket not submitted: ${[titleError, messageError].filter(Boolean).join(" ")}`;
      return;
    }
    if (!anonymous && contacts && !phonePattern.test(contacts) && !emailPattern.test(contacts)) {
      $("#mobileRfqStatus").textContent = "Ticket not submitted: contact must be a valid phone number or email address.";
      return;
    }
    const ticket = {
      id: `TCK-${Date.now().toString().slice(-5)}`,
      customerId: customer.id,
      customer: customerName(),
      customerName: customerName(),
      contacts: anonymous ? "" : contacts,
      anonymous,
      title,
      asset: $("#mobileTicketAsset").value,
      requestType: $("#mobileTicketType").value,
      returnType: $("#mobileTicketType").value === "Return" ? $("#mobileReturnType").value : "",
      returnStatus: $("#mobileTicketType").value === "Return" ? "Pending" : "",
      message,
      status: "Submitted",
      response: ""
    };
    if (firebaseReady) {
      await addDoc(collection(customerDb, "tickets"), {
        ...ticket,
        createdAt: serverTimestamp()
      });
    }
    tickets.unshift(ticket);
    event.target.reset();
    renderTickets();
  });

  $("#mobileCheckout").addEventListener("click", checkoutMobileCart);
  $("#submitMobileRfq").addEventListener("click", async () => {
    $("#mobileRfqStatus").textContent = "Submitted to sales";
    if (!firebaseReady) return;
    const rfq = await addDoc(collection(customerDb, "rfqs"), {
      customerId: customer.id,
      status: "Submitted to sales",
      createdAt: serverTimestamp()
    });
    await Promise.all(cart.map((item) => addDoc(collection(customerDb, "rfqItems"), {
      rfqId: rfq.id,
      productId: item.sku,
      sku: item.sku,
      name: item.name,
      qty: item.qty,
      createdAt: serverTimestamp()
    })));
  });

  ["mobileCatalogSearch", "mobileCategoryFilter", "mobileBrandFilter", "mobileAvailabilityFilter", "mobileConditionFilter", "mobilePriceMin", "mobilePriceMax", "mobileSortFilter"].forEach((id) => {
    $("#" + id).addEventListener("input", renderCatalog);
    $("#" + id).addEventListener("change", renderCatalog);
  });
}

function renderAll() {
  renderAssets();
  renderBuilder();
  renderSubscriptions();
  renderTickets();
  renderCatalog();
  renderCart();
  renderOrders();
}

function init() {
  hydrateSelectors();
  bindTabs();
  bindActions();
  renderAll();
  loadFirebaseData();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => undefined);
  }
}

init();
