import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

// જો કોઈ પણ કી ખૂટતી હોય તો કોન્સોલમાં વોર્નિંગ આપો
const missingKeys = Object.keys(config).filter(key => !config[key]);
if (missingKeys.length > 0) {
  console.error(`Firebase configuration error: Missing keys [${missingKeys.join(', ')}]. Check Vercel Environment Variables.`);
  // Firebase ને ખાલી ઓબ્જેક્ટ આપવાથી એરર આવશે, પણ આપણે તેને રોકવા માટે ડિફોલ્ટ આપીએ
  if (!config.apiKey) config.apiKey = "invalid_key_check_vercel";
}

const app = initializeApp(config);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
