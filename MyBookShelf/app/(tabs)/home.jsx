import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Alert, Modal } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getStats, getBooksByStatus, getUserStats, getUsername, getWeeklyProgress, isMissionClaimed, claimMissionReward, cancelMissionReward, getWeekKey, getSchoolLevel, getWeeklyDoubleXpEvent, getWeeklyMissions, getExtraMissions, getMissionProgress, getAge, getGuildThemeMissions, getUserId, getPet } from '../../database/database';
import { getUserGuilds, getUserThemeMissionStatus, submitThemeMission, getUnreadGuildNotices, markNoticeRead } from '../../database/guildDatabase';
import { setPendingLibraryStatus } from './_libraryFilter';
import { checkAndUnlockBadges, checkAndUnlockWeeklyAllMissionsBadge } from '../../database/badges';
import BookCard from '../../components/BookCard';
import PixelPet from '../../components/PixelPet';
import { COSMETIC_ITEMS } from '../../constants/petItems';

function buildEquipped(pet) {
  const find = (id) => COSMETIC_ITEMS.find(i => i.id === id) ?? null;
  return {
    hat:       find(pet?.equipped_hat),
    clothes:   find(pet?.equipped_clothes),
    accessory: find(pet?.equipped_accessory),
  };
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


function MissionItem({ mission, progress, claimed, themeStatus, onSubmit }) {
  const current = Math.min(getMissionProgress(mission, progress), mission.target);
  const pct = Math.min(100, Math.round((current / mission.target) * 100));
  const done = current >= mission.target;
  const isClaimed = claimed.includes(mission.id);

  const renderRightSlot = () => {
    if (onSubmit) {
      // 테마 미션: 승인 기반 상태 표시
      if (isClaimed) {
        return (
          <View style={[styles.missionXpTag, styles.missionXpTagDone]}>
            <Text style={[styles.missionXpText, styles.missionXpTextDone]}>✓ 수령</Text>
          </View>
        );
      }
      if (themeStatus === 'rejected') {
        return (
          <View style={[styles.missionXpTag, styles.missionStatusRejected]}>
            <Text style={[styles.missionXpText, styles.missionStatusRejectedText]}>거절됨</Text>
          </View>
        );
      }
      if (themeStatus === 'pending') {
        return (
          <View style={[styles.missionXpTag, styles.missionStatusPending]}>
            <Text style={[styles.missionXpText, styles.missionStatusPendingText]}>승인 대기</Text>
          </View>
        );
      }
      if (done) {
        return (
          <TouchableOpacity style={styles.submitBtn} onPress={onSubmit}>
            <Text style={styles.submitBtnText}>제출하기</Text>
          </TouchableOpacity>
        );
      }
      return (
        <View style={styles.missionXpTag}>
          <Text style={styles.missionXpText}>{`+${mission.xp} XP`}</Text>
        </View>
      );
    }
    // 일반 미션
    return (
      <View style={[styles.missionXpTag, done && styles.missionXpTagDone]}>
        <Text style={[styles.missionXpText, done && styles.missionXpTextDone]}>
          {isClaimed ? '✓ 수령' : `+${mission.xp} XP`}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.missionItem}>
      <Ionicons name={mission.icon} size={20} color={done ? '#4CAF50' : '#6750A4'} style={styles.missionIcon} />
      <View style={styles.missionInfo}>
        <Text style={[styles.missionLabel, done && styles.missionLabelDone]}>{mission.label}</Text>
        <View style={styles.missionBarBg}>
          <View style={[styles.missionBarFill, { width: `${pct}%` }, done && styles.missionBarFillDone]} />
        </View>
        <Text style={styles.missionProgressText}>{done ? '완료!' : `${current} / ${mission.target}`}</Text>
      </View>
      {renderRightSlot()}
    </View>
  );
}

function WeeklyMissionCard({ missions, progress, claimed, extraMissions, themeMissions, guildThemeLabel, themeStatus, onSubmitTheme }) {
  return (
    <View style={styles.missionCard}>
      <Text style={styles.missionTitle}>🎯 주간 미션</Text>
      {missions.map((mission) => (
        <MissionItem key={mission.id} mission={mission} progress={progress} claimed={claimed} />
      ))}
      {extraMissions && extraMissions.length > 0 && (
        <>
          <View style={styles.missionDivider} />
          <Text style={styles.missionExtraTitle}>⚡ 추가 미션</Text>
          {extraMissions.map((mission) => (
            <MissionItem key={mission.id} mission={mission} progress={progress} claimed={claimed} />
          ))}
        </>
      )}
      {themeMissions && themeMissions.length > 0 && (
        <>
          <View style={styles.missionDivider} />
          <Text style={styles.missionGuildTitle}>🏰 {guildThemeLabel} 테마 미션</Text>
          {themeMissions.map((mission) => (
            <MissionItem
              key={mission.id}
              mission={mission}
              progress={progress}
              claimed={claimed}
              themeStatus={themeStatus?.[mission.id] ?? null}
              onSubmit={onSubmitTheme ? () => onSubmitTheme(mission) : undefined}
            />
          ))}
        </>
      )}
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
  const [pet, setPetState] = useState(null);
  const [doubleXpEvent, setDoubleXpEvent] = useState(null);
  const [newBadges, setNewBadges] = useState([]);
  const [extraMissions, setExtraMissions] = useState([]);
  const [guildThemeMissions, setGuildThemeMissions] = useState([]);
  const [guildThemeLabel, setGuildThemeLabel] = useState('');
  const [guildThemeId, setGuildThemeId] = useState('');
  const [guildThemeStatus, setGuildThemeStatus] = useState({});
  const extraMissionsAcceptedRef = useRef(false);
  const lastWeekKeyRef = useRef('');
  const [weekTick, setWeekTick] = useState(0);
  const [noticeModal, setNoticeModal] = useState(null);
  const noticeCheckedRef = useRef(false);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // 앱이 열린 채로 주차가 바뀌면 미션 즉시 갱신
  useEffect(() => {
    const interval = setInterval(() => {
      const newKey = getWeekKey();
      if (lastWeekKeyRef.current && lastWeekKeyRef.current !== newKey) {
        extraMissionsAcceptedRef.current = false;
        setWeekTick(t => t + 1);
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (newBadges.length === 0) return;
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(toastAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setNewBadges([]));
  }, [newBadges]);

  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      setStats(getStats());
      setUsername(getUsername());
      setPetState(getPet());
      const age = getAge();
      const adultFilter = (b) => !(age > 0 && age < 19 && b.isAdult);
      setReadingBooks(getBooksByStatus('reading').filter(adultFilter).slice(0, 3));
      setWishlistBooks(getBooksByStatus('want_to_read').filter(adultFilter).slice(0, 3));
      setCompletedBooks(getBooksByStatus('completed').filter(adultFilter).slice(0, 3));

      const weekKey = getWeekKey();

      // 포커스 복귀 시 주차가 바뀌었으면 추가 미션 상태 초기화
      if (lastWeekKeyRef.current && lastWeekKeyRef.current !== weekKey) {
        extraMissionsAcceptedRef.current = false;
      }
      lastWeekKeyRef.current = weekKey;

      const missions = getWeeklyMissions(weekKey, age);
      setWeeklyMissions(missions);
      const progress = getWeeklyProgress();
      setWeeklyProgress(progress);
      const claimed = missions.filter((m) => isMissionClaimed(m.id, weekKey)).map((m) => m.id);

      // Strict: 이미 수령했으나 진행도가 목표 미달로 떨어진 미션 취소
      claimed.slice().forEach((id) => {
        const m = missions.find(x => x.id === id);
        if (!m) return;
        if (getMissionProgress(m, progress) < m.target) {
          cancelMissionReward(m.id, weekKey);
          claimed.splice(claimed.indexOf(id), 1);
        }
      });

      missions.forEach((m) => {
        const current = getMissionProgress(m, progress);
        if (current >= m.target && !claimed.includes(m.id)) {
          claimMissionReward(m.id, weekKey, m.xp);
          claimed.push(m.id);
        }
      });
      // Extra missions: 이전에 수락했거나 이미 클레임한 게 있으면 계속 표시
      const allExtra = getExtraMissions(missions, weekKey, age);
      const anyExtraClaimed = allExtra.some(m => isMissionClaimed(m.id, weekKey));
      if (anyExtraClaimed || extraMissionsAcceptedRef.current) {
        allExtra.forEach(m => {
          const cur = getMissionProgress(m, progress);
          // Strict: 추가 미션도 진행도 미달 시 취소
          if (isMissionClaimed(m.id, weekKey) && cur < m.target) {
            cancelMissionReward(m.id, weekKey);
          } else if (!isMissionClaimed(m.id, weekKey) && cur >= m.target) {
            claimMissionReward(m.id, weekKey, m.xp);
          }
          if (isMissionClaimed(m.id, weekKey)) claimed.push(m.id);
        });
        setExtraMissions(allExtra);
      } else {
        setExtraMissions([]);
      }

      setClaimedMissions([...claimed]);
      setUserStats(getUserStats());
      setSchoolLevel(getSchoolLevel());
      setDoubleXpEvent(getWeeklyDoubleXpEvent());

      // 길드 테마 미션 로드 + 미읽 공지 확인 (운영자 승인 후에만 XP 지급)
      (async () => {
        try {
          const userId = getUserId();
          if (!userId) return;
          const guilds = await getUserGuilds(userId);

          // 미읽 공지 확인 (세션당 1회)
          if (!noticeCheckedRef.current && guilds && guilds.length > 0) {
            noticeCheckedRef.current = true;
            try {
              const allUnread = (await Promise.all(
                guilds.map((g) => getUnreadGuildNotices(g.id, userId).catch(() => []))
              )).flat();
              allUnread.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
              if (allUnread.length > 0) {
                const first = allUnread[0];
                const guildName = guilds.find((g) => g.id === first.guildId)?.name || '길드';
                setNoticeModal({ ...first, guildName });
              }
            } catch (_) {}
          }

          if (!guilds || guilds.length === 0) {
            setGuildThemeMissions([]); setGuildThemeLabel(''); setGuildThemeId(''); return;
          }
          const guild = guilds[0];
          const keywords = guild.keywords || [];
          const themeMissions = getGuildThemeMissions(keywords, weekKey);
          if (themeMissions.length === 0) {
            setGuildThemeMissions([]); setGuildThemeLabel(''); setGuildThemeId(''); return;
          }
          const statusMap = await getUserThemeMissionStatus(
            guild.id, userId, weekKey, themeMissions.map(m => m.id)
          );
          // 운영자가 승인했고 아직 로컬에 수령 안 됐으면 XP 지급
          const newClaimed = [];
          themeMissions.forEach(m => {
            if (statusMap[m.id] === 'approved' && !isMissionClaimed(m.id, weekKey)) {
              claimMissionReward(m.id, weekKey, m.xp);
              newClaimed.push(m.id);
            }
          });
          setGuildThemeMissions(themeMissions);
          setGuildThemeLabel(guild.name || '길드');
          setGuildThemeId(guild.id);
          setGuildThemeStatus(statusMap);
          if (newClaimed.length > 0) {
            setClaimedMissions(prev => [...new Set([...prev, ...newClaimed])]);
            setUserStats(getUserStats());
          }
        } catch (_) {
          setGuildThemeMissions([]); setGuildThemeLabel(''); setGuildThemeId('');
        }
      })();

      const weeklyBadge = checkAndUnlockWeeklyAllMissionsBadge(weekKey, missions);
      const unlocked = checkAndUnlockBadges();
      if (unlocked.length > 0) setNewBadges(unlocked);

      if (weeklyBadge !== null) {
        Alert.alert(
          '🎉 주간 미션 완료!',
          '이번 주 미션을 모두 달성했어요! 🏆\n\n추가 미션에도 도전해볼까요?',
          [
            { text: '괜찮아요', style: 'cancel' },
            {
              text: '도전할게요!',
              onPress: () => {
                extraMissionsAcceptedRef.current = true;
                const extraClaimed = [];
                allExtra.forEach(m => {
                  const cur = getMissionProgress(m, progress);
                  if (cur >= m.target) {
                    claimMissionReward(m.id, weekKey, m.xp);
                    extraClaimed.push(m.id);
                  }
                });
                setExtraMissions(allExtra);
                if (extraClaimed.length > 0) {
                  setClaimedMissions(prev => [...new Set([...prev, ...extraClaimed])]);
                  setUserStats(getUserStats());
                }
              },
            },
          ]
        );
      }
    }, [weekTick])
  );

  const handleSubmitThemeMission = async (mission) => {
    const weekKey = getWeekKey();
    try {
      const userId = getUserId();
      const displayName = getUsername() || '독서가';
      await submitThemeMission(guildThemeId, userId, displayName, mission.id, mission.label, mission.xp, weekKey);
      setGuildThemeStatus(prev => ({ ...prev, [mission.id]: 'pending' }));
    } catch (e) {
      Alert.alert('오류', e.message || '제출에 실패했습니다.');
    }
  };

  return (
    <View style={styles.root}>
    <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/shop')} style={styles.avatarBtn}>
          <PixelPet
            petType={pet?.type}
            stats={{ hunger: pet?.hunger, happiness: pet?.happiness, cleanliness: pet?.cleanliness }}
            equipped={buildEquipped(pet)}
            bgTheme={pet?.room_theme || 'classic'}
            faceOnly
          />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.greeting}>안녕하세요 👋</Text>
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName}>{username}</Text>
            <View style={[styles.levelBadge, { borderColor: userStats.tierColor, backgroundColor: userStats.tierColor + '22' }]}>
              <MaterialCommunityIcons name="diamond" size={13} color={userStats.tierColor} />
              <Text style={[styles.levelText, { color: userStats.tierColor }]}> Lv.{userStats.tierLevel}</Text>
            </View>
          </View>
          <View style={styles.xpRow}>
            <View style={styles.xpBarBg}>
              <View style={[styles.xpBarFill, { width: `${Math.min(100, Math.round((userStats.xpInLevel / userStats.xpForNext) * 100))}%`, backgroundColor: userStats.tierColor }]} />
            </View>
            <Text style={styles.xpText}>{userStats.xpInLevel} / {userStats.xpForNext} XP</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile-edit')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={16} color="#9E9E9E" />
        </TouchableOpacity>
      </View>
	
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

      <WeeklyMissionCard missions={weeklyMissions} progress={weeklyProgress} claimed={claimedMissions} extraMissions={extraMissions} themeMissions={guildThemeMissions} guildThemeLabel={guildThemeLabel} themeStatus={guildThemeStatus} onSubmitTheme={handleSubmitThemeMission} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>읽는 중인 책</Text>
          {stats.reading > 3 && (
            <TouchableOpacity style={styles.moreBtn} onPress={() => { setPendingLibraryStatus('reading'); router.push('/(tabs)'); }}>
              <Text style={styles.moreBtnText}>더보기</Text>
            </TouchableOpacity>
          )}
        </View>
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
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>읽고 싶은 책</Text>
          {stats.want > 3 && (
            <TouchableOpacity style={styles.moreBtn} onPress={() => { setPendingLibraryStatus('want_to_read'); router.push('/(tabs)'); }}>
              <Text style={styles.moreBtnText}>더보기</Text>
            </TouchableOpacity>
          )}
        </View>
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
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>완독한 책</Text>
          {stats.completed > 3 && (
            <TouchableOpacity style={styles.moreBtn} onPress={() => { setPendingLibraryStatus('completed'); router.push('/(tabs)'); }}>
              <Text style={styles.moreBtnText}>더보기</Text>
            </TouchableOpacity>
          )}
        </View>
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
    </ScrollView>
    {newBadges.length > 0 && (
      <Animated.View style={[styles.badgeToast, {
        opacity: toastAnim,
        transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
      }]}>
        <Text style={styles.badgeToastTitle}>🏅 새 뱃지 획득!</Text>
        {newBadges.map(b => (
          <Text key={b.id} style={styles.badgeToastItem}>{b.emoji} {b.name}</Text>
        ))}
      </Animated.View>
    )}
    <Modal visible={!!noticeModal} transparent animationType="fade">
      <View style={styles.noticeOverlay}>
        <View style={styles.noticeModalBox}>
          <View style={styles.noticeModalHeader}>
            <Ionicons name="megaphone-outline" size={18} color="#6750A4" />
            <Text style={styles.noticeModalLabel}>
              {noticeModal?.guildName ? `${noticeModal.guildName} 공지` : '길드 공지'}
            </Text>
          </View>
          <Text style={styles.noticeModalTitle}>{noticeModal?.title}</Text>
          <Text style={styles.noticeModalContent}>{noticeModal?.content}</Text>
          <TouchableOpacity
            style={styles.noticeModalBtn}
            onPress={async () => {
              if (noticeModal?.id) {
                try { await markNoticeRead(noticeModal.guildId, noticeModal.id, getUserId()); } catch (_) {}
              }
              setNoticeModal(null);
            }}
          >
            <Text style={styles.noticeModalBtnText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  avatarBtn: {
    width: 60,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petMiniEmoji: {
    fontSize: 48,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  greeting: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1B1F',
  },
  profileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1B1F',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '700',
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B1F',
  },
  moreBtn: {
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  moreBtnText: {
    fontSize: 12,
    color: '#6750A4',
    fontWeight: '600',
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
  missionDivider: {
    height: 1,
    backgroundColor: '#EDE7F6',
    marginVertical: 12,
  },
  missionExtraTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6750A4',
    marginBottom: 10,
  },
  missionGuildTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7B5FA5',
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  submitBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  missionStatusPending: {
    backgroundColor: '#FFF3E0',
  },
  missionStatusPendingText: {
    color: '#E65100',
  },
  missionStatusRejected: {
    backgroundColor: '#FEEBEE',
  },
  missionStatusRejectedText: {
    color: '#E57373',
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
  badgeToast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#6750A4',
    borderRadius: 16,
    padding: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  badgeToastTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  badgeToastItem: {
    fontSize: 13,
    color: '#EDE7F6',
    fontWeight: '600',
    marginTop: 2,
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
  noticeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,15,35,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  noticeModalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    elevation: 8,
    shadowColor: '#4A3870',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  noticeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  noticeModalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6750A4',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  noticeModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2D2440',
    marginBottom: 10,
    lineHeight: 24,
  },
  noticeModalContent: {
    fontSize: 14,
    color: '#5F5870',
    lineHeight: 22,
    marginBottom: 20,
  },
  noticeModalBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#6750A4',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  noticeModalBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
