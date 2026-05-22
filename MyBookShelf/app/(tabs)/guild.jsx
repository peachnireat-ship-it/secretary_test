import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getUserId, getUsername, getGuildId, leaveGuild,
} from '../../database/database';
import {
  getGuildInfo, getGuildWeeklyScores, getGuildRankings,
  syncWeeklyScore, removeMemberFromGuild,
} from '../../database/guildDatabase';
import { isFirebaseReady } from '../../database/firebaseConfig';

const MEDALS = ['🥇', '🥈', '🥉'];
const SEGMENT_TABS = ['주간 목표', '멤버 순위', '길드 대항전'];

export default function GuildScreen() {
  const router = useRouter();
  const [guildId, setGuildId] = useState('');
  const [guild, setGuild] = useState(null);
  const [memberScores, setMemberScores] = useState([]);
  const [guildRankings, setGuildRankings] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const load = async () => {
    setLoading(true);
    const id = getGuildId();
    setGuildId(id);

    if (!id) {
      setLoading(false);
      return;
    }

    if (!isFirebaseReady()) {
      setLoading(false);
      Alert.alert(
        '연결 오류',
        '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.',
      );
      return;
    }

    try {
      const userId = getUserId();
      const displayName = getUsername() || '독서가';

      setSyncing(true);
      await syncWeeklyScore(id, userId, displayName);
      setSyncing(false);

      const [info, scores, rankings] = await Promise.all([
        getGuildInfo(id),
        getGuildWeeklyScores(id),
        getGuildRankings(),
      ]);

      setGuild(info);
      setMemberScores(scores);
      setGuildRankings(rankings);
    } catch (e) {
      Alert.alert('오류', e.message || '길드 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setSyncing(false);
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
            await removeMemberFromGuild(guildId, userId);
            leaveGuild();
            setGuildId('');
            setGuild(null);
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

  // ── 길드 미가입 화면 ────────────────────────────────────────────

  if (!loading && !guildId) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.landingContainer}>
        <Ionicons name="people" size={64} color="#D0BCFF" />
        <Text style={styles.landingTitle}>독서 길드</Text>
        <Text style={styles.landingDesc}>
          길드원과 함께 주간 독서 목표를 달성하고{'\n'}길드 대항전에서 실력을 겨뤄보세요!
        </Text>

        {!isFirebaseReady() && (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={16} color="#E65100" />
            <Text style={styles.warnText}>
              서버에 연결할 수 없습니다.{'\n'}
              네트워크 상태를 확인해주세요.
            </Text>
          </View>
        )}

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

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#6750A4" />
        {syncing && <Text style={styles.syncText}>점수 동기화 중...</Text>}
      </View>
    );
  }

  // ── 길드 홈 화면 ────────────────────────────────────────────────

  const totalWeeklyBooks = memberScores.reduce((sum, m) => sum + (m.booksCompleted || 0), 0);
  const weeklyGoal = guild?.weeklyGoal || 0;
  const goalPct = weeklyGoal > 0 ? Math.min(1, totalWeeklyBooks / weeklyGoal) : 0;
  const myRankIndex = guildRankings.findIndex((g) => g.guildId === guildId);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  return (
    <View style={styles.container}>
      {/* 길드 헤더 */}
      <View style={styles.guildHeader}>
        <View style={styles.guildHeaderTop}>
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
            onPress={() => setActiveTab(i)}
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
                  style={[styles.rankRow, g.guildId === guildId && styles.rankRowHighlight]}
                >
                  <Text style={styles.rankNum}>
                    {i < 3 ? MEDALS[i] : `${i + 1}위`}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankName}>
                      {g.name}
                      {g.guildId === guildId ? ' 👈' : ''}
                    </Text>
                    <Text style={styles.rankMeta}>{g.memberCount}명 참여</Text>
                  </View>
                  <Text style={styles.rankScore}>{g.totalScore.toLocaleString()}점</Text>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.refreshBtn} onPress={load}>
              <Ionicons name="refresh-outline" size={15} color="#6750A4" />
              <Text style={styles.refreshText}>새로고침</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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

  // ── 랜딩 ─────────────────────────────────────────────────────
  landingContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
    gap: 14,
  },
  landingTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#6750A4',
  },
  landingDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
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
  },
});
