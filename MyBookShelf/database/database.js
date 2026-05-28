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
try {
  db.execSync(`ALTER TABLE books ADD COLUMN cover TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN ratedAt INTEGER`);
} catch (_) {}
db.execSync(`UPDATE books SET ratedAt = COALESCE(updatedAt, endDate, createdAt) WHERE rating = 5 AND ratedAt IS NULL`);

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
  db.execSync(`ALTER TABLE user_stats ADD COLUMN company TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN companyType TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN age INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE completed_missions ADD COLUMN xp INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN userId TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE user_stats ADD COLUMN guildId TEXT DEFAULT ''`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE book_reviews ADD COLUMN xpEarned INTEGER DEFAULT 10`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN xpEarned INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE books ADD COLUMN isAdult INTEGER DEFAULT 0`);
} catch (_) {}
try {
  db.execSync(`ALTER TABLE guild_members ADD COLUMN isAdult INTEGER DEFAULT 0`);
} catch (_) {}

db.execSync(`
  CREATE TABLE IF NOT EXISTS user_prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// one-time fix: 'Test' 완독 도서 종료일 → 2026-05-20
try {
  const _fixKey = 'fix_test_enddate_20260520';
  const _applied = db.getFirstSync(`SELECT value FROM user_prefs WHERE key = ?`, [_fixKey]);
  if (!_applied) {
    db.runSync(
      `UPDATE books SET endDate = ? WHERE title = 'Test' AND status = 'completed'`,
      [new Date(2026, 4, 20).getTime()]
    );
    db.runSync(`INSERT OR REPLACE INTO user_prefs (key, value) VALUES (?, '1')`, [_fixKey]);
  }
} catch (_) {}

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

// 어린이 (~12세): 쉬운 난이도
const MISSION_POOL_CHILD = [
  { id: 'complete_1', label: '책 1권 완독하기', icon: 'trophy-outline', type: 'complete', target: 1, xp: 80 },
  { id: 'memo_2', label: '메모 2개 작성하기', icon: 'create-outline', type: 'memo', target: 2, xp: 40 },
  { id: 'memo_3', label: '메모 3개 작성하기', icon: 'create-outline', type: 'memo', target: 3, xp: 50 },
  { id: 'add_1', label: '새 책 1권 추가하기', icon: 'add-circle-outline', type: 'add', target: 1, xp: 30 },
  { id: 'streak_2', label: '2일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 2, xp: 40 },
  { id: 'streak_3', label: '3일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 3, xp: 60 },
];

// 청소년 (13~18세): 중간 난이도
const MISSION_POOL_TEEN = [
  { id: 'complete_1', label: '책 1권 완독하기', icon: 'trophy-outline', type: 'complete', target: 1, xp: 80 },
  { id: 'complete_2', label: '책 2권 완독하기', icon: 'trophy-outline', type: 'complete', target: 2, xp: 160 },
  { id: 'memo_3', label: '메모 3개 작성하기', icon: 'create-outline', type: 'memo', target: 3, xp: 50 },
  { id: 'memo_5', label: '메모 5개 작성하기', icon: 'create-outline', type: 'memo', target: 5, xp: 80 },
  { id: 'add_1', label: '새 책 1권 추가하기', icon: 'add-circle-outline', type: 'add', target: 1, xp: 30 },
  { id: 'add_2', label: '새 책 2권 추가하기', icon: 'add-circle-outline', type: 'add', target: 2, xp: 60 },
  { id: 'streak_3', label: '3일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 3, xp: 60 },
  { id: 'streak_5', label: '5일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 5, xp: 100 },
];

// 성인 (19세+): 어려운 난이도
const MISSION_POOL_ADULT = [
  { id: 'complete_1', label: '책 1권 완독하기', icon: 'trophy-outline', type: 'complete', target: 1, xp: 80 },
  { id: 'complete_2', label: '책 2권 완독하기', icon: 'trophy-outline', type: 'complete', target: 2, xp: 160 },
  { id: 'complete_3', label: '책 3권 완독하기', icon: 'trophy-outline', type: 'complete', target: 3, xp: 240 },
  { id: 'memo_5', label: '메모 5개 작성하기', icon: 'create-outline', type: 'memo', target: 5, xp: 80 },
  { id: 'memo_7', label: '메모 7개 작성하기', icon: 'create-outline', type: 'memo', target: 7, xp: 110 },
  { id: 'add_2', label: '새 책 2권 추가하기', icon: 'add-circle-outline', type: 'add', target: 2, xp: 60 },
  { id: 'streak_5', label: '5일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 5, xp: 100 },
  { id: 'streak_7', label: '7일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 7, xp: 140 },
];

// 연령 미설정 시 기본값(청소년 풀)으로 fallback
export const MISSION_POOL = MISSION_POOL_TEEN;

// ── 길드 키워드 → 테마 매핑 ──────────────────────────────────────
const KEYWORD_THEME_MAP = [
  { theme: 'fantasy',  patterns: ['판타지', '마법', 'sf', '공상과학', '모험', '드래곤', '히어로', '판타'] },
  { theme: 'selfHelp', patterns: ['자기계발', '성장', '동기부여', '목표', '습관', '리더십', '마인드', '계발'] },
  { theme: 'history',  patterns: ['역사', '인문', '고전', '전기', '위인전', '문명', '사학'] },
  { theme: 'science',  patterns: ['과학', '기술', '공학', '수학', '물리', '화학', '생물', '우주', '프로그래밍'] },
  { theme: 'literature', patterns: ['문학', '소설', '시', '에세이', '수필', '글쓰기', '문예'] },
  { theme: 'kids',     patterns: ['동화', '그림책', '어린이', '만화', '학습만화'] },
];

const THEMED_MISSIONS = {
  fantasy: [
    { id: 'th_fantasy_complete_1', label: '판타지 탐험 - 책 1권 완독하기', icon: 'planet-outline', type: 'complete', target: 1, xp: 110 },
    { id: 'th_fantasy_memo_3',     label: '모험 일지 - 메모 3개 작성하기', icon: 'document-text-outline', type: 'memo', target: 3, xp: 65 },
    { id: 'th_fantasy_streak_3',   label: '영웅의 여정 - 3일 연속 독서하기', icon: 'shield-outline', type: 'streak', target: 3, xp: 75 },
  ],
  selfHelp: [
    { id: 'th_self_complete_1', label: '자기 성장 - 책 1권 완독하기', icon: 'trending-up-outline', type: 'complete', target: 1, xp: 110 },
    { id: 'th_self_memo_5',     label: '인사이트 기록 - 메모 5개 작성하기', icon: 'bulb-outline', type: 'memo', target: 5, xp: 90 },
    { id: 'th_self_streak_5',   label: '성장 루틴 - 5일 연속 독서하기', icon: 'barbell-outline', type: 'streak', target: 5, xp: 110 },
  ],
  history: [
    { id: 'th_history_complete_2', label: '역사 탐구 - 책 2권 완독하기', icon: 'library-outline', type: 'complete', target: 2, xp: 190 },
    { id: 'th_history_memo_5',     label: '역사 기록 - 메모 5개 작성하기', icon: 'pencil-outline', type: 'memo', target: 5, xp: 90 },
    { id: 'th_history_add_2',      label: '지식 수집 - 새 책 2권 추가하기', icon: 'albums-outline', type: 'add', target: 2, xp: 75 },
  ],
  science: [
    { id: 'th_science_complete_2', label: '지식 탐구 - 책 2권 완독하기', icon: 'flask-outline', type: 'complete', target: 2, xp: 190 },
    { id: 'th_science_memo_5',     label: '발견 기록 - 메모 5개 작성하기', icon: 'eye-outline', type: 'memo', target: 5, xp: 90 },
    { id: 'th_science_streak_4',   label: '탐구 정신 - 4일 연속 독서하기', icon: 'rocket-outline', type: 'streak', target: 4, xp: 90 },
  ],
  literature: [
    { id: 'th_lit_complete_2', label: '문학 여행 - 책 2권 완독하기', icon: 'newspaper-outline', type: 'complete', target: 2, xp: 190 },
    { id: 'th_lit_memo_7',     label: '독서 감상 - 메모 7개 작성하기', icon: 'chatbubble-outline', type: 'memo', target: 7, xp: 120 },
    { id: 'th_lit_streak_5',   label: '작가의 삶 - 5일 연속 독서하기', icon: 'brush-outline', type: 'streak', target: 5, xp: 110 },
  ],
  kids: [
    { id: 'th_kids_complete_1', label: '동화 나라 - 책 1권 완독하기', icon: 'happy-outline', type: 'complete', target: 1, xp: 90 },
    { id: 'th_kids_memo_2',     label: '이야기 기록 - 메모 2개 작성하기', icon: 'color-wand-outline', type: 'memo', target: 2, xp: 45 },
    { id: 'th_kids_add_1',      label: '책장 채우기 - 새 책 1권 추가하기', icon: 'gift-outline', type: 'add', target: 1, xp: 35 },
  ],
};

function detectGuildTheme(keywords) {
  if (!keywords || keywords.length === 0) return null;
  const scores = {};
  for (const kw of keywords) {
    const lower = kw.toLowerCase().replace(/\s/g, '');
    for (const { theme, patterns } of KEYWORD_THEME_MAP) {
      if (patterns.some(p => lower.includes(p) || (p.length >= 2 && p.includes(lower)))) {
        scores[theme] = (scores[theme] ?? 0) + 1;
      }
    }
  }
  if (Object.keys(scores).length === 0) return null;
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

export function getGuildThemeMissions(keywords, weekKey) {
  const key = weekKey ?? getWeekKey();
  const theme = detectGuildTheme(keywords);
  if (!theme) return [];
  const pool = THEMED_MISSIONS[theme];
  const seed = parseInt(key.replace(/\D/g, ''), 10) + 77777;
  return seededShuffle(pool, seed).slice(0, 1);
}

function getMissionPoolByAge(age) {
  if (age > 0 && age <= 12) return MISSION_POOL_CHILD;
  if (age > 0 && age <= 18) return MISSION_POOL_TEEN;
  return MISSION_POOL_ADULT;
}

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = ((s * 1664525) + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getWeeklyMissions(weekKey, age) {
  const key = weekKey ?? getWeekKey();
  const resolvedAge = age ?? getAge();
  const pool = getMissionPoolByAge(resolvedAge);
  const seed = parseInt(key.replace('-W', ''), 10);
  return seededShuffle(pool, seed).slice(0, 3);
}

export function getExtraMissions(currentMissions, weekKey, age) {
  const key = weekKey ?? getWeekKey();
  const resolvedAge = age ?? getAge();
  const pool = getMissionPoolByAge(resolvedAge);
  const currentIds = new Set(currentMissions.map(m => m.id));
  const remaining = pool.filter(m => !currentIds.has(m.id));
  const seed = parseInt(key.replace(/\D/g, ''), 10) + 31337;
  return seededShuffle(remaining, seed).slice(0, 2);
}

export function getMissionProgress(mission, progress) {
  if (mission.type === 'complete') return progress.completed;
  if (mission.type === 'memo') return progress.memos;
  if (mission.type === 'add') return progress.added;
  if (mission.type === 'streak') return progress.streak;
  return 0;
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

// 티어 정의: 브론즈(1~100) → 실버(1~80) → 골드(1~60) → 플래티넘(1~40) → 다이아(1~30)
export const TIERS = [
  { name: '브론즈',   maxLevel: 100, color: '#CD7F32' },
  { name: '실버',     maxLevel: 80,  color: '#9E9E9E' },
  { name: '골드',     maxLevel: 60,  color: '#FFA000' },
  { name: '플래티넘', maxLevel: 40,  color: '#607D8B' },
  { name: '다이아',   maxLevel: 30,  color: '#29B6F6' },
];

// 누적 글로벌 레벨 → { tier, tierLevel, tierColor }
export function getTierInfo(globalLevel) {
  let remaining = globalLevel;
  for (const t of TIERS) {
    if (remaining <= t.maxLevel) return { tier: t.name, tierLevel: remaining, tierColor: t.color };
    remaining -= t.maxLevel;
  }
  const last = TIERS[TIERS.length - 1];
  return { tier: last.name, tierLevel: last.maxLevel, tierColor: last.color };
}

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
  const { tier, tierLevel, tierColor } = getTierInfo(level);
  return {
    xp,
    level,
    tier,
    tierLevel,
    tierColor,
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
  db.getAllSync('SELECT * FROM books WHERE rating = 5 ORDER BY ratedAt DESC, endDate DESC, createdAt DESC');

export const getBookById = (id) =>
  db.getFirstSync('SELECT * FROM books WHERE id = ?', [id]);

export const insertBook = (book) => {
  const now = Date.now();
  db.runSync(
    `INSERT INTO books (title, author, totalPages, currentPage, status, rating, review, startDate, endDate, createdAt, bookType, genre, cover, isAdult)
     VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      book.cover || '',
      book.isAdult ? 1 : 0,
    ]
  );
};

export const updateBook = (book) => {
  const now = Date.now();
  const current = db.getFirstSync('SELECT goalDate, goalSetAt, rating, ratedAt FROM books WHERE id = ?', [book.id]);
  const newGoalSetAt = (book.goalDate && book.goalDate !== current?.goalDate)
    ? now
    : (current?.goalSetAt || null);
  const newRatedAt = book.rating === 5
    ? (current?.rating === 5 && current?.ratedAt ? current.ratedAt : now)
    : null;
  db.runSync(
    `UPDATE books SET title = ?, author = ?, totalPages = ?, currentPage = ?,
     status = ?, rating = ?, review = ?, startDate = ?, endDate = ?, goalDate = ?,
     bookType = ?, progressPct = ?, genre = ?, cover = ?, updatedAt = ?, goalSetAt = ?, ratedAt = ?, isAdult = ? WHERE id = ?`,
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
      book.cover || '',
      now,
      newGoalSetAt,
      newRatedAt,
      book.isAdult ? 1 : 0,
      book.id,
    ]
  );
};

export const deleteBook = (id) => {
  const book = db.getFirstSync('SELECT xpEarned, status, review FROM books WHERE id = ?', [id]);
  if (book) {
    const memoXp = db.getFirstSync(
      'SELECT COALESCE(SUM(xpEarned), 0) as total FROM book_reviews WHERE bookId = ?', [id]
    )?.total ?? 0;
    const reviewXp = (book.status === 'completed' && book.review) ? XP_REWARDS.BOOK_REVIEW : 0;
    const totalDeduct = (book.xpEarned ?? 0) + memoXp + reviewXp;
    if (totalDeduct > 0) addXp(-totalDeduct);
  }
  db.runSync('DELETE FROM book_reviews WHERE bookId = ?', [id]);
  db.runSync('DELETE FROM books WHERE id = ?', [id]);

  // 삭제 후 현재 주 미션 진행도 재검증 → 목표 미달 미션 즉시 취소
  const weekKey = getWeekKey();
  const progress = getWeeklyProgress();
  const missions = getWeeklyMissions();
  const extra = getExtraMissions(missions);
  [...missions, ...extra].forEach(m => {
    if (isMissionClaimed(m.id, weekKey) && getMissionProgress(m, progress) < m.target) {
      cancelMissionReward(m.id, weekKey);
    }
  });
};

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
  let totalXp = XP_REWARDS.BOOK_COMPLETE * multiplier;
  if (book.goalDate && book.endDate) {
    const endDay = new Date(book.endDate).setHours(0, 0, 0, 0);
    const goalDay = new Date(book.goalDate).setHours(0, 0, 0, 0);
    if (endDay <= goalDay) totalXp += XP_REWARDS.CHALLENGE_SUCCESS * multiplier;
  }
  addXp(totalXp);
  if (book.id) db.runSync('UPDATE books SET xpEarned = ? WHERE id = ?', [totalXp, book.id]);
};

export const onBookReverted = (bookId, fallbackXp) => {
  const row = db.getFirstSync('SELECT xpEarned FROM books WHERE id = ?', [bookId]);
  const xp = (row?.xpEarned > 0) ? row.xpEarned : fallbackXp;
  db.runSync('UPDATE books SET xpEarned = 0 WHERE id = ?', [bookId]);
  addXp(-xp);
  return xp;
};

export const getReadStreak = () =>
  db.getFirstSync('SELECT readStreak FROM user_stats WHERE id = 1')?.readStreak ?? 0;

export const getCheckinDays = () => {
  const rows = db.getAllSync('SELECT checkins FROM books');
  const days = new Set();
  rows.forEach(r => {
    try { JSON.parse(r.checkins || '[]').forEach(ts => days.add(ts)); } catch {}
  });
  return days;
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

export const getStats = (excludeAdult = false) => {
  const ac = excludeAdult ? ' AND isAdult != 1' : '';
  const total = db.getFirstSync(`SELECT COUNT(*) as count FROM books WHERE 1=1${ac}`);
  const completed = db.getFirstSync(`SELECT COUNT(*) as count FROM books WHERE status = 'completed'${ac}`);
  const reading = db.getFirstSync(`SELECT COUNT(*) as count FROM books WHERE status = 'reading'${ac}`);
  const want = db.getFirstSync(`SELECT COUNT(*) as count FROM books WHERE status = 'want_to_read'${ac}`);
  return {
    total: total?.count || 0,
    completed: completed?.count || 0,
    reading: reading?.count || 0,
    want: want?.count || 0,
  };
};

export const getMonthlyReadingStats = (excludeAdult = false) => {
  const now = new Date();
  const result = [];
  const ac = excludeAdult ? ' AND isAdult != 1' : '';
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const row = db.getFirstSync(
      `SELECT COUNT(*) as count FROM books WHERE status = 'completed' AND COALESCE(endDate, createdAt) >= ? AND COALESCE(endDate, createdAt) <= ?${ac}`,
      [start, end]
    );
    result.push({ label: `${d.getMonth() + 1}월`, count: row?.count ?? 0 });
  }
  return result;
};

export const getWeeklyProgress = (excludeAdult = false) => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartTs = weekStart.getTime();

  const ac = excludeAdult ? ' AND isAdult != 1' : '';
  const completed = db.getFirstSync(
    `SELECT COUNT(*) as count FROM books WHERE status = 'completed' AND endDate >= ?${ac}`,
    [weekStartTs]
  )?.count ?? 0;
  const memos = db.getFirstSync(
    excludeAdult
      ? `SELECT COUNT(*) as count FROM book_reviews br INNER JOIN books b ON br.bookId = b.id WHERE br.createdAt >= ? AND b.isAdult != 1`
      : `SELECT COUNT(*) as count FROM book_reviews WHERE createdAt >= ?`,
    [weekStartTs]
  )?.count ?? 0;
  const added = db.getFirstSync(
    `SELECT COUNT(*) as count FROM books WHERE createdAt >= ?${ac}`,
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

export const cancelMissionReward = (missionId, weekKey) => {
  const row = db.getFirstSync(
    'SELECT xp FROM completed_missions WHERE missionId = ? AND weekKey = ?',
    [missionId, weekKey]
  );
  if (!row) return false;
  db.runSync(
    'DELETE FROM completed_missions WHERE missionId = ? AND weekKey = ?',
    [missionId, weekKey]
  );
  addXp(-row.xp);
  return true;
};

export const getBookReviews = (bookId) =>
  db.getAllSync('SELECT * FROM book_reviews WHERE bookId = ? ORDER BY sequence ASC', [bookId]);

export const insertBookReview = (bookId, content, type = 'memo') => {
  const row = db.getFirstSync(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSeq FROM book_reviews WHERE bookId = ?',
    [bookId]
  );
  const nextSeq = row?.nextSeq ?? 1;
  const multiplier = isDoubleXpActive() ? 2 : 1;
  const xpEarned = XP_REWARDS.MEMO_ADD * multiplier;
  db.runSync(
    'INSERT INTO book_reviews (bookId, sequence, content, type, createdAt, xpEarned) VALUES (?, ?, ?, ?, ?, ?)',
    [bookId, nextSeq, content, type, Date.now(), xpEarned]
  );
  addXp(xpEarned);
};

export const deleteBookReview = (id) => {
  const row = db.getFirstSync('SELECT xpEarned FROM book_reviews WHERE id = ?', [id]);
  const xpEarned = row?.xpEarned ?? XP_REWARDS.MEMO_ADD;
  db.runSync('DELETE FROM book_reviews WHERE id = ?', [id]);
  addXp(-xpEarned);
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

export const getCompany = () => {
  const row = db.getFirstSync('SELECT company FROM user_stats WHERE id = 1');
  return row?.company || '';
};

export const saveCompany = (name) => {
  db.runSync('UPDATE user_stats SET company = ? WHERE id = 1', [name.trim()]);
};

export const getCompanyType = () => {
  const row = db.getFirstSync('SELECT companyType FROM user_stats WHERE id = 1');
  return row?.companyType || '';
};

export const saveCompanyType = (type) => {
  db.runSync('UPDATE user_stats SET companyType = ? WHERE id = 1', [type]);
};

export const getAge = () => {
  return db.getFirstSync('SELECT age FROM user_stats WHERE id = 1')?.age ?? 0;
};

export const saveAge = (age) => {
  db.runSync('UPDATE user_stats SET age = ? WHERE id = 1', [age]);
};

export const getWeeklyScore = (excludeAdult = false) => {
  const progress = getWeeklyProgress(excludeAdult);
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

export const getYearlyWrappedStats = (year) => {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31, 23, 59, 59, 999).getTime();

  const completed = db.getFirstSync(
    `SELECT COUNT(*) as c FROM books WHERE status='completed' AND COALESCE(endDate,createdAt) BETWEEN ? AND ?`,
    [start, end]
  )?.c ?? 0;

  const totalPages = db.getFirstSync(
    `SELECT COALESCE(SUM(totalPages),0) as p FROM books WHERE status='completed' AND COALESCE(endDate,createdAt) BETWEEN ? AND ?`,
    [start, end]
  )?.p ?? 0;

  const memos = db.getFirstSync(
    `SELECT COUNT(*) as c FROM book_reviews WHERE createdAt BETWEEN ? AND ?`,
    [start, end]
  )?.c ?? 0;

  const avgRaw = db.getFirstSync(
    `SELECT AVG(rating) as avg FROM books WHERE rating>0 AND COALESCE(endDate,createdAt) BETWEEN ? AND ?`,
    [start, end]
  )?.avg ?? 0;
  const avgRating = Math.round((avgRaw || 0) * 10) / 10;

  const topGenreRow = db.getFirstSync(
    `SELECT COALESCE(NULLIF(genre,''),'기타') as genre, COUNT(*) as c FROM books
     WHERE status='completed' AND COALESCE(endDate,createdAt) BETWEEN ? AND ?
     GROUP BY COALESCE(NULLIF(genre,''),'기타') ORDER BY c DESC LIMIT 1`,
    [start, end]
  );
  const topGenre = topGenreRow?.genre ?? null;
  const topGenreCount = topGenreRow?.c ?? 0;

  const bestBookRow = db.getFirstSync(
    `SELECT title, rating FROM books WHERE status='completed' AND rating>0
     AND COALESCE(endDate,createdAt) BETWEEN ? AND ?
     ORDER BY rating DESC, COALESCE(endDate,createdAt) DESC LIMIT 1`,
    [start, end]
  );
  const bestBook = bestBookRow ? { title: bestBookRow.title, rating: bestBookRow.rating } : null;

  let bestMonth = null;
  let bestMonthCount = 0;
  for (let m = 0; m < 12; m++) {
    const ms = new Date(year, m, 1).getTime();
    const me = new Date(year, m + 1, 0, 23, 59, 59, 999).getTime();
    const cnt = db.getFirstSync(
      `SELECT COUNT(*) as c FROM books WHERE status='completed' AND COALESCE(endDate,createdAt) BETWEEN ? AND ?`,
      [ms, me]
    )?.c ?? 0;
    if (cnt > bestMonthCount) { bestMonthCount = cnt; bestMonth = m + 1; }
  }

  return { year, completed, totalPages, memos, avgRating, topGenre, topGenreCount, bestBook, bestMonth, bestMonthCount };
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

export const getMonthlyReport = () => {
  const now = new Date();
  const build = (year, month) => {
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    const completed = db.getFirstSync(
      `SELECT COUNT(*) as c FROM books WHERE status='completed' AND COALESCE(endDate,createdAt) BETWEEN ? AND ?`,
      [start, end]
    )?.c ?? 0;
    const added = db.getFirstSync(
      `SELECT COUNT(*) as c FROM books WHERE createdAt BETWEEN ? AND ?`,
      [start, end]
    )?.c ?? 0;
    const memos = db.getFirstSync(
      `SELECT COUNT(*) as c FROM book_reviews WHERE createdAt BETWEEN ? AND ?`,
      [start, end]
    )?.c ?? 0;
    const avgRaw = db.getFirstSync(
      `SELECT AVG(rating) as avg FROM books WHERE rating>0 AND COALESCE(endDate,createdAt) BETWEEN ? AND ?`,
      [start, end]
    )?.avg ?? 0;
    return { label: `${month + 1}월`, completed, added, memos, avgRating: Math.round((avgRaw || 0) * 10) / 10 };
  };
  const y = now.getFullYear(), m = now.getMonth();
  const lm = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
  return { thisMonth: build(y, m), lastMonth: build(lm.y, lm.m) };
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

// ── 길드 관련 헬퍼 ──────────────────────────────────────────────

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const getUserId = () => {
  const row = db.getFirstSync('SELECT userId FROM user_stats WHERE id = 1');
  if (row?.userId) return row.userId;
  const newId = generateUUID();
  db.runSync('UPDATE user_stats SET userId = ? WHERE id = 1', [newId]);
  return newId;
};

export const getGuildId = () => {
  const row = db.getFirstSync('SELECT guildId FROM user_stats WHERE id = 1');
  return row?.guildId || '';
};

export const saveGuildId = (guildId) => {
  db.runSync('UPDATE user_stats SET guildId = ? WHERE id = 1', [guildId]);
};

export const leaveGuild = () => {
  db.runSync("UPDATE user_stats SET guildId = '' WHERE id = 1");
};

// ── 독서 토론 ──────────────────────────────────────────────────────────────
db.execSync(`
  CREATE TABLE IF NOT EXISTS book_discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookId INTEGER DEFAULT NULL,
    bookTitle TEXT DEFAULT '',
    topic TEXT NOT NULL,
    content TEXT DEFAULT '',
    questions TEXT DEFAULT '[]',
    createdAt INTEGER,
    updatedAt INTEGER
  );
`);
try { db.execSync(`ALTER TABLE book_discussions ADD COLUMN discussionType TEXT DEFAULT 'debate'`); } catch (_) {}
try { db.execSync(`ALTER TABLE book_discussions ADD COLUMN createdBy TEXT DEFAULT ''`); } catch (_) {}
try {
  db.execSync(`
    UPDATE book_discussions
    SET createdBy = (SELECT username FROM user_stats WHERE id = 1)
    WHERE (createdBy IS NULL OR createdBy = '')
      AND (SELECT COALESCE(username, '') FROM user_stats WHERE id = 1) != ''
  `);
} catch (_) {}

db.execSync(`
  CREATE TABLE IF NOT EXISTS discussion_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discussionId INTEGER NOT NULL,
    vote TEXT DEFAULT NULL,
    questionIndex INTEGER DEFAULT NULL,
    content TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
`);
try { db.execSync('ALTER TABLE discussion_comments ADD COLUMN createdBy TEXT DEFAULT NULL'); } catch (_) {}
try { db.execSync('ALTER TABLE discussion_comments ADD COLUMN parentId INTEGER DEFAULT NULL'); } catch (_) {}

export const getDiscussions = () =>
  db.getAllSync('SELECT * FROM book_discussions ORDER BY createdAt DESC');

export const getDiscussionById = (id) =>
  db.getFirstSync('SELECT * FROM book_discussions WHERE id = ?', [id]);

export const addDiscussion = ({ bookId, bookTitle, topic, content, questions, discussionType, createdBy }) => {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO book_discussions (bookId, bookTitle, topic, content, questions, discussionType, createdBy, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookId || null, bookTitle || '', topic, content || '', JSON.stringify(questions || []), discussionType || 'debate', createdBy || '', now, now],
  );
  return result.lastInsertRowId;
};

export const updateDiscussion = ({ id, topic, content, questions }) => {
  db.runSync(
    `UPDATE book_discussions SET topic = ?, content = ?, questions = ?, updatedAt = ? WHERE id = ?`,
    [topic, content || '', JSON.stringify(questions || []), Date.now(), id],
  );
};

export const deleteDiscussion = (id) => {
  db.runSync('DELETE FROM discussion_comments WHERE discussionId = ?', [id]);
  db.runSync('DELETE FROM book_discussions WHERE id = ?', [id]);
};

export const getComments = (discussionId) =>
  db.getAllSync('SELECT * FROM discussion_comments WHERE discussionId = ? ORDER BY createdAt ASC', [discussionId]);

export const addComment = ({ discussionId, vote, questionIndex, content, createdBy, parentId }) => {
  db.runSync(
    `INSERT INTO discussion_comments (discussionId, vote, questionIndex, content, createdAt, createdBy, parentId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [discussionId, vote || null, questionIndex ?? null, content, Date.now(), createdBy || null, parentId || null],
  );
};

export const deleteComment = (id) => {
  db.runSync('DELETE FROM discussion_comments WHERE parentId = ?', [id]);
  db.runSync('DELETE FROM discussion_comments WHERE id = ?', [id]);
};
