import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getStats, getBooksByStatus, getUserStats, getUsername, getWeeklyProgress, isMissionClaimed, claimMissionReward, getWeekKey, getSchoolLevel, getWeeklyDoubleXpEvent } from '../../database/database';
import { getBadgesWithStatus } from '../../database/badges';
import BookCard from '../../components/BookCard';

const MISSION_POOL = [
  { id: 'complete_1', label: '책 1권 완독하기', icon: 'trophy-outline', type: 'complete', target: 1, xp: 80 },
  { id: 'complete_2', label: '책 2권 완독하기', icon: 'trophy-outline', type: 'complete', target: 2, xp: 160 },
  { id: 'memo_3', label: '메모 3개 작성하기', icon: 'create-outline', type: 'memo', target: 3, xp: 50 },
  { id: 'memo_5', label: '메모 5개 작성하기', icon: 'create-outline', type: 'memo', target: 5, xp: 80 },
  { id: 'add_1', label: '새 책 1권 추가하기', icon: 'add-circle-outline', type: 'add', target: 1, xp: 30 },
  { id: 'add_2', label: '새 책 2권 추가하기', icon: 'add-circle-outline', type: 'add', target: 2, xp: 60 },
  { id: 'streak_3', label: '3일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 3, xp: 60 },
  { id: 'streak_5', label: '5일 연속 독서하기', icon: 'flame-outline', type: 'streak', target: 5, xp: 100 },
];

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

function getWeeklyMissions() {
  const key = getWeekKey();
  const seed = parseInt(key.replace('-W', ''), 10);
  return seededShuffle(MISSION_POOL, seed).slice(0, 3);
}

const ENCOURAGEMENT = {
  '초등': [
    '📚 책 읽기는 상상력의 날개를 달아줘요!',
    '🌟 오늘도 새로운 세계로 떠나볼까요?',
    '🐣 책 한 장 한 장이 나를 성장시켜요!',
    '🌈 매일 조금씩 읽으면 세상이 넓어져요!',
    '💫 독서는 가장 재미있는 모험이에요!',
  ],
  '중학': [
    '📖 꾸준한 독서가 실력의 차이를 만들어요',
    '🔥 오늘의 독서가 내일의 나를 만든다',
    '💪 책을 읽을수록 생각이 깊어져요',
    '⚡ 10분 독서로 하루를 시작해보세요',
    '🎯 목표를 가지고 읽으면 더 많이 얻어요',
  ],
  '고등': [
    '🏆 독서는 최강의 자기 개발 전략입니다',
    '📊 오늘 1페이지가 내일의 경쟁력이 됩니다',
    '🚀 지금의 집중이 미래를 바꿉니다',
    '⭐ 상위권의 공통점? 꾸준한 독서입니다',
    '💡 읽는 만큼 성장하고, 성장한 만큼 앞서갑니다',
  ],
  '성인': [
    '📚 독서는 평생의 가장 좋은 투자입니다',
    '🌿 책 한 권이 인생의 방향을 바꿀 수 있습니다',
    '✨ 성장에는 나이가 없습니다. 오늘도 한 페이지',
    '🧠 독서는 뇌를 젊게 유지하는 최고의 방법',
    '💼 지식은 쌓일수록 빛이 납니다',
  ],
};

function getDailyMessage(level) {
  const pool = ENCOURAGEMENT[level];
  if (!pool) return null;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return pool[dayOfYear % pool.length];
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function DoubleXpBanner({ event }) {
  if (!event) return null;
  const now = Date.now();
  const { startTs, endTs } = event;

  const startDate = new Date(startTs);
  const endHour = new Date(endTs).getHours();
  const dayLabel = DAY_LABELS[startDate.getDay() === 0 ? 6 : startDate.getDay() - 1];
  const startHour = startDate.getHours();
  const timeLabel = `${startHour}:00 ~ ${endHour}:00`;

  if (now > endTs) {
    return (
      <View style={styles.doubleXpBannerEnded}>
        <Text style={styles.doubleXpEndedTitle}>이번 주 경험치 2배 이벤트 종료</Text>
        <Text style={styles.doubleXpEndedSub}>{dayLabel}요일 {timeLabel} · 다음 주 이벤트를 기대해 주세요!</Text>
      </View>
    );
  }

  const isActive = now >= startTs;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const eventDayStart = new Date(startTs).setHours(0, 0, 0, 0);
  const isToday = todayStart === eventDayStart;

  if (isActive) {
    return (
      <View style={styles.doubleXpBannerActive}>
        <Text style={styles.doubleXpActiveBadge}>LIVE</Text>
        <View style={styles.doubleXpBannerBody}>
          <Text style={styles.doubleXpActiveTitle}>⚡ 경험치 2배 이벤트 진행 중!</Text>
          <Text style={styles.doubleXpActiveSub}>지금 독서 기록 시 경험치 2배 ({endHour}:00까지)</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.doubleXpBanner}>
      <Text style={styles.doubleXpBannerTitle}>
        {isToday ? '⚡ 오늘 경험치 2배 이벤트 예정' : `📅 이번 주 경험치 2배 이벤트`}
      </Text>
      <Text style={styles.doubleXpBannerSub}>
        {isToday ? timeLabel : `${dayLabel}요일 ${timeLabel}`} 독서 기록 시 경험치 2배!
      </Text>
    </View>
  );
}

function EncouragementBanner({ level }) {
  const msg = getDailyMessage(level);
  if (!msg) return null;
  return (
    <View style={styles.encourageCard}>
      <Text style={styles.encourageText}>{msg}</Text>
    </View>
  );
}

function getMissionProgress(mission, progress) {
  if (mission.type === 'complete') return progress.completed;
  if (mission.type === 'memo') return progress.memos;
  if (mission.type === 'add') return progress.added;
  if (mission.type === 'streak') return progress.streak;
  return 0;
}

function WeeklyMissionCard({ missions, progress, claimed }) {
  return (
    <View style={styles.missionCard}>
      <Text style={styles.missionTitle}>🎯 주간 미션</Text>
      {missions.map((mission) => {
        const current = Math.min(getMissionProgress(mission, progress), mission.target);
        const pct = Math.min(100, Math.round((current / mission.target) * 100));
        const done = current >= mission.target;
        const isClaimed = claimed.includes(mission.id);
        return (
          <View key={mission.id} style={styles.missionItem}>
            <Ionicons name={mission.icon} size={20} color={done ? '#4CAF50' : '#6750A4'} style={styles.missionIcon} />
            <View style={styles.missionInfo}>
              <Text style={[styles.missionLabel, done && styles.missionLabelDone]}>{mission.label}</Text>
              <View style={styles.missionBarBg}>
                <View style={[styles.missionBarFill, { width: `${pct}%` }, done && styles.missionBarFillDone]} />
              </View>
              <Text style={styles.missionProgressText}>{done ? '완료!' : `${current} / ${mission.target}`}</Text>
            </View>
            <View style={[styles.missionXpTag, done && styles.missionXpTagDone]}>
              <Text style={[styles.missionXpText, done && styles.missionXpTextDone]}>
                {isClaimed ? '✓ 수령' : `+${mission.xp} XP`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BadgeCard({ badge }) {
  const pct = Math.min(100, Math.round((badge.progress.current / badge.progress.max) * 100));
  return (
    <View style={[styles.badgeCard, badge.unlocked && styles.badgeCardUnlocked]}>
      <Text style={[styles.badgeEmoji, !badge.unlocked && styles.badgeEmojiLocked]}>{badge.emoji}</Text>
      <Text style={[styles.badgeName, !badge.unlocked && styles.badgeNameLocked]}>{badge.name}</Text>
      <Text style={styles.badgeDesc}>{badge.desc}</Text>
      <View style={styles.badgeBarBg}>
        <View style={[styles.badgeBarFill, { width: `${pct}%` }, badge.unlocked && styles.badgeBarFillDone]} />
      </View>
      <Text style={styles.badgeProgressText}>
        {badge.unlocked ? '✓ 달성!' : `${badge.progress.current} / ${badge.progress.max}`}
      </Text>
    </View>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const scrollViewRef = useRef(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, reading: 0, want: 0 });
  const [userStats, setUserStats] = useState({ xp: 0, level: 1, xpInLevel: 0, xpForNext: 50 });
  const [username, setUsername] = useState('');
  const [readingBooks, setReadingBooks] = useState([]);
  const [wishlistBooks, setWishlistBooks] = useState([]);
  const [completedBooks, setCompletedBooks] = useState([]);
  const [weeklyMissions, setWeeklyMissions] = useState([]);
  const [weeklyProgress, setWeeklyProgress] = useState({ completed: 0, memos: 0, added: 0, streak: 0 });
  const [claimedMissions, setClaimedMissions] = useState([]);
  const [schoolLevel, setSchoolLevel] = useState('');
  const [doubleXpEvent, setDoubleXpEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [badges, setBadges] = useState([]);

  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      setStats(getStats());
      setUsername(getUsername());
      setReadingBooks(getBooksByStatus('reading').slice(0, 3));
      setWishlistBooks(getBooksByStatus('want_to_read').slice(0, 3));
      setCompletedBooks(getBooksByStatus('completed').slice(0, 3));

      const missions = getWeeklyMissions();
      setWeeklyMissions(missions);
      const progress = getWeeklyProgress();
      setWeeklyProgress(progress);
      const weekKey = getWeekKey();
      const claimed = missions.filter((m) => isMissionClaimed(m.id, weekKey)).map((m) => m.id);
      missions.forEach((m) => {
        const current = getMissionProgress(m, progress);
        if (current >= m.target && !claimed.includes(m.id)) {
          claimMissionReward(m.id, weekKey, m.xp);
          claimed.push(m.id);
        }
      });
      setClaimedMissions([...claimed]);

      setUserStats(getUserStats());
      setSchoolLevel(getSchoolLevel());
      setDoubleXpEvent(getWeeklyDoubleXpEvent());
      setBadges(getBadgesWithStatus());
    }, [])
  );

  return (
    <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>안녕하세요 👋</Text>
          <Text style={styles.subtitle}>오늘도 독서를 즐겨보세요</Text>
        </View>
        <View style={styles.profileBox}>
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName}>{username}</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Lv.{userStats.level}</Text>
            </View>
          </View>
          <View style={styles.xpRow}>
            <View style={styles.xpBarBg}>
              <View style={[styles.xpBarFill, { width: `${Math.min(100, Math.round((userStats.xpInLevel / userStats.xpForNext) * 100))}%` }]} />
            </View>
            <Text style={styles.xpText}>{userStats.xpInLevel} / {userStats.xpForNext} XP</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile-edit')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={16} color="#9E9E9E" />
        </TouchableOpacity>
      </View>
	
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'home' && styles.tabBtnActive]}
          onPress={() => setActiveTab('home')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'home' && styles.tabBtnTextActive]}>홈</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'badge' && styles.tabBtnActive]}
          onPress={() => setActiveTab('badge')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'badge' && styles.tabBtnTextActive]}>뱃지</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'home' ? (
        <>
          <DoubleXpBanner event={doubleXpEvent} />
          <EncouragementBanner level={schoolLevel} />
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-book')}>
            <Ionicons name="add-circle-outline" size={10} color="#fff" />
            <Text style={styles.addButtonText}>책 추가하기</Text>
          </TouchableOpacity>

          <View style={styles.statsRow}>
            <StatCard icon="book-outline" label="전체" value={stats.total} color="#6750A4" />
            <StatCard icon="checkmark-circle-outline" label="완독" value={stats.completed} color="#4CAF50" />
            <StatCard icon="reader-outline" label="읽는 중" value={stats.reading} color="#2196F3" />
            <StatCard icon="bookmark-outline" label="읽고 싶음" value={stats.want} color="#FF9800" />
          </View>

          <WeeklyMissionCard missions={weeklyMissions} progress={weeklyProgress} claimed={claimedMissions} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>읽는 중인 책</Text>
            {readingBooks.length > 0 ? (
              readingBooks.map((book) => (
                <BookCard key={book.id} book={book} onPress={() => router.push(`/book/${book.id}`)} />
              ))
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="book-outline" size={36} color="#C4C4C4" />
                <Text style={styles.emptyText}>읽는 중인 책이 없습니다</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>읽고 싶은 책</Text>
            {wishlistBooks.length > 0 ? (
              wishlistBooks.map((book) => (
                <BookCard key={book.id} book={book} onPress={() => router.push(`/book/${book.id}`)} />
              ))
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="bookmark-outline" size={36} color="#C4C4C4" />
                <Text style={styles.emptyText}>위시리스트가 비어 있습니다</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>완독한 책</Text>
            {completedBooks.length > 0 ? (
              completedBooks.map((book) => (
                <BookCard key={book.id} book={book} onPress={() => router.push(`/book/${book.id}`)} />
              ))
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle-outline" size={36} color="#C4C4C4" />
                <Text style={styles.emptyText}>완독한 책이 없습니다</Text>
              </View>
            )}
          </View>
        </>
      ) : (
        <View style={styles.badgeSection}>
          <Text style={styles.sectionTitle}>
            🏅 나의 뱃지 ({badges.filter(b => b.unlocked).length}/{badges.length})
          </Text>
          <View style={styles.badgeGrid}>
            {badges.map((badge) => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1B1F',
  },
  subtitle: {
    fontSize: 14,
    color: '#49454F',
    marginTop: 4,
  },
  profileBox: {
    gap: 4,
    width: 130,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1B1F',
  },
  levelBadge: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsBtn: {
    padding: 4,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  xpText: {
    fontSize: 11,
    color: '#9E8FB2',
    fontWeight: '600',
  },
  xpBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#E8DEF8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#49454F',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 12,
  },
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  missionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  missionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 12,
  },
  missionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  missionIcon: {
    marginRight: 10,
  },
  missionInfo: {
    flex: 1,
  },
  missionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 4,
  },
  missionLabelDone: {
    color: '#4CAF50',
  },
  missionBarBg: {
    height: 4,
    backgroundColor: '#E8DEF8',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 2,
  },
  missionBarFill: {
    height: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 2,
  },
  missionBarFillDone: {
    backgroundColor: '#4CAF50',
  },
  missionProgressText: {
    fontSize: 10,
    color: '#9E9E9E',
  },
  missionXpTag: {
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  missionXpTagDone: {
    backgroundColor: '#E8F5E9',
  },
  missionXpText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6750A4',
  },
  missionXpTextDone: {
    color: '#4CAF50',
  },
  doubleXpBannerActive: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  doubleXpActiveBadge: {
    backgroundColor: '#fff',
    color: '#E65100',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  doubleXpBannerBody: {
    flex: 1,
  },
  doubleXpActiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  doubleXpActiveSub: {
    fontSize: 12,
    color: '#FFCCBC',
    marginTop: 2,
  },
  doubleXpBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  doubleXpBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E65100',
  },
  doubleXpBannerSub: {
    fontSize: 12,
    color: '#F57F17',
    marginTop: 2,
  },
  doubleXpBannerEnded: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#BDBDBD',
  },
  doubleXpEndedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#757575',
  },
  doubleXpEndedSub: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 2,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#EDE7F6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#6750A4',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6750A4',
  },
  tabBtnTextActive: {
    color: '#fff',
  },
  badgeSection: {
    marginBottom: 24,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  badgeCardUnlocked: {
    borderColor: '#6750A4',
    backgroundColor: '#F3EFFE',
  },
  badgeEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  badgeEmojiLocked: {
    opacity: 0.35,
  },
  badgeName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1B1F',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: '#9E9E9E',
  },
  badgeDesc: {
    fontSize: 11,
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 15,
  },
  badgeBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  badgeBarFill: {
    height: '100%',
    backgroundColor: '#9E9E9E',
    borderRadius: 2,
  },
  badgeBarFillDone: {
    backgroundColor: '#6750A4',
  },
  badgeProgressText: {
    fontSize: 10,
    color: '#9E9E9E',
    fontWeight: '600',
  },
  encourageCard: {
    backgroundColor: '#EDE7F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#6750A4',
  },
  encourageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A3880',
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
