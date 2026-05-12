import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, FieldValue } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// JSON ફાઇલ ન મળે તો Environment Variables વાપરો (Vercel માટે)
const config: any = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ચેક કરો કે કઈ કી ખૂટે છે
const missingKeys = Object.entries(config)
  .filter(([_, value]) => !value || value === "missing" || value === "undefined")
  .map(([key]) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}`);

if (missingKeys.length > 0) {
  console.error("CRITICAL: Firebase configuration is missing for:", missingKeys.join(", "));
}

const app = initializeApp(config);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export { FieldValue };
