import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────
// Firebase 설정 방법:
// 1. https://console.firebase.google.com 에서 새 프로젝트 생성
// 2. Firestore Database 활성화 (테스트 모드로 시작)
// 3. 프로젝트 설정 > 일반 > 앱 추가(웹 또는 Android) > firebaseConfig 복사
// 4. 아래 YOUR_... 값을 실제 값으로 교체
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: '***FIREBASE_API_KEY_REMOVED***',
  authDomain: 'mybookshelf-32b29.firebaseapp.com',
  projectId: 'mybookshelf-32b29',
  storageBucket: 'mybookshelf-32b29.firebasestorage.app',
  messagingSenderId: '372327629344',
  appId: '1:372327629344:web:c620c717c1e9bdef16b245',
};

let firestoreDb = null;

try {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
} catch (e) {
  console.warn('[Firebase] 초기화 실패:', e.message);
}

export { firestoreDb };
export const isFirebaseReady = () => !!firestoreDb && firebaseConfig.apiKey !== 'YOUR_API_KEY';
