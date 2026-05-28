import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getReportGroups,
  dismissReportsForTarget,
  deleteReportTarget,
  getReportDetailsByUser,
  dismissReportsForUser,
  banUser,
  unbanUser,
  getBannedUsers,
} from '../database/database';

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('content');
  const [groups, setGroups] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [bannedMap, setBannedMap] = useState({});
  const [expandedUsers, setExpandedUsers] = useState({});
  const [highlightedUser, setHighlightedUser] = useState(null);
  const [suspendModal, setSuspendModal] = useState({ visible: false, username: '', days: '' });

  const load = useCallback(() => {
    setGroups(getReportGroups());

    const details = getReportDetailsByUser();
    const grouped = {};
    details.forEach((row) => {
      const u = row.targetAuthor;
      if (!grouped[u]) grouped[u] = { username: u, totalCount: 0, lastReportedAt: 0, items: [] };
      grouped[u].totalCount += row.reportCount;
      grouped[u].lastReportedAt = Math.max(grouped[u].lastReportedAt, row.lastReportedAt);
      grouped[u].items.push(row);
    });
    setUserGroups(Object.values(grouped).sort((a, b) => b.lastReportedAt - a.lastReportedAt));

    const bans = getBannedUsers();
    const map = {};
    bans.forEach((b) => { map[b.username] = b; });
    setBannedMap(map);
  }, []);

  useFocusEffect(load);

  const navigateToContent = (targetType, targetId, parentDiscussionId) => {
    if (targetType === 'discussion') {
      router.push(`/(tabs)/book-discussion?focusDiscId=${targetId}`);
    } else if (parentDiscussionId) {
      router.push(`/(tabs)/book-discussion?focusDiscId=${parentDiscussionId}&focusCmtId=${targetId}`);
    }
  };

  const handleDismiss = (targetType, targetId) => {
    Alert.alert('신고 무시', '이 대상의 모든 신고를 무시하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '무시',
        onPress: () => {
          dismissReportsForTarget(targetType, targetId);
          load();
        },
      },
    ]);
  };

  const handleDismissUser = (username) => {
    Alert.alert('사용자 신고 무시', `'${username}' 사용자에 대한 모든 신고를 무시하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '무시',
        onPress: () => {
          dismissReportsForUser(username);
          load();
        },
      },
    ]);
  };

  const handleDelete = (targetType, targetId, targetContent) => {
    const label = targetType === 'discussion' ? '토론글' : '댓글';
    Alert.alert(
      `${label} 삭제`,
      `해당 ${label}을 삭제하고 신고 내역도 제거합니다.\n\n"${(targetContent || '').slice(0, 40)}…"`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deleteReportTarget(targetType, targetId);
            load();
          },
        },
      ],
    );
  };

  const handleSuspend = (username) => {
    setSuspendModal({ visible: true, username, days: '' });
  };

  const confirmSuspend = () => {
    const days = parseInt(suspendModal.days, 10);
    if (!days || days <= 0) {
      Alert.alert('입력 오류', '1 이상의 숫자를 입력해 주세요.');
      return;
    }
    banUser(suspendModal.username, 'suspend', Date.now() + days * 86400000);
    setSuspendModal({ visible: false, username: '', days: '' });
    load();
  };

  const handlePermaBan = (username) => {
    Alert.alert(
      `'${username}' 영구 정지`,
      '이 계정을 영구 정지하시겠습니까?\n정지 후에는 토론 글/댓글 작성이 불가합니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '영구 정지', style: 'destructive', onPress: () => { banUser(username, 'ban'); load(); } },
      ],
    );
  };

  const handleUnban = (username) => {
    Alert.alert('정지 해제', `'${username}' 계정의 정지를 해제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '해제', onPress: () => { unbanUser(username); load(); } },
    ]);
  };

  const renderItem = ({ item }) => {
    const isComment = item.targetType === 'comment';
    const label = isComment ? '댓글' : '토론글';
    const labelColor = isComment ? '#0277BD' : '#6750A4';
    const reporters = item.reporters
      ? item.reporters.split(',').filter(Boolean).map((entry) => {
          const atSep = entry.lastIndexOf(' / ');
          const at = Number(entry.slice(atSep + 3));
          const left = entry.slice(0, atSep);
          const reasonSep = left.indexOf(' / ');
          const name = left.slice(0, reasonSep);
          const reason = left.slice(reasonSep + 3);
          return { name, reason, at };
        })
      : [];

    return (
      <View style={styles.card}>

        {/* 1. 신고 대상 계정 */}
        {!!item.targetAuthor && (
          <TouchableOpacity
            style={styles.targetAuthorBtn}
            onPress={() => { setHighlightedUser(item.targetAuthor); setTab('user'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={15} color="#6750A4" />
            <Text style={styles.targetAuthor}>신고 대상 계정 : {item.targetAuthor}</Text>
            <Ionicons name="chevron-forward" size={14} color="#9E9E9E" />
          </TouchableOpacity>
        )}

        {/* 2. 게시글 컨텍스트 (댓글인 경우) */}
        {isComment && !!item.parentDiscussionTopic && (
          <View style={styles.parentContextRow}>
            <View style={styles.parentContextLabel}>
              <Ionicons name="document-text-outline" size={10} color="#6750A4" />
              <Text style={styles.parentContextLabelText}>게시글</Text>
            </View>
            {!!item.parentDiscussionBookTitle && (
              <>
                <Text style={styles.parentContextBookTitle} numberOfLines={1}>
                  {item.parentDiscussionBookTitle}
                </Text>
                <Text style={styles.parentContextOf}>의</Text>
              </>
            )}
            <Text style={styles.parentContextTopic} numberOfLines={1}>
              {item.parentDiscussionTopic}
            </Text>
          </View>
        )}

        {/* 3. 신고 유형 배지(좌) + 내용(중) + 원문 보기(우) */}
        <View style={styles.badgeContentRow}>
          <View style={[styles.typeBadge, { backgroundColor: labelColor }]}>
            <Text style={styles.typeBadgeText}>{label}</Text>
          </View>
          <Text style={styles.badgeContentText} numberOfLines={2}>
            {item.targetContent || '(삭제된 게시물)'}
          </Text>
          <TouchableOpacity
            style={styles.viewOriginalBtn}
            onPress={() => navigateToContent(item.targetType, item.targetId, item.parentDiscussionId)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-forward-circle-outline" size={14} color="#6750A4" />
            <Text style={styles.viewOriginalText}>원문 보기</Text>
          </TouchableOpacity>
        </View>

        {/* 5. 신고 건수 */}
        <Text style={styles.reportCount}>신고 {item.reportCount}건</Text>

        {/* 6. 신고자 수직 리스트 */}
        {reporters.length > 0 && (
          <View style={styles.reporterListContainer}>
            {reporters.map((r, i) => (
              <View key={i} style={styles.reporterListRow}>
                <Text style={styles.reporterListText}>신고 계정 : {r.name}</Text>
                <Text style={styles.reporterListText}>신고 일시 : {formatDate(r.at)}</Text>
                {!!r.reason && (
                  <Text style={styles.reporterListText}>신고 사유 : {r.reason}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => handleDismiss(item.targetType, item.targetId)}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color="#6750A4" />
            <Text style={styles.dismissBtnText}>무시</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.targetType, item.targetId, item.targetContent)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={15} color="#fff" />
            <Text style={styles.deleteBtnText}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderUserItem = ({ item }) => {
    const ban = bannedMap[item.username];
    const isSuspended = ban?.banType === 'suspend';
    const isPermaBanned = ban?.banType === 'ban';
    const isRestricted = isSuspended || isPermaBanned;
    const isExpanded = expandedUsers[item.username] !== false;

    const banLabel = isPermaBanned
      ? '영구 정지'
      : isSuspended
      ? `이용 정지 중 (~${new Date(ban.banUntil).getMonth() + 1}/${new Date(ban.banUntil).getDate()})`
      : null;

    const isHighlighted = item.username === highlightedUser;

    return (
      <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
        {/* 사용자 헤더 — 탭으로 트리 접기/펼치기 */}
        <TouchableOpacity
          style={styles.userCardHeader}
          onPress={() => setExpandedUsers((prev) => ({ ...prev, [item.username]: !isExpanded }))}
          activeOpacity={0.7}
        >
          <Ionicons name="person-circle-outline" size={18} color="#6750A4" />
          <Text style={styles.userName} numberOfLines={1}>{item.username}</Text>
          {banLabel && (
            <View style={[styles.banBadge, isPermaBanned && styles.banBadgePerma]}>
              <Ionicons name={isPermaBanned ? 'ban-outline' : 'time-outline'} size={11} color="#fff" />
              <Text style={styles.banBadgeText}>{banLabel}</Text>
            </View>
          )}
          <Text style={styles.userTotalCount}>신고 {item.totalCount}건</Text>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={15} color="#9E9E9E" />
        </TouchableOpacity>

        {isExpanded && <View style={styles.treeDivider} />}

        {/* 트리 — 신고된 콘텐츠 목록 */}
        {isExpanded && (
          <View style={styles.treeContainer}>
            {item.items.map((content, idx) => {
              const isComment = content.targetType === 'comment';
              const isLast = idx === item.items.length - 1;
              const reasons = content.reasons ? content.reasons.split(',').filter(Boolean) : [];
              const reporters = content.reporters
                ? content.reporters.split(',').filter(Boolean).map((entry) => {
                    const atSep = entry.lastIndexOf(' / ');
                    const at = Number(entry.slice(atSep + 3));
                    const left = entry.slice(0, atSep);
                    const reasonSep = left.indexOf(' / ');
                    const name = left.slice(0, reasonSep);
                    const reason = left.slice(reasonSep + 3);
                    return { name, reason, at };
                  })
                : [];

              return (
                <View key={`${content.targetType}-${content.targetId}`} style={styles.treeRow}>
                  {/* 연결선 */}
                  <View style={styles.treeConnector}>
                    <View style={[styles.treeLineV, isLast && styles.treeLineVHalf]} />
                    <View style={styles.treeLineH} />
                  </View>

                  {/* 콘텐츠 카드 */}
                  <View style={styles.treeCard}>
                    {/* 1. 게시글+제목 '의' 토론 게시글 중 제목 */}
                    {isComment && !!content.parentDiscussionTopic && (
                      <View style={styles.parentContextRow}>
                        <View style={styles.parentContextLabel}>
                          <Ionicons name="document-text-outline" size={10} color="#6750A4" />
                          <Text style={styles.parentContextLabelText}>게시글</Text>
                        </View>
                        {!!content.parentDiscussionBookTitle && (
                          <>
                            <Text style={styles.parentContextBookTitle} numberOfLines={1}>
                              {content.parentDiscussionBookTitle}
                            </Text>
                            <Text style={styles.parentContextOf}>의</Text>
                          </>
                        )}
                        <Text style={styles.parentContextTopic} numberOfLines={1}>
                          {content.parentDiscussionTopic}
                        </Text>
                      </View>
                    )}

                    {/* 2. 본문 */}
                    <Text style={styles.treeContentText} numberOfLines={2}>
                      {content.targetContent || '(삭제된 게시물)'}
                    </Text>

                    {/* 3. 유형 배지 + 신고 건수 + 원문 보기(오른쪽 끝) */}
                    <View style={styles.treeMetaRow}>
                      <View style={[styles.typeBadge, { backgroundColor: isComment ? '#0277BD' : '#6750A4' }]}>
                        <Text style={styles.typeBadgeText}>{isComment ? '댓글' : '토론글'}</Text>
                      </View>
                      <Text style={styles.treeReportCount}>신고 {content.reportCount}건</Text>
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity
                        style={styles.viewOriginalBtn}
                        onPress={() => navigateToContent(content.targetType, content.targetId, content.parentDiscussionId)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="arrow-forward-circle-outline" size={14} color="#6750A4" />
                        <Text style={styles.viewOriginalText}>원문 보기</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 4. 신고자 상세 (2건 이상이면 목록, 1건이면 단순 표시) */}
                    {content.reportCount >= 2 ? (
                      <View style={styles.reporterListContainer}>
                        {reporters.map((r, i) => (
                          <View key={i} style={styles.reporterListRow}>
                            <Text style={styles.reporterListText}>신고 계정 : {r.name}</Text>
                            {!!r.reason && (
                              <Text style={styles.reporterListText}>신고 사유 : {r.reason}</Text>
                            )}
                            <Text style={styles.reporterListText}>신고 일시 : {formatDate(r.at)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <>
                        {reasons.length > 0 && (
                          <Text style={styles.treeReasonText}>신고 사유 : {reasons.join(' · ')}</Text>
                        )}
                        <Text style={styles.treeReportDate}>
                          신고 일시 : {formatDate(content.lastReportedAt)}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.treeDivider} />

        {/* 액션 버튼 */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => handleDismissUser(item.username)}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color="#6750A4" />
            <Text style={styles.dismissBtnText}>신고 무시</Text>
          </TouchableOpacity>
          {isRestricted ? (
            <TouchableOpacity
              style={styles.unbanBtn}
              onPress={() => handleUnban(item.username)}
              activeOpacity={0.8}
            >
              <Ionicons name="lock-open-outline" size={15} color="#fff" />
              <Text style={styles.unbanBtnText}>정지 해제</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.suspendBtn}
              onPress={() => handleSuspend(item.username)}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={15} color="#F57C00" />
              <Text style={styles.suspendBtnText}>이용 정지</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isRestricted && (
          <TouchableOpacity
            style={styles.permaBanBtn}
            onPress={() => handlePermaBan(item.username)}
            activeOpacity={0.8}
          >
            <Ionicons name="ban-outline" size={15} color="#fff" />
            <Text style={styles.permaBanBtnText}>영구 정지</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const isEmpty = tab === 'content' ? groups.length === 0 : userGroups.length === 0;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1C1B1F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>신고 내역 관리</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'content' && styles.tabBtnActive]}
          onPress={() => setTab('content')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, tab === 'content' && styles.tabBtnTextActive]}>콘텐츠별</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'user' && styles.tabBtnActive]}
          onPress={() => setTab('user')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, tab === 'user' && styles.tabBtnTextActive]}>사용자별</Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#C4B4E0" />
          <Text style={styles.emptyText}>처리할 신고가 없습니다</Text>
        </View>
      ) : tab === 'content' ? (
        <FlatList
          data={groups}
          keyExtractor={(item) => `${item.targetType}-${item.targetId}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      ) : (
        <FlatList
          data={userGroups}
          keyExtractor={(item) => item.username}
          renderItem={renderUserItem}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal
        visible={suspendModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuspendModal((m) => ({ ...m, visible: false }))}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable
            style={styles.suspendOverlay}
            onPress={() => setSuspendModal((m) => ({ ...m, visible: false }))}
          >
            <Pressable style={styles.suspendSheet} onPress={() => {}}>
              <View style={styles.suspendSheetHeader}>
                <Ionicons name="time-outline" size={20} color="#F57C00" />
                <Text style={styles.suspendSheetTitle}>이용 정지</Text>
              </View>
              <Text style={styles.suspendSheetUsername}>{suspendModal.username}</Text>
              <Text style={styles.suspendSheetDesc}>정지 기간을 일(日) 단위로 입력하세요.</Text>
              <View style={styles.suspendInputRow}>
                <TextInput
                  style={styles.suspendInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#BDBDBD"
                  value={suspendModal.days}
                  onChangeText={(v) => setSuspendModal((m) => ({ ...m, days: v.replace(/[^0-9]/g, '') }))}
                  maxLength={4}
                  autoFocus
                />
                <Text style={styles.suspendInputUnit}>일</Text>
              </View>
              <View style={styles.suspendBtnRow}>
                <TouchableOpacity
                  style={styles.suspendCancelBtn}
                  onPress={() => setSuspendModal((m) => ({ ...m, visible: false }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.suspendCancelBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.suspendConfirmBtn, !suspendModal.days && styles.suspendConfirmBtnDisabled]}
                  onPress={confirmSuspend}
                  activeOpacity={0.8}
                >
                  <Text style={styles.suspendConfirmBtnText}>정지 적용</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1B1F' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  reportCount: { fontSize: 13, fontWeight: '700', color: '#E53935', flex: 1 },
  dateText: { fontSize: 11, color: '#9E9E9E' },
  parentDiscussion: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  parentDiscussionText: { fontSize: 11, color: '#9E9E9E', flex: 1 },
  reportersList: { gap: 4 },
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reporterName: { fontSize: 12, color: '#616161', fontWeight: '600' },
  reporterReason: { fontSize: 12, color: '#757575', flex: 1 },
  reporterAt: { fontSize: 11, color: '#9E9E9E' },
  targetContent: { fontSize: 14, color: '#1C1B1F', lineHeight: 20 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  targetAuthorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#F3EEFF',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  targetAuthor: { fontSize: 14, color: '#6750A4', fontWeight: '700', flex: 1 },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: '#6750A4',
    backgroundColor: '#FAF7FF',
  },
  reasonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: {
    backgroundColor: '#F3E5F5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  reasonChipText: { fontSize: 11, color: '#6750A4', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dismissBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#6750A4',
  },
  dismissBtnText: { fontSize: 13, fontWeight: '600', color: '#6750A4' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#E53935',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: '#9E9E9E' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#6750A4' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#9E9E9E' },
  tabBtnTextActive: { color: '#6750A4' },
  userName: { fontSize: 14, fontWeight: '700', color: '#1C1B1F', flex: 1 },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userTotalCount: { fontSize: 13, fontWeight: '700', color: '#E53935' },
  treeDivider: { height: 1, backgroundColor: '#F0EBF8' },
  treeContainer: {
    gap: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#DDD4F4',
    marginLeft: 4,
  },
  treeRow: { gap: 0 },
  treeConnector: { width: 0, overflow: 'hidden' },
  treeLineV: {},
  treeLineVHalf: {},
  treeLineH: {},
  treeCard: {
    backgroundColor: '#F8F6FD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EBE5F5',
    padding: 12,
    gap: 8,
  },
  treeContentText: { fontSize: 13, color: '#1C1B1F', lineHeight: 19 },
  treeReportCount: { fontSize: 12, fontWeight: '700', color: '#E53935' },
  banBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#F57C00',
  },
  banBadgePerma: { backgroundColor: '#B71C1C' },
  banBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  suspendBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 10, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#F57C00',
  },
  suspendBtnText: { fontSize: 13, fontWeight: '600', color: '#F57C00' },
  permaBanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 10, paddingVertical: 10,
    backgroundColor: '#B71C1C',
  },
  permaBanBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  unbanBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 10, paddingVertical: 10,
    backgroundColor: '#388E3C',
  },
  unbanBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  parentContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    backgroundColor: '#F0EBF8',
    borderRadius: 7,
    borderLeftWidth: 2.5,
    borderLeftColor: '#6750A4',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  parentContextLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  parentContextLabelText: { fontSize: 10, fontWeight: '700', color: '#6750A4' },
  parentContextBookTitle: { fontSize: 11, color: '#424242', fontWeight: '600', flexShrink: 1, maxWidth: 90 },
  parentContextOf: { fontSize: 11, color: '#757575' },
  parentContextTopic: { fontSize: 11, color: '#424242', flexShrink: 1, flex: 1 },
  treeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  treeReportDate: { fontSize: 11, color: '#9E9E9E' },
  treeReasonText: { fontSize: 11, color: '#9E9E9E' },
  badgeContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badgeContentText: {
    fontSize: 14,
    color: '#1C1B1F',
    lineHeight: 20,
    flex: 1,
  },
  viewOriginalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  viewOriginalText: { fontSize: 12, color: '#6750A4', fontWeight: '600' },
  reporterListContainer: { gap: 6 },
  reporterListRow: {
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#E0E0E0',
  },
  reporterListText: { fontSize: 11, color: '#757575' },
  suspendOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  suspendSheet: {
    backgroundColor: '#fff', borderRadius: 20,
    marginHorizontal: 32, padding: 24, width: '80%',
  },
  suspendSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  suspendSheetTitle: { fontSize: 16, fontWeight: '700', color: '#F57C00' },
  suspendSheetUsername: { fontSize: 14, fontWeight: '700', color: '#1C1B1F', marginBottom: 4 },
  suspendSheetDesc: { fontSize: 13, color: '#757575', marginBottom: 16 },
  suspendInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 20,
  },
  suspendInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#F57C00', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 22, fontWeight: '700', color: '#1C1B1F',
    textAlign: 'center', backgroundColor: '#FFF8F0',
  },
  suspendInputUnit: { fontSize: 16, fontWeight: '600', color: '#757575' },
  suspendBtnRow: { flexDirection: 'row', gap: 10 },
  suspendCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center',
  },
  suspendCancelBtnText: { fontSize: 14, color: '#9E9E9E', fontWeight: '600' },
  suspendConfirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#F57C00', alignItems: 'center',
  },
  suspendConfirmBtnDisabled: { backgroundColor: '#FFD9A8' },
  suspendConfirmBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
