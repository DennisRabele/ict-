import React, { useEffect, useMemo, useState } from "react";
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
const ACCOUNTS_KEY = "ict-mobile-accounts";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loginData, setLoginData] = useState({ firstName: "", secondName: "", email: "", password: "" });
  const [authMessage, setAuthMessage] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    category: "all",
    brand: "all",
    availability: "all",
    condition: "all",
    priceMin: "",
    priceMax: "",
    sort: "newest"
  });
  const [deliveryForm, setDeliveryForm] = useState({
    fullName: "",
    phone: "",
    district: "Maseru",
    town: "",
    address: "",
    deliveryOption: "Delivery",
    pickupPoint: "Maseru Mall",
    paymentMethod: "M-Pesa",
    paymentAmount: ""
  });
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await loadStorageSession();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (user) {
      loadFirebaseData();
    }
  }, [user]);

  const customerName = useMemo(() => {
    if (!user) return "Customer";
    return [user.firstName, user.secondName].filter(Boolean).join(" ") || user.name || "Customer";
  }, [user]);

  const sortedCatalog = useMemo(() => {
    return sortProducts(catalog.filter((product) => matchesProduct(product, filters)), filters.sort);
  }, [catalog, filters]);

  const filteredBrands = useMemo(() => {
    const brands = [...new Set(catalog.map((product) => product.brand).filter(Boolean))].sort();
    return brands;
  }, [catalog]);

  async function loadStorageSession() {
    try {
      const rawSession = localStorage.getItem(SESSION_KEY);
      const rawAccounts = localStorage.getItem(ACCOUNTS_KEY);
      if (rawAccounts) {
        setAccounts(JSON.parse(rawAccounts));
      }
      if (rawSession) {
        setUser(JSON.parse(rawSession));
        setScreen("products");
      } else {
        setScreen("login");
      }
    } catch (error) {
      console.error(error);
      setScreen("login");
    }
  }

  function setLoginField(name, value) {
    setLoginData((current) => ({ ...current, [name]: value }));
  }

  const plainTextPattern = /^[A-Za-z0-9 ]+$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^\d{7,15}$/;
  const moneyPattern = /^\d+(\.\d{1,2})?$/;
  const wholeNumberPattern = /^\d+$/;

  function cleanText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function validatePlainText(label, value, { required = true, max = 80 } = {}) {
    const text = cleanText(value);
    if (!text) return required ? `${label} is required.` : "";
    if (!plainTextPattern.test(text)) return `${label} must contain only letters, numbers, and spaces.`;
    if (text.length > max) return `${label} must be ${max} characters or fewer.`;
    return "";
  }

  function validateAccount(value) {
    const firstNameError = validatePlainText("First name", value.firstName, { max: 30 });
    if (firstNameError) return firstNameError;
    const secondNameError = validatePlainText("Second name", value.secondName, { max: 30 });
    if (secondNameError) return secondNameError;
    if (!value.email) return "Email address is required.";
    if (!emailPattern.test(value.email)) return "Email address must be valid, for example customer@example.com.";
    if (!value.password) return "Password is required.";
    if (!/^[A-Za-z0-9]+$/.test(value.password)) return "Password must contain only letters and numbers.";
    if (value.password.length < 6 || !/\d/.test(value.password)) return "Password must be at least 6 characters and include 1 number.";
    return "";
  }

  async function register() {
    const value = {
      firstName: cleanText(loginData.firstName),
      secondName: cleanText(loginData.secondName),
      email: cleanText(loginData.email).toLowerCase(),
      password: String(loginData.password || "")
    };
    const error = validateAccount(value);
    if (error) {
      setAuthMessage(error);
      return;
    }
    if (accounts.some((account) => account.email === value.email.toLowerCase())) {
      setAuthMessage("Registration unsuccessful: email already exists.");
      return;
    }
    const account = {
      ...value,
      email: value.email.toLowerCase(),
      id: `customer-${value.email.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`
    };
    try {
      if (firebaseReady) {
        await addDoc(collection(customerDb, "customerProfiles"), {
          id: account.id,
          firstName: account.firstName,
          secondName: account.secondName,
          name: `${account.firstName} ${account.secondName}`,
          email: account.email,
          accountType: "Retail Customer",
          source: "mobile-app",
          role: "customer",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error(error);
      setAuthMessage("Registration saved locally. Firebase profile could not be recorded right now.");
    }
    const nextAccounts = [...accounts, account];
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(nextAccounts));
    setAccounts(nextAccounts);
    setAuthMessage("Registration successful. Please log in.");
    setScreen("login");
    setLoginData({ firstName: "", secondName: "", email: "", password: "" });
  }

  async function login() {
    const value = {
      firstName: cleanText(loginData.firstName),
      secondName: cleanText(loginData.secondName),
      email: cleanText(loginData.email).toLowerCase(),
      password: String(loginData.password || "")
    };
    const error = validateAccount(value);
    if (error) {
      setAuthMessage(error);
      return;
    }
    const existing = accounts.find(
      (item) =>
        item.firstName.toLowerCase() === value.firstName.toLowerCase() &&
        item.secondName.toLowerCase() === value.secondName.toLowerCase() &&
        item.email === value.email.toLowerCase() &&
        item.password === value.password
    );
    if (!existing) {
      setAuthMessage("Login unsuccessful: details do not match a registered customer.");
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(existing));
    setUser(existing);
    setLoginData({ firstName: "", secondName: "", email: "", password: "" });
    setScreen("products");
    setAuthMessage("");
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setScreen("login");
  }

  async function readRows(name) {
    const snapshot = await getDocs(collection(customerDb, name));
    return snapshot.docs.map((item) => {
      const data = item.data();
      return { ...data, docId: item.id, id: data.id || item.id };
    });
  }

  async function loadFirebaseData() {
    if (!firebaseReady) return;
    try {
      const [loadedProducts, loadedInventory, loadedCart, loadedOrders, loadedOrderItems] = await Promise.all([
        readRows("catalogProducts"),
        readRows("inventoryItems"),
        readRows("cartItems"),
        readRows("orders"),
        readRows("orderItems")
      ]);

      const nextCatalog = mergeCatalogAndInventory(loadedProducts, loadedInventory);
      if (nextCatalog.length) {
        setCatalog(nextCatalog);
        setSelectedProduct(nextCatalog[0]);
      }
      if (loadedCart.length) setCart(loadedCart.filter((item) => item.customerId === user.id));
      if (loadedOrders.length) {
        setOrders(
          loadedOrders
            .filter((order) => !order.customerId || order.customerId === user.id)
            .map((order) => ({
              ...order,
              total: Math.round(Number(order.total || 0)),
              amountPaid: Math.round(Number(order.amountPaid || 0)),
              items: order.items || loadedOrderItems.filter((item) => item.orderId === order.id || item.orderDocId === order.docId)
            }))
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  function cartTotal() {
    return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
  }

  async function addToCart(product) {
    let existing = cart.find((item) => item.sku === product.sku);
    if (existing) {
      await updateCartQty(existing, Math.round(Number(existing.qty || 1)) + 1);
      setStatusMessage(`${product.name} qty updated`);
      setScreen("cart");
      return;
    }
    const item = {
      customerId: user.id,
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
      setStatusMessage(`${product.name} added. Confirm order to save it.`);
    }
    setCart((current) => [...current, item]);
    if (item.docId || !firebaseReady) setStatusMessage(`${product.name} added`);
    setScreen("cart");
  }

  async function updateCartQty(item, qty) {
    const nextQty = Math.max(1, Math.round(Number(qty) || 1));
    setCart((current) => current.map((entry) => (entry.sku === item.sku ? { ...entry, qty: nextQty } : entry)));
    try {
      if (firebaseReady && item.docId) {
        await updateDoc(doc(customerDb, "cartItems", item.docId), {
          qty: nextQty,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("Quantity updated. Confirm order to save it.");
    }
  }

  async function removeCartItem(item) {
    setCart((current) => current.filter((entry) => entry.sku !== item.sku));
    try {
      if (firebaseReady && item.docId) {
        await deleteDoc(doc(customerDb, "cartItems", item.docId));
      }
    } catch (error) {
      console.error(error);
    }
  }

  function checkoutDelivery() {
    return {
      fullName: cleanText(deliveryForm.fullName) || customerName,
      phone: cleanText(deliveryForm.phone),
      district: cleanText(deliveryForm.district) || "Maseru",
      town: cleanText(deliveryForm.town),
      address: cleanText(deliveryForm.address),
      deliveryOption: deliveryForm.deliveryOption,
      pickupPoint: cleanText(deliveryForm.pickupPoint),
      paymentMethod: deliveryForm.paymentMethod,
      paymentAmount: Number(deliveryForm.paymentAmount || 0),
      paymentAmountRaw: String(deliveryForm.paymentAmount || "").trim()
    };
  }

  function validateCheckout(delivery) {
    const errors = [];
    const fullNameError = validatePlainText("Full name", delivery.fullName, { max: 60 });
    const districtError = validatePlainText("District", delivery.district, { max: 40 });
    const townError = validatePlainText("Town", delivery.town, { max: 40 });
    const addressError = validatePlainText("Address", delivery.address, { max: 120 });
    const pickupError = validatePlainText("Pickup point", delivery.pickupPoint, { required: false, max: 60 });
    [fullNameError, districtError, townError, addressError, pickupError].filter(Boolean).forEach((error) => errors.push(error));
    if (!delivery.phone) errors.push("Phone number is required for the order receipt.");
    else if (!phonePattern.test(delivery.phone)) errors.push("Phone number must contain digits only and be 7 to 15 digits long.");
    if (!delivery.paymentAmountRaw) errors.push("Payment amount is required.");
    else if (!moneyPattern.test(delivery.paymentAmountRaw)) errors.push("Payment amount must be a number with up to 2 decimal places.");
    else if (Number(delivery.paymentAmountRaw) !== cartTotal()) errors.push(`Payment amount must equal the cart total of ${formatMoney(cartTotal())}.`);
    return errors;
  }

  async function checkoutCart() {
    if (!cart.length) {
      setStatusMessage("Cart empty");
      return;
    }
    const delivery = checkoutDelivery();
    const checkoutErrors = validateCheckout(delivery);
    if (checkoutErrors.length) {
      setStatusMessage(`Order not completed: ${checkoutErrors.join(" ")}`);
      return;
    }
    const order = {
      id: `ORD-${Date.now()}`,
      receiptNumber: `INV-${Date.now().toString().slice(-6)}`,
      customerId: user.id,
      customer: customerName,
      total: Math.round(cartTotal()),
      amountPaid: Math.round(delivery.paymentAmount),
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
        qty: Math.round(Number(item.qty || 1)),
        price: Math.round(Number(item.price || 0))
      }))
    };
    setStatusMessage("Saving order...");
    try {
      if (firebaseReady) {
        const orderRef = await addDoc(collection(customerDb, "orders"), {
          ...order,
          createdAt: serverTimestamp()
        });
        await Promise.allSettled(
          order.items.map((item) =>
            addDoc(collection(customerDb, "orderItems"), {
              orderId: order.id,
              orderDocId: orderRef.id,
              customerId: order.customerId,
              productId: item.productId,
              sku: item.sku,
              name: item.name,
              qty: item.qty,
              price: item.price,
              createdAt: serverTimestamp()
            })
          )
        );
        await addDoc(collection(customerDb, "invoices"), {
          id: order.receiptNumber,
          orderId: order.id,
          customerId: order.customerId,
          amount: order.total,
          paymentMethod: order.paymentMethod,
          customerPhone: order.customerPhone,
          status: "Paid",
          createdAt: serverTimestamp()
        });
        await Promise.allSettled(
          cart.filter((item) => item.docId).map((item) => deleteDoc(doc(customerDb, "cartItems", item.docId)))
        );
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("Order not completed. Please try again.");
      return;
    }
    setOrders((current) => [order, ...current]);
    setCart([]);
    setDeliveryForm({
      fullName: "",
      phone: "",
      district: "Maseru",
      town: "",
      address: "",
      deliveryOption: "Delivery",
      pickupPoint: "Maseru Mall",
      paymentMethod: "M-Pesa",
      paymentAmount: ""
    });
    setStatusMessage(`Order placed successfully: ${order.id}`);
    setScreen("orders");
  }

  if (loading) {
    return (
      <div style={{ flex: 1, backgroundColor: "#F5F7FB", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: "24px" }}>Loading...</div>
      </div>
    );
  }

  if (screen === "login" || screen === "register") {
    const isRegister = screen === "register";
    return (
      <div style={{ flex: 1, backgroundColor: "#F5F7FB", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px", overflowY: "auto" }}>
          <div style={{ fontSize: "28px", fontWeight: "700", marginBottom: "16px", color: "#0F172A" }}>{isRegister ? "Create account" : "Customer login"}</div>
          {authMessage ? <div style={{ color: "#B91C1C", marginBottom: "12px" }}>{authMessage}</div> : null}
          <input 
            style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
            placeholder="First name" 
            value={loginData.firstName} 
            onChange={(e) => setLoginField("firstName", e.target.value)} 
          />
          <input 
            style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
            placeholder="Second name" 
            value={loginData.secondName} 
            onChange={(e) => setLoginField("secondName", e.target.value)} 
          />
          <input 
            style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
            placeholder="Email" 
            type="email"
            value={loginData.email} 
            onChange={(e) => setLoginField("email", e.target.value)} 
          />
          <input 
            style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
            placeholder="Password" 
            type="password"
            value={loginData.password} 
            onChange={(e) => setLoginField("password", e.target.value)} 
          />
          <button 
            style={{ backgroundColor: "#2563EB", color: "#FFF", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: "700", width: "100%", marginTop: "8px" }}
            onClick={isRegister ? register : login}
          >
            {isRegister ? "Register" : "Enter mobile app"}
          </button>
          <button 
            style={{ backgroundColor: "#FFF", color: "#334155", padding: "14px", borderRadius: "12px", border: "1px solid #CBD5E1", cursor: "pointer", fontWeight: "700", width: "100%", marginTop: "8px" }}
            onClick={() => { setScreen(isRegister ? "login" : "register"); setAuthMessage(""); }}
          >
            {isRegister ? "Already have account? Login" : "Create account"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, backgroundColor: "#F5F7FB", minHeight: "100vh", display: "flex", flexDirection: "column", paddingBottom: "100px" }}>
      <div style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1F2937" }}>IC</div>
          <div style={{ fontSize: "12px", color: "#64748B" }}>Customer App</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#0F172A" }}>{screen === "products" ? "Products" : screen.charAt(0).toUpperCase() + screen.slice(1)}</div>
        </div>
        <button 
          style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "#E2E8F0", border: "none", cursor: "pointer", color: "#0F172A", fontWeight: "600" }}
          onClick={logout}
        >
          Log out
        </button>
      </div>
      <div style={{ paddingLeft: "16px", paddingRight: "16px", paddingBottom: "80px", overflowY: "auto", flex: 1 }}>
        {screen === "products" && (
          <>
            <div style={{ marginBottom: "16px" }}>
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="Search products" 
                value={filters.search} 
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} 
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                {["all", ...ICT_CATEGORIES].map((category) => (
                  <button 
                    key={category}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: filters.category === category ? "#2563EB" : "#CBD5E1",
                      backgroundColor: filters.category === category ? "#2563EB" : "#FFF",
                      color: filters.category === category ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setFilters((f) => ({ ...f, category }))}
                  >
                    {category === "all" ? "All" : category}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                {["all", ...filteredBrands].map((brand) => (
                  <button 
                    key={brand}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: filters.brand === brand ? "#2563EB" : "#CBD5E1",
                      backgroundColor: filters.brand === brand ? "#2563EB" : "#FFF",
                      color: filters.brand === brand ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setFilters((f) => ({ ...f, brand }))}
                  >
                    {brand === "all" ? "All brands" : brand}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                {[["all", "Any"], ["Available", "Available"], ["Out of stock", "Out of stock"]].map(([value, label]) => (
                  <button 
                    key={value}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: filters.availability === value ? "#2563EB" : "#CBD5E1",
                      backgroundColor: filters.availability === value ? "#2563EB" : "#FFF",
                      color: filters.availability === value ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setFilters((f) => ({ ...f, availability: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                {[["all", "All cond"], ["New", "New"], ["Used", "Used"]].map(([value, label]) => (
                  <button 
                    key={value}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: filters.condition === value ? "#2563EB" : "#CBD5E1",
                      backgroundColor: filters.condition === value ? "#2563EB" : "#FFF",
                      color: filters.condition === value ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setFilters((f) => ({ ...f, condition: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <input 
                  style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", borderWidth: "1px", borderColor: "#CBD5E1", flex: 1, boxSizing: "border-box" }} 
                  placeholder="Min" 
                  type="number"
                  value={filters.priceMin} 
                  onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))} 
                />
                <input 
                  style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", borderWidth: "1px", borderColor: "#CBD5E1", flex: 1, boxSizing: "border-box" }} 
                  placeholder="Max" 
                  type="number"
                  value={filters.priceMax} 
                  onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))} 
                />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {[["newest", "Newest"], ["lowest", "Lowest"], ["highest", "Highest"], ["popularity", "Popularity"]].map(([value, label]) => (
                  <button 
                    key={value}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: filters.sort === value ? "#2563EB" : "#CBD5E1",
                      backgroundColor: filters.sort === value ? "#2563EB" : "#FFF",
                      color: filters.sort === value ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setFilters((f) => ({ ...f, sort: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {sortedCatalog.map((product) => (
              <div key={product.id || product.sku} style={{ backgroundColor: "#FFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", borderWidth: "1px", borderColor: "#E2E8F0" }}>
                {product?.imageUrl || product?.photoUrl ? (
                  <img
                    src={product.imageUrl || product.photoUrl}
                    style={{ width: "100%", height: "170px", borderRadius: "12px", marginBottom: "12px", backgroundColor: "#E2E8F0", objectFit: "cover" }}
                    alt={product.name}
                  />
                ) : null}
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>{product.name}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`${product.brand || "Brand"} • ${product.category || "Category"} • ${formatMoney(product.price)}`}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{product.stock > 0 ? "Available" : "Out of stock"}</div>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button 
                    style={{ backgroundColor: "#1D4ED8", color: "#FFF", padding: "10px 12px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: "600" }}
                    onClick={() => setSelectedProduct(product)}
                  >
                    Details
                  </button>
                  <button 
                    style={{ 
                      backgroundColor: product.stock <= 0 ? "#94A3B8" : "#1D4ED8", 
                      color: "#FFF", 
                      padding: "10px 12px", 
                      borderRadius: "12px", 
                      border: "none", 
                      cursor: product.stock <= 0 ? "not-allowed" : "pointer",
                      fontWeight: "600"
                    }} 
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                  >
                    Add cart
                  </button>
                </div>
              </div>
            ))}
            {selectedProduct ? (
              <div style={{ backgroundColor: "#FFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", borderWidth: "1px", borderColor: "#E2E8F0" }}>
                {selectedProduct?.imageUrl || selectedProduct?.photoUrl ? (
                  <img
                    src={selectedProduct.imageUrl || selectedProduct.photoUrl}
                    style={{ width: "100%", height: "220px", borderRadius: "12px", marginBottom: "12px", backgroundColor: "#E2E8F0", objectFit: "cover" }}
                    alt={selectedProduct.name}
                  />
                ) : null}
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>Selected: {selectedProduct.name}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{selectedProduct.description || "ICT product"}</div>
                {selectedProduct.specifications && Object.entries(selectedProduct.specifications)
                  .filter(([, value]) => value != null && String(value).trim() && !/^n\/?a$/i.test(String(value).trim()))
                  .map(([key, value]) => (
                    <div key={key} style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`${key}: ${value}`}</div>
                  ))}
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`Stock: ${selectedProduct.stock > 0 ? "Available" : "Out of stock"} (${Math.round(selectedProduct.stock)})`}</div>
              </div>
            ) : null}
          </>
        )}

        {screen === "cart" && (
          <>
            <div style={{ backgroundColor: "#FFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", borderWidth: "1px", borderColor: "#E2E8F0" }}>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>Checkout</div>
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="Full name" 
                value={deliveryForm.fullName} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, fullName: e.target.value }))} 
              />
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="Phone number" 
                type="tel"
                value={deliveryForm.phone} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, phone: e.target.value }))} 
              />
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="District" 
                value={deliveryForm.district} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, district: e.target.value }))} 
              />
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="Town" 
                value={deliveryForm.town} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, town: e.target.value }))} 
              />
              <textarea 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box", minHeight: "100px" }} 
                placeholder="Address" 
                value={deliveryForm.address} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, address: e.target.value }))} 
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                {[["Delivery", "Delivery"], ["Pickup", "Pickup"]].map((option) => (
                  <button 
                    key={option[0]}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: deliveryForm.deliveryOption === option[0] ? "#2563EB" : "#CBD5E1",
                      backgroundColor: deliveryForm.deliveryOption === option[0] ? "#2563EB" : "#FFF",
                      color: deliveryForm.deliveryOption === option[0] ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setDeliveryForm((f) => ({ ...f, deliveryOption: option[0] }))}
                  >
                    {option[1]}
                  </button>
                ))}
              </div>
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="Pickup point" 
                value={deliveryForm.pickupPoint} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, pickupPoint: e.target.value }))} 
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                {["M-Pesa", "EcoCash", "Bank Card"].map((payment) => (
                  <button 
                    key={payment}
                    style={{ 
                      borderRadius: "999px", 
                      borderWidth: "1px", 
                      borderColor: deliveryForm.paymentMethod === payment ? "#2563EB" : "#CBD5E1",
                      backgroundColor: deliveryForm.paymentMethod === payment ? "#2563EB" : "#FFF",
                      color: deliveryForm.paymentMethod === payment ? "#FFF" : "#0F172A",
                      padding: "8px 14px", 
                      cursor: "pointer",
                      border: "none"
                    }} 
                    onClick={() => setDeliveryForm((f) => ({ ...f, paymentMethod: payment }))}
                  >
                    {payment}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>Amount to pay: {formatMoney(cartTotal())}</div>
              <input 
                style={{ backgroundColor: "#FFF", borderRadius: "12px", padding: "12px", marginBottom: "12px", borderWidth: "1px", borderColor: "#CBD5E1", width: "100%", boxSizing: "border-box" }} 
                placeholder="Simulated payment amount" 
                type="number"
                value={deliveryForm.paymentAmount} 
                onChange={(e) => setDeliveryForm((f) => ({ ...f, paymentAmount: e.target.value }))} 
              />
            </div>
            <div style={{ backgroundColor: "#FFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", borderWidth: "1px", borderColor: "#E2E8F0" }}>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>Cart</div>
              <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{cart.length} item(s) - {formatMoney(cartTotal())}</div>
              <div style={{ borderRadius: "12px", padding: "10px", backgroundColor: "#E2E8F0", marginBottom: "12px", color: "#0F172A" }}>{statusMessage}</div>
              {cart.length ? cart.map((item) => (
                <div key={item.sku} style={{ backgroundColor: "#F8FAFC", borderRadius: "12px", padding: "12px", marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      {item?.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          style={{ width: "100%", height: "120px", borderRadius: "10px", marginBottom: "10px", backgroundColor: "#E2E8F0", objectFit: "cover" }}
                          alt={item.name}
                        />
                      ) : null}
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A" }}>{item.name}</div>
                      <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`${item.sku} • Qty ${Math.round(item.qty)} • ${formatMoney(Math.round(Number(item.price || 0)) * Math.round(Number(item.qty || 1)))}`}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                    <button 
                      style={{ backgroundColor: "#1D4ED8", color: "#FFF", padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", width: "40px" }}
                      onClick={() => updateCartQty(item, Math.round(Number(item.qty || 1)) - 1)}
                    >
                      -
                    </button>
                    <div style={{ fontSize: "14px", color: "#475569", minWidth: "20px", textAlign: "center" }}>{Math.round(item.qty)}</div>
                    <button 
                      style={{ backgroundColor: "#1D4ED8", color: "#FFF", padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", width: "40px" }}
                      onClick={() => updateCartQty(item, Math.round(Number(item.qty || 1)) + 1)}
                    >
                      +
                    </button>
                    <button 
                      style={{ backgroundColor: "#EF4444", color: "#FFF", padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", marginLeft: "auto" }}
                      onClick={() => removeCartItem(item)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )) : <div style={{ fontSize: "14px", color: "#475569" }}>Cart is empty. Add products from Products.</div>}
              <button 
                style={{ 
                  backgroundColor: !cart.length ? "#94A3B8" : "#2563EB", 
                  color: "#FFF", 
                  padding: "14px", 
                  borderRadius: "12px", 
                  border: "none", 
                  cursor: !cart.length ? "not-allowed" : "pointer",
                  fontWeight: "700",
                  width: "100%",
                  marginTop: "8px"
                }}
                onClick={checkoutCart}
                disabled={!cart.length}
              >
                Place order
              </button>
            </div>
          </>
        )}

        {screen === "orders" && (
          <div style={{ backgroundColor: "#FFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", borderWidth: "1px", borderColor: "#E2E8F0" }}>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>Orders</div>
            {orders.length ? orders.map((order) => (
              <div key={order.id} style={{ backgroundColor: "#FFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", borderWidth: "1px", borderColor: "#E2E8F0" }}>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>{`${order.id} • ${formatMoney(order.total)}`}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`${order.paymentStatus || "Payment Successful"} • ${order.paymentMethod || "Payment method"} • ${order.status || "Processing"}`}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`Receipt ${order.receiptNumber || "generated"}`}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`Phone: ${order.customerPhone || order.delivery?.phone || "Not recorded"}`}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`Location: ${order.customerLocation || "Not specified"}`}</div>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "4px" }}>{`Amount paid: ${formatMoney(order.amountPaid)}`}</div>
              </div>
            )) : <div style={{ fontSize: "14px", color: "#475569" }}>No orders yet. Checkout receipts will appear here.</div>}
          </div>
        )}
      </div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", flexWrap: "wrap", justifyContent: "space-between", padding: "12px", backgroundColor: "#FFFFFF", borderTopWidth: "1px", borderTopColor: "#E2E8F0" }}>
        <button 
          style={{ 
            flex: 1, 
            padding: "10px", 
            marginHorizontal: "2px", 
            borderRadius: "12px", 
            backgroundColor: screen === "products" ? "#2563EB" : "#F8FAFC",
            color: screen === "products" ? "#FFF" : "#334155",
            fontWeight: "600",
            border: "none",
            cursor: "pointer",
            margin: "2px"
          }}
          onClick={() => setScreen("products")}
        >
          Products
        </button>
        <button 
          style={{ 
            flex: 1, 
            padding: "10px", 
            marginHorizontal: "2px", 
            borderRadius: "12px", 
            backgroundColor: screen === "cart" ? "#2563EB" : "#F8FAFC",
            color: screen === "cart" ? "#FFF" : "#334155",
            fontWeight: "600",
            border: "none",
            cursor: "pointer",
            margin: "2px"
          }}
          onClick={() => setScreen("cart")}
        >
          Cart
        </button>
        <button 
          style={{ 
            flex: 1, 
            padding: "10px", 
            marginHorizontal: "2px", 
            borderRadius: "12px", 
            backgroundColor: screen === "orders" ? "#2563EB" : "#F8FAFC",
            color: screen === "orders" ? "#FFF" : "#334155",
            fontWeight: "600",
            border: "none",
            cursor: "pointer",
            margin: "2px"
          }}
          onClick={() => setScreen("orders")}
        >
          Orders
        </button>
      </div>
    </div>
  );
}
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Custom PC Builder</Text>
              {[{ label: "CPU", list: cpus, selectedField: "cpuName" }, { label: "Board", list: boards, selectedField: "boardName" }, { label: "Memory", list: ram, selectedField: "ramName" }, { label: "Storage", list: storage, selectedField: "storageName" }].map(({ label, list, selectedField }) => (
                <View key={selectedField} style={styles.section}>
                  <Text style={styles.sectionTitle}>{label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {list.map((item) => (
                      <TouchableOpacity key={item.name} style={[styles.chip, deliveryForm[selectedField] === item.name && styles.chipActive]} onPress={() => setDeliveryForm((current) => ({ ...current, [selectedField]: item.name }))}>
                        <Text style={[styles.chipText, deliveryForm[selectedField] === item.name && styles.chipTextActive]}>{item.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ))}
              <Text style={styles.cardMeta}>Total: {formatMoney(buildTotal())}</Text>
              <Text style={[styles.cardMeta, buildCompatible() ? styles.okText : styles.warnText]}>{buildCompatible() ? "Compatible" : "Check parts"}</Text>
              <TouchableOpacity style={[styles.primaryButton, !buildCompatible() && styles.disabledButton]} onPress={() => addToCart({ id: "CTO-PC", sku: "CTO-PC", productId: "CTO-PC", name: `${deliveryForm.cpuName || initialCpus[0].name} custom rig`, price: buildTotal(), stock: 1, brand: "Custom", category: "Gaming Devices", imageUrl: "" })} disabled={!buildCompatible()}>
                <Text style={styles.primaryText}>Add rig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Bulk order</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline value={bulkInput} onChangeText={setBulkInput} />
              <TouchableOpacity style={styles.primaryButton} onPress={addBulkItems}>
                <Text style={styles.primaryText}>Add bulk items</Text>
              </TouchableOpacity>
              <Text style={styles.cardMeta}>{bulkStatus}</Text>
            </View>
          </>
        )}

        {screen === "billing" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Lesotho checkout details</Text>
              <TextInput style={styles.input} placeholder="Full name" value={deliveryForm.fullName} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, fullName: text }))} />
              <TextInput style={styles.input} placeholder="Phone number" keyboardType="phone-pad" value={deliveryForm.phone} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, phone: text }))} />
              <TextInput style={styles.input} placeholder="District" value={deliveryForm.district} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, district: text }))} />
              <TextInput style={styles.input} placeholder="Town" value={deliveryForm.town} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, town: text }))} />
              <TextInput style={[styles.input, styles.textArea]} placeholder="Address" multiline value={deliveryForm.address} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, address: text }))} />
              <View style={styles.filterRow}>
                {[["Delivery", "Delivery"], ["Pickup", "Pickup"]].map((option) => (
                  <TouchableOpacity key={option[0]} style={[styles.chip, deliveryForm.deliveryOption === option[0] && styles.chipActive]} onPress={() => setDeliveryForm((f) => ({ ...f, deliveryOption: option[0] }))}>
                    <Text style={[styles.chipText, deliveryForm.deliveryOption === option[0] && styles.chipTextActive]}>{option[1]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} placeholder="Pickup point" value={deliveryForm.pickupPoint} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, pickupPoint: text }))} />
              <View style={styles.filterRow}>
                {["M-Pesa", "EcoCash", "Bank Card"].map((payment) => (
                  <TouchableOpacity key={payment} style={[styles.chip, deliveryForm.paymentMethod === payment && styles.chipActive]} onPress={() => setDeliveryForm((f) => ({ ...f, paymentMethod: payment }))}>
                    <Text style={[styles.chipText, deliveryForm.paymentMethod === payment && styles.chipTextActive]}>{payment}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.cardMeta}>Amount to pay: {formatMoney(cartTotal())}</Text>
              <TextInput style={styles.input} placeholder="Simulated payment amount" keyboardType="numeric" value={deliveryForm.paymentAmount} onChangeText={(text) => setDeliveryForm((f) => ({ ...f, paymentAmount: text }))} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Cart summary</Text>
              <Text style={styles.cardMeta}>{cart.length} item(s) - {formatMoney(cartTotal())}</Text>
              <Text style={styles.statusBadge}>{statusMessage}</Text>
              {cart.length ? cart.map((item) => (
                <View key={item.sku} style={styles.cartRow}>
                  <View style={styles.cartInfo}>
                    {productPhoto(item, styles.cartImage)}
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>{`${item.sku} • Qty ${item.qty} • ${formatMoney(Number(item.price || 0) * Number(item.qty || 1))}`}</Text>
                  </View>
                  <View style={styles.quantityRow}>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQty(item, Number(item.qty || 1) - 1)}><Text style={styles.actionText}>-</Text></TouchableOpacity>
                    <Text style={styles.cardMeta}>{item.qty}</Text>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQty(item, Number(item.qty || 1) + 1)}><Text style={styles.actionText}>+</Text></TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => removeCartItem(item)}><Text style={styles.actionText}>Remove</Text></TouchableOpacity>
                </View>
              )) : <Text style={styles.cardMeta}>Cart is empty. Add products from Shop.</Text>}
              <TouchableOpacity style={[styles.primaryButton, !cart.length && styles.disabledButton]} onPress={checkoutCart} disabled={!cart.length}>
                <Text style={styles.primaryText}>Simulate payment</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent orders</Text>
              {orders.length ? orders.map((order) => (
                <View key={order.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{`${order.id} • ${formatMoney(order.total)}`}</Text>
                  <Text style={styles.cardMeta}>{`${order.paymentStatus || "Payment Successful"} • ${order.paymentMethod || "Payment simulated"} • ${order.status || "Processing"}`}</Text>
                  <Text style={styles.cardMeta}>{`Receipt ${order.receiptNumber || "generated"}`}</Text>
                  <Text style={styles.cardMeta}>{`Customer phone: ${order.customerPhone || order.delivery?.phone || "Not recorded"}`}</Text>
                </View>
              )) : <Text style={styles.cardMeta}>No orders yet. Checkout receipts will appear here.</Text>}
            </View>
            {subscriptions.length ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Subscriptions</Text>
                {subscriptions.map((sub) => (
                  <Text key={sub.id} style={styles.cardMeta}>{`${sub.name} • ${sub.cycle || "Monthly"} - ${sub.renewal || "Renewal"} • ${sub.autoRenew ?? sub.auto ? "Auto-renew on" : "Auto-renew off"}`}</Text>
                ))}
              </View>
            ) : null}
          </>
        )}

        {screen === "support" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Helpdesk ticket</Text>
              <TextInput style={styles.input} placeholder="Ticket title" value={ticketForm.title} onChangeText={(text) => setTicketForm((t) => ({ ...t, title: text }))} />
              <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {assets.map((asset) => (
                    <TouchableOpacity key={asset.id} style={[styles.chip, ticketForm.asset === asset.name && styles.chipActive]} onPress={() => setTicketForm((t) => ({ ...t, asset: asset.name }))}>
                      <Text style={[styles.chipText, ticketForm.asset === asset.name && styles.chipTextActive]}>{asset.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                {[["Question", "Question"], ["Complaint", "Complaint"], ["Delivery Tracking", "Delivery Tracking"], ["Return", "Return"]].map((option) => (
                  <TouchableOpacity key={option[0]} style={[styles.chip, ticketForm.requestType === option[0] && styles.chipActive]} onPress={() => setTicketForm((t) => ({ ...t, requestType: option[0] }))}>
                    <Text style={[styles.chipText, ticketForm.requestType === option[0] && styles.chipTextActive]}>{option[1]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {ticketForm.requestType === "Return" ? (
                <View style={styles.filterRow}>
                  {[["Replacement", "Replacement"], ["Refund", "Refund"], ["Exchange", "Exchange"]].map((option) => (
                    <TouchableOpacity key={option[0]} style={[styles.chip, ticketForm.returnType === option[0] && styles.chipActive]} onPress={() => setTicketForm((t) => ({ ...t, returnType: option[0] }))}>
                      <Text style={[styles.chipText, ticketForm.returnType === option[0] && styles.chipTextActive]}>{option[1]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <TextInput style={styles.input} placeholder="Contact phone or email" value={ticketForm.contacts} onChangeText={(text) => setTicketForm((t) => ({ ...t, contacts: text }))} />
              <View style={styles.rowCenter}>
                <TouchableOpacity style={[styles.chip, ticketForm.anonymous && styles.chipActive]} onPress={() => setTicketForm((t) => ({ ...t, anonymous: !t.anonymous }))}>
                  <Text style={[styles.chipText, ticketForm.anonymous && styles.chipTextActive]}>{ticketForm.anonymous ? "Anonymous" : "Submit anonymously"}</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={[styles.input, styles.textArea]} placeholder="Message or return reason" multiline value={ticketForm.message} onChangeText={(text) => setTicketForm((t) => ({ ...t, message: text }))} />
              <TouchableOpacity style={styles.primaryButton} onPress={createTicket}>
                <Text style={styles.primaryText}>Create ticket</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Support tickets</Text>
              {tickets.length ? tickets.map((ticket) => (
                <View key={ticket.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{`${ticket.id} • ${ticket.title}`}</Text>
                  <Text style={styles.cardMeta}>{`${ticket.anonymous ? "Anonymous" : ticket.contacts || customerName} • ${ticket.requestType || "Question"} • ${ticket.status || "Submitted"}`}</Text>
                  <Text style={styles.cardMeta}>{ticket.message}</Text>
                  <Text style={styles.cardMeta}>Response: {ticket.response || "Awaiting admin response"}</Text>
                </View>
              )) : <Text style={styles.cardMeta}>No tickets. Customer support requests will appear here.</Text>}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>RFQ</Text>
              <Text style={styles.cardMeta}>{bulkStatus}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={async () => {
                setBulkStatus("Submitted to sales");
                if (!firebaseReady) return;
                try {
                  const rfqRef = await addDoc(collection(customerDb, "rfqs"), { customerId: user.id, status: "Submitted to sales", createdAt: serverTimestamp() });
                  await Promise.all(cart.map((item) => addDoc(collection(customerDb, "rfqItems"), { rfqId: rfqRef.id, productId: item.sku, sku: item.sku, name: item.name, qty: item.qty, createdAt: serverTimestamp() })));
                } catch (error) {
                  console.error(error);
                }
              }}>
                <Text style={styles.primaryText}>Submit RFQ</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {screen === "scan" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Barcode Scanner</Text>
              <View style={styles.scannerContainer}>
                {scanEnabled && cameraPermission?.granted ? (
                  <CameraView
                    facing="back"
                    onBarcodeScanned={barcodeScanned}
                    barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"] }}
                    style={styles.scanner}
                  />
                ) : (
                  <TouchableOpacity style={styles.primaryButton} onPress={startScanning}>
                    <Text style={styles.primaryText}>{cameraPermission?.granted ? "Start scanning" : "Allow camera and scan"}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {cameraPermission?.granted === false ? <Text style={styles.cardMeta}>Camera permission is required to scan barcodes.</Text> : null}
              <Text style={styles.cardMeta}>{scannedContent || "Scanned barcode data will appear here."}</Text>
            </View>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {renderNavButton("home", "Home")}
        {renderNavButton("shop", "Shop")}
        {renderNavButton("builder", "Builder")}
        {renderNavButton("billing", "Cart")}
        {renderNavButton("support", "Support")}
        {renderNavButton("scan", "Scan")}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB" },
  header: { padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandMark: { fontSize: 24, fontWeight: "700", color: "#1F2937" },
  subtitle: { fontSize: 12, color: "#64748B" },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#E2E8F0" },
  logoutText: { color: "#0F172A", fontWeight: "600" },
  content: { paddingHorizontal: 16, paddingBottom: 80 },
  pageTitle: { fontSize: 28, fontWeight: "700", marginBottom: 16, color: "#0F172A" },
  authContainer: { padding: 20 },
  input: { backgroundColor: "#FFF", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#CBD5E1" },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#2563EB", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  primaryText: { color: "#FFF", fontWeight: "700" },
  ghostButton: { padding: 14, borderRadius: 12, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFF" },
  ghostText: { color: "#334155", fontWeight: "700" },
  errorText: { color: "#B91C1C", marginBottom: 12 },
  summaryCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  summaryTitle: { fontSize: 14, color: "#64748B", marginBottom: 6 },
  summaryValue: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  summaryMeta: { fontSize: 12, color: "#64748B", marginTop: 4 },
  scanCard: { backgroundColor: "#DBEAFE", borderRadius: 16, padding: 16, marginBottom: 16 },
  scanTitle: { fontSize: 16, fontWeight: "700", color: "#1E40AF" },
  scanMeta: { fontSize: 14, color: "#1E3A8A", marginTop: 8 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  productImage: { width: "100%", height: 170, borderRadius: 12, marginBottom: 12, backgroundColor: "#E2E8F0" },
  detailImage: { width: "100%", height: 220, borderRadius: 12, marginBottom: 12, backgroundColor: "#E2E8F0" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 },
  cardMeta: { fontSize: 14, color: "#475569", marginBottom: 4 },
  actionButton: { backgroundColor: "#1D4ED8", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginRight: 8 },
  actionText: { color: "#FFF", fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  rowCenter: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginVertical: 8 },
  section: { marginBottom: 12 },
  sectionTitle: { fontWeight: "700", marginBottom: 8, color: "#334155" },
  filterPanel: { marginBottom: 16 },
  filterRow: { flexDirection: "row", flexWrap: "nowrap", marginBottom: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8, backgroundColor: "#FFF" },
  chipText: { color: "#0F172A" },
  chipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipTextActive: { color: "#FFF" },
  priceRow: { flexDirection: "row", gap: 8 },
  priceInput: { flex: 1 },
  okText: { color: "#166534", fontWeight: "700" },
  warnText: { color: "#B45309", fontWeight: "700" },
  cartRow: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, marginBottom: 12 },
  cartInfo: { flex: 1 },
  cartImage: { width: "100%", height: 120, borderRadius: 10, marginBottom: 10, backgroundColor: "#E2E8F0" },
  quantityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: 120, marginTop: 8 },
  qtyButton: { backgroundColor: "#1D4ED8", borderRadius: 8, padding: 8 },
  deleteButton: { backgroundColor: "#EF4444", borderRadius: 8, padding: 8, marginTop: 8, alignSelf: "flex-start" },
  statusBadge: { borderRadius: 12, padding: 10, backgroundColor: "#E2E8F0", marginBottom: 12, color: "#0F172A" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", padding: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E2E8F0" },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 10, marginHorizontal: 2, borderRadius: 12, backgroundColor: "#F8FAFC" },
  tabButtonActive: { backgroundColor: "#2563EB" },
  tabText: { color: "#334155", fontWeight: "600" },
  tabTextActive: { color: "#FFF" },
  disabledButton: { backgroundColor: "#94A3B8" },
  scannerContainer: { height: 280, borderRadius: 16, overflow: "hidden", marginTop: 12 },
  scanner: { flex: 1 },
  textCenter: { textAlign: "center" }
});
