import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getUserId, getUsername, leaveGuild,
} from '../../database/database';
import {
  getGuildInfo, getGuildWeeklyScores, getGuildRankings,
  syncWeeklyScore, removeMemberFromGuild, getUserGuilds,
  getGuildPosts, createGuildPost, deleteGuildPost,
} from '../../database/guildDatabase';
import { isFirebaseReady } from '../../database/firebaseConfig';

const MEDALS = ['🥇', '🥈', '🥉'];
const SEGMENT_TABS = ['주간 목표', '멤버 순위', '길드 대항전', '게시판'];

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

      const [info, scores, rankings] = await Promise.all([
        getGuildInfo(guildId),
        getGuildWeeklyScores(guildId),
        getGuildRankings(),
      ]);

      setGuild(info);
      setMemberScores(scores);
      setGuildRankings(rankings);
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

  const handleTabChange = (i) => {
    setActiveTab(i);
    if (i === 3 && !postLoaded && !postLoading) {
      loadPosts(selectedGuildId);
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
          <Ionicons name="people" size={36} color="#6750A4" />
          <Text style={styles.listTitle}>독서 길드</Text>
        </View>

        {!isFirebaseReady() && (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={16} color="#E65100" />
            <Text style={styles.warnText}>
              서버에 연결할 수 없습니다.{'\n'}
              네트워크 상태를 확인해주세요.
            </Text>
          </View>
        )}

        {myGuilds.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>가입한 길드</Text>
            {myGuilds.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.guildCard}
                onPress={() => loadGuildDetail(g.id)}
              >
                <View style={styles.guildCardInfo}>
                  <Text style={styles.guildCardName}>{g.name}</Text>
                  <Text style={styles.guildCardMeta}>
                    멤버 {g.memberCount || 0}명 · 주간 목표 {g.weeklyGoal || 0}권
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#aaa" />
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.emptyGuide}>
            <Ionicons name="people-outline" size={48} color="#D0BCFF" />
            <Text style={styles.emptyGuideText}>
              아직 가입한 길드가 없습니다.{'\n'}
              길드원과 함께 주간 독서 목표를 달성하고{'\n'}길드 대항전에서 실력을 겨뤄보세요!
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>길드 찾기</Text>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/guild-create')}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.actionBtnText}>길드 만들기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => router.push('/guild-join')}
        >
          <Ionicons name="key-outline" size={20} color="#6750A4" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
            초대 코드로 참여
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => router.push({ pathname: '/guild-join', params: { tab: 'search' } })}
        >
          <Ionicons name="search-outline" size={20} color="#6750A4" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
            공개 길드 둘러보기
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── 길드 홈 화면 ────────────────────────────────────────────────

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
          <TouchableOpacity onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.guildName}>{guild?.name || '내 길드'}</Text>
          <TouchableOpacity onPress={handleLeave} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.guildMeta}>
          <Text style={styles.guildMetaText}>
            <Ionicons name="people-outline" size={13} /> 멤버 {guild?.memberCount || 0}명
          </Text>
          <TouchableOpacity onPress={copyCode} style={styles.codeBox}>
            <Text style={styles.codeText}>코드: {guild?.inviteCode}</Text>
            <Ionicons name="copy-outline" size={13} color="#D0BCFF" />
          </TouchableOpacity>
        </View>
        {myRank && (
          <Text style={styles.rankBadge}>
            {myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`} 이번 주 길드 대항전
          </Text>
        )}
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
          </View>
        )}

        {/* ── 멤버 순위 ── */}
        {activeTab === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>멤버 이번 주 점수</Text>
            {memberScores.length === 0 ? (
              <Text style={styles.emptyText}>아직 점수 기록이 없습니다.</Text>
            ) : (
              memberScores.map((m, i) => (
                <View key={m.userId} style={[styles.rankRow, i === 0 && styles.rankRowFirst]}>
                  <Text style={styles.rankNum}>
                    {i < 3 ? MEDALS[i] : `${i + 1}위`}
                  </Text>
                  <Text style={styles.rankName}>{m.displayName}</Text>
                  <Text style={styles.rankScore}>{(m.score || 0).toLocaleString()}점</Text>
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
    backgroundColor: '#F9F5FF',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  syncText: {
    fontSize: 13,
    color: '#888',
  },
  errorText: {
    fontSize: 14,
    color: '#E65100',
    textAlign: 'center',
    marginTop: 12,
    marginHorizontal: 32,
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6750A4',
  },

  // ── 길드 목록 ─────────────────────────────────────────────────
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
    gap: 10,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  listTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6750A4',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },
  guildCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  guildCardInfo: {
    flex: 1,
    gap: 4,
  },
  guildCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  guildCardMeta: {
    fontSize: 12,
    color: '#888',
  },
  emptyGuide: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyGuideText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 4,
  },
  warnText: {
    fontSize: 12,
    color: '#E65100',
    flex: 1,
    lineHeight: 18,
  },
  actionBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: '#F0EAFB',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  actionBtnTextSecondary: {
    color: '#6750A4',
  },

  // ── 길드 헤더 ─────────────────────────────────────────────────
  guildHeader: {
    backgroundColor: '#6750A4',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 6,
  },
  guildHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guildName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  guildMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  guildMetaText: {
    fontSize: 13,
    color: '#D0BCFF',
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  codeText: {
    fontSize: 13,
    color: '#D0BCFF',
    letterSpacing: 1,
  },
  rankBadge: {
    fontSize: 12,
    color: '#E8DEF8',
    marginTop: 2,
  },

  // ── 세그먼트 탭 ───────────────────────────────────────────────
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0D6F0',
  },
  segItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segItemActive: {
    borderBottomColor: '#6750A4',
  },
  segLabel: {
    fontSize: 13,
    color: '#888',
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
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6750A4',
    marginBottom: 14,
  },

  // ── 주간 목표 ─────────────────────────────────────────────────
  goalNumbers: {
    textAlign: 'center',
    marginBottom: 10,
  },
  goalCurrent: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#6750A4',
  },
  goalSlash: {
    fontSize: 22,
    color: '#ccc',
  },
  goalTarget: {
    fontSize: 22,
    color: '#888',
  },
  progressBg: {
    height: 10,
    backgroundColor: '#E8E0F0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 5,
  },
  goalPct: {
    fontSize: 13,
    color: '#888',
    textAlign: 'right',
  },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EEF8',
  },
  contribRank: {
    width: 28,
    fontSize: 13,
    color: '#888',
    fontWeight: 'bold',
  },
  contribName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  contribBooks: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6750A4',
  },

  // ── 순위 ─────────────────────────────────────────────────────
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EEF8',
    gap: 10,
  },
  rankRowFirst: {
    backgroundColor: '#FFFDE7',
    borderRadius: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  rankRowHighlight: {
    backgroundColor: '#EDE7F6',
    borderRadius: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
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
    color: '#333',
  },
  rankMeta: {
    fontSize: 11,
    color: '#aaa',
  },
  rankScore: {
    fontSize: 14,
    fontWeight: 'bold',
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
  },
  emptyText: {
    fontSize: 13,
    color: '#bbb',
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 20,
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
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
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
    color: '#333',
  },
  postMeta: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 4,
  },
  postContent: {
    fontSize: 13,
    color: '#444',
    lineHeight: 20,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3EEF8',
  },

  // ── 글쓰기 모달 ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6750A4',
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0D6F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  modalTextarea: {
    height: 120,
    paddingTop: 10,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0BCFF',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6750A4',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6750A4',
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
