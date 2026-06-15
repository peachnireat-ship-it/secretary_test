// 판타지 소설 모임 길드 + 리더 계정 시드 스크립트
// 실행: node scripts/seed-fantasy-guild.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { randomUUID } from 'crypto';

const firebaseConfig = {
  apiKey: 'AIzaSyDQTR8y3nDxBpYQIVtxVVJYROLg_cR_48U',
  authDomain: 'mybookshelf-32b29.firebaseapp.com',
  projectId: 'mybookshelf-32b29',
  storageBucket: 'mybookshelf-32b29.firebasestorage.app',
  messagingSenderId: '372327629344',
  appId: '1:372327629344:web:c620c717c1e9bdef16b245',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const leaderId = randomUUID();
const guildId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const inviteCode = generateInviteCode();

console.log('=== 판타지 소설 모임 시드 ===');
console.log('리더 userId :', leaderId);
console.log('guildId     :', guildId);
console.log('초대 코드   :', inviteCode);
console.log('');

try {
  await setDoc(doc(db, 'guilds', guildId), {
    name: '판타지 소설 모임',
    inviteCode,
    isPublic: true,
    creatorId: leaderId,
    weeklyGoal: 1,
    memberCount: 1,
    keywords: ['판타지', '소설', '장르소설'],
    agePolicy: 'all',
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'guild_members', `${guildId}_${leaderId}`), {
    guildId,
    userId: leaderId,
    displayName: '판타지모임장',
    school: '',
    schoolLevel: '',
    joinedAt: serverTimestamp(),
    isOwner: true,
    isAdult: true,
  });

  console.log('✅ 길드 생성 완료');
  console.log('');
  console.log('앱에서 이 계정으로 접속하려면:');
  console.log(`  user_stats 테이블의 userId 컬럼을 "${leaderId}" 로 설정하고`);
  console.log(`  guildId 컬럼을 "${guildId}" 로 설정하세요.`);
  console.log('');
  console.log('또는 앱에서 초대 코드로 가입:');
  console.log(`  초대 코드: ${inviteCode}`);
} catch (e) {
  console.error('❌ 오류:', e.message);
}

process.exit(0);
