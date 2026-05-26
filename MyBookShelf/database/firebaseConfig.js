import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: "G-MC7VSL0EN7"
};

let firestoreDb = null;

try {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
} catch (e) {
  console.warn('[Firebase] 초기화 실패:', e.message);
}

export { firestoreDb };
export const isFirebaseReady = () => !!firestoreDb;
