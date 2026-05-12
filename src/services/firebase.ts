import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

type FirebaseRuntimeConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const runtimeConfig = window.__SEZ_FIREBASE_CONFIG__ ?? {};

const config: FirebaseRuntimeConfig = {
  apiKey: runtimeConfig.apiKey?.trim() || import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: runtimeConfig.authDomain?.trim() || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: runtimeConfig.projectId?.trim() || import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: runtimeConfig.storageBucket?.trim() || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: runtimeConfig.messagingSenderId?.trim() || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: runtimeConfig.appId?.trim() || import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};

const missingKeys = Object.entries(config).filter(([_, value]) => !value || value === 'undefined');

export const isFirebaseConfigured = missingKeys.length === 0;
export const firebaseConfigError = isFirebaseConfigured
  ? ''
  : `Firebase config missing: ${missingKeys.map(([key]) => key).join(', ')}. Update public/runtime-config.js or set VITE_FIREBASE_* variables, then redeploy.`;

if (!isFirebaseConfigured) {
  console.warn(firebaseConfigError);
}

const app = initializeApp({
  apiKey: config.apiKey || 'invalid_key',
  authDomain: config.authDomain || 'missing',
  projectId: config.projectId || 'missing',
  storageBucket: config.storageBucket || 'missing',
  messagingSenderId: config.messagingSenderId || 'missing',
  appId: config.appId || 'missing',
});

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
