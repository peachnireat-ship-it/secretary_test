import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "***FIREBASE_API_KEY_REMOVED***",
  authDomain: "mybookshelf-32b29.firebaseapp.com",
  databaseURL: "https://mybookshelf-32b29-default-rtdb.firebaseio.com",
  projectId: "mybookshelf-32b29",
  storageBucket: "mybookshelf-32b29.firebasestorage.app",
  messagingSenderId: "372327629344",
  appId: "1:372327629344:web:c620c717c1e9bdef16b245",
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
