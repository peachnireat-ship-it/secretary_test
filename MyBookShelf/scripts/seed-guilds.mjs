import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, setDoc, serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDQTR8y3nDxBpYQIVtxVVJYROLg_cR_48U",
  authDomain: "mybookshelf-32b29.firebaseapp.com",
  databaseURL: "https://mybookshelf-32b29-default-rtdb.firebaseio.com",
  projectId: "mybookshelf-32b29",
  storageBucket: "mybookshelf-32b29.firebasestorage.app",
  messagingSenderId: "372327629344",
  appId: "1:372327629344:web:c620c717c1e9bdef16b245",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function randomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const TEST_GUILDS = [
  { name: '책벌레 독서단',     weeklyGoal: 3 },
  { name: '새벽 독서 클럽',    weeklyGoal: 5 },
  { name: '하루 한 챕터',      weeklyGoal: 7 },
  { name: '고전문학 탐구반',   weeklyGoal: 2 },
  { name: '판타지 소설 모임',  weeklyGoal: 4 },
  { name: '과학책 읽기 모임',  weeklyGoal: 3 },
  { name: '역사책 동호회',     weeklyGoal: 4 },
  { name: '자기계발 독서단',   weeklyGoal: 5 },
  { name: '만화책 클럽',       weeklyGoal: 10 },
  { name: '에세이 읽기 모임',  weeklyGoal: 6 },
  { name: '추리소설 탐정단',   weeklyGoal: 4 },
  { name: '철학 독서 모임',    weeklyGoal: 2 },
  { name: '경제경영 스터디',   weeklyGoal: 3 },
  { name: '시와 산문 읽기',    weeklyGoal: 5 },
  { name: '세계문학 여행단',   weeklyGoal: 3 },
  { name: '청소년 독서클럽',   weeklyGoal: 6 },
  { name: 'SF 소설 팬클럽',    weeklyGoal: 4 },
  { name: '심리학 탐구반',     weeklyGoal: 3 },
  { name: '언어학 독서 모임',  weeklyGoal: 2 },
  { name: '그림책 사랑방',     weeklyGoal: 8 },
];

const SEED_USER_ID = 'seed_test_user';
const SEED_DISPLAY_NAME = '테스트 운영자';

async function seedGuilds() {
  let success = 0;
  for (const g of TEST_GUILDS) {
    const guildId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const inviteCode = randomCode();

    try {
      await setDoc(doc(db, 'guilds', guildId), {
        name: g.name,
        inviteCode,
        isPublic: true,
        creatorId: SEED_USER_ID,
        weeklyGoal: g.weeklyGoal,
        memberCount: 1,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'guild_members', `${guildId}_${SEED_USER_ID}`), {
        guildId,
        userId: SEED_USER_ID,
        displayName: SEED_DISPLAY_NAME,
        school: '',
        schoolLevel: '',
        joinedAt: serverTimestamp(),
        isOwner: true,
      });

      success++;
      console.log(`[${success}/${TEST_GUILDS.length}] 생성 완료: "${g.name}" (초대코드: ${inviteCode})`);

      // Firestore 쓰기 속도 제한 방지
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`실패: "${g.name}" —`, e.message);
    }
  }

  console.log(`\n총 ${success}개 공개 길드 생성 완료.`);
  process.exit(0);
}

seedGuilds();
