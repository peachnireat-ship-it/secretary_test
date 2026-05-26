import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput, Switch,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getUserId, getUsername, leaveGuild, getWeekKey,
} from '../../database/database';
import {
  getGuildInfo, getGuildWeeklyScores, getGuildRankings,
  syncWeeklyScore, removeMemberFromGuild, getUserGuilds,
  getGuildPosts, createGuildPost, deleteGuildPost, updateGuildInfo,
  getGuildThemeMissionSubmissions, reviewThemeMission,
  getGuildReading, setGuildReading, endGuildReading,
  getGuildMembers, appointDeputy, revokeDeputy,
} from '../../database/guildDatabase';
import { isFirebaseReady } from '../../database/firebaseConfig';

const MEDALS = ['🥇', '🥈', '🥉'];
const SEGMENT_TABS = ['주간 목표', '멤버 순위', '길드 대항전', '게시판', '함께 읽기'];

function formatPostDate(createdAt) {
  if (!createdAt) return '';
  const date = createdAt.toDate ? createdAt.toDate() : new Date((createdAt.seconds || 0) * 1000);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function GuildScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState('list');  // 'list' | 'detail'
  const [myGuilds, setMyGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [guild, setGuild] = useState(null);
  const [memberScores, setMemberScores] = useState([]);
  const [guildRankings, setGuildRankings] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [posts, setPosts] = useState([]);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postLoaded, setPostLoaded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editWeeklyGoal, setEditWeeklyGoal] = useState('5');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editKeywords, setEditKeywords] = useState([]);
  const [editKeywordInput, setEditKeywordInput] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [themeMissionSubs, setThemeMissionSubs] = useState([]);
  const [guildReading, setGuildReading] = useState(null);
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [readingTitle, setReadingTitle] = useState('');
  const [readingAuthor, setReadingAuthor] = useState('');
  const [readingIsAdult, setReadingIsAdult] = useState(false);
  const [readingStartDate, setReadingStartDate] = useState('');
  const [readingEndDate, setReadingEndDate] = useState('');
  const [readingSaving, setReadingSaving] = useState(false);
  const [readingLoaded, setReadingLoaded] = useState(false);
  const [members, setMembers] = useState([]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const load = async () => {
    setLoading(true);
    setLoadError('');
    setViewMode('list');

    if (!isFirebaseReady()) {
      setLoading(false);
      return;
    }

    try {
      const userId = getUserId();
      const guilds = await getUserGuilds(userId);
      setMyGuilds(guilds);
    } catch (e) {
      setLoadError(e.message || '길드 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadGuildDetail = async (guildId) => {
    setLoading(true);
    setLoadError('');
    setSelectedGuildId(guildId);
    setActiveTab(0);

    try {
      const userId = getUserId();
      const displayName = getUsername() || '독서가';

      setSyncing(true);
      await syncWeeklyScore(guildId, userId, displayName);
      setSyncing(false);

      const [info, scores, rankings, memberList] = await Promise.all([
        getGuildInfo(guildId),
        getGuildWeeklyScores(guildId),
        getGuildRankings(),
        getGuildMembers(guildId),
      ]);

      setGuild(info);
      setMemberScores(scores);
      setGuildRankings(rankings);
      setMembers(memberList);

      // 운영자/부운영자인 경우 테마 미션 제출 목록 로드
      const myMemberData = memberList.find(m => m.userId === getUserId());
      if (info?.creatorId === getUserId() || myMemberData?.isDeputy) {
        try {
          const subs = await getGuildThemeMissionSubmissions(guildId, getWeekKey());
          setThemeMissionSubs(subs);
        } catch (_) {}
      }

      setViewMode('detail');
    } catch (e) {
      setLoadError(e.message || '길드 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedGuildId('');
    setGuild(null);
    setLoadError('');
    setPosts([]);
    setPostLoaded(false);
    setExpandedPostId(null);
    setGuildReading(null);
    setReadingLoaded(false);
    setMembers([]);
  };

  const loadPosts = async (guildId) => {
    setPostLoading(true);
    try {
      const data = await getGuildPosts(guildId);
      setPosts(data);
      setPostLoaded(true);
    } catch (e) {
      Alert.alert('오류', e.message || '게시글을 불러오지 못했습니다.');
    } finally {
      setPostLoading(false);
    }
  };

  const loadReading = async (guildId) => {
    try {
      const data = await getGuildReading(guildId);
      setGuildReading(data);
      setReadingLoaded(true);
    } catch (_) {}
  };

  const handleTabChange = (i) => {
    setActiveTab(i);
    if (i === 3 && !postLoaded && !postLoading) {
      loadPosts(selectedGuildId);
    }
    if (i === 4 && !readingLoaded) {
      loadReading(selectedGuildId);
    }
  };

  const handleDeletePost = (postId) => {
    Alert.alert('삭제', '이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGuildPost(postId);
            setPosts((prev) => prev.filter((p) => p.id !== postId));
          } catch (e) {
            Alert.alert('오류', e.message || '삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleSubmitPost = async () => {
    if (!newTitle.trim()) { Alert.alert('알림', '제목을 입력해주세요.'); return; }
    if (!newContent.trim()) { Alert.alert('알림', '내용을 입력해주세요.'); return; }
    try {
      const userId = getUserId();
      const displayName = getUsername() || '독서가';
      await createGuildPost(selectedGuildId, userId, displayName, newTitle, newContent);
      setShowWriteForm(false);
      setNewTitle('');
      setNewContent('');
      await loadPosts(selectedGuildId);
    } catch (e) {
      Alert.alert('오류', e.message || '게시글 등록에 실패했습니다.');
    }
  };

  const openEditModal = () => {
    setEditName(guild?.name || '');
    setEditWeeklyGoal(String(guild?.weeklyGoal || 5));
    setEditIsPublic(guild?.isPublic ?? true);
    setEditKeywords(guild?.keywords || []);
    setEditKeywordInput('');
    setShowEditModal(true);
  };

  const addEditKeyword = () => {
    const kw = editKeywordInput.trim();
    if (!kw) return;
    if (kw.length > 10) { Alert.alert('알림', '키워드는 10자 이내로 입력해주세요.'); return; }
    if (editKeywords.length >= 5) { Alert.alert('알림', '키워드는 최대 5개까지 추가할 수 있습니다.'); return; }
    if (editKeywords.includes(kw)) { setEditKeywordInput(''); return; }
    setEditKeywords([...editKeywords, kw]);
    setEditKeywordInput('');
  };

  const removeEditKeyword = (kw) => setEditKeywords(editKeywords.filter((k) => k !== kw));

  const handleSaveGuildInfo = async () => {
    if (!editName.trim()) { Alert.alert('알림', '길드 이름을 입력해주세요.'); return; }
    if (editName.trim().length > 20) { Alert.alert('알림', '길드 이름은 20자 이내로 입력해주세요.'); return; }
    setEditSaving(true);
    try {
      await updateGuildInfo(selectedGuildId, {
        name: editName.trim(),
        weeklyGoal: parseInt(editWeeklyGoal) || 5,
        isPublic: editIsPublic,
        keywords: editKeywords,
      });
      setGuild((prev) => ({
        ...prev,
        name: editName.trim(),
        weeklyGoal: parseInt(editWeeklyGoal) || 5,
        isPublic: editIsPublic,
        keywords: editKeywords,
      }));
      setShowEditModal(false);
    } catch (e) {
      Alert.alert('오류', e.message || '수정에 실패했습니다.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('길드 탈퇴', '정말 이 길드를 탈퇴하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '탈퇴',
        style: 'destructive',
        onPress: async () => {
          try {
            const userId = getUserId();
            await removeMemberFromGuild(selectedGuildId, userId);
            leaveGuild();
            setMyGuilds((prev) => prev.filter((g) => g.id !== selectedGuildId));
            handleBack();
          } catch (e) {
            Alert.alert('오류', e.message || '탈퇴에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const openReadingModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    setReadingTitle(guildReading?.status === 'active' ? guildReading.bookTitle : '');
    setReadingAuthor(guildReading?.status === 'active' ? guildReading.bookAuthor : '');
    setReadingIsAdult(guildReading?.status === 'active' ? guildReading.isAdult : false);
    setReadingStartDate(guildReading?.status === 'active' ? guildReading.startDate : today);
    setReadingEndDate(guildReading?.status === 'active' ? guildReading.endDate : nextMonth);
    setShowReadingModal(true);
  };

  const handleSetReading = async () => {
    if (!readingTitle.trim()) { Alert.alert('알림', '책 제목을 입력해주세요.'); return; }
    if (!readingStartDate.trim() || !readingEndDate.trim()) {
      Alert.alert('알림', '시작일과 종료일을 입력해주세요.'); return;
    }
    setReadingSaving(true);
    try {
      const userId = getUserId();
      await setGuildReading(
        selectedGuildId,
        { bookTitle: readingTitle, bookAuthor: readingAuthor, isAdult: readingIsAdult, startDate: readingStartDate, endDate: readingEndDate },
        userId,
      );
      const updated = await getGuildReading(selectedGuildId);
      setGuildReading(updated);
      setShowReadingModal(false);
    } catch (e) {
      Alert.alert('오류', e.message || '도서 선정에 실패했습니다.');
    } finally {
      setReadingSaving(false);
    }
  };

  const handleEndReading = () => {
    Alert.alert('함께 읽기 종료', '현재 선정된 도서를 종료하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '종료',
        style: 'destructive',
        onPress: async () => {
          try {
            await endGuildReading(selectedGuildId);
            setGuildReading((prev) => ({ ...prev, status: 'ended' }));
          } catch (e) {
            Alert.alert('오류', e.message || '종료에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleReviewMission = (docId, status, displayName, missionLabel) => {
    const actionLabel = status === 'approved' ? '승인' : '거절';
    Alert.alert(
      `미션 ${actionLabel}`,
      `${displayName}님의\n'${missionLabel}'\n을(를) ${actionLabel}하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: actionLabel,
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await reviewThemeMission(docId, status);
              setThemeMissionSubs(prev => prev.map(s => s.id === docId ? { ...s, status } : s));
            } catch (e) {
              Alert.alert('오류', e.message || '처리에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleMemberAction = (member) => {
    const isDeputy = member.isDeputy;
    Alert.alert(
      member.displayName,
      '멤버 관리',
      [
        {
          text: isDeputy ? '부운영자 해제' : '부운영자로 임명',
          onPress: () => isDeputy ? handleRevokeDeputy(member.userId) : handleAppointDeputy(member.userId),
        },
        {
          text: '길드에서 해고',
          style: 'destructive',
          onPress: () => handleKickMember(member.userId, member.displayName),
        },
        { text: '취소', style: 'cancel' },
      ],
    );
  };

  const handleAppointDeputy = async (userId) => {
    try {
      await appointDeputy(selectedGuildId, userId);
      setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, isDeputy: true } : m));
    } catch (e) {
      Alert.alert('오류', e.message || '임명에 실패했습니다.');
    }
  };

  const handleRevokeDeputy = async (userId) => {
    try {
      await revokeDeputy(selectedGuildId, userId);
      setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, isDeputy: false } : m));
    } catch (e) {
      Alert.alert('오류', e.message || '해제에 실패했습니다.');
    }
  };

  const handleKickMember = (userId, displayName) => {
    Alert.alert(
      '멤버 해고',
      `${displayName}님을 길드에서 내보내시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해고',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMemberFromGuild(selectedGuildId, userId);
              setMembers((prev) => prev.filter((m) => m.userId !== userId));
              setMemberScores((prev) => prev.filter((m) => m.userId !== userId));
              setGuild((prev) => ({ ...prev, memberCount: Math.max(0, (prev?.memberCount || 1) - 1) }));
            } catch (e) {
              Alert.alert('오류', e.message || '해고에 실패했습니다.');
            }
          },
        },
      ],
    );
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(guild?.inviteCode || '');
    Alert.alert('복사 완료', '초대 코드가 클립보드에 복사되었습니다.');
  };

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#6750A4" />
        {syncing && <Text style={styles.syncText}>점수 동기화 중...</Text>}
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centerBox}>
        <Ionicons name="warning-outline" size={40} color="#E65100" />
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={viewMode === 'detail' ? () => loadGuildDetail(selectedGuildId) : load}
        >
          <Ionicons name="refresh-outline" size={16} color="#6750A4" />
          <Text style={styles.refreshText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 길드 목록 화면 ───────────────────────────────────────────────

  if (viewMode === 'list') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.listContainer}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderIcon}>
            <Ionicons name="shield-half-outline" size={22} color="#6750A4" />
          </View>
          <View>
            <Text style={styles.listTitle}>독서 길드</Text>
            <Text style={styles.listSubtitle}>길드원과 함께 독서 목표를 달성하세요</Text>
          </View>
        </View>

        {!isFirebaseReady() && (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={15} color="#B45309" />
            <Text style={styles.warnText}>
              서버에 연결할 수 없습니다.{'\n'}
              네트워크 상태를 확인해주세요.
            </Text>
          </View>
        )}

        <View style={styles.xpBanner}>
          <View style={styles.xpBannerIcon}>
            <Ionicons name="flash" size={18} color="#7C3AED" />
          </View>
          <View style={styles.xpBannerBody}>
            <Text style={styles.xpBannerTitle}>길드 활동으로 개인 XP 획득!</Text>
            <Text style={styles.xpBannerDesc}>
              길드 기여 점수가 오를 때마다 개인 경험치를 받아요.{'\n'}
              <Text style={styles.xpBannerHighlight}>기여 점수 10점 → 1 XP</Text>
              {'  ·  XP 2배 이벤트도 적용돼요'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>길드 찾기</Text>

        {!myGuilds.some((g) => g.creatorId === getUserId()) && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/guild-create')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>길드 만들기</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary, styles.actionBtnHalf]}
            onPress={() => router.push('/guild-join')}
            activeOpacity={0.75}
          >
            <Ionicons name="key-outline" size={16} color="#6750A4" />
            <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary, styles.actionBtnTextSm]}>
              초대 코드로 참여
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnHalf]}
            onPress={() => router.push({ pathname: '/guild-join', params: { tab: 'search' } })}
            activeOpacity={0.75}
          >
            <Ionicons name="search-outline" size={16} color="#fff" />
            <Text style={[styles.actionBtnText, styles.actionBtnTextSm]}>
              공개 길드 둘러보기
            </Text>
          </TouchableOpacity>
        </View>

        {myGuilds.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>가입한 길드</Text>
            {myGuilds.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.guildCard}
                onPress={() => loadGuildDetail(g.id)}
                activeOpacity={0.75}
              >
                <View style={styles.guildCardAccent} />
                <View style={styles.guildCardInfo}>
                  <Text style={styles.guildCardName}>{g.name}</Text>
                  <Text style={styles.guildCardMeta}>
                    멤버 {g.memberCount || 0}명 · 주간 목표 {g.weeklyGoal || 0}권
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C4B9DC" />
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.emptyGuide}>
            <View style={styles.emptyGuideIconWrap}>
              <Ionicons name="people-outline" size={36} color="#9575CD" />
            </View>
            <Text style={styles.emptyGuideTitle}>가입한 길드가 없습니다</Text>
            <Text style={styles.emptyGuideText}>
              길드원과 함께 주간 독서 목표를 달성하고{'\n'}길드 대항전에서 실력을 겨뤄보세요!
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── 길드 홈 화면 ────────────────────────────────────────────────

  const isOwner = guild?.creatorId === getUserId();
  const isDeputy = members.find(m => m.userId === getUserId())?.isDeputy || false;

  const mergedMembers = (() => {
    if (members.length === 0) return memberScores;
    const scoreMap = {};
    memberScores.forEach((s) => { scoreMap[s.userId] = s; });
    return members
      .map((m) => ({ ...m, score: scoreMap[m.userId]?.score || 0, booksCompleted: scoreMap[m.userId]?.booksCompleted || 0 }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  })();

  const totalWeeklyBooks = memberScores.reduce((sum, m) => sum + (m.booksCompleted || 0), 0);
  const weeklyGoal = guild?.weeklyGoal || 0;
  const goalPct = weeklyGoal > 0 ? Math.min(1, totalWeeklyBooks / weeklyGoal) : 0;
  const myRankIndex = guildRankings.findIndex((g) => g.guildId === selectedGuildId);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  return (
    <View style={styles.container}>
      {/* 길드 헤더 */}
      <View style={styles.guildHeader}>
        <View style={styles.guildHeaderTop}>
          <TouchableOpacity onPress={handleBack} hitSlop={8} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.guildName} numberOfLines={1}>{guild?.name || '내 길드'}</Text>
          <View style={styles.headerRightBtns}>
            {isOwner && (
              <TouchableOpacity onPress={openEditModal} hitSlop={8}>
                <Ionicons name="settings-outline" size={19} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLeave} hitSlop={8}>
              <Ionicons name="log-out-outline" size={19} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.guildMeta}>
          <View style={styles.metaChip}>
            <Ionicons name="people-outline" size={12} color="#D0BCFF" />
            <Text style={styles.metaChipText}>멤버 {guild?.memberCount || 0}명</Text>
          </View>
          <TouchableOpacity onPress={copyCode} style={styles.metaChip}>
            <Ionicons name="copy-outline" size={12} color="#D0BCFF" />
            <Text style={styles.metaChipText}>코드: {guild?.inviteCode}</Text>
          </TouchableOpacity>
          {myRank && (
            <View style={[styles.metaChip, styles.rankChip]}>
              <Text style={styles.rankChipText}>
                {myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`} 대항전
              </Text>
            </View>
          )}
          {(guild?.keywords || []).map((kw) => (
            <View key={kw} style={[styles.metaChip, styles.kwTagChip]}>
              <Text style={styles.kwTagChipText}>#{kw}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 세그먼트 탭 */}
      <View style={styles.segmentBar}>
        {SEGMENT_TABS.map((label, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.segItem, activeTab === i && styles.segItemActive]}
            onPress={() => handleTabChange(i)}
          >
            <Text style={[styles.segLabel, activeTab === i && styles.segLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* ── 주간 목표 ── */}
        {activeTab === 0 && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>이번 주 협동 목표</Text>
              <Text style={styles.goalNumbers}>
                <Text style={styles.goalCurrent}>{totalWeeklyBooks}</Text>
                <Text style={styles.goalSlash}> / </Text>
                <Text style={styles.goalTarget}>{weeklyGoal}권</Text>
              </Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${goalPct * 100}%` }]} />
              </View>
              <Text style={styles.goalPct}>{Math.round(goalPct * 100)}% 달성</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>멤버별 이번 주 완독</Text>
              {memberScores.length === 0 ? (
                <Text style={styles.emptyText}>아직 기록이 없습니다.</Text>
              ) : (
                memberScores.map((m, i) => (
                  <View key={m.userId} style={styles.contribRow}>
                    <Text style={styles.contribRank}>{i + 1}</Text>
                    <Text style={styles.contribName}>{m.displayName}</Text>
                    <Text style={styles.contribBooks}>{m.booksCompleted || 0}권</Text>
                  </View>
                ))
              )}
            </View>

            {(isOwner || isDeputy) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🏰 테마 미션 승인</Text>
                {themeMissionSubs.length === 0 ? (
                  <Text style={styles.emptyText}>이번 주 제출된 테마 미션이 없습니다.</Text>
                ) : (
                  themeMissionSubs.map(sub => (
                    <View key={sub.id} style={styles.missionSubRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subMissionLabel}>{sub.missionLabel}</Text>
                        <Text style={styles.subMemberName}>{sub.displayName}</Text>
                      </View>
                      {sub.status === 'pending' ? (
                        <View style={styles.subActionRow}>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleReviewMission(sub.id, 'approved', sub.displayName, sub.missionLabel)}
                          >
                            <Text style={styles.approveBtnText}>승인</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleReviewMission(sub.id, 'rejected', sub.displayName, sub.missionLabel)}
                          >
                            <Text style={styles.rejectBtnText}>거절</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={[
                          styles.subStatusBadge,
                          sub.status === 'approved' ? styles.subStatusApproved : styles.subStatusRejected,
                        ]}>
                          <Text style={sub.status === 'approved' ? styles.subStatusApprovedText : styles.subStatusRejectedText}>
                            {sub.status === 'approved' ? '승인됨' : '거절됨'}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* ── 멤버 순위 ── */}
        {activeTab === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>멤버 이번 주 점수</Text>
            {mergedMembers.length === 0 ? (
              <Text style={styles.emptyText}>아직 점수 기록이 없습니다.</Text>
            ) : (
              mergedMembers.map((m, i) => (
                <View key={m.userId} style={[styles.rankRow, i === 0 && styles.rankRowFirst]}>
                  <Text style={styles.rankNum}>
                    {i < 3 ? MEDALS[i] : `${i + 1}위`}
                  </Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      style={{ fontSize: 14, fontWeight: '600', color: '#2D2440', flexShrink: 1 }}
                      numberOfLines={1}
                    >
                      {m.displayName}
                    </Text>
                    {m.isOwner && (
                      <View style={styles.ownerBadge}>
                        <Text style={styles.ownerBadgeText}>운영자</Text>
                      </View>
                    )}
                    {!m.isOwner && m.isDeputy && (
                      <View style={styles.deputyBadge}>
                        <Text style={styles.deputyBadgeText}>부운영자</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rankScore}>{(m.score || 0).toLocaleString()}점</Text>
                  {isOwner && !m.isOwner && (
                    <TouchableOpacity
                      onPress={() => handleMemberAction(m)}
                      hitSlop={8}
                      style={styles.memberActionBtn}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="#B0AAC0" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── 길드 대항전 ── */}
        {activeTab === 2 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>길드 이번 주 순위</Text>
            {guildRankings.length === 0 ? (
              <Text style={styles.emptyText}>참여 길드가 없습니다.</Text>
            ) : (
              guildRankings.map((g, i) => (
                <View
                  key={g.guildId}
                  style={[styles.rankRow, g.guildId === selectedGuildId && styles.rankRowHighlight]}
                >
                  <Text style={styles.rankNum}>
                    {i < 3 ? MEDALS[i] : `${i + 1}위`}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankName}>
                      {g.name}
                      {g.guildId === selectedGuildId ? ' 👈' : ''}
                    </Text>
                    <Text style={styles.rankMeta}>{g.memberCount}명 참여</Text>
                  </View>
                  <Text style={styles.rankScore}>{g.totalScore.toLocaleString()}점</Text>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.refreshBtn} onPress={() => loadGuildDetail(selectedGuildId)}>
              <Ionicons name="refresh-outline" size={15} color="#6750A4" />
              <Text style={styles.refreshText}>새로고침</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 함께 읽기 ── */}
        {activeTab === 4 && (
          <View>
            {!readingLoaded ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#6750A4" />
            ) : guildReading?.status === 'active' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>이번 함께 읽기</Text>
                <View style={styles.readingBookRow}>
                  <View style={styles.readingIconBox}>
                    <Ionicons name="book" size={28} color="#6750A4" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.readingTitleRow}>
                      <Text style={styles.readingBookTitle} numberOfLines={2}>{guildReading.bookTitle}</Text>
                      {guildReading.isAdult && (
                        <View style={styles.adultBadge}>
                          <Text style={styles.adultBadgeText}>성인</Text>
                        </View>
                      )}
                    </View>
                    {!!guildReading.bookAuthor && (
                      <Text style={styles.readingBookAuthor}>{guildReading.bookAuthor}</Text>
                    )}
                    <View style={styles.readingPeriodRow}>
                      <Ionicons name="calendar-outline" size={13} color="#9B93B0" />
                      <Text style={styles.readingPeriodText}>
                        {guildReading.startDate} ~ {guildReading.endDate}
                      </Text>
                    </View>
                  </View>
                </View>
                {isOwner && (
                  <View style={styles.readingOwnerBtns}>
                    <TouchableOpacity style={styles.readingChangeBtn} onPress={openReadingModal}>
                      <Ionicons name="swap-horizontal-outline" size={14} color="#6750A4" />
                      <Text style={styles.readingChangeBtnText}>도서 변경</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.readingEndBtn} onPress={handleEndReading}>
                      <Ionicons name="stop-circle-outline" size={14} color="#E57373" />
                      <Text style={styles.readingEndBtnText}>함께 읽기 종료</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  현재 선정된 도서가 없습니다.{isOwner ? '\n아래 버튼으로 도서를 선정해보세요.' : ''}
                </Text>
                {isOwner && (
                  <TouchableOpacity style={styles.readingSelectBtn} onPress={openReadingModal}>
                    <Ionicons name="add-circle-outline" size={16} color="#fff" />
                    <Text style={styles.readingSelectBtnText}>도서 선정하기</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <View style={styles.readingInfoBox}>
              <Ionicons name="information-circle-outline" size={14} color="#9B93B0" />
              <Text style={styles.readingInfoText}>
                길드 운영자가 기간을 정해 함께 읽을 도서를 선정합니다.{'\n'}
                성인 도서는 모든 멤버가 19세 이상인 길드에서만 선정 가능합니다.
              </Text>
            </View>
          </View>
        )}

        {/* ── 게시판 ── */}
        {activeTab === 3 && (
          <View>
            <TouchableOpacity style={styles.writeBtn} onPress={() => setShowWriteForm(true)}>
              <Ionicons name="pencil-outline" size={16} color="#fff" />
              <Text style={styles.writeBtnText}>글쓰기</Text>
            </TouchableOpacity>

            {postLoading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#6750A4" />
            ) : posts.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>아직 게시글이 없습니다.{'\n'}첫 글을 남겨보세요!</Text>
              </View>
            ) : (
              posts.map((p) => {
                const isExpanded = expandedPostId === p.id;
                const isOwn = p.userId === getUserId();
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.postCard}
                    onPress={() => setExpandedPostId(isExpanded ? null : p.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.postHeader}>
                      <Text style={styles.postTitle} numberOfLines={isExpanded ? 0 : 1}>
                        {p.title}
                      </Text>
                      {isOwn && (
                        <TouchableOpacity onPress={() => handleDeletePost(p.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={15} color="#ccc" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.postMeta}>
                      {p.displayName} · {formatPostDate(p.createdAt)}
                    </Text>
                    {isExpanded && (
                      <Text style={styles.postContent}>{p.content}</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* 길드 정보 수정 모달 */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.editModalBox}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>길드 정보 수정</Text>

              <Text style={styles.editLabel}>길드 이름</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="길드 이름 (최대 20자)"
                placeholderTextColor="#bbb"
                maxLength={20}
              />

              <Text style={[styles.editLabel, { marginTop: 12 }]}>주간 목표 권수</Text>
              <View style={styles.editGoalRow}>
                <TouchableOpacity
                  style={styles.editGoalBtn}
                  onPress={() => setEditWeeklyGoal((v) => String(Math.max(1, parseInt(v) - 1)))}
                >
                  <Ionicons name="remove" size={18} color="#6750A4" />
                </TouchableOpacity>
                <Text style={styles.editGoalValue}>{editWeeklyGoal}권</Text>
                <TouchableOpacity
                  style={styles.editGoalBtn}
                  onPress={() => setEditWeeklyGoal((v) => String(Math.min(100, parseInt(v) + 1)))}
                >
                  <Ionicons name="add" size={18} color="#6750A4" />
                </TouchableOpacity>
              </View>

              <View style={styles.editSwitchRow}>
                <Text style={styles.editLabel}>공개 길드</Text>
                <Switch
                  value={editIsPublic}
                  onValueChange={setEditIsPublic}
                  thumbColor={editIsPublic ? '#6750A4' : '#ccc'}
                  trackColor={{ false: '#e0e0e0', true: '#D0BCFF' }}
                />
              </View>

              <Text style={[styles.editLabel, { marginTop: 12 }]}>키워드</Text>
              <View style={styles.editKwInputRow}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  value={editKeywordInput}
                  onChangeText={setEditKeywordInput}
                  placeholder="키워드 입력 (최대 10자)"
                  placeholderTextColor="#bbb"
                  maxLength={10}
                  onSubmitEditing={addEditKeyword}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.editKwAddBtn} onPress={addEditKeyword}>
                  <Text style={styles.editKwAddBtnText}>추가</Text>
                </TouchableOpacity>
              </View>
              {editKeywords.length > 0 && (
                <View style={styles.editKwChips}>
                  {editKeywords.map((kw) => (
                    <TouchableOpacity key={kw} style={styles.kwChip} onPress={() => removeEditKeyword(kw)}>
                      <Text style={styles.kwChipText}>{kw}</Text>
                      <Ionicons name="close" size={12} color="#6750A4" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.editHint}>최대 5개 · 탭하면 삭제</Text>

              <View style={[styles.modalBtns, { marginTop: 16, marginBottom: 8 }]}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, editSaving && { opacity: 0.6 }]}
                  onPress={handleSaveGuildInfo}
                  disabled={editSaving}
                >
                  {editSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSubmitText}>저장</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 도서 선정 모달 */}
      <Modal visible={showReadingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.editModalBox}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>함께 읽기 도서 선정</Text>

              <Text style={styles.editLabel}>책 제목 *</Text>
              <TextInput
                style={styles.modalInput}
                value={readingTitle}
                onChangeText={setReadingTitle}
                placeholder="책 제목을 입력하세요"
                placeholderTextColor="#bbb"
                maxLength={100}
              />

              <Text style={[styles.editLabel, { marginTop: 12 }]}>저자</Text>
              <TextInput
                style={styles.modalInput}
                value={readingAuthor}
                onChangeText={setReadingAuthor}
                placeholder="저자명 (선택)"
                placeholderTextColor="#bbb"
                maxLength={50}
              />

              <View style={[styles.editSwitchRow, { marginTop: 16 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editLabel}>성인 도서</Text>
                  <Text style={styles.editHint}>전원 19세 이상인 길드에서만 선정 가능</Text>
                </View>
                <Switch
                  value={readingIsAdult}
                  onValueChange={setReadingIsAdult}
                  thumbColor={readingIsAdult ? '#E57373' : '#ccc'}
                  trackColor={{ false: '#e0e0e0', true: '#FFCDD2' }}
                />
              </View>

              <Text style={[styles.editLabel, { marginTop: 16 }]}>시작일</Text>
              <TextInput
                style={styles.modalInput}
                value={readingStartDate}
                onChangeText={setReadingStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#bbb"
                maxLength={10}
                keyboardType="numeric"
              />

              <Text style={[styles.editLabel, { marginTop: 12 }]}>종료일</Text>
              <TextInput
                style={styles.modalInput}
                value={readingEndDate}
                onChangeText={setReadingEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#bbb"
                maxLength={10}
                keyboardType="numeric"
              />

              <View style={[styles.modalBtns, { marginTop: 20, marginBottom: 8 }]}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowReadingModal(false)}
                >
                  <Text style={styles.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, readingSaving && { opacity: 0.6 }]}
                  onPress={handleSetReading}
                  disabled={readingSaving}
                >
                  {readingSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSubmitText}>선정</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 글쓰기 모달 */}
      <Modal visible={showWriteForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>새 게시글</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="제목"
              placeholderTextColor="#bbb"
              value={newTitle}
              onChangeText={setNewTitle}
              maxLength={50}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextarea]}
              placeholder="내용을 입력하세요"
              placeholderTextColor="#bbb"
              value={newContent}
              onChangeText={setNewContent}
              multiline
              numberOfLines={5}
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowWriteForm(false); setNewTitle(''); setNewContent(''); }}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSubmitPost}>
                <Text style={styles.modalSubmitText}>등록</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F2F8',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F4F2F8',
  },
  syncText: {
    fontSize: 13,
    color: '#9B93B0',
  },
  errorText: {
    fontSize: 14,
    color: '#B45309',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 32,
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6750A4',
  },

  // ── 길드 목록 ─────────────────────────────────────────────────
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 10,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  listHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2D2440',
    letterSpacing: -0.3,
  },
  listSubtitle: {
    fontSize: 12,
    color: '#9B93B0',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A09AB0',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 4,
  },
  guildCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingRight: 16,
    paddingLeft: 0,
    borderWidth: 1,
    borderColor: '#EBE6F4',
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#7C6FA0',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  guildCardAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#6750A4',
    marginRight: 14,
    borderRadius: 2,
  },
  guildCardInfo: {
    flex: 1,
    gap: 4,
  },
  guildCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2440',
  },
  guildCardMeta: {
    fontSize: 12,
    color: '#9B93B0',
  },
  emptyGuide: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyGuideIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyGuideTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4A3870',
  },
  emptyGuideText: {
    fontSize: 13,
    color: '#9B93B0',
    textAlign: 'center',
    lineHeight: 20,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    width: '100%',
    marginBottom: 2,
  },
  warnText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
    lineHeight: 18,
  },
  xpBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F3EEFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDD0F8',
    marginTop: 4,
  },
  xpBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  xpBannerBody: {
    flex: 1,
    gap: 4,
  },
  xpBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A3870',
  },
  xpBannerDesc: {
    fontSize: 12,
    color: '#7B6FAA',
    lineHeight: 18,
  },
  xpBannerHighlight: {
    fontWeight: '700',
    color: '#6750A4',
  },
  actionBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#6750A4',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  actionBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D4C8F0',
    elevation: 0,
    shadowOpacity: 0,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionBtnTextSecondary: {
    color: '#6750A4',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnHalf: {
    flex: 1,
    width: undefined,
  },
  actionBtnTextSm: {
    fontSize: 13,
  },

  // ── 길드 헤더 ─────────────────────────────────────────────────
  guildHeader: {
    backgroundColor: '#5B4397',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
  },
  guildHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBackBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guildName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginHorizontal: 8,
  },
  guildMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  metaChipText: {
    fontSize: 12,
    color: '#DDD5F5',
    letterSpacing: 0.3,
  },
  rankChip: {
    backgroundColor: 'rgba(255,220,100,0.18)',
  },
  rankChipText: {
    fontSize: 12,
    color: '#FFE082',
    fontWeight: '700',
  },
  kwTagChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  kwTagChipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
  },

  // ── 세그먼트 탭 ───────────────────────────────────────────────
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EBE6F4',
  },
  segItem: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  segItemActive: {
    borderBottomColor: '#6750A4',
  },
  segLabel: {
    fontSize: 12,
    color: '#A09AB0',
    fontWeight: '600',
  },
  segLabelActive: {
    color: '#6750A4',
  },

  // ── 카드 ─────────────────────────────────────────────────────
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EBE6F4',
    elevation: 1,
    shadowColor: '#7C6FA0',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6750A4',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── 주간 목표 ─────────────────────────────────────────────────
  goalNumbers: {
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  goalCurrent: {
    fontSize: 40,
    fontWeight: '800',
    color: '#5B4397',
    letterSpacing: -1,
  },
  goalSlash: {
    fontSize: 24,
    color: '#D4C8F0',
  },
  goalTarget: {
    fontSize: 24,
    color: '#9B93B0',
  },
  progressBg: {
    height: 12,
    backgroundColor: '#EBE6F4',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 6,
  },
  goalPct: {
    fontSize: 12,
    color: '#9B93B0',
    textAlign: 'right',
    fontWeight: '600',
  },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F2EEF8',
  },
  contribRank: {
    width: 28,
    fontSize: 13,
    color: '#B0AAC0',
    fontWeight: '700',
    textAlign: 'center',
  },
  contribName: {
    flex: 1,
    fontSize: 14,
    color: '#2D2440',
    fontWeight: '500',
  },
  contribBooks: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6750A4',
  },

  // ── 순위 ─────────────────────────────────────────────────────
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F2EEF8',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  rankRowFirst: {
    backgroundColor: '#FFFBEB',
    borderBottomColor: 'transparent',
    marginBottom: 2,
  },
  rankRowHighlight: {
    backgroundColor: '#EDE7F6',
    borderBottomColor: 'transparent',
  },
  rankNum: {
    width: 34,
    fontSize: 15,
    textAlign: 'center',
  },
  rankName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2440',
  },
  rankMeta: {
    fontSize: 11,
    color: '#B0AAC0',
    marginTop: 2,
  },
  rankScore: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6750A4',
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 14,
    paddingVertical: 8,
  },
  refreshText: {
    fontSize: 13,
    color: '#6750A4',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#C4BDD4',
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 21,
  },

  // ── 게시판 ───────────────────────────────────────────────────────
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    backgroundColor: '#6750A4',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#6750A4',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  writeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EBE6F4',
    elevation: 1,
    shadowColor: '#7C6FA0',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2440',
  },
  postMeta: {
    fontSize: 11,
    color: '#B0AAC0',
    marginTop: 5,
  },
  postContent: {
    fontSize: 13,
    color: '#5F5870',
    lineHeight: 21,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2EEF8',
  },

  // ── 길드 수정 모달 ───────────────────────────────────────────────
  editModalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4A3870',
    marginBottom: 8,
  },
  editHint: {
    fontSize: 11,
    color: '#B0AAC0',
    marginTop: 6,
  },
  editGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 4,
  },
  editGoalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0EAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editGoalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6750A4',
    minWidth: 60,
    textAlign: 'center',
  },
  editSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  editKwInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editKwAddBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  editKwAddBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  editKwChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  kwChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE7F6',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  kwChipText: {
    fontSize: 13,
    color: '#6750A4',
    fontWeight: '600',
  },

  // ── 글쓰기 모달 ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,15,35,0.45)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D2440',
    marginBottom: 2,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#E0D6F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#2D2440',
    backgroundColor: '#FAF8FE',
  },
  modalTextarea: {
    height: 120,
    paddingTop: 11,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D4C8F0',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6750A4',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#6750A4',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#6750A4',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  modalSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── 함께 읽기 ────────────────────────────────────────────────────
  readingBookRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  readingIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  readingBookTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D2440',
    flex: 1,
  },
  readingBookAuthor: {
    fontSize: 13,
    color: '#9B93B0',
    marginBottom: 6,
  },
  readingPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  readingPeriodText: {
    fontSize: 12,
    color: '#9B93B0',
  },
  adultBadge: {
    backgroundColor: '#FEEBEE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  adultBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E57373',
  },
  readingOwnerBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  readingChangeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D4C8F0',
  },
  readingChangeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6750A4',
  },
  readingEndBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  readingEndBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E57373',
  },
  readingSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
    elevation: 2,
    shadowColor: '#6750A4',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  readingSelectBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  readingInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F4F2F8',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  readingInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#9B93B0',
    lineHeight: 18,
  },

  // ── 테마 미션 승인 ─────────────────────────────────────────────
  missionSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0EBF8',
  },
  subMissionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 2,
  },
  subMemberName: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  subActionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  approveBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  rejectBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E57373',
  },
  rejectBtnText: {
    color: '#E57373',
    fontSize: 12,
    fontWeight: '700',
  },
  subStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subStatusApproved: {
    backgroundColor: '#E8F5E9',
  },
  subStatusRejected: {
    backgroundColor: '#FEEBEE',
  },
  subStatusApprovedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  subStatusRejectedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E57373',
  },

  // ── 멤버 역할 배지 / 관리 ──────────────────────────────────────
  ownerBadge: {
    backgroundColor: '#EDE7F6',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6750A4',
  },
  deputyBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  deputyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1976D2',
  },
  memberActionBtn: {
    padding: 4,
    marginLeft: 2,
  },
});
