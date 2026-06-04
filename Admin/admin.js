import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { adminDb, customerDb, firebaseReady } from "./firebase.js";
import { ICT_CATEGORIES, formatMoney, normalizeCategory, slug } from "../firebase/catalog.js";

const SESSION_KEY = "ict-admin-session";

const photoModules = import.meta.glob("./assets/inventory-photos/*.{jpg,jpeg,png,webp,svg}", {
  eager: true,
  query: "?url",
  import: "default"
});

const inventoryPhotos = Object.entries(photoModules).map(([path, url]) => {
  const fileName = path.split("/").pop();
  return {
    id: fileName,
    fileName,
    label: fileName.replace(/\.[^.]+$/, "").replaceAll("-", " ").replaceAll("_", " "),
    url
  };
});

const DEFAULT_PRODUCT_IDS = new Set(["LT-T14", "SV-R350", "SW-48P", "WK-CTO", "HP-ELITE-MINI", "HP-ELITE-840", "SAM-A15", "UBQ-48P", "DEMO-LAPTOP"]);

const state = {
  inventory: [],
  orders: [],
  orderItems: [],
  queries: []
};

const $ = (selector) => document.querySelector(selector);

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notify(type, message) {
  const notice = $("#adminNotice");
  notice.hidden = false;
  notice.className = `auth-notice dashboard-notice ${type}`;
  notice.textContent = message;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => {
    notice.hidden = true;
  }, 4500);
}

function statusClass(status) {
  if (/cancel|failed|reject/i.test(status || "")) return "danger";
  if (/pending|submitted|processing|tracking/i.test(status || "")) return "warn";
  return "";
}

async function readRows(db, name) {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return { ...data, docId: item.id, id: data.id || item.id };
  });
}

function selectedPhoto() {
  return inventoryPhotos.find((photo) => photo.id === $("#inventoryPhotoChoice").value) || inventoryPhotos[0];
}

function productIdFor(name) {
  return slug(name).toUpperCase() || `PRODUCT-${Date.now()}`;
}

const plainTextPattern = /^[A-Za-z0-9 ]+$/;
const moneyPattern = /^\d+(\.\d{1,2})?$/;
const wholeNumberPattern = /^\d+$/;

function hasSpecialCharacters(value) {
  return !plainTextPattern.test(String(value || ""));
}

function resetInventoryForm(form) {
  form.reset();
  $("#inventoryStock").value = "1";
  renderPhotoOptions();
}

function validateInventoryForm({ name, priceRaw, stockRaw, details, category, photo }) {
  const errors = [];
  const trimmedName = name.trim();
  const trimmedDetails = details.trim().replace(/\s+/g, " ");
  const trimmedPrice = priceRaw.trim();
  const trimmedStock = stockRaw.trim();

  if (!ICT_CATEGORIES.includes(category)) {
    errors.push("Inventory class is invalid: choose one of the listed classes.");
  }

  if (!trimmedName) {
    errors.push("Product name is required.");
  } else if (hasSpecialCharacters(trimmedName)) {
    errors.push("Product name must contain only letters, numbers, and spaces.");
  } else if (trimmedName.length > 60) {
    errors.push("Product name must be 60 characters or fewer.");
  }

  if (!trimmedPrice) {
    errors.push("Price is required.");
  } else if (!moneyPattern.test(trimmedPrice)) {
    errors.push("Price must be a number with up to 2 decimal places, for example 199.99.");
  } else if (Number(trimmedPrice) <= 0) {
    errors.push("Price must be greater than 0.");
  }

  if (!trimmedStock) {
    errors.push("Available stock is required.");
  } else if (!wholeNumberPattern.test(trimmedStock)) {
    errors.push("Available stock must be a whole number.");
  } else if (Number(trimmedStock) < 1) {
    errors.push("Available stock must be at least 1.");
  }

  if (!trimmedDetails) {
    errors.push("Product details are required.");
  } else if (hasSpecialCharacters(trimmedDetails)) {
    errors.push("Product details must contain only letters, numbers, and spaces.");
  }

  if (!photo?.url) {
    errors.push("Product photo is required: select a valid photo.");
  }

  return {
    errors,
    value: {
      name: trimmedName,
      price: Number(trimmedPrice),
      stock: Number(trimmedStock),
      details: trimmedDetails,
      category
    }
  };
}

function normalizeInventory(item, index = 0) {
  return {
    ...item,
    id: item.id || item.docId || `inv-${Date.now()}-${index}`,
    productId: item.productId || item.sku || productIdFor(item.name),
    sku: item.sku || item.productId || productIdFor(item.name),
    name: item.name || "ICT Product",
    category: normalizeCategory(item.category),
    price: Number(item.price || 0),
    stock: Number(item.stock || item.available || 0),
    details: item.details || item.specs || item.description || "",
    specs: item.specs || item.details || item.description || "",
    description: item.description || item.details || item.specs || "",
    photoUrl: item.photoUrl || item.imageUrl || inventoryPhotos[index % inventoryPhotos.length]?.url || ""
  };
}

function normalizeOrder(order) {
  const items = state.orderItems.filter((item) => item.orderId === order.id || item.orderDocId === order.docId);
  return {
    ...order,
    customer: order.customer || order.customerName || order.delivery?.fullName || "Customer",
    location: order.customerLocation || order.delivery?.town || order.delivery?.district || "",
    address: order.customerAddress || order.delivery?.address || "",
    total: Number(order.total || order.amountPaid || 0),
    items: order.items?.length ? order.items : items
  };
}

function normalizeQuery(ticket) {
  return {
    ...ticket,
    id: ticket.id || ticket.docId,
    customer: ticket.anonymous ? "Anonymous" : ticket.customer || ticket.customerName || ticket.name || "Customer",
    contacts: ticket.anonymous ? "Anonymous" : ticket.contacts || ticket.phone || ticket.email || "Not supplied",
    message: ticket.message || ticket.title || "",
    status: ticket.status || "Submitted",
    response: ticket.response || ""
  };
}

function renderPhotoOptions() {
  $("#inventoryCategory").innerHTML = ICT_CATEGORIES.map((category) => `<option>${escapeHtml(category)}</option>`).join("");
  $("#inventoryPhotoChoice").innerHTML = inventoryPhotos.map((photo) => `<option value="${escapeHtml(photo.id)}">${escapeHtml(photo.label)}</option>`).join("");
  renderPhotoPreview();
}

function renderPhotoPreview() {
  const photo = selectedPhoto();
  $("#inventoryPhotoPreview").src = photo?.url || "";
}

async function photoDataUrl(photo) {
  const response = await fetch(photo.url);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(blob);
  });
}

function renderStats() {
  $("#productCount").textContent = state.inventory.length;
  $("#orderCount").textContent = state.orders.length;
  $("#queryCount").textContent = state.queries.length;
}

function paidOrderIds() {
  return new Set(state.orders
    .filter((order) => !/cancel|failed|reject/i.test(order.status || ""))
    .map((order) => order.id || order.docId)
    .filter(Boolean));
}

function salesRows() {
  const activeOrders = paidOrderIds();
  const salesByProduct = new Map();

  const ordersWithEmbeddedItems = new Set(state.orders
    .filter((order) => order.items?.length)
    .flatMap((order) => [order.id, order.docId].filter(Boolean)));
  const fallbackOrderItems = state.orderItems.filter((item) => !ordersWithEmbeddedItems.has(item.orderId) && !ordersWithEmbeddedItems.has(item.orderDocId));
  const soldItems = [
    ...fallbackOrderItems,
    ...state.orders.flatMap((order) => (order.items || []).map((item) => ({
      ...item,
      orderId: order.id,
      orderDocId: order.docId
    })))
  ];

  soldItems.forEach((item) => {
    if (activeOrders.size && !activeOrders.has(item.orderId) && !activeOrders.has(item.orderDocId)) return;
    const key = item.productId || item.sku || item.name;
    const qty = Number(item.qty || 1);
    const price = Number(item.price || 0);
    const current = salesByProduct.get(key) || { sold: 0, total: 0 };
    current.sold += qty;
    current.total += qty * price;
    salesByProduct.set(key, current);
  });

  return state.inventory.map((item) => {
    const sales = salesByProduct.get(item.productId) || salesByProduct.get(item.sku) || salesByProduct.get(item.name) || { sold: 0, total: 0 };
    const stock = Number(item.stock || 0);
    return {
      ...item,
      sold: sales.sold,
      salesTotal: sales.total,
      remaining: Math.max(stock - sales.sold, 0)
    };
  });
}

function renderSales() {
  const rows = salesRows();
  const total = rows.reduce((sum, item) => sum + Number(item.salesTotal || 0), 0);
  $("#salesTotal").textContent = `Total sales: ${formatMoney(total)}`;
  $("#salesTable").innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>
        <div class="asset-cell">
          <img class="inventory-thumb" src="${escapeHtml(item.photoUrl)}" alt="${escapeHtml(item.name)}" />
          <div><strong>${escapeHtml(item.name)}</strong><div class="row-meta">${escapeHtml(item.productId)}</div></div>
        </div>
      </td>
      <td>${escapeHtml(item.category)}</td>
      <td>${Number(item.stock || 0)}</td>
      <td>${Number(item.sold || 0)}</td>
      <td>${Number(item.remaining || 0)}</td>
      <td>${formatMoney(item.salesTotal)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6">No products posted yet.</td></tr>`;
}

function renderInventory() {
  const search = ($("#inventorySearch").value || "").toLowerCase();
  const rows = state.inventory.filter((item) => [item.name, item.category, item.productId, item.details].join(" ").toLowerCase().includes(search));
  $("#inventoryTable").innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>
        <div class="asset-cell">
          <img class="inventory-thumb" src="${escapeHtml(item.photoUrl)}" alt="${escapeHtml(item.name)}" />
          <div><strong>${escapeHtml(item.name)}</strong><div class="row-meta">${escapeHtml(item.productId)}</div></div>
        </div>
        <div class="row-meta">${escapeHtml(item.details || "No details supplied")}</div>
      </td>
      <td>${escapeHtml(item.category)}</td>
      <td>${formatMoney(item.price)}</td>
      <td>${Number(item.stock || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="4">No inventory posted yet.</td></tr>`;
  renderStats();
}

function orderProductNames(order) {
  return (order.items || []).map((item) => `${item.name || item.productId} x${item.qty || 1}`).join(", ") || "No items listed";
}

function renderOrders() {
  $("#orderBoard").replaceChildren(...(state.orders.length ? state.orders.map((raw) => {
    const order = normalizeOrder(raw);
    const row = document.createElement("article");
    row.className = "row-item";
    row.innerHTML = `
      <div class="row-topline">
        <div>
          <strong>${escapeHtml(order.id)}</strong>
          <div class="row-meta">${escapeHtml(order.customer)} - ${escapeHtml(order.location)} - ${escapeHtml(order.address)}</div>
        </div>
        <span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status || "Processing")}</span>
      </div>
      <div><strong>Products:</strong> ${escapeHtml(orderProductNames(order))}</div>
      <div><strong>Amount paid:</strong> ${formatMoney(order.total)}</div>
      <div class="order-actions">
        <select data-order-status="${escapeHtml(order.docId || order.id)}">
          ${["Processing", "Packed", "Shipped", "Delivered", "Cancelled"].map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <button class="mini-action" data-save-order="${escapeHtml(order.docId || order.id)}">Update delivery</button>
      </div>
    `;
    return row;
  }) : [emptyRow("No orders yet", "Orders made from customer web and mobile apps will appear here.")]));

  document.querySelectorAll("[data-save-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.saveOrder;
      const order = state.orders.find((item) => (item.docId || item.id) === key);
      const status = document.querySelector(`[data-order-status="${CSS.escape(key)}"]`).value;
      if (!order) return;
      order.status = status;
      if (firebaseReady) await updateDoc(doc(customerDb, "orders", order.docId || order.id), { status, updatedAt: serverTimestamp() });
      renderOrders();
      notify("success", `Order updated: ${order.id} is now ${status}.`);
    });
  });
  renderStats();
}

function renderQueries() {
  $("#queryBoard").replaceChildren(...(state.queries.length ? state.queries.map((raw) => {
    const query = normalizeQuery(raw);
    const row = document.createElement("article");
    row.className = "row-item";
    row.innerHTML = `
      <div class="row-topline">
        <div>
          <strong>${escapeHtml(query.customer)}</strong>
          <div class="row-meta">${escapeHtml(query.contacts)} - ${escapeHtml(query.requestType || "Question")}</div>
        </div>
        <span class="status-pill ${statusClass(query.status)}">${escapeHtml(query.status)}</span>
      </div>
      <div>${escapeHtml(query.message)}</div>
      ${query.response ? `<div class="row-meta">Admin response: ${escapeHtml(query.response)}</div>` : ""}
      <div class="support-actions">
        <textarea data-query-response="${escapeHtml(query.docId || query.id)}" placeholder="Respond to customer">${escapeHtml(query.response)}</textarea>
        <button class="mini-action" data-send-query="${escapeHtml(query.docId || query.id)}">Send response</button>
      </div>
    `;
    return row;
  }) : [emptyRow("No customer queries yet", "Complaints, questions, and delivery tracking messages will appear here.")]));

  document.querySelectorAll("[data-send-query]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.sendQuery;
      const query = state.queries.find((item) => (item.docId || item.id) === key);
      const response = document.querySelector(`[data-query-response="${CSS.escape(key)}"]`).value.trim();
      if (!query || !response) {
        notify("error", "Response not sent: type a reply first.");
        return;
      }
      Object.assign(query, { response, status: "Responded" });
      if (firebaseReady) await updateDoc(doc(customerDb, "tickets", query.docId || query.id), { response, status: "Responded", respondedAt: serverTimestamp() });
      renderQueries();
      notify("success", "Response sent: customer query updated.");
    });
  });
  renderStats();
}

function emptyRow(title, meta) {
  const row = document.createElement("article");
  row.className = "row-item";
  row.innerHTML = `<strong>${escapeHtml(title)}</strong><span class="row-meta">${escapeHtml(meta)}</span>`;
  return row;
}

async function postInventory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = $("#inventoryName").value;
  const priceRaw = $("#inventoryPrice").value;
  const stockRaw = $("#inventoryStock").value;
  const details = $("#inventoryDetails").value;
  const category = normalizeCategory($("#inventoryCategory").value);
  const photo = selectedPhoto();
  const validation = validateInventoryForm({ name, priceRaw, stockRaw, details, category, photo });

  if (validation.errors.length) {
    notify("error", `Product not posted: ${validation.errors.join(" ")}`);
    return;
  }

  const { value } = validation;

  try {
    const productId = productIdFor(value.name);
    const imageUrl = await photoDataUrl(photo);
    const item = {
      id: `inv-${slug(value.name)}-${Date.now()}`,
      productId,
      sku: productId,
      name: value.name,
      category: value.category,
      details: value.details,
      specs: value.details,
      description: value.details,
      price: value.price,
      stock: value.stock,
      photoUrl: imageUrl,
      imageUrl,
      sourcePhoto: photo.fileName,
      status: "Available"
    };

    if (firebaseReady) {
      await setDoc(doc(adminDb, "inventoryItems", item.id), { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(customerDb, "inventoryItems", item.id), { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    }

    state.inventory.unshift(item);
    resetInventoryForm(form);
    renderInventory();

    try {
      if (!firebaseReady) {
        notify("success", "Product posted locally. Firebase is not connected.");
        return;
      }

      await setDoc(doc(customerDb, "catalogProducts", productId), {
        id: productId,
        productId,
        sku: productId,
        name: value.name,
        category: value.category,
        details: value.details,
        specs: value.details,
        description: value.details,
        specifications: {
          Details: value.details
        },
        price: value.price,
        stock: value.stock,
        availability: "Available",
        condition: "New",
        imageUrl,
        photoUrl: imageUrl,
        sourcePhoto: photo.fileName,
        updatedAt: serverTimestamp()
      }, { merge: true });
      notify("success", "Product posted successfully.");
    } catch (catalogError) {
      console.error(catalogError);
      notify("warn", "Product posted, but customer catalog sync failed. Refresh or try updating the catalog again.");
    }
  } catch (error) {
    console.error(error);
    notify("error", `Product not posted: ${error.message || "inventory could not be saved. Please try again."}`);
  }
}

function bindNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.view}`).classList.add("active");
      $("#viewTitle").textContent = button.textContent.replace(/^\d+\s*/, "").trim();
    });
  });
}

async function loadData() {
  state.inventory = [];

  if (!firebaseReady) {
    renderAll();
    notify("success", "Dashboard ready.");
    return;
  }

  try {
    const [adminInventory, customerInventory, orders, orderItems, queries] = await Promise.all([
      readRows(adminDb, "inventoryItems"),
      readRows(customerDb, "inventoryItems"),
      readRows(customerDb, "orders"),
      readRows(customerDb, "orderItems"),
      readRows(customerDb, "tickets")
    ]);
    const inventorySource = adminInventory.length ? adminInventory : customerInventory;
    state.inventory = inventorySource.map(normalizeInventory).filter((item) => !DEFAULT_PRODUCT_IDS.has(item.productId) && !DEFAULT_PRODUCT_IDS.has(item.sku));
    state.orderItems = orderItems;
    state.orders = orders.map(normalizeOrder);
    state.queries = queries.map(normalizeQuery);
    renderAll();
  } catch (error) {
    console.error(error);
    renderAll();
    notify("error", "Dashboard data could not be refreshed.");
  }
}

function renderAll() {
  renderInventory();
  renderOrders();
  renderQueries();
  renderSales();
  renderStats();
}

function init() {
  if (!readSession()) {
    window.location.replace("login.html");
    return;
  }
  bindNavigation();
  renderPhotoOptions();
  $("#inventoryPhotoChoice").addEventListener("change", renderPhotoPreview);
  $("#inventorySearch").addEventListener("input", renderInventory);
  $("#inventoryForm").addEventListener("submit", postInventory);
  $("#adminLogout").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  });
  loadData();
}

init();
