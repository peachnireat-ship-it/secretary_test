import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp, increment,
} from 'firebase/firestore';
import { firestoreDb, isFirebaseReady } from './firebaseConfig';
import { getWeeklyScore, getWeeklyProgress, getWeekKey, addXp, isDoubleXpActive, getAge } from './database';

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── 길드 생성 ────────────────────────────────────────────────────

export async function createGuild({ name, isPublic, weeklyGoal, userId, displayName, school, schoolLevel, keywords, agePolicy }) {
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
    agePolicy: agePolicy || 'all',
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
    isAdult: getAge() >= 19,
  });

  return { guildId, inviteCode };
}

// ── 초대 코드로 가입 신청 ─────────────────────────────────────────

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
  const guildData = guildDoc.data();

  const userAge = getAge();
  const userIsAdult = userAge >= 19;
  const agePolicy = guildData.agePolicy || 'all';

  if (agePolicy !== 'all' && userAge === 0) {
    throw new Error('이 길드는 연령 제한이 있습니다.\n프로필에서 나이를 먼저 설정해주세요.');
  }
  if (agePolicy === 'adult' && !userIsAdult) {
    throw new Error('이 길드는 성인(19세 이상)만 가입할 수 있습니다.');
  }
  if (agePolicy === 'minor' && userIsAdult) {
    throw new Error('이 길드는 미성년자(18세 이하)만 가입할 수 있습니다.');
  }

  const memberRef = doc(firestoreDb, 'guild_members', `${guildId}_${userId}`);
  const memberSnap = await getDoc(memberRef);
  if (memberSnap.exists()) throw new Error('이미 이 길드의 멤버입니다.');

  const requestRef = doc(firestoreDb, 'guild_join_requests', `${guildId}_${userId}`);
  const requestSnap = await getDoc(requestRef);
  if (requestSnap.exists()) throw new Error('이미 가입 신청 중입니다. 운영자 승인을 기다려주세요.');

  await setDoc(requestRef, {
    guildId,
    userId,
    displayName: displayName || '독서가',
    school: school || '',
    schoolLevel: schoolLevel || '',
    isAdult: getAge() >= 19,
    requestedAt: serverTimestamp(),
    status: 'pending',
  });

  return { guildId, guildName: guildData.name };
}

// ── 가입 신청 목록 조회 ────────────────────────────────────────────

export async function getGuildJoinRequests(guildId) {
  if (!isFirebaseReady()) return [];
  const q = query(
    collection(firestoreDb, 'guild_join_requests'),
    where('guildId', '==', guildId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.status === 'pending')
    .sort((a, b) => (a.requestedAt?.seconds || 0) - (b.requestedAt?.seconds || 0));
}

// ── 가입 신청 승인 ────────────────────────────────────────────────

export async function approveJoinRequest(guildId, userId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');

  const requestRef = doc(firestoreDb, 'guild_join_requests', `${guildId}_${userId}`);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) throw new Error('가입 신청을 찾을 수 없습니다.');
  const requestData = requestSnap.data();

  const memberRef = doc(firestoreDb, 'guild_members', `${guildId}_${userId}`);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) {
    await setDoc(memberRef, {
      guildId,
      userId,
      displayName: requestData.displayName || '독서가',
      school: requestData.school || '',
      schoolLevel: requestData.schoolLevel || '',
      joinedAt: serverTimestamp(),
      isOwner: false,
      isAdult: requestData.isAdult,
    });
    await updateDoc(doc(firestoreDb, 'guilds', guildId), {
      memberCount: increment(1),
    });
  }

  await deleteDoc(requestRef);
}

// ── 가입 신청 거절 ────────────────────────────────────────────────

export async function rejectJoinRequest(guildId, userId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await deleteDoc(doc(firestoreDb, 'guild_join_requests', `${guildId}_${userId}`));
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

  try {
    const memberRef = doc(firestoreDb, 'guild_members', `${guildId}_${userId}`);
    await updateDoc(memberRef, { isAdult: getAge() >= 19 });
  } catch (_) {}

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

export async function updateGuildInfo(guildId, { name, isPublic, weeklyGoal, keywords, agePolicy }) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await updateDoc(doc(firestoreDb, 'guilds', guildId), {
    name: name.trim(),
    isPublic: !!isPublic,
    weeklyGoal: Number(weeklyGoal) || 0,
    keywords: Array.isArray(keywords) ? keywords : [],
    agePolicy: agePolicy || 'all',
  });
}

// ── 길드 탈퇴 ────────────────────────────────────────────────────

export async function removeMemberFromGuild(guildId, userId) {
  if (!isFirebaseReady()) return;

  const guildSnap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  if (guildSnap.exists() && guildSnap.data().creatorId === userId) {
    throw new Error('길드 운영자는 탈퇴할 수 없습니다.\n길드를 폐쇄하거나 운영자를 양도해주세요.');
  }

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

export async function createGuildPost(guildId, userId, displayName, title, content, isNotice = false) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await addDoc(collection(firestoreDb, 'guild_posts'), {
    guildId,
    userId,
    displayName,
    title: title.trim(),
    content: content.trim(),
    isNotice: !!isNotice,
    createdAt: serverTimestamp(),
  });
}

// ── 미확인 공지 조회 ──────────────────────────────────────────────

export async function getUnreadGuildNotices(guildId, userId) {
  if (!isFirebaseReady()) return [];
  const q = query(
    collection(firestoreDb, 'guild_posts'),
    where('guildId', '==', guildId),
    where('isNotice', '==', true),
  );
  const snap = await getDocs(q);
  const notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (notices.length === 0) return [];

  const readChecks = await Promise.all(
    notices.map((n) =>
      getDoc(doc(firestoreDb, 'guild_notice_reads', `${guildId}_${n.id}_${userId}`))
        .then((s) => ({ id: n.id, isRead: s.exists() }))
    )
  );
  const readIds = new Set(readChecks.filter((r) => r.isRead).map((r) => r.id));
  return notices
    .filter((n) => !readIds.has(n.id))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ── 공지 읽음 처리 ────────────────────────────────────────────────

export async function markNoticeRead(guildId, postId, userId) {
  if (!isFirebaseReady()) return;
  await setDoc(doc(firestoreDb, 'guild_notice_reads', `${guildId}_${postId}_${userId}`), {
    guildId,
    postId,
    userId,
    readAt: serverTimestamp(),
  });
}

// ── 게시판 글 삭제 ────────────────────────────────────────────────

export async function deleteGuildPost(postId) {
  if (!isFirebaseReady()) return;
  await deleteDoc(doc(firestoreDb, 'guild_posts', postId));
}

// ── 게시판 글 신고 ────────────────────────────────────────────────

export async function reportGuildPost(postId, guildId, reporterId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  const reportRef = doc(firestoreDb, 'guild_post_reports', `${postId}_${reporterId}`);
  const existing = await getDoc(reportRef);
  if (existing.exists()) throw new Error('이미 신고한 게시글입니다.');
  await setDoc(reportRef, {
    postId,
    guildId,
    reporterId,
    createdAt: serverTimestamp(),
  });
}

// ── 게시판 신고 목록 조회 (앱 운영자용) ──────────────────────────────

export async function getGuildPostReports() {
  if (!isFirebaseReady()) return [];
  const snap = await getDocs(collection(firestoreDb, 'guild_post_reports'));
  const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const grouped = {};
  reports.forEach((r) => {
    if (!grouped[r.postId]) {
      grouped[r.postId] = { postId: r.postId, guildId: r.guildId, reportCount: 0, reporters: [] };
    }
    grouped[r.postId].reportCount++;
    grouped[r.postId].reporters.push({ reporterId: r.reporterId, createdAt: r.createdAt });
  });

  await Promise.all(
    Object.keys(grouped).map(async (postId) => {
      try {
        const postSnap = await getDoc(doc(firestoreDb, 'guild_posts', postId));
        if (postSnap.exists()) {
          const data = postSnap.data();
          grouped[postId].title = data.title;
          grouped[postId].content = data.content;
          grouped[postId].authorId = data.userId;
          grouped[postId].authorName = data.displayName;
          grouped[postId].postCreatedAt = data.createdAt;
        } else {
          grouped[postId].deleted = true;
        }
      } catch (_) {}
    }),
  );

  return Object.values(grouped).sort(
    (a, b) =>
      (b.reporters[0]?.createdAt?.seconds || 0) - (a.reporters[0]?.createdAt?.seconds || 0),
  );
}

export async function dismissGuildPostReports(postId) {
  if (!isFirebaseReady()) return;
  const q = query(collection(firestoreDb, 'guild_post_reports'), where('postId', '==', postId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function deleteGuildPostAndReports(postId) {
  if (!isFirebaseReady()) return;
  await deleteDoc(doc(firestoreDb, 'guild_posts', postId));
  const q = query(collection(firestoreDb, 'guild_post_reports'), where('postId', '==', postId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// ── 테마 미션 제출·승인 ───────────────────────────────────────────

export async function submitThemeMission(guildId, userId, displayName, missionId, missionLabel, missionXp, weekKey) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  const docId = `${guildId}_${weekKey}_${userId}_${missionId}`;
  await setDoc(doc(firestoreDb, 'guild_theme_missions', docId), {
    guildId,
    weekKey,
    userId,
    displayName: displayName || '독서가',
    missionId,
    missionLabel,
    missionXp,
    status: 'pending',
    submittedAt: serverTimestamp(),
  });
}

export async function getUserThemeMissionStatus(guildId, userId, weekKey, missionIds) {
  if (!isFirebaseReady()) return {};
  const statuses = {};
  await Promise.all(
    missionIds.map(async (missionId) => {
      const docId = `${guildId}_${weekKey}_${userId}_${missionId}`;
      const snap = await getDoc(doc(firestoreDb, 'guild_theme_missions', docId));
      if (snap.exists()) statuses[missionId] = snap.data().status;
    })
  );
  return statuses;
}

export async function getGuildThemeMissionSubmissions(guildId, weekKey) {
  if (!isFirebaseReady()) return [];
  const q = query(
    collection(firestoreDb, 'guild_theme_missions'),
    where('guildId', '==', guildId),
    where('weekKey', '==', weekKey),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
}

export async function reviewThemeMission(docId, status) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await updateDoc(doc(firestoreDb, 'guild_theme_missions', docId), {
    status,
    reviewedAt: serverTimestamp(),
  });
}

// ── 길드 함께 읽기 ────────────────────────────────────────────────

export async function isGuildAllAdult(guildId) {
  const members = await getGuildMembers(guildId);
  if (members.length === 0) return false;
  return members.every((m) => m.isAdult === true);
}

export async function setGuildReading(guildId, { bookTitle, bookAuthor, isAdult, startDate, endDate }, userId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  const guildSnap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  const agePolicy = guildSnap.exists() ? (guildSnap.data().agePolicy || 'all') : 'all';
  if (isAdult) {
    if (agePolicy === 'minor') throw new Error('미성년자 전용 길드에서는 성인 도서를 선정할 수 없습니다.');
    const allAdult = await isGuildAllAdult(guildId);
    if (!allAdult) throw new Error('성인 도서는 모든 멤버가 성인(19세 이상)인 길드에서만 선정할 수 있습니다.');
  }
  await setDoc(doc(firestoreDb, 'guild_reading', guildId), {
    guildId,
    bookTitle: bookTitle.trim(),
    bookAuthor: (bookAuthor || '').trim(),
    isAdult: !!isAdult,
    startDate,
    endDate,
    createdBy: userId,
    createdAt: serverTimestamp(),
    status: 'active',
  });
}

export async function getGuildReading(guildId) {
  if (!isFirebaseReady()) return null;
  const snap = await getDoc(doc(firestoreDb, 'guild_reading', guildId));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function endGuildReading(guildId) {
  if (!isFirebaseReady()) return;
  await updateDoc(doc(firestoreDb, 'guild_reading', guildId), {
    status: 'ended',
  });
}

// ── 길드 폐쇄 ────────────────────────────────────────────────────

export async function dissolveGuild(guildId, userId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');

  const guildSnap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  if (!guildSnap.exists()) throw new Error('길드를 찾을 수 없습니다.');
  if (guildSnap.data().creatorId !== userId) throw new Error('길드 운영자만 폐쇄할 수 있습니다.');

  const relatedQueries = [
    query(collection(firestoreDb, 'guild_members'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_scores'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_posts'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_theme_missions'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_join_requests'), where('guildId', '==', guildId)),
  ];

  await Promise.all(
    relatedQueries.map(async (q) => {
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    })
  );

  await deleteDoc(doc(firestoreDb, 'guild_reading', guildId));
  await deleteDoc(doc(firestoreDb, 'guilds', guildId));
}

// ── 운영자 권한 위임 ─────────────────────────────────────────────

export async function delegateAuthority(guildId, ownerId, deputyUserId, expiresAt) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  const guildSnap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  if (!guildSnap.exists()) throw new Error('길드를 찾을 수 없습니다.');
  if (guildSnap.data().creatorId !== ownerId) throw new Error('운영자만 권한을 위임할 수 있습니다.');
  const memberSnap = await getDoc(doc(firestoreDb, 'guild_members', `${guildId}_${deputyUserId}`));
  if (!memberSnap.exists() || !memberSnap.data().isDeputy) throw new Error('부운영자에게만 권한을 위임할 수 있습니다.');
  await updateDoc(doc(firestoreDb, 'guilds', guildId), {
    delegatedTo: deputyUserId,
    delegationExpiresAt: expiresAt,
  });
}

export async function revokeDelegation(guildId, ownerId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  const guildSnap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  if (!guildSnap.exists()) throw new Error('길드를 찾을 수 없습니다.');
  if (guildSnap.data().creatorId !== ownerId) throw new Error('운영자만 위임을 회수할 수 있습니다.');
  await updateDoc(doc(firestoreDb, 'guilds', guildId), {
    delegatedTo: null,
    delegationExpiresAt: null,
  });
}

// ── 부운영자 임명 / 해제 ──────────────────────────────────────────

export async function appointDeputy(guildId, userId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await updateDoc(doc(firestoreDb, 'guild_members', `${guildId}_${userId}`), { isDeputy: true });
}

export async function revokeDeputy(guildId, userId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  await updateDoc(doc(firestoreDb, 'guild_members', `${guildId}_${userId}`), { isDeputy: false });
}

// ── 앱 운영자 전용 ────────────────────────────────────────────────

const ADMIN_USER_ID = 'nireat';

export async function getAllGuilds() {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  const snap = await getDocs(collection(firestoreDb, 'guilds'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function forceDissolveGuild(guildId, requesterId) {
  if (!isFirebaseReady()) throw new Error('Firebase가 설정되지 않았습니다.');
  if (requesterId !== ADMIN_USER_ID) throw new Error('앱 운영자만 강제 폐쇄할 수 있습니다.');

  const guildSnap = await getDoc(doc(firestoreDb, 'guilds', guildId));
  if (!guildSnap.exists()) throw new Error('길드를 찾을 수 없습니다.');

  const relatedQueries = [
    query(collection(firestoreDb, 'guild_members'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_scores'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_posts'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_theme_missions'), where('guildId', '==', guildId)),
    query(collection(firestoreDb, 'guild_join_requests'), where('guildId', '==', guildId)),
  ];

  await Promise.all(
    relatedQueries.map(async (q) => {
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    })
  );

  await deleteDoc(doc(firestoreDb, 'guild_reading', guildId));
  await deleteDoc(doc(firestoreDb, 'guilds', guildId));
}
