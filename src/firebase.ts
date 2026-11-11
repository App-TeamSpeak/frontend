import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const providedConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfig = Object.values(providedConfig).every(Boolean) ? providedConfig : {
  ...providedConfig,
  apiKey: 'local-test-api-key',
  authDomain: 'local-test.firebaseapp.com',
  projectId: 'local-test-project',
  storageBucket: 'local-test.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:localtest',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);

export function assertFirebaseConfiguration() {
  const missing = Object.entries(providedConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Faltan variables públicas de Firebase: ${missing.join(', ')}`);
  }
}
