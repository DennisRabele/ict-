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
import workbench from "./assets/workbench.svg";
import { customerDb, firebaseReady } from "./firebase.js";
import {
  ICT_CATEGORIES,
  PRODUCT_CONDITIONS,
  formatMoney,
  matchesProduct,
  mergeCatalogAndInventory,
  sortProducts
} from "../../firebase/catalog.js";

const SESSION_KEY = "ict-customer-session";
const DEFAULT_CUSTOMER = {
  id: "customer-prime-logistics",
  firstName: "Prime",
  secondName: "Logistics",
  email: "customer@company.test"
};

const DEFAULT_PRODUCT_IDS = new Set(["LT-T14", "SV-R350", "SW-48P", "WK-CTO", "HP-ELITE-MINI", "HP-ELITE-840", "SAM-A15", "UBQ-48P", "DEMO-LAPTOP"]);
const INITIAL_FILTERS = {
  search: "",
  category: "all",
  brand: "all",
  availability: "all",
  condition: "all",
  priceMin: "",
  priceMax: "",
  sort: "newest"
};

function checkoutDefaults(customer) {
  return {
    fullName: customerName(customer),
    phone: "",
    district: "Maseru",
    town: "",
    address: "",
    deliveryOption: "Delivery",
    pickupPoint: "Maseru Mall",
    paymentMethod: "M-Pesa",
    paymentAmount: ""
  };
}

function Icon({ name }) {
  const paths = {
    products: <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />,
    cart: <path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM4 4h2l2.2 10.5A2 2 0 0 0 10.1 16H18v-2h-7.8l-.4-2H18.8L21 6H7.2L6.8 4H4Z" />,
    checkout: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6V6H9v2Zm0 4h6v-2H9v2Zm0 4h4v-2H9v2Z" />,
    orders: <path d="M5 4h14v3H5V4Zm0 5h14v11H5V9Zm3 3v2h8v-2H8Zm0 4v2h5v-2H8Z" />,
    logout: <path d="M5 4h8v2H7v12h6v2H5V4Zm10.5 3.5L20 12l-4.5 4.5-1.4-1.4 2.1-2.1H10v-2h6.2l-2.1-2.1 1.4-1.4Z" />,
    plus: <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function customerName(customer) {
  return [customer?.firstName, customer?.secondName].filter(Boolean).join(" ") || customer?.name || "Customer";
}

function orderDate(order) {
  const value = order.createdAt;
  if (value?.toDate) return value.toDate().toLocaleDateString();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toLocaleDateString();
  return new Date(value || Date.now()).toLocaleDateString();
}

function specEntries(product) {
  const entries = Object.entries(product.specifications || {})
    .filter(([, value]) => value != null && String(value).trim() && !/^n\/?a$/i.test(String(value).trim()));
  if (entries.length) return entries;
  return [["Details", product.details || product.specs || product.description || "ICT product"]];
}

function productCardDetails(product) {
  return [
    ["Brand", product.brand],
    ...specEntries(product),
    ["Stock", product.stock > 0 ? "Available" : "Out of stock"]
  ].filter(([, value]) => value != null && String(value).trim() && !/^n\/?a$/i.test(String(value).trim()));
}

function sameCartItem(entry, item) {
  return item.docId ? entry.docId === item.docId : entry.sku === item.sku;
}

function App() {
  const [active, setActive] = useState("products");
  const [customer, setCustomer] = useState(readSession() || DEFAULT_CUSTOMER);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [checkout, setCheckout] = useState(checkoutDefaults(customer));
  const [tickets, setTickets] = useState([]);
  const [query, setQuery] = useState({
    requestType: "Question",
    message: "",
    contacts: "",
    anonymous: false
  });
  const [checkoutNotice, setCheckoutNotice] = useState("Cart ready");
  const [receipt, setReceipt] = useState(null);

  const brands = useMemo(() => [...new Set(products.map((product) => product.brand).filter(Boolean))].sort(), [products]);
  const filteredProducts = useMemo(() => {
    return sortProducts(products.filter((product) => matchesProduct(product, filters)), filters.sort);
  }, [products, filters]);
  const detailProduct = selectedProduct || filteredProducts[0] || products[0];
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0), [cart]);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      window.location.href = "customer-login.html";
      return;
    }

    setCustomer(session);
    setCheckout(checkoutDefaults(session));
  }, []);

  useEffect(() => {
    let mounted = true;

    async function readRows(name) {
      const snapshot = await getDocs(collection(customerDb, name));
      return snapshot.docs.map((item) => {
        const data = item.data();
        return { ...data, docId: item.id, id: data.id || item.id };
      });
    }

    async function loadCustomerData() {
      if (!firebaseReady) {
        return;
      }

      try {
        const session = readSession() || DEFAULT_CUSTOMER;
        const [catalogRows, inventoryRows, cartRows, orderRows, orderItemRows, ticketRows] = await Promise.all([
          readRows("catalogProducts"),
          readRows("inventoryItems"),
          readRows("cartItems"),
          readRows("orders"),
          readRows("orderItems"),
          readRows("tickets")
        ]);

        if (!mounted) return;

        const merged = mergeCatalogAndInventory(catalogRows, inventoryRows)
          .filter((product) => !DEFAULT_PRODUCT_IDS.has(product.productId) && !DEFAULT_PRODUCT_IDS.has(product.sku));
        if (merged.length) setProducts(merged);

        setCart(cartRows.filter((item) => item.customerId === session.id));
        setOrders(orderRows
          .filter((order) => !order.customerId || order.customerId === session.id)
          .map((order) => ({
            ...order,
            items: order.items || orderItemRows.filter((item) => item.orderId === order.id || item.orderDocId === order.docId)
          })));
        setTickets(ticketRows.filter((ticket) => !ticket.customerId || ticket.customerId === session.id));
      } catch (error) {
        console.error(error);
      }
    }

    loadCustomerData();

    return () => {
      mounted = false;
    };
  }, []);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function addProductToCart(product) {
    const existing = cart.find((item) => item.sku === product.sku);
    if (existing) {
      await updateCartQuantity(existing, Number(existing.qty || 1) + 1);
      setCheckoutNotice(`${product.name} quantity updated`);
      setFilters(INITIAL_FILTERS);
      setSelectedProduct(null);
      setActive("cart");
      return;
    }

    const item = {
      customerId: customer.id,
      sku: product.sku,
      productId: product.productId || product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
      qty: 1,
      price: Number(product.price || 0)
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
      setCheckoutNotice(`${product.name} added to cart. Confirm your order to save it.`);
    }

    setCart((items) => [...items, item]);
    if (item.docId || !firebaseReady) setCheckoutNotice(`${product.name} added to cart`);
    setFilters(INITIAL_FILTERS);
    setSelectedProduct(null);
    setActive("cart");
  }

  async function updateCartQuantity(item, qty) {
    const nextQty = Math.max(1, Number(qty) || 1);
    setCart((items) => items.map((entry) => sameCartItem(entry, item) ? { ...entry, qty: nextQty } : entry));
    try {
      if (firebaseReady && item.docId) {
        await updateDoc(doc(customerDb, "cartItems", item.docId), {
          qty: nextQty,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error(error);
      setCheckoutNotice("Quantity updated. Confirm your order to save the final cart.");
    }
  }

  async function removeCartItem(item) {
    setCart((items) => items.filter((entry) => !sameCartItem(entry, item)));
    if (firebaseReady && item.docId) {
      await deleteDoc(doc(customerDb, "cartItems", item.docId));
    }
  }

  async function checkoutCart() {
    setCheckoutNotice("Checking order...");
    if (!cart.length) {
      setCheckoutNotice("Cart is empty");
      return;
    }

    const confirmedAmount = Number(checkout.paymentAmount) || cartTotal;
    if (confirmedAmount !== cartTotal) setCheckoutNotice(`Payment amount adjusted to ${formatMoney(cartTotal)}.`);
    const delivery = {
      ...checkout,
      fullName: checkout.fullName.trim() || customerName(customer),
      phone: checkout.phone.trim() || "Not supplied",
      district: checkout.district.trim() || "Maseru",
      town: checkout.town.trim() || "Not supplied",
      address: checkout.address.trim() || "Not supplied",
      paymentMethod: checkout.paymentMethod || "M-Pesa",
      paymentAmount: cartTotal
    };

    const order = {
      id: `ORD-${Date.now()}`,
      receiptNumber: `INV-${Date.now().toString().slice(-6)}`,
      customerId: customer.id,
      customer: customerName(customer),
      total: cartTotal,
      amountPaid: cartTotal,
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

    setCheckoutNotice("Saving order...");

    try {
      if (firebaseReady) {
        const orderRef = await addDoc(collection(customerDb, "orders"), {
          id: order.id,
          receiptNumber: order.receiptNumber,
          customerId: order.customerId,
          customer: order.customer,
          total: order.total,
          amountPaid: order.amountPaid,
          customerLocation: order.customerLocation,
          customerAddress: order.customerAddress,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          delivery: order.delivery,
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
          status: "Paid",
          createdAt: serverTimestamp()
        })]);

        await Promise.allSettled(cart.filter((item) => item.docId).map((item) => deleteDoc(doc(customerDb, "cartItems", item.docId))));
      }
    } catch (error) {
      console.error(error);
      setCheckoutNotice("Order not completed: please try again.");
      return;
    }

    setOrders((items) => [order, ...items]);
    setReceipt(order);
    setCart([]);
    setCheckout(checkoutDefaults(customer));
    setCheckoutNotice(`Order placed successfully: ${order.id}`);
    setActive("orders");
  }

  async function submitQuery(event) {
    event.preventDefault();
    if (!query.message.trim()) return;
    const ticket = {
      id: `TCK-${Date.now().toString().slice(-5)}`,
      customerId: customer.id,
      customer: customerName(customer),
      customerName: customerName(customer),
      contacts: query.anonymous ? "" : query.contacts,
      anonymous: query.anonymous,
      requestType: query.requestType,
      message: query.message.trim(),
      status: "Submitted",
      response: "",
      createdAt: new Date().toISOString()
    };
    try {
      if (firebaseReady) {
        const ref = await addDoc(collection(customerDb, "tickets"), {
          ...ticket,
          createdAt: serverTimestamp()
        });
        ticket.docId = ref.id;
      }
      setTickets((items) => [ticket, ...items]);
      setQuery({ requestType: "Question", message: "", contacts: "", anonymous: false });
    } catch (error) {
      console.error(error);
      setQuery((current) => ({ ...current, message: current.message }));
    }
  }

  function logoutCustomer() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "customer-login.html";
  }

  return (
    <div className="appShell">
      <aside className="sidePanel">
        <a className="brandLockup compact" href="index.html">
          <span className="brandMark">IC</span>
          <span>Customer</span>
        </a>
        <nav className="tabList" aria-label="Customer commerce modules">
          {[
            ["products", "Products", "products"],
            ["cart", "Cart", "cart"],
            ["checkout", "Checkout", "checkout"],
            ["orders", "Orders", "orders"],
            ["queries", "Queries", "checkout"]
          ].map(([id, label, icon]) => (
            <button key={id} className={active === id ? "tab active" : "tab"} type="button" onClick={() => setActive(id)}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <section className="sideVisual">
          <img src={workbench} alt="Customer ICT workbench" />
        </section>
      </aside>

      <main className="mainContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">Customer workspace</p>
            <h1>{active === "products" ? "Products" : active === "cart" ? "Shopping Cart" : active === "checkout" ? "Checkout" : active === "orders" ? "Orders And Receipts" : "Customer Queries"}</h1>
          </div>
          <div className="topbarActions">
            <span className="statusPill">{customerName(customer)}</span>
            <button className="ghostButton" type="button" onClick={logoutCustomer}>
              <Icon name="logout" />
              Log out
            </button>
          </div>
        </header>
        {checkoutNotice !== "Cart ready" && <div className="authNotice">{checkoutNotice}</div>}

        {active === "products" && (
          <section className="screenGrid">
            <article className="panel wide">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Browse ICT products</p>
                  <h2>{filteredProducts.length} available item(s)</h2>
                </div>
                <span className="statusPill">{cart.length} in cart</span>
              </div>
              <div className="filterBar">
                <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search name, brand, category, keyword" />
                <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
                  <option value="all">All categories</option>
                  {ICT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
                <select value={filters.brand} onChange={(event) => updateFilter("brand", event.target.value)}>
                  <option value="all">All brands</option>
                  {brands.map((brand) => <option key={brand}>{brand}</option>)}
                </select>
                <select value={filters.availability} onChange={(event) => updateFilter("availability", event.target.value)}>
                  <option value="all">Any availability</option>
                  <option>Available</option>
                  <option>Out of stock</option>
                </select>
                <select value={filters.condition} onChange={(event) => updateFilter("condition", event.target.value)}>
                  <option value="all">New and used</option>
                  {PRODUCT_CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}
                </select>
                <input type="number" min="0" value={filters.priceMin} onChange={(event) => updateFilter("priceMin", event.target.value)} placeholder="Min price" />
                <input type="number" min="0" value={filters.priceMax} onChange={(event) => updateFilter("priceMax", event.target.value)} placeholder="Max price" />
                <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>
                  <option value="newest">Newest</option>
                  <option value="lowest">Lowest price</option>
                  <option value="highest">Highest price</option>
                  <option value="popularity">Popularity</option>
                </select>
              </div>
              <div className="catalogGrid">
                {filteredProducts.map((product) => (
                  <article className="productCard" key={product.id}>
                    {product.imageUrl && <img className="productThumb" src={product.imageUrl} alt={product.name} />}
                    <span className="assetType">{product.category}</span>
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <dl>
                      {productCardDetails(product).map(([label, value]) => (
                        <div key={`${product.id}-${label}`}>
                          <dt>{label}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="productFooter">
                      <strong>{formatMoney(product.price)}</strong>
                      <span className={product.stock > 0 ? "statusPill" : "statusPill warn"}>{product.condition}</span>
                    </div>
                    <div className="buttonRow">
                      <button className="miniButton" type="button" onClick={() => setSelectedProduct(product)}>View details</button>
                      <button className="miniButton" type="button" onClick={() => addProductToCart(product)} disabled={product.stock <= 0}>Add to cart</button>
                    </div>
                  </article>
                ))}
              </div>
            </article>
            <aside className="panel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Product details</p>
                  <h2>{detailProduct?.name || "Select a product"}</h2>
                </div>
              </div>
              {detailProduct && (
                <div className="detailStack">
                  {detailProduct.imageUrl && <img className="productThumb" src={detailProduct.imageUrl} alt={detailProduct.name} />}
                  <span className={detailProduct.stock > 0 ? "statusPill" : "statusPill warn"}>{detailProduct.availability}</span>
                  <p>{detailProduct.description}</p>
                  <div className="rowStack">
                    {specEntries(detailProduct).map(([label, value]) => (
                      <div className="rowItem" key={label}>
                        <strong>{label}</strong>
                        <span>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="priceBand">
                    <strong>{formatMoney(detailProduct.price)}</strong>
                    <span>{detailProduct.stock} in stock</span>
                  </div>
                  <button className="primaryButton" type="button" onClick={() => addProductToCart(detailProduct)} disabled={detailProduct.stock <= 0}>
                    <Icon name="plus" />
                    Add to cart
                  </button>
                </div>
              )}
            </aside>
          </section>
        )}

        {active === "cart" && (
          <section className="screenGrid">
            <article className="panel wide">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Temporary cart</p>
                  <h2>Selected products</h2>
                </div>
                <span className="statusPill">{formatMoney(cartTotal)}</span>
              </div>
              <CartList cart={cart} onQuantity={updateCartQuantity} onRemove={removeCartItem} />
              <div className="priceBand">
                <strong>Total: {formatMoney(cartTotal)}</strong>
                <button className="primaryButton" type="button" onClick={() => setActive("checkout")} disabled={!cart.length}>
                  <Icon name="checkout" />
                  Checkout
                </button>
              </div>
            </article>
            <aside className="panel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Cart totals</p>
                  <h2>Summary</h2>
                </div>
              </div>
              <div className="rowStack">
                <div className="rowItem"><strong>Subtotal</strong><span>{formatMoney(cartTotal)}</span></div>
                <div className="rowItem"><strong>Delivery</strong><span>Calculated at checkout</span></div>
                <div className="rowItem"><strong>Total</strong><span>{formatMoney(cartTotal)}</span></div>
              </div>
            </aside>
          </section>
        )}

        {active === "checkout" && (
          <section className="screenGrid">
            <article className="panel wide">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Confirm order</p>
                  <h2>Delivery and simulated payment</h2>
                </div>
                <span className="statusPill">{checkoutNotice}</span>
              </div>
              <div className="checkoutGrid">
                <label>Full name<input value={checkout.fullName} onChange={(event) => setCheckout({ ...checkout, fullName: event.target.value })} /></label>
                <label>Phone number<input value={checkout.phone} onChange={(event) => setCheckout({ ...checkout, phone: event.target.value })} placeholder="+266" /></label>
                <label>District<input value={checkout.district} onChange={(event) => setCheckout({ ...checkout, district: event.target.value })} /></label>
                <label>Town<input value={checkout.town} onChange={(event) => setCheckout({ ...checkout, town: event.target.value })} /></label>
                <label>Delivery option
                  <select value={checkout.deliveryOption} onChange={(event) => setCheckout({ ...checkout, deliveryOption: event.target.value })}>
                    <option>Delivery</option>
                    <option>Pickup</option>
                  </select>
                </label>
                <label>Pickup point<input value={checkout.pickupPoint} onChange={(event) => setCheckout({ ...checkout, pickupPoint: event.target.value })} /></label>
                <label className="wideInput">Address<textarea value={checkout.address} onChange={(event) => setCheckout({ ...checkout, address: event.target.value })} /></label>
                <label>Payment method
                  <select value={checkout.paymentMethod} onChange={(event) => setCheckout({ ...checkout, paymentMethod: event.target.value })}>
                  <option>M-Pesa</option>
                  <option>EcoCash</option>
                  <option>Bank Card</option>
                </select>
              </label>
                <div className="rowItem"><strong>Amount to pay</strong><span>{formatMoney(cartTotal)}</span></div>
                <label>Simulated payment amount<input type="number" min="0" value={checkout.paymentAmount} onChange={(event) => setCheckout({ ...checkout, paymentAmount: event.target.value })} placeholder={String(cartTotal)} /></label>
              </div>
              <div className="priceBand">
                <strong>Total: {formatMoney(cartTotal)}</strong>
                <button className="primaryButton" type="button" onClick={checkoutCart}>
                  <Icon name="cart" />
                  Confirm order
                </button>
              </div>
            </article>
            <aside className="panel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Review</p>
                  <h2>Products and quantities</h2>
                </div>
              </div>
              <CartList cart={cart} compact onQuantity={updateCartQuantity} onRemove={removeCartItem} />
            </aside>
          </section>
        )}

        {active === "orders" && (
          <section className="screenGrid">
            <article className="panel wide">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Receipts and invoices</p>
                  <h2>Recent orders</h2>
                </div>
              </div>
              <div className="rowStack">
                {orders.length ? orders.map((order) => (
                  <article className="rowItem" key={order.id}>
                    <strong>{order.id} - {formatMoney(order.total)}</strong>
                    <span>{order.paymentStatus} - {order.paymentMethod || "Payment simulated"} - {order.status}</span>
                    <span>{orderDate(order)} - {(order.items || []).reduce((sum, item) => sum + Number(item.qty || 1), 0)} item(s) - {order.customerLocation || order.delivery?.town || "Location pending"}</span>
                    <span>Receipt: {order.receiptNumber || order.invoiceId || "Generated on checkout"}</span>
                    <button className="miniButton" type="button" onClick={() => {
                      setQuery({
                        requestType: "Delivery Tracking",
                        message: `Please update me on delivery for ${order.id}.`,
                        contacts: checkout.phone,
                        anonymous: false
                      });
                      setActive("queries");
                    }}>Ask about delivery</button>
                  </article>
                )) : (
                  <article className="rowItem">
                    <strong>No orders yet</strong>
                    <span>Completed checkout orders will appear here.</span>
                  </article>
                )}
              </div>
            </article>
            <aside className="panel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Latest receipt</p>
                  <h2>{receipt?.receiptNumber || "No receipt yet"}</h2>
                </div>
              </div>
              {receipt ? (
                <div className="rowStack">
                  <div className="rowItem"><strong>Order</strong><span>{receipt.id}</span></div>
                  <div className="rowItem"><strong>Payment</strong><span>{receipt.paymentMethod}</span></div>
                  <div className="rowItem"><strong>Total</strong><span>{formatMoney(receipt.total)}</span></div>
                  <div className="rowItem"><strong>Delivery</strong><span>{receipt.delivery.town}, {receipt.delivery.district}</span></div>
                </div>
              ) : (
                <div className="rowItem">
                  <strong>Receipt pending</strong>
                  <span>Place an order to generate an invoice summary.</span>
                </div>
              )}
            </aside>
          </section>
        )}

        {active === "queries" && (
          <section className="screenGrid">
            <article className="panel wide">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Customer queries</p>
                  <h2>Questions, complaints, and delivery tracking</h2>
                </div>
              </div>
              <form className="ticketForm" onSubmit={submitQuery}>
                <select value={query.requestType} onChange={(event) => setQuery({ ...query, requestType: event.target.value })}>
                  <option>Question</option>
                  <option>Complaint</option>
                  <option>Delivery Tracking</option>
                </select>
                <input value={query.contacts} onChange={(event) => setQuery({ ...query, contacts: event.target.value })} placeholder="Contact phone or email" disabled={query.anonymous} />
                <label className="checkboxLine">
                  <input type="checkbox" checked={query.anonymous} onChange={(event) => setQuery({ ...query, anonymous: event.target.checked, contacts: event.target.checked ? "" : query.contacts })} />
                  Submit anonymously
                </label>
                <textarea value={query.message} onChange={(event) => setQuery({ ...query, message: event.target.value })} placeholder="Write your message" required />
                <button className="primaryButton" type="submit">Send query</button>
              </form>
            </article>
            <aside className="panel">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">Responses</p>
                  <h2>Admin replies</h2>
                </div>
              </div>
              <div className="rowStack">
                {tickets.length ? tickets.map((ticket) => (
                  <article className="rowItem" key={ticket.docId || ticket.id}>
                    <strong>{ticket.requestType || "Question"} - {ticket.status || "Submitted"}</strong>
                    <div className="messageBlock">
                      <strong>Customer message</strong>
                      <span>{ticket.message}</span>
                    </div>
                    <div className="messageBlock adminMessage">
                      <strong>Admin response</strong>
                      <span>{ticket.response || "Awaiting admin response"}</span>
                    </div>
                  </article>
                )) : <article className="rowItem"><strong>No queries yet</strong><span>Send a question or complaint to admin.</span></article>}
              </div>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}

function CartList({ cart, onQuantity, onRemove, compact = false }) {
  if (!cart.length) {
    return (
      <div className="rowStack">
        <article className="rowItem">
          <strong>Cart is empty</strong>
          <span>Add products before checkout.</span>
        </article>
      </div>
    );
  }

  return (
    <div className="rowStack">
      {cart.map((item) => (
        <article className="rowItem cartLine" key={`${item.sku}-${item.docId || item.name}`}>
          <div>
            <strong>{item.name}</strong>
            <span>{item.sku} - {formatMoney(item.price)} each</span>
            <span>Subtotal: {formatMoney(Number(item.price || 0) * Number(item.qty || 1))}</span>
          </div>
          {!compact && (
            <div className="cartControls">
              <button className="miniButton" type="button" onClick={() => onQuantity(item, Number(item.qty || 1) - 1)}>-</button>
              <input value={item.qty || 1} onChange={(event) => onQuantity(item, event.target.value)} aria-label={`${item.name} quantity`} />
              <button className="miniButton" type="button" onClick={() => onQuantity(item, Number(item.qty || 1) + 1)}>+</button>
              <button className="miniButton" type="button" onClick={() => onRemove(item)}>Remove</button>
            </div>
          )}
          {compact && <span>Qty {item.qty || 1}</span>}
        </article>
      ))}
    </div>
  );
}

export default App;
