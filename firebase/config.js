export const firebaseConfig = {
  apiKey: "AIzaSyCuf-3lf2peMvJbgv3Edx5e1CQvBSEpE0A",
  authDomain: "ict-ecommerce.firebaseapp.com",
  projectId: "ict-ecommerce",
  storageBucket: "ict-ecommerce.firebasestorage.app",
  messagingSenderId: "834426104493",
  appId: "1:834426104493:web:20807eb7d6af9e1987f424",
  measurementId: "G-S2HQG1J1SD"
};

export const firebaseDatabases = {
  customer: "(default)",
  admin: "(default)"
};

export const storageFolders = {
  customer: "customer",
  admin: "admin"
};

export function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every((value) => value && !value.startsWith("PASTE_"));
}
