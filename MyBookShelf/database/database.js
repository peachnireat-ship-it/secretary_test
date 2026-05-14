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

// XP 보상 상수
export const XP_REWARDS = {
  BOOK_COMPLETE: 100,      // 완독
  CHALLENGE_SUCCESS: 50,   // 챌린지 목표일 내 완독 보너스
  DAILY_CHECKIN: 10,       // 하루 독서 인증
};

// 레벨 N에 필요한 누적 XP: N*(N-1)*25
function xpForLevel(level) {
  return level * (level - 1) * 25;
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

export const addCheckin = (bookId, dayTs) => {
  const row = db.getFirstSync('SELECT checkins FROM books WHERE id = ?', [bookId]);
  const list = JSON.parse(row?.checkins || '[]');
  if (!list.includes(dayTs)) {
    list.push(dayTs);
    db.runSync('UPDATE books SET checkins = ? WHERE id = ?', [JSON.stringify(list), bookId]);
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
