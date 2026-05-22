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
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
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
