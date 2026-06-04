import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import "./styles.css";
import workbench from "./assets/workbench.svg";
import { customerDb, firebaseReady } from "./firebase.js";

const ACCOUNTS_KEY = "ict-customer-accounts";
const SESSION_KEY = "ict-customer-session";

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function customerId(details) {
  return `customer-${details.email.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

async function recordCustomerProfile(details, id) {
  if (!firebaseReady) return;
  await setDoc(doc(customerDb, "customerProfiles", id), {
    id,
    firstName: details.firstName,
    secondName: details.secondName,
    name: `${details.firstName} ${details.secondName}`,
    email: details.email,
    accountType: "Retail Customer",
    source: "web-app",
    role: "customer",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function validate(details) {
  if (!details.firstName || !details.secondName || !details.email || !details.password) {
    return "All fields are required.";
  }
  if (!/^[a-z0-9 -]{1,30}$/i.test(details.firstName) || !/^[a-z0-9 -]{1,30}$/i.test(details.secondName)) {
    return "Names must use letters, numbers, spaces, or hyphens and be 30 characters or fewer.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
    return "Enter a valid email address.";
  }
  if (details.password.length < 6 || !/\d/.test(details.password) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(details.password)) {
    return "Password must be at least 6 characters with at least 1 number and 1 special character.";
  }
  return "";
}

function CustomerLogin() {
  const [mode, setMode] = useState(readAccounts().length ? "login" : "register");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");

  function formDetails(event) {
    const data = new FormData(event.currentTarget);
    return {
      firstName: String(data.get("firstName") || "").trim(),
      secondName: String(data.get("secondName") || "").trim(),
      email: String(data.get("email") || "").trim().toLowerCase(),
      password: String(data.get("password") || "")
    };
  }

  function showNotice(type, message) {
    setNoticeType(type);
    setNotice(message);
  }

  async function register(event) {
    event.preventDefault();
    const details = formDetails(event);
    const error = validate(details);
    const accounts = readAccounts();

    if (error) {
      showNotice("error", `Registration unsuccessful: ${error}`);
      return;
    }

    if (accounts.some((account) => account.email === details.email)) {
      showNotice("error", "Registration unsuccessful: this email is already registered.");
      return;
    }

    const id = customerId(details);

    try {
      await recordCustomerProfile(details, id);
    } catch (profileError) {
      console.error(profileError);
      saveAccounts([...accounts, { ...details, id }]);
      event.currentTarget.reset();
      showNotice("success", "Registration successful locally. Firebase customerProfiles could not be updated right now.");
      setMode("login");
      return;
    }

    saveAccounts([...accounts, { ...details, id }]);
    event.currentTarget.reset();
    showNotice("success", "Registration successful: customer recorded in Firebase. Please log in.");
    setMode("login");
  }

  function login(event) {
    event.preventDefault();
    const details = formDetails(event);
    const error = validate(details);

    if (error) {
      showNotice("error", `Login unsuccessful: ${error}`);
      event.currentTarget.reset();
      return;
    }

    const account = readAccounts().find((item) =>
      item.firstName.toLowerCase() === details.firstName.toLowerCase()
      && item.secondName.toLowerCase() === details.secondName.toLowerCase()
      && item.email === details.email
      && item.password === details.password
    );

    if (!account) {
      showNotice("error", "Login unsuccessful: the four login attributes do not match a registered customer.");
      event.currentTarget.reset();
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: account.id,
      firstName: account.firstName,
      secondName: account.secondName,
      email: account.email
    }));
    window.location.href = "index.html";
  }

  function switchMode(nextMode) {
    document.querySelector(".loginForm")?.reset();
    setMode(nextMode);
    setNotice("");
  }

  const isLogin = mode === "login";

  return (
    <main className="loginPage">
      <section className="loginPanel">
        <div className="brandLockup">
          <span className="brandMark">IC</span>
          <div>
            <p className="eyebrow">Customer route</p>
            <h1>Client Portal</h1>
          </div>
        </div>
        {notice && <div className={`authNotice ${noticeType}`}>{notice}</div>}
        <form key={mode} className="loginForm" onSubmit={isLogin ? login : register}>
          <div>
            <p className="eyebrow">{isLogin ? "Customer login" : "Create customer"}</p>
            <h2>{isLogin ? "Enter registered details" : "Register before checkout"}</h2>
          </div>
          <label>
            First Name
            <input name="firstName" autoComplete="given-name" required />
          </label>
          <label>
            Second Name
            <input name="secondName" autoComplete="family-name" required />
          </label>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required />
          </label>
          <button className="primaryButton" type="submit">
            <Icon name="login" />
            {isLogin ? "Enter customer portal" : "Register customer"}
          </button>
          <button className="ghostButton" type="button" onClick={() => switchMode(isLogin ? "register" : "login")}>
            {isLogin ? "Create account" : "Already have account, login"}
          </button>
        </form>
      </section>
      <aside className="loginVisual">
        <img src={workbench} alt="Customer portal preview" />
      </aside>
    </main>
  );
}

function Icon({ name }) {
  const paths = {
    login: <path d="M7 6h7l4 6-4 6H7v-3h5l2-3-2-3H7V6Zm-4 5h7v2H3v-2Z" />
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

createRoot(document.getElementById("root")).render(<CustomerLogin />);
