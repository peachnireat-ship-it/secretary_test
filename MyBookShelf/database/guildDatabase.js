import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp, increment,
} from 'firebase/firestore';
import { firestoreDb, isFirebaseReady } from './firebaseConfig';
import { getWeeklyScore, getWeeklyProgress, getWeekKey, addXp, isDoubleXpActive } from './database';

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── 길드 생성 ────────────────────────────────────────────────────

export async function createGuild({ name, isPublic, weeklyGoal, userId, displayName, school, schoolLevel, keywords }) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');

  const existingQ = query(
    collection(firestoreDb, 'guilds'),
    where('creatorId', '==', userId),
    limit(1),
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) throw new Error('길드는 1인당 1개만 생성할 수 있습니다.');

  const guildId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inviteCode = generateInviteCode();

  await setDoc(doc(firestoreDb, 'guilds', guildId), {
    name: name.trim(),
    inviteCode,
    isPublic: !!isPublic,
    creatorId: userId,
    weeklyGoal: Number(weeklyGoal) || 0,
    memberCount: 1,
    keywords: Array.isArray(keywords) ? keywords : [],
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(firestoreDb, 'guild_members', `${guildId}_${userId}`), {
    guildId,
    userId,
    displayName: displayName || '독서가',
    school: school || '',
    schoolLevel: schoolLevel || '',
    joinedAt: serverTimestamp(),
    isOwner: true,
  });

  return { guildId, inviteCode };
}

// ── 초대 코드로 가입 ─────────────────────────────────────────────

export async function joinGuildByCode(inviteCode, userId, displayName, school, schoolLevel) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');

  const q = query(
    collection(firestoreDb, 'guilds'),
    where('inviteCode', '==', inviteCode.trim().toUpperCase()),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('유효하지 않은 초대 코드입니다.');

  const guildDoc = snap.docs[0];
  const guildId = guildDoc.id;

  const memberRef = doc(firestoreDb, 'guild_members', `${guildId}_${userId}`);
  const memberSnap = await getDoc(memberRef);
  if (memberSnap.exists()) throw new Error('이미 이 길드의 멤버입니다.');

  await setDoc(memberRef, {
    guildId,
    userId,
    displayName: displayName || '독서가',
    school: school || '',
    schoolLevel: schoolLevel || '',
    joinedAt: serverTimestamp(),
    isOwner: false,
  });

  await updateDoc(doc(firestoreDb, 'guilds', guildId), {
    memberCount: increment(1),
  });

  return { guildId, guildName: guildDoc.data().name };
}

// ── 공개 길드 검색 ───────────────────────────────────────────────

export async function searchPublicGuilds(searchText) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');

  const q = query(
    collection(firestoreDb, 'guilds'),
    where('isPublic', '==', true),
    limit(30),
  );
  const snap = await getDocs(q);
  const guilds = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
  if (searchText && searchText.trim()) {
    const q = searchText.trim();
    return guilds.filter(
      (g) => g.name.includes(q) || (g.keywords || []).some((kw) => kw.includes(q)),
    );
  }
  return guilds;
}

// ── 길드 정보 조회 ───────────────────────────────────────────────

export async function getGuildInfo(guildId) {
  if (!isFirebaseReady()) return null;
  const snap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ── 멤버 목록 조회 ───────────────────────────────────────────────

export async function getGuildMembers(guildId) {
  if (!isFirebaseReady()) return [];
  const q = query(
    collection(firestoreDb, 'guild_members'),
    where('guildId', '==', guildId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

// ── 주간 점수 동기화 ─────────────────────────────────────────────

export async function syncWeeklyScore(guildId, userId, displayName) {
  if (!isFirebaseReady()) return 0;
  const weekKey = getWeekKey();
  const score = getWeeklyScore();
  const progress = getWeeklyProgress();

  const scoreRef = doc(firestoreDb, 'guild_scores', `${guildId}_${weekKey}_${userId}`);
  const prevSnap = await getDoc(scoreRef);
  const prevScore = prevSnap.exists() ? (prevSnap.data().score ?? 0) : 0;

  await setDoc(
    scoreRef,
    {
      guildId,
      weekKey,
      userId,
      displayName: displayName || '독서가',
      score,
      booksCompleted: progress.completed,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const delta = score - prevScore;
  if (delta > 0) {
    const xpGain = Math.floor(delta / 10);
    if (xpGain > 0) {
      const multiplier = isDoubleXpActive() ? 2 : 1;
      addXp(xpGain * multiplier);
    }
  }

  return score;
}

// ── 길드 멤버별 이번 주 점수 ─────────────────────────────────────

export async function getGuildWeeklyScores(guildId) {
  if (!isFirebaseReady()) return [];
  const weekKey = getWeekKey();
  const q = query(
    collection(firestoreDb, 'guild_scores'),
    where('guildId', '==', guildId),
    where('weekKey', '==', weekKey),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ── 길드 간 주간 순위 ────────────────────────────────────────────

export async function getGuildRankings() {
  if (!isFirebaseReady()) return [];
  const weekKey = getWeekKey();
  const q = query(
    collection(firestoreDb, 'guild_scores'),
    where('weekKey', '==', weekKey),
  );
  const snap = await getDocs(q);

  const guildTotals = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!guildTotals[data.guildId]) {
      guildTotals[data.guildId] = { guildId: data.guildId, totalScore: 0, memberCount: 0 };
    }
    guildTotals[data.guildId].totalScore += data.score;
    guildTotals[data.guildId].memberCount++;
  });

  const withNames = await Promise.all(
    Object.values(guildTotals).map(async (g) => {
      const info = await getGuildInfo(g.guildId);
      return { ...g, name: info?.name || '알 수 없는 길드' };
    }),
  );

  return withNames.sort((a, b) => b.totalScore - a.totalScore).slice(0, 20);
}

// ── 길드 정보 수정 ───────────────────────────────────────────────

export async function updateGuildInfo(guildId, { name, isPublic, weeklyGoal, keywords }) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await updateDoc(doc(firestoreDb, 'guilds', guildId), {
    name: name.trim(),
    isPublic: !!isPublic,
    weeklyGoal: Number(weeklyGoal) || 0,
    keywords: Array.isArray(keywords) ? keywords : [],
  });
}

// ── 길드 탈퇴 ────────────────────────────────────────────────────

export async function removeMemberFromGuild(guildId, userId) {
  if (!isFirebaseReady()) return;
  await deleteDoc(doc(firestoreDb, 'guild_members', `${guildId}_${userId}`));
  await updateDoc(doc(firestoreDb, 'guilds', guildId), {
    memberCount: increment(-1),
  });
}

// ── 사용자가 가입한 길드 목록 ─────────────────────────────────────

export async function getUserGuilds(userId) {
  if (!isFirebaseReady()) return [];
  const q = query(
    collection(firestoreDb, 'guild_members'),
    where('userId', '==', userId),
  );
  const snap = await getDocs(q);
  const guildIds = snap.docs.map((d) => d.data().guildId);
  if (guildIds.length === 0) return [];
  const guilds = await Promise.all(guildIds.map((id) => getGuildInfo(id)));
  return guilds.filter(Boolean);
}

// ── 게시판 글 목록 ────────────────────────────────────────────────

export async function getGuildPosts(guildId) {
  if (!isFirebaseReady()) return [];
  const q = query(
    collection(firestoreDb, 'guild_posts'),
    where('guildId', '==', guildId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ── 게시판 글 작성 ────────────────────────────────────────────────

export async function createGuildPost(guildId, userId, displayName, title, content) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await addDoc(collection(firestoreDb, 'guild_posts'), {
    guildId,
    userId,
    displayName,
    title: title.trim(),
    content: content.trim(),
    createdAt: serverTimestamp(),
  });
}

// ── 게시판 글 삭제 ────────────────────────────────────────────────

export async function deleteGuildPost(postId) {
  if (!isFirebaseReady()) return;
  await deleteDoc(doc(firestoreDb, 'guild_posts', postId));
}
