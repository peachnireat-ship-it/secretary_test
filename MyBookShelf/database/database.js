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
