import React, { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image
} from "react-native";

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
      const rawSession = await AsyncStorage.getItem(SESSION_KEY);
      const rawAccounts = await AsyncStorage.getItem(ACCOUNTS_KEY);
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
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(nextAccounts));
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
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(existing));
    setUser(existing);
    setLoginData({ firstName: "", secondName: "", email: "", password: "" });
    setScreen("products");
    setAuthMessage("");
  }

  function logout() {
    AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
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

  function renderNavButton(name, label) {
    return (
      <TouchableOpacity key={name} style={[styles.tabButton, screen === name && styles.tabButtonActive]} onPress={() => setScreen(name)}>
        <Text style={[styles.tabText, screen === name && styles.tabTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2A71FF" />
      </SafeAreaView>
    );
  }

  if (screen === "login" || screen === "register") {
    const isRegister = screen === "register";
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.authContainer}>
          <Text style={styles.pageTitle}>{isRegister ? "Create account" : "Customer login"}</Text>
          {authMessage ? <Text style={styles.errorText}>{authMessage}</Text> : null}
          <TextInput style={styles.input} placeholder="First name" value={loginData.firstName} onChangeText={(text) => setLoginField("firstName", text)} />
          <TextInput style={styles.input} placeholder="Second name" value={loginData.secondName} onChangeText={(text) => setLoginField("secondName", text)} />
          <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={loginData.email} onChangeText={(text) => setLoginField("email", text)} />
          <TextInput style={styles.input} placeholder="Password" secureTextEntry value={loginData.password} onChangeText={(text) => setLoginField("password", text)} />
          <TouchableOpacity style={styles.primaryButton} onPress={isRegister ? register : login}>
            <Text style={styles.primaryText}>{isRegister ? "Register" : "Enter mobile app"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={() => { setScreen(isRegister ? "login" : "register"); setAuthMessage(""); }}>
            <Text style={styles.ghostText}>{isRegister ? "Already have account? Login" : "Create account"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brandMark}>IC</Text>
          <Text style={styles.subtitle}>Customer App</Text>
          <Text style={styles.title}>{screen === "products" ? "Products" : screen.charAt(0).toUpperCase() + screen.slice(1)}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {screen === "products" && (
          <>
            <View style={styles.filterPanel}>
              <TextInput style={styles.input} placeholder="Search products" value={filters.search} onChangeText={(text) => setFilters((f) => ({ ...f, search: text }))} />
              <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {["all", ...ICT_CATEGORIES].map((category) => (
                    <TouchableOpacity key={category} style={[styles.chip, filters.category === category && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, category }))}>
                      <Text style={[styles.chipText, filters.category === category && styles.chipTextActive]}>{category === "all" ? "All" : category}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {["all", ...filteredBrands].map((brand) => (
                    <TouchableOpacity key={brand} style={[styles.chip, filters.brand === brand && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, brand }))}>
                      <Text style={[styles.chipText, filters.brand === brand && styles.chipTextActive]}>{brand === "all" ? "All brands" : brand}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                {[["all", "Any"], ["Available", "Available"], ["Out of stock", "Out of stock"]].map(([value, label]) => (
                  <TouchableOpacity key={value} style={[styles.chip, filters.availability === value && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, availability: value }))}>
                    <Text style={[styles.chipText, filters.availability === value && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.filterRow}>
                {[["all", "All cond"], ["New", "New"], ["Used", "Used"]].map(([value, label]) => (
                  <TouchableOpacity key={value} style={[styles.chip, filters.condition === value && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, condition: value }))}>
                    <Text style={[styles.chipText, filters.condition === value && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.priceRow}>
                <TextInput style={[styles.input, styles.priceInput]} placeholder="Min" keyboardType="numeric" value={filters.priceMin} onChangeText={(text) => setFilters((f) => ({ ...f, priceMin: text }))} />
                <TextInput style={[styles.input, styles.priceInput]} placeholder="Max" keyboardType="numeric" value={filters.priceMax} onChangeText={(text) => setFilters((f) => ({ ...f, priceMax: text }))} />
              </View>
              <View style={styles.filterRow}>
                {[["newest", "Newest"], ["lowest", "Lowest"], ["highest", "Highest"], ["popularity", "Popularity"]].map(([value, label]) => (
                  <TouchableOpacity key={value} style={[styles.chip, filters.sort === value && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, sort: value }))}>
                    <Text style={[styles.chipText, filters.sort === value && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {sortedCatalog.map((product) => (
              <View key={product.id || product.sku} style={styles.card}>
                {product?.imageUrl || product?.photoUrl ? (
                  <Image
                    source={{ uri: product.imageUrl || product.photoUrl }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                ) : null}
                <Text style={styles.cardTitle}>{product.name}</Text>
                <Text style={styles.cardMeta}>{`${product.brand || "Brand"} • ${product.category || "Category"} • ${formatMoney(product.price)}`}</Text>
                <Text style={styles.cardMeta}>{product.stock > 0 ? "Available" : "Out of stock"}</Text>
                <View style={styles.row}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => setSelectedProduct(product)}>
                    <Text style={styles.actionText}>Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, product.stock <= 0 && styles.disabledButton]} onPress={() => addToCart(product)} disabled={product.stock <= 0}>
                    <Text style={styles.actionText}>Add cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {selectedProduct ? (
              <View style={styles.card}>
                {selectedProduct?.imageUrl || selectedProduct?.photoUrl ? (
                  <Image
                    source={{ uri: selectedProduct.imageUrl || selectedProduct.photoUrl }}
                    style={styles.detailImage}
                    resizeMode="cover"
                  />
                ) : null}
                <Text style={styles.cardTitle}>Selected: {selectedProduct.name}</Text>
                <Text style={styles.cardMeta}>{selectedProduct.description || "ICT product"}</Text>
                {selectedProduct.specifications && Object.entries(selectedProduct.specifications)
                  .filter(([, value]) => value != null && String(value).trim() && !/^n\/?a$/i.test(String(value).trim()))
                  .map(([key, value]) => (
                    <Text key={key} style={styles.cardMeta}>{`${key}: ${value}`}</Text>
                  ))}
                <Text style={styles.cardMeta}>{`Stock: ${selectedProduct.stock > 0 ? "Available" : "Out of stock"} (${Math.round(selectedProduct.stock)})`}</Text>
              </View>
            ) : null}
          </>
        )}

        {screen === "cart" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Checkout</Text>
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
              <Text style={styles.cardTitle}>Cart</Text>
              <Text style={styles.cardMeta}>{cart.length} item(s) - {formatMoney(cartTotal())}</Text>
              <Text style={styles.statusBadge}>{statusMessage}</Text>
              {cart.length ? cart.map((item) => (
                <View key={item.sku} style={styles.cartRow}>
                  <View style={styles.cartInfo}>
                    {item?.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.cartImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>{`${item.sku} • Qty ${Math.round(item.qty)} • ${formatMoney(Math.round(Number(item.price || 0)) * Math.round(Number(item.qty || 1)))}`}</Text>
                  </View>
                  <View style={styles.quantityRow}>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQty(item, Math.round(Number(item.qty || 1)) - 1)}><Text style={styles.actionText}>-</Text></TouchableOpacity>
                    <Text style={styles.cardMeta}>{Math.round(item.qty)}</Text>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQty(item, Math.round(Number(item.qty || 1)) + 1)}><Text style={styles.actionText}>+</Text></TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => removeCartItem(item)}><Text style={styles.actionText}>Remove</Text></TouchableOpacity>
                </View>
              )) : <Text style={styles.cardMeta}>Cart is empty. Add products from Products.</Text>}
              <TouchableOpacity style={[styles.primaryButton, !cart.length && styles.disabledButton]} onPress={checkoutCart} disabled={!cart.length}>
                <Text style={styles.primaryText}>Place order</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {screen === "orders" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Orders</Text>
            {orders.length ? orders.map((order) => (
              <View key={order.id} style={styles.card}>
                <Text style={styles.cardTitle}>{`${order.id} • ${formatMoney(order.total)}`}</Text>
                <Text style={styles.cardMeta}>{`${order.paymentStatus || "Payment Successful"} • ${order.paymentMethod || "Payment method"} • ${order.status || "Processing"}`}</Text>
                <Text style={styles.cardMeta}>{`Receipt ${order.receiptNumber || "generated"}`}</Text>
                <Text style={styles.cardMeta}>{`Phone: ${order.customerPhone || order.delivery?.phone || "Not recorded"}`}</Text>
                <Text style={styles.cardMeta}>{`Location: ${order.customerLocation || "Not specified"}`}</Text>
                <Text style={styles.cardMeta}>{`Amount paid: ${formatMoney(order.amountPaid)}`}</Text>
              </View>
            )) : <Text style={styles.cardMeta}>No orders yet. Checkout receipts will appear here.</Text>}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {renderNavButton("products", "Products")}
        {renderNavButton("cart", "Cart")}
        {renderNavButton("orders", "Orders")}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>MRR services</Text>
              <Text style={styles.summaryValue}>M6,740</Text>
              <Text style={styles.summaryMeta}>Next renewal: 2026-06-14</Text>
            </View>
            <TouchableOpacity style={styles.scanCard} onPress={() => { setScreen("scan"); setScanEnabled(true); }}>
              <Text style={styles.scanTitle}>Scan barcode</Text>
              <Text style={styles.scanMeta}>{scannedContent || "Tap to scan with Expo Go"}</Text>
            </TouchableOpacity>
            {assets.map((asset) => (
              <View key={asset.id} style={styles.card}>
                <Text style={styles.cardTitle}>{asset.name}</Text>
                <Text style={styles.cardMeta}>{`${asset.type} - expires ${asset.expires}`}</Text>
                <TouchableOpacity style={styles.actionButton} onPress={() => setStatusMessage(`${asset.action} opened`)}>
                  <Text style={styles.actionText}>{asset.action}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {screen === "shop" && (
          <>
            <View style={styles.filterPanel}>
              <TextInput style={styles.input} placeholder="Search products" value={filters.search} onChangeText={(text) => setFilters((f) => ({ ...f, search: text }))} />
              <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {["all", ...ICT_CATEGORIES].map((category) => (
                    <TouchableOpacity key={category} style={[styles.chip, filters.category === category && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, category }))}>
                      <Text style={[styles.chipText, filters.category === category && styles.chipTextActive]}>{category === "all" ? "All" : category}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {["all", ...filteredBrands].map((brand) => (
                    <TouchableOpacity key={brand} style={[styles.chip, filters.brand === brand && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, brand }))}>
                      <Text style={[styles.chipText, filters.brand === brand && styles.chipTextActive]}>{brand === "all" ? "All brands" : brand}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                {[["all", "Any"], ["Available", "Available"], ["Out of stock", "Out of stock"]].map(([value, label]) => (
                  <TouchableOpacity key={value} style={[styles.chip, filters.availability === value && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, availability: value }))}>
                    <Text style={[styles.chipText, filters.availability === value && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.filterRow}>
                {[["all", "All cond"], ["New", "New"], ["Used", "Used"]].map(([value, label]) => (
                  <TouchableOpacity key={value} style={[styles.chip, filters.condition === value && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, condition: value }))}>
                    <Text style={[styles.chipText, filters.condition === value && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.priceRow}>
                <TextInput style={[styles.input, styles.priceInput]} placeholder="Min" keyboardType="numeric" value={filters.priceMin} onChangeText={(text) => setFilters((f) => ({ ...f, priceMin: text }))} />
                <TextInput style={[styles.input, styles.priceInput]} placeholder="Max" keyboardType="numeric" value={filters.priceMax} onChangeText={(text) => setFilters((f) => ({ ...f, priceMax: text }))} />
              </View>
              <View style={styles.filterRow}>
                {[["newest", "Newest"], ["lowest", "Lowest"], ["highest", "Highest"], ["popularity", "Popularity"]].map(([value, label]) => (
                  <TouchableOpacity key={value} style={[styles.chip, filters.sort === value && styles.chipActive]} onPress={() => setFilters((f) => ({ ...f, sort: value }))}>
                    <Text style={[styles.chipText, filters.sort === value && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {sortedCatalog.map((product) => (
              <View key={product.id || product.sku} style={styles.card}>
                {productPhoto(product)}
                <Text style={styles.cardTitle}>{product.name}</Text>
                <Text style={styles.cardMeta}>{`${product.brand || "Brand"} • ${product.category || "Category"} • ${formatMoney(product.price)}`}</Text>
                <Text style={styles.cardMeta}>{product.stock > 0 ? "Available" : "Out of stock"}</Text>
                <View style={styles.row}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => setSelectedProduct(product)}>
                    <Text style={styles.actionText}>Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, product.stock <= 0 && styles.disabledButton]} onPress={() => addToCart(product)} disabled={product.stock <= 0}>
                    <Text style={styles.actionText}>Add cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {selectedProduct ? (
              <View style={styles.card}>
                {productPhoto(selectedProduct, styles.detailImage)}
                <Text style={styles.cardTitle}>Selected: {selectedProduct.name}</Text>
                <Text style={styles.cardMeta}>{selectedProduct.description || "ICT product"}</Text>
                {selectedProduct.specifications && Object.entries(selectedProduct.specifications)
                  .filter(([, value]) => value != null && String(value).trim() && !/^n\/?a$/i.test(String(value).trim()))
                  .map(([key, value]) => (
                    <Text key={key} style={styles.cardMeta}>{`${key}: ${value}`}</Text>
                  ))}
                <Text style={styles.cardMeta}>{`Stock: ${selectedProduct.stock > 0 ? "Available" : "Out of stock"} (${selectedProduct.stock})`}</Text>
              </View>
            ) : null}
          </>
        )}

        {screen === "builder" && (
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
