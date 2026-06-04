import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  firebaseConfig,
  firebaseDatabases,
  hasFirebaseConfig
} from "../firebase/config.js";

export const firebaseReady = hasFirebaseConfig();

const app = firebaseReady ? initializeApp(firebaseConfig) : null;

export const adminDb = app ? getFirestore(app, firebaseDatabases.admin) : null;
export const customerDb = app ? getFirestore(app, firebaseDatabases.customer) : null;
