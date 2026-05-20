import * as SQLite from 'expo-sqlite';
import { emitXpGain } from './xpEvents';

const db = SQLite.openDatabaseSync('mybookshelf.db');

db.execSync(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    totalPages INTEGER DEFAULT 0,
    currentPage INTEGER DEFAULT 0,
    status TEXT DEFAULT 'want_to_read',
    rating REAL DEFAULT 0,
    review TEXT DEFAULT '',
    startDate INTEGER,
    endDate INTEGER,
    goalDate INTEGER,
    createdAt INTEGER,
    bookType TEXT DEFAULT 'physical',
    progressPct INTEGER DEFAULT 0
  );
`);

try {
  db.execSync(`ALTER TABLE books ADD COLUMN bookType TEXT DEFAULT 'physical'`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN goalDate INTEGER`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN checkins TEXT DEFAULT '[]'`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN progressPct INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN genre TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN updatedAt INTEGER`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN goalSetAt INTEGER`);
} catch (_) {}

db.execSync(`
  CREATE TABLE IF NOT EXISTS book_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookId INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'memo',
    createdAt INTEGER
  );
`);

db.execSync(`
  CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY DEFAULT 1,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    username TEXT DEFAULT ''
  );
`);
db.execSync(`INSERT OR IGNORE INTO user_stats (id, xp, level) VALUES (1, 0, 1)`);
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN username TEXT DEFAULT ''`);
} catch (_) {}

db.execSync(`
  CREATE TABLE IF NOT EXISTS completed_missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    missionId TEXT NOT NULL,
    weekKey TEXT NOT NULL,
    UNIQUE(missionId, weekKey)
  );
`);

db.execSync(`
  CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    badgeId TEXT NOT NULL UNIQUE,
    unlockedAt INTEGER NOT NULL
  );
`);
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN lastReadDay INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN todayPages INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN readStreak INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN todayPagesXpGiven INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN school TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN schoolLevel TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN age INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE completed_missions ADD COLUMN xp INTEGER DEFAULT 0`);
} catch (_) {}

db.execSync(`
  CREATE TABLE IF NOT EXISTS user_prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getPref(key, defaultValue = null) {
  const row = db.getFirstSync('SELECT value FROM user_prefs WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

export function setPref(key, value) {
  db.runSync(
    'INSERT OR REPLACE INTO user_prefs (key, value) VALUES (?, ?)',
    [key, String(value)],
  );
}

export function getWeekKey() {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// 이번 주 XP 2배 이벤트 일정 (주차 seed 기반 결정론적 랜덤)
export function getWeeklyDoubleXpEvent() {
  const key = getWeekKey();
  const seed = parseInt(key.replace(/\D/g, ''), 10);

  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  let s = seed;
  const rand = () => { s = ((s * 1664525) + 1013904223) & 0x7fffffff; return s; };

  const eventDay = rand() % 7;         // 0(월) ~ 6(일)
  const eventHour = 8 + (rand() % 13); // 8시 ~ 20시 (2시간 구간이므로 최대 22시)

  const eventDate = new Date(monday);
  eventDate.setDate(monday.getDate() + eventDay);
  eventDate.setHours(eventHour, 0, 0, 0);

  const startTs = eventDate.getTime();
  return { startTs, endTs: startTs + 2 * 60 * 60 * 1000 };
}

export function isDoubleXpActive() {
  const { startTs, endTs } = getWeeklyDoubleXpEvent();
  const now = Date.now();
  return now >= startTs && now <= endTs;
}

// XP 보상 상수
export const XP_REWARDS = {
  BOOK_COMPLETE: 100,       // 완독 1권
  DAILY_PAGES_100: 30,      // 하루 독서 합산 100페이지 달성
  DAILY_STREAK: 10,         // 연속 독서 (1일당)
  CHALLENGE_SUCCESS: 150,   // 챌린지 성공
  MEMO_ADD: 10,             // 독서 메모 1개 추가
  BOOK_REVIEW: 50,          // 완독 도서 리뷰 최초 등록
};

// 레벨 N → N+1 진급에 필요한 XP: 80 × N^1.5
function xpRequiredForLevel(level) {
  return Math.round(80 * Math.pow(level, 1.5));
}

// 레벨 N에 도달하기까지 필요한 누적 XP (레벨 1 = 0)
function xpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpRequiredForLevel(i);
  return total;
}

// 누적 XP로부터 현재 레벨 계산
function calcLevel(xp) {
  let lv = 1;
  while (xpForLevel(lv + 1) <= xp) lv++;
  return lv;
}

export const getUserStats = () => {
  const row = db.getFirstSync('SELECT xp FROM user_stats WHERE id = 1');
  const xp = row?.xp ?? 0;
  const level = calcLevel(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    xp,
    level,
    xpInLevel: xp - currentLevelXp,
    xpForNext: nextLevelXp - currentLevelXp,
  };
};

export const addXp = (amount) => {
  db.runSync('UPDATE user_stats SET xp = MAX(0, xp + ?) WHERE id = 1', [amount]);
  const row = db.getFirstSync('SELECT xp FROM user_stats WHERE id = 1');
  const newLevel = calcLevel(row?.xp ?? 0);
  db.runSync('UPDATE user_stats SET level = ? WHERE id = 1', [newLevel]);
  if (amount > 0) emitXpGain(amount);
  return getUserStats();
};

const STATUS_ORDER = "CASE status WHEN 'want_to_read' THEN 1 WHEN 'reading' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END";

export const getAllBooks = () =>
  db.getAllSync(`SELECT * FROM books ORDER BY ${STATUS_ORDER}, createdAt DESC`);

export const getBooksByStatus = (status) =>
  db.getAllSync(`SELECT * FROM books WHERE status = ? ORDER BY ${STATUS_ORDER}, createdAt DESC`, [status]);

export const getFiveStarBooks = () =>
  db.getAllSync('SELECT * FROM books WHERE rating = 5 ORDER BY endDate DESC, createdAt DESC');

export const getBookById = (id) =>
  db.getFirstSync('SELECT * FROM books WHERE id = ?', [id]);

export const insertBook = (book) => {
  const now = Date.now();
  db.runSync(
    `INSERT INTO books (title, author, totalPages, currentPage, status, rating, review, startDate, endDate, createdAt, bookType, genre)
     VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      book.title,
      book.author || '',
      book.totalPages || 0,
      book.status || 'want_to_read',
      book.review || '',
      book.status === 'reading' ? now : null,
      book.status === 'completed' ? now : null,
      now,
      book.bookType || 'physical',
      book.genre || '',
    ]
  );
};

export const updateBook = (book) => {
  const now = Date.now();
  const current = db.getFirstSync('SELECT goalDate, goalSetAt FROM books WHERE id = ?', [book.id]);
  const newGoalSetAt = (book.goalDate && book.goalDate !== current?.goalDate)
    ? now
    : (current?.goalSetAt || null);
  db.runSync(
    `UPDATE books SET title = ?, author = ?, totalPages = ?, currentPage = ?,
     status = ?, rating = ?, review = ?, startDate = ?, endDate = ?, goalDate = ?,
     bookType = ?, progressPct = ?, genre = ?, updatedAt = ?, goalSetAt = ? WHERE id = ?`,
    [
      book.title,
      book.author || '',
      book.totalPages || 0,
      book.currentPage || 0,
      book.status,
      book.rating || 0,
      book.review || '',
      book.startDate || null,
      book.endDate || null,
      book.goalDate || null,
      book.bookType || 'physical',
      book.progressPct || 0,
      book.genre || '',
      now,
      newGoalSetAt,
      book.id,
    ]
  );
};

export const deleteBook = (id) =>
  db.runSync('DELETE FROM books WHERE id = ?', [id]);

export const trackDailyReading = (pagesRead = 0) => {
  const multiplier = isDoubleXpActive() ? 2 : 1;
  const todayTs = new Date().setHours(0, 0, 0, 0);
  const yesterdayTs = todayTs - 86400000;
  const row = db.getFirstSync(
    'SELECT lastReadDay, todayPages, readStreak, todayPagesXpGiven FROM user_stats WHERE id = 1'
  );
  const lastReadDay = row?.lastReadDay ?? 0;
  let streak = row?.readStreak ?? 0;
  let todayPages = lastReadDay === todayTs ? (row?.todayPages ?? 0) : 0;
  let todayPagesXpGiven = lastReadDay === todayTs ? (row?.todayPagesXpGiven ?? 0) : 0;

  if (lastReadDay !== todayTs) {
    streak = lastReadDay === yesterdayTs ? streak + 1 : 1;
    addXp(XP_REWARDS.DAILY_STREAK * multiplier);
  }

  const newPages = todayPages + pagesRead;
  if (!todayPagesXpGiven && newPages >= 100) {
    addXp(XP_REWARDS.DAILY_PAGES_100 * multiplier);
    todayPagesXpGiven = 1;
  }

  db.runSync(
    'UPDATE user_stats SET lastReadDay = ?, todayPages = ?, readStreak = ?, todayPagesXpGiven = ? WHERE id = 1',
    [todayTs, newPages, streak, todayPagesXpGiven]
  );
  return multiplier;
};

export const onBookCompleted = (book) => {
  const multiplier = isDoubleXpActive() ? 2 : 1;
  addXp(XP_REWARDS.BOOK_COMPLETE * multiplier);
  if (book.goalDate && book.endDate) {
    const endDay = new Date(book.endDate).setHours(0, 0, 0, 0);
    const goalDay = new Date(book.goalDate).setHours(0, 0, 0, 0);
    if (endDay <= goalDay) addXp(XP_REWARDS.CHALLENGE_SUCCESS * multiplier);
  }
};

export const addCheckin = (bookId, dayTs) => {
  const row = db.getFirstSync('SELECT checkins FROM books WHERE id = ?', [bookId]);
  const list = JSON.parse(row?.checkins || '[]');
  if (!list.includes(dayTs)) {
    list.push(dayTs);
    db.runSync('UPDATE books SET checkins = ? WHERE id = ?', [JSON.stringify(list), bookId]);
    trackDailyReading(0);
  }
};

export const getExpiredChallengeBooks = () =>
  db.getAllSync(
    `SELECT * FROM books
     WHERE goalDate IS NOT NULL
       AND (goalDate < ? OR (status = 'completed' AND endDate IS NOT NULL))
     ORDER BY goalDate DESC`,
    [Date.now()]
  );

export const getSuccessfulChallengeBooks = () => {
  const rows = db.getAllSync(
    'SELECT * FROM books WHERE status = ? AND goalDate IS NOT NULL AND endDate IS NOT NULL ORDER BY endDate DESC',
    ['completed']
  );
  return rows.filter((b) => {
    const endDay = new Date(b.endDate).setHours(0, 0, 0, 0);
    const goalDay = new Date(b.goalDate).setHours(0, 0, 0, 0);
    return endDay <= goalDay;
  });
};

export const getUsername = () => {
  const row = db.getFirstSync('SELECT username FROM user_stats WHERE id = 1');
  return row?.username || '';
};

export const saveUsername = (name) => {
  db.runSync('UPDATE user_stats SET username = ? WHERE id = 1', [name.trim()]);
};

export const getStats = () => {
  const total = db.getFirstSync('SELECT COUNT(*) as count FROM books');
  const completed = db.getFirstSync("SELECT COUNT(*) as count FROM books WHERE status = 'completed'");
  const reading = db.getFirstSync("SELECT COUNT(*) as count FROM books WHERE status = 'reading'");
  const want = db.getFirstSync("SELECT COUNT(*) as count FROM books WHERE status = 'want_to_read'");
  return {
    total: total?.count || 0,
    completed: completed?.count || 0,
    reading: reading?.count || 0,
    want: want?.count || 0,
  };
};

export const getMonthlyReadingStats = () => {
  const now = new Date();
  const result = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const row = db.getFirstSync(
      `SELECT COUNT(*) as count FROM books WHERE status = 'completed' AND COALESCE(endDate, createdAt) >= ? AND COALESCE(endDate, createdAt) <= ?`,
      [start, end]
    );
    result.push({ label: `${d.getMonth() + 1}월`, count: row?.count ?? 0 });
  }
  return result;
};

export const getWeeklyProgress = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartTs = weekStart.getTime();

  const completed = db.getFirstSync(
    `SELECT COUNT(*) as count FROM books WHERE status = 'completed' AND endDate >= ?`,
    [weekStartTs]
  )?.count ?? 0;
  const memos = db.getFirstSync(
    `SELECT COUNT(*) as count FROM book_reviews WHERE createdAt >= ?`,
    [weekStartTs]
  )?.count ?? 0;
  const added = db.getFirstSync(
    `SELECT COUNT(*) as count FROM books WHERE createdAt >= ?`,
    [weekStartTs]
  )?.count ?? 0;
  const streak = db.getFirstSync(
    `SELECT readStreak FROM user_stats WHERE id = 1`
  )?.readStreak ?? 0;

  return { completed, memos, added, streak };
};

export const isMissionClaimed = (missionId, weekKey) =>
  !!db.getFirstSync(
    `SELECT id FROM completed_missions WHERE missionId = ? AND weekKey = ?`,
    [missionId, weekKey]
  );

export const claimMissionReward = (missionId, weekKey, xpAmount) => {
  try {
    const multiplier = isDoubleXpActive() ? 2 : 1;
    db.runSync(
      `INSERT INTO completed_missions (missionId, weekKey, xp) VALUES (?, ?, ?)`,
      [missionId, weekKey, xpAmount * multiplier]
    );
    addXp(xpAmount * multiplier);
    return true;
  } catch (_) {
    return false;
  }
};

export const getBookReviews = (bookId) =>
  db.getAllSync('SELECT * FROM book_reviews WHERE bookId = ? ORDER BY sequence ASC', [bookId]);

export const insertBookReview = (bookId, content, type = 'memo') => {
  const row = db.getFirstSync(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSeq FROM book_reviews WHERE bookId = ?',
    [bookId]
  );
  const nextSeq = row?.nextSeq ?? 1;
  db.runSync(
    'INSERT INTO book_reviews (bookId, sequence, content, type, createdAt) VALUES (?, ?, ?, ?, ?)',
    [bookId, nextSeq, content, type, Date.now()]
  );
  const multiplier = isDoubleXpActive() ? 2 : 1;
  addXp(XP_REWARDS.MEMO_ADD * multiplier);
};

export const deleteBookReview = (id) => {
  db.runSync('DELETE FROM book_reviews WHERE id = ?', [id]);
  addXp(-XP_REWARDS.MEMO_ADD);
};

export const getSchool = () => {
  const row = db.getFirstSync('SELECT school FROM user_stats WHERE id = 1');
  return row?.school || '';
};

export const saveSchool = (name) => {
  db.runSync('UPDATE user_stats SET school = ? WHERE id = 1', [name.trim()]);
};

export const getSchoolLevel = () => {
  const row = db.getFirstSync('SELECT schoolLevel FROM user_stats WHERE id = 1');
  return row?.schoolLevel || '';
};

export const saveSchoolLevel = (level) => {
  db.runSync('UPDATE user_stats SET schoolLevel = ? WHERE id = 1', [level]);
};

export const getAge = () => {
  return db.getFirstSync('SELECT age FROM user_stats WHERE id = 1')?.age ?? 0;
};

export const saveAge = (age) => {
  db.runSync('UPDATE user_stats SET age = ? WHERE id = 1', [age]);
};

export const getWeeklyScore = () => {
  const progress = getWeeklyProgress();
  const key = getWeekKey();
  const missionXp = db.getFirstSync(
    `SELECT COALESCE(SUM(xp), 0) as total FROM completed_missions WHERE weekKey = ?`,
    [key]
  )?.total ?? 0;
  return (
    progress.completed * 100 +
    progress.memos * 10 +
    progress.added * 20 +
    progress.streak * 15 +
    missionXp
  );
};

export const getTimeOfDayStats = () => {
  const buckets = [
    { label: '새벽\n0-5시',   min: 0,  max: 5  },
    { label: '아침\n6-9시',   min: 6,  max: 9  },
    { label: '낮\n10-13시',  min: 10, max: 13 },
    { label: '오후\n14-17시', min: 14, max: 17 },
    { label: '저녁\n18-21시', min: 18, max: 21 },
    { label: '밤\n22-23시',  min: 22, max: 23 },
  ];
  const counts = new Array(buckets.length).fill(0);

  const addHour = (ts) => {
    if (!ts) return;
    const hour = new Date(ts).getHours();
    const idx = buckets.findIndex(bk => hour >= bk.min && hour <= bk.max);
    if (idx >= 0) counts[idx]++;
  };

  const rows = db.getAllSync(
    `SELECT createdAt, updatedAt, goalSetAt FROM books`
  );
  rows.forEach(r => {
    addHour(r.createdAt);
    addHour(r.updatedAt);
    addHour(r.goalSetAt);
  });

  return buckets.map((bk, i) => ({ label: bk.label, count: counts[i] }));
};

export const getPageCountDistribution = () => {
  const rows = db.getAllSync(
    `SELECT totalPages FROM books WHERE status = 'completed' AND totalPages > 0`
  );
  const buckets = [
    { label: '~100p', max: 100 },
    { label: '~200p', max: 200 },
    { label: '~300p', max: 300 },
    { label: '~500p', max: 500 },
    { label: '500p+', max: Infinity },
  ];
  const counts = new Array(buckets.length).fill(0);
  rows.forEach(r => {
    const idx = buckets.findIndex(b => r.totalPages <= b.max);
    if (idx >= 0) counts[idx]++;
  });
  return buckets.map((b, i) => ({ label: b.label, count: counts[i] }));
};

export const getGenreCompletedStats = () =>
  db.getAllSync(
    `SELECT COALESCE(NULLIF(genre, ''), '기타') as label, COUNT(*) as count
     FROM books WHERE status = 'completed'
     GROUP BY COALESCE(NULLIF(genre, ''), '기타')
     ORDER BY count DESC`
  );

export const getDayOfWeekStats = () => {
  const counts = [0, 0, 0, 0, 0, 0, 0];

  const addDay = (ts) => {
    if (!ts) return;
    counts[new Date(ts).getDay()]++;
  };

  const rows = db.getAllSync(
    `SELECT createdAt, updatedAt, goalSetAt, checkins FROM books`
  );
  rows.forEach(r => {
    addDay(r.createdAt);
    addDay(r.updatedAt);
    addDay(r.goalSetAt);
    JSON.parse(r.checkins || '[]').forEach(ts => addDay(ts));
  });

  return ['월', '화', '수', '목', '금', '토', '일'].map((label, i) => ({
    label,
    count: counts[(i + 1) % 7],
  }));
};

export const getRatingDistribution = () => {
  const rows = db.getAllSync(
    `SELECT ROUND(rating) as star, COUNT(*) as count
     FROM books WHERE rating > 0
     GROUP BY ROUND(rating) ORDER BY star`
  );
  const map = {};
  rows.forEach(r => { map[r.star] = r.count; });
  return [1, 2, 3, 4, 5].map(s => ({ label: `${s}점`, count: map[s] || 0 }));
};

export const getCompletionTimeStats = () => {
  const rows = db.getAllSync(
    `SELECT COALESCE(startDate, createdAt) AS startDate, endDate FROM books
     WHERE status = 'completed' AND endDate IS NOT NULL
       AND COALESCE(startDate, createdAt) IS NOT NULL
       AND endDate > COALESCE(startDate, createdAt)`
  );
  const buckets = [
    { label: '~1주', max: 7 },
    { label: '~2주', max: 14 },
    { label: '~1달', max: 30 },
    { label: '~3달', max: 90 },
    { label: '3달+', max: Infinity },
  ];
  const counts = new Array(buckets.length).fill(0);
  rows.forEach(r => {
    const days = Math.round((r.endDate - r.startDate) / 86400000);
    const idx = buckets.findIndex(b => days <= b.max);
    if (idx >= 0) counts[idx]++;
  });
  return buckets.map((b, i) => ({ label: b.label, count: counts[i] }));
};
