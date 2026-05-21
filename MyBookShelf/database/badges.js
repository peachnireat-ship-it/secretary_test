import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('mybookshelf.db');

export const GENRES = [
  '소설/문학',
  '판타지/SF',
  '역사',
  '과학/기술',
  '자기계발',
  '에세이',
  '경제/경영',
  '인문/철학',
  '종교',
  '기타',
];

export const BADGE_DEFS = [
  // 시간대 패턴
  { id: 'dawn_reader',    emoji: '🌙', name: '새벽 독서가',    desc: '새벽 0~5시에 메모·완독 5회', type: 'time', threshold: 5 },
  { id: 'morning_reader', emoji: '🌅', name: '아침형 독서가',  desc: '오전 6~9시에 메모·완독 5회', type: 'time', threshold: 5 },
  { id: 'night_owl',      emoji: '🦉', name: '올빼미 독서가',  desc: '밤 21~24시에 메모·완독 5회', type: 'time', threshold: 5 },
  // 장르 패턴 - 판타지/SF (3단계 진화)
  { id: 'fantasy_fan',    emoji: '✨', name: '판타지 마니아',  desc: '판타지/SF 완독 3권',  type: 'genre', genre: '판타지/SF', threshold: 3,  tier: 1 },
  { id: 'fantasy_master', emoji: '🌟', name: '판타지 마스터',  desc: '판타지/SF 완독 7권',  type: 'genre', genre: '판타지/SF', threshold: 7,  tier: 2, prerequisite: 'fantasy_fan' },
  { id: 'sf_maniac',      emoji: '🚀', name: '판타지 광인',    desc: '판타지/SF 완독 10권', type: 'genre', genre: '판타지/SF', threshold: 10, tier: 3, prerequisite: 'fantasy_master' },
  // 장르 패턴 - 소설/문학 (3단계 진화)
  { id: 'lit_lover',      emoji: '📖', name: '문학 애호가',   desc: '소설/문학 완독 3권',  type: 'genre', genre: '소설/문학', threshold: 3,  tier: 1 },
  { id: 'lit_explorer',   emoji: '📚', name: '문학 탐험가',   desc: '소설/문학 완독 7권',  type: 'genre', genre: '소설/문학', threshold: 7,  tier: 2, prerequisite: 'lit_lover' },
  { id: 'lit_master',     emoji: '🖋️', name: '문학 마스터',   desc: '소설/문학 완독 10권', type: 'genre', genre: '소설/문학', threshold: 10, tier: 3, prerequisite: 'lit_explorer' },
  // 장르 패턴 - 과학/기술 (4단계 진화)
  { id: 'science_fan',    emoji: '🔬', name: '과학 탐구자',   desc: '과학/기술 완독 3권',   type: 'genre', genre: '과학/기술', threshold: 3,  tier: 1 },
  { id: 'science_maniac', emoji: '⚗️', name: '과학 마니아',   desc: '과학/기술 완독 7권',   type: 'genre', genre: '과학/기술', threshold: 7,  tier: 2, prerequisite: 'science_fan' },
  { id: 'science_master', emoji: '🧪', name: '과학 마스터',   desc: '과학/기술 완독 12권',  type: 'genre', genre: '과학/기술', threshold: 12, tier: 3, prerequisite: 'science_maniac' },
  { id: 'science_madman', emoji: '🧬', name: '과학 광인',     desc: '과학/기술 완독 20권',  type: 'genre', genre: '과학/기술', threshold: 20, tier: 4, prerequisite: 'science_master' },
  // 장르 패턴 - 기타 (단일 등급)
  { id: 'history_buff',   emoji: '📜', name: '역사 탐험가',   desc: '역사 완독 3권',        type: 'genre', genre: '역사',      threshold: 3 },
  { id: 'self_dev',       emoji: '💼', name: '자기계발러',    desc: '자기계발 완독 3권',    type: 'genre', genre: '자기계발',  threshold: 3 },
  { id: 'essay_fan',      emoji: '✏️', name: '에세이 팬',    desc: '에세이 완독 3권',        type: 'genre', genre: '에세이',    threshold: 3 },
  // 장르 패턴 - 경제/경영 (8단계 진화)
  { id: 'econ_dreamer',    emoji: '📈', name: '재테크 꿈나무',  desc: '경제/경영 완독 3권',   type: 'genre', genre: '경제/경영', threshold: 3,  tier: 1 },
  { id: 'econ_sprout',     emoji: '🌱', name: '재테크 새싹',    desc: '경제/경영 완독 5권',   type: 'genre', genre: '경제/경영', threshold: 5,  tier: 2, prerequisite: 'econ_dreamer' },
  { id: 'econ_beginner',   emoji: '📊', name: '재테크 입문자',  desc: '경제/경영 완독 8권',   type: 'genre', genre: '경제/경영', threshold: 8,  tier: 3, prerequisite: 'econ_sprout' },
  { id: 'econ_researcher', emoji: '🔍', name: '재테크 연구원',  desc: '경제/경영 완독 12권',  type: 'genre', genre: '경제/경영', threshold: 12, tier: 4, prerequisite: 'econ_beginner' },
  { id: 'econ_investor',   emoji: '💹', name: '재테크 투자자',  desc: '경제/경영 완독 17권',  type: 'genre', genre: '경제/경영', threshold: 17, tier: 5, prerequisite: 'econ_researcher' },
  { id: 'econ_strategist', emoji: '♟️', name: '재테크 전략가',  desc: '경제/경영 완독 23권',  type: 'genre', genre: '경제/경영', threshold: 23, tier: 6, prerequisite: 'econ_investor' },
  { id: 'econ_planner',    emoji: '📐', name: '재테크 설계자',  desc: '경제/경영 완독 30권',  type: 'genre', genre: '경제/경영', threshold: 30, tier: 7, prerequisite: 'econ_strategist' },
  { id: 'econ_master',     emoji: '🏆', name: '자산관리 마스터', desc: '경제/경영 완독 40권', type: 'genre', genre: '경제/경영', threshold: 40, tier: 8, prerequisite: 'econ_planner' },
  { id: 'religion_seeker',emoji: '🙏', name: '신앙 탐구자',  desc: '종교 완독 3권',          type: 'genre', genre: '종교',      threshold: 3 },
  { id: 'genre_explorer', emoji: '🗺️', name: '장르 탐험가',  desc: '3가지 이상 장르 완독',   type: 'multi', threshold: 3 },
  // 활동 패턴 - 완독 수 (6단계 진화)
  { id: 'bookworm',        emoji: '🐛', name: '독서벌레',   desc: '완독 5권 이상',   type: 'activity', threshold: 5,   tier: 1 },
  { id: 'book_cocoon',     emoji: '🌱', name: '독서번데기', desc: '완독 10권 이상',  type: 'activity', threshold: 10,  tier: 2, prerequisite: 'bookworm' },
  { id: 'book_butterfly',  emoji: '🦋', name: '독서나비',   desc: '완독 20권 이상',  type: 'activity', threshold: 20,  tier: 3, prerequisite: 'book_cocoon' },
  { id: 'book_fairy',      emoji: '🧚', name: '독서요정',   desc: '완독 35권 이상',  type: 'activity', threshold: 35,  tier: 4, prerequisite: 'book_butterfly' },
  { id: 'book_king',       emoji: '👑', name: '독서왕',     desc: '완독 50권 이상',  type: 'activity', threshold: 50,  tier: 5, prerequisite: 'book_fairy' },
  { id: 'book_legend',     emoji: '🌟', name: '독서 전설',  desc: '완독 100권 이상', type: 'activity', threshold: 100, tier: 6, prerequisite: 'book_king' },
  // 활동 패턴 - 기타 (단일 등급)
  { id: 'memo_master',    emoji: '📝', name: '메모 달인',     desc: '메모 10개 이상 작성',  type: 'activity', threshold: 10 },
  { id: 'streak_king',    emoji: '🔥', name: '연속 독서왕',   desc: '연속 독서 7일 이상',   type: 'activity', threshold: 7 },
  { id: 'speed_reader',   emoji: '⚡', name: '챌린지 클리어러', desc: '챌린지 성공 3번 이상', type: 'activity', threshold: 3 },
  { id: 'steady_reader',  emoji: '🗓️', name: '꾸준한 독서가',  desc: '연령별 목표 달성 (어린이 15일+200p / 청소년 20일+350p / 성인 30일+500p)', type: 'activity', threshold: 30 },
];

function getTimeActivityCount(startHour, endHour) {
  const reviews = db.getAllSync('SELECT createdAt FROM book_reviews WHERE createdAt IS NOT NULL');
  const completions = db.getAllSync("SELECT endDate as ts FROM books WHERE status='completed' AND endDate IS NOT NULL");
  const all = [...reviews.map(r => r.createdAt), ...completions.map(c => c.ts)];
  return all.filter(ts => {
    const h = new Date(ts).getHours();
    return h >= startHour && h < endHour;
  }).length;
}

function getBadgeProgress(badge) {
  switch (badge.id) {
    case 'dawn_reader':    return { current: getTimeActivityCount(0, 5),   max: badge.threshold };
    case 'morning_reader': return { current: getTimeActivityCount(6, 9),   max: badge.threshold };
    case 'night_owl':      return { current: getTimeActivityCount(21, 24), max: badge.threshold };
    case 'genre_explorer': {
      const rows = db.getAllSync(
        "SELECT DISTINCT genre FROM books WHERE status='completed' AND genre IS NOT NULL AND genre != ''"
      );
      return { current: rows.length, max: badge.threshold };
    }
    case 'memo_master': {
      const c = db.getFirstSync('SELECT COUNT(*) as c FROM book_reviews')?.c ?? 0;
      return { current: c, max: badge.threshold };
    }
    case 'bookworm':
    case 'book_cocoon':
    case 'book_butterfly':
    case 'book_fairy':
    case 'book_king':
    case 'book_legend': {
      const c = db.getFirstSync("SELECT COUNT(*) as c FROM books WHERE status='completed'")?.c ?? 0;
      return { current: c, max: badge.threshold };
    }
    case 'streak_king': {
      const s = db.getFirstSync('SELECT readStreak FROM user_stats WHERE id=1')?.readStreak ?? 0;
      return { current: s, max: badge.threshold };
    }
    case 'speed_reader': {
      const rows = db.getAllSync(
        "SELECT endDate, goalDate FROM books WHERE status='completed' AND goalDate IS NOT NULL AND endDate IS NOT NULL"
      );
      const successes = rows.filter(b =>
        new Date(b.endDate).setHours(0, 0, 0, 0) <= new Date(b.goalDate).setHours(0, 0, 0, 0)
      ).length;
      return { current: successes, max: badge.threshold };
    }
    case 'steady_reader': {
      const age = db.getFirstSync('SELECT age FROM user_stats WHERE id=1')?.age ?? 0;
      // 연령별 조건: 어린이(~12): 15일+200p, 청소년(13~18): 20일+350p, 성인(19~): 30일+500p
      let dayGoal, pageGoal;
      if (age > 0 && age <= 12)       { dayGoal = 15; pageGoal = 200; }
      else if (age > 0 && age <= 18)  { dayGoal = 20; pageGoal = 350; }
      else                             { dayGoal = 30; pageGoal = 500; }
      const row = db.getFirstSync('SELECT MIN(startDate) as first FROM books WHERE startDate IS NOT NULL');
      if (!row?.first) return { current: 0, max: pageGoal };
      const totalPages = db.getFirstSync('SELECT SUM(currentPage) as total FROM books WHERE currentPage IS NOT NULL')?.total ?? 0;
      if (totalPages < pageGoal) return { current: Math.min(totalPages, pageGoal), max: pageGoal };
      const daysSince = Math.floor((Date.now() - row.first) / (1000 * 60 * 60 * 24));
      return { current: Math.min(daysSince, dayGoal), max: dayGoal };
    }
    default: {
      if (badge.type === 'genre' && badge.genre) {
        const c = db.getFirstSync(
          "SELECT COUNT(*) as c FROM books WHERE status='completed' AND genre=?",
          [badge.genre]
        )?.c ?? 0;
        return { current: c, max: badge.threshold };
      }
      return { current: 0, max: badge.threshold };
    }
  }
}

// "2026-W21" → "5월 3주차"
function weekKeyToLabel(weekKey) {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1) + (week - 1) * 7));
  const month = monday.getUTCMonth() + 1;
  const weekOfMonth = Math.ceil(monday.getUTCDate() / 7);
  return `${month}월 ${weekOfMonth}주차`;
}

// 해당 주 미션 3개 모두 완료 시 호출 — 이미 받았으면 null, 신규 획득 시 뱃지 객체 반환
export function checkAndUnlockWeeklyAllMissionsBadge(weekKey, missions) {
  const badgeId = `weekly_complete_${weekKey}`;
  const already = db.getFirstSync('SELECT id FROM user_badges WHERE badgeId = ?', [badgeId]);
  if (already) return null;

  const allClaimed = missions.every(m =>
    !!db.getFirstSync(
      'SELECT id FROM completed_missions WHERE missionId = ? AND weekKey = ?',
      [m.id, weekKey]
    )
  );
  if (!allClaimed) return null;

  try {
    db.runSync('INSERT INTO user_badges (badgeId, unlockedAt) VALUES (?, ?)', [badgeId, Date.now()]);
    const label = weekKeyToLabel(weekKey);
    return { id: badgeId, emoji: '🏆', name: `${label} 미션 왕`, desc: `${label} 주간 미션 3개를 모두 달성했습니다!`, type: 'weekly' };
  } catch (_) {
    return null;
  }
}

export function getWeeklyCompletionBadges() {
  const rows = db.getAllSync(
    "SELECT badgeId, unlockedAt FROM user_badges WHERE badgeId LIKE 'weekly_complete_%' ORDER BY unlockedAt DESC"
  );
  return rows.map(row => {
    const weekKey = row.badgeId.replace('weekly_complete_', '');
    const label = weekKeyToLabel(weekKey);
    return {
      id: row.badgeId,
      emoji: '🏆',
      name: `${label} 미션 왕`,
      desc: `${label} 주간 미션 3개를 모두 달성했습니다!`,
      type: 'weekly',
      unlocked: true,
      available: true,
      unlockedAt: row.unlockedAt,
      progress: { current: 1, max: 1 },
    };
  });
}

export function checkAndUnlockBadges() {
  const newlyUnlocked = [];
  const unlockedIds = new Set(
    db.getAllSync('SELECT badgeId FROM user_badges').map(r => r.badgeId)
  );
  for (const badge of BADGE_DEFS) {
    if (unlockedIds.has(badge.id)) continue;
    if (badge.prerequisite && !unlockedIds.has(badge.prerequisite)) continue;
    const { current, max } = getBadgeProgress(badge);
    if (current >= max) {
      try {
        db.runSync(
          'INSERT INTO user_badges (badgeId, unlockedAt) VALUES (?, ?)',
          [badge.id, Date.now()]
        );
        unlockedIds.add(badge.id);
        newlyUnlocked.push(badge);
      } catch (_) {}
    }
  }
  return newlyUnlocked;
}

export function getBadgesWithStatus() {
  const unlockedIds = new Set(
    db.getAllSync('SELECT badgeId FROM user_badges').map(r => r.badgeId)
  );
  const defsMap = Object.fromEntries(BADGE_DEFS.map(b => [b.id, b]));
  return BADGE_DEFS.map(badge => ({
    ...badge,
    unlocked: unlockedIds.has(badge.id),
    available: !unlockedIds.has(badge.id) && (!badge.prerequisite || unlockedIds.has(badge.prerequisite)),
    prerequisiteName: badge.prerequisite ? (defsMap[badge.prerequisite]?.name ?? null) : null,
    progress: getBadgeProgress(badge),
  }));
}
