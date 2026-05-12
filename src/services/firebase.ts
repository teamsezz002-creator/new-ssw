import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};

// કઈ કી ખૂટે છે તે ચેક કરો
const missingKeys = Object.entries(config).filter(([_, value]) => !value || value === "undefined");

if (missingKeys.length > 0) {
  console.warn("Firebase configuration is missing for:", missingKeys.map(([key]) => key).join(", "));
}

// જો કી ન હોય તો નકલી કી થી એપ શરુ કરો જેથી લાઈટ વર્ઝન એરર ન આપે, 
// પણ લોગીન વખતે એરર આવશે જે સમજવામાં સરળ રહેશે.
const app = initializeApp({
  apiKey: config.apiKey || "invalid_key",
  authDomain: config.authDomain || "missing",
  projectId: config.projectId || "missing",
  storageBucket: config.storageBucket || "missing",
  messagingSenderId: config.messagingSenderId || "missing",
  appId: config.appId || "missing",
});

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
