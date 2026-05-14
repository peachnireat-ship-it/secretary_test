import * as SQLite from 'expo-sqlite';

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

// XP 보상 상수
export const XP_REWARDS = {
  BOOK_COMPLETE: 100,       // 완독 1권
  DAILY_PAGES_100: 30,      // 하루 독서 합산 100페이지 달성
  DAILY_STREAK: 10,         // 연속 독서 (1일당)
  CHALLENGE_SUCCESS: 150,   // 챌린지 성공
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
  db.runSync('UPDATE user_stats SET xp = xp + ? WHERE id = 1', [amount]);
  const row = db.getFirstSync('SELECT xp FROM user_stats WHERE id = 1');
  const newLevel = calcLevel(row?.xp ?? 0);
  db.runSync('UPDATE user_stats SET level = ? WHERE id = 1', [newLevel]);
  return getUserStats();
};

export const getAllBooks = () =>
  db.getAllSync('SELECT * FROM books ORDER BY createdAt DESC');

export const getBooksByStatus = (status) =>
  db.getAllSync('SELECT * FROM books WHERE status = ? ORDER BY createdAt DESC', [status]);

export const getBookById = (id) =>
  db.getFirstSync('SELECT * FROM books WHERE id = ?', [id]);

export const insertBook = (book) => {
  db.runSync(
    `INSERT INTO books (title, author, totalPages, currentPage, status, rating, review, startDate, createdAt, bookType)
     VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
    [
      book.title,
      book.author || '',
      book.totalPages || 0,
      book.status || 'want_to_read',
      book.review || '',
      book.status === 'reading' ? Date.now() : null,
      Date.now(),
      book.bookType || 'physical',
    ]
  );
};

export const updateBook = (book) => {
  db.runSync(
    `UPDATE books SET title = ?, author = ?, totalPages = ?, currentPage = ?,
     status = ?, rating = ?, review = ?, startDate = ?, endDate = ?, goalDate = ?, bookType = ?, progressPct = ? WHERE id = ?`,
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
      book.id,
    ]
  );
};

export const deleteBook = (id) =>
  db.runSync('DELETE FROM books WHERE id = ?', [id]);

export const trackDailyReading = (pagesRead = 0) => {
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
    addXp(XP_REWARDS.DAILY_STREAK);
  }

  const newPages = todayPages + pagesRead;
  if (!todayPagesXpGiven && newPages >= 100) {
    addXp(XP_REWARDS.DAILY_PAGES_100);
    todayPagesXpGiven = 1;
  }

  db.runSync(
    'UPDATE user_stats SET lastReadDay = ?, todayPages = ?, readStreak = ?, todayPagesXpGiven = ? WHERE id = 1',
    [todayTs, newPages, streak, todayPagesXpGiven]
  );
};

export const onBookCompleted = (book) => {
  addXp(XP_REWARDS.BOOK_COMPLETE);
  if (book.goalDate && book.endDate) {
    const endDay = new Date(book.endDate).setHours(0, 0, 0, 0);
    const goalDay = new Date(book.goalDate).setHours(0, 0, 0, 0);
    if (endDay <= goalDay) addXp(XP_REWARDS.CHALLENGE_SUCCESS);
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
