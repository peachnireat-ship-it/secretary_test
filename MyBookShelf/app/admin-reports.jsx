import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getReportGroups,
  dismissReportsForTarget,
  deleteReportTarget,
  getReportGroupsByUser,
  dismissReportsForUser,
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

  const load = useCallback(() => {
    setGroups(getReportGroups());
    setUserGroups(getReportGroupsByUser());
  }, []);

  useFocusEffect(load);

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

  const renderItem = ({ item }) => {
    const label = item.targetType === 'discussion' ? '토론글' : '댓글';
    const labelColor = item.targetType === 'discussion' ? '#6750A4' : '#0277BD';
    const reasons = item.reasons ? item.reasons.split(',').filter(Boolean) : [];
    const uniqueReasons = [...new Set(reasons)];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: labelColor }]}>
            <Text style={styles.typeBadgeText}>{label}</Text>
          </View>
          <Text style={styles.reportCount}>신고 {item.reportCount}건</Text>
          <Text style={styles.dateText}>{formatDate(item.lastReportedAt)}</Text>
        </View>

        {item.targetType === 'comment' && !!item.parentDiscussionTopic && (
          <View style={styles.parentDiscussion}>
            <Ionicons name="chatbubbles-outline" size={12} color="#9E9E9E" />
            <Text style={styles.parentDiscussionText} numberOfLines={1}>
              {item.parentDiscussionTopic}
            </Text>
          </View>
        )}
        <Text style={styles.targetContent} numberOfLines={2}>
          {item.targetContent || '(삭제된 게시물)'}
        </Text>
        {!!item.targetAuthor && (
          <Text style={styles.targetAuthor}>작성자: {item.targetAuthor}</Text>
        )}

        {uniqueReasons.length > 0 && (
          <View style={styles.reasonsRow}>
            {uniqueReasons.map((r, i) => (
              <View key={i} style={styles.reasonChip}>
                <Text style={styles.reasonChipText}>{r}</Text>
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
    const reasons = item.allReasons ? item.allReasons.split(',').filter(Boolean) : [];
    const uniqueReasons = [...new Set(reasons)];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="person-circle-outline" size={18} color="#6750A4" />
          <Text style={styles.userName}>{item.targetAuthor}</Text>
          <Text style={styles.reportCount}>신고 {item.totalReportCount}건</Text>
          <Text style={styles.dateText}>{formatDate(item.lastReportedAt)}</Text>
        </View>

        <Text style={styles.targetAuthor}>{item.reportedItemCount}개 콘텐츠에서 신고됨</Text>

        {uniqueReasons.length > 0 && (
          <View style={styles.reasonsRow}>
            {uniqueReasons.map((r, i) => (
              <View key={i} style={styles.reasonChip}>
                <Text style={styles.reasonChipText}>{r}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => handleDismissUser(item.targetAuthor)}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color="#6750A4" />
            <Text style={styles.dismissBtnText}>신고 무시</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isEmpty = tab === 'content' ? groups.length === 0 : userGroups.length === 0;

  return (
    <View style={styles.container}>
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
          keyExtractor={(item) => item.targetAuthor}
          renderItem={renderUserItem}
          contentContainerStyle={styles.list}
        />
      )}
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
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  reportCount: { fontSize: 13, fontWeight: '700', color: '#E53935', flex: 1 },
  dateText: { fontSize: 11, color: '#9E9E9E' },
  parentDiscussion: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  parentDiscussionText: { fontSize: 11, color: '#9E9E9E', flex: 1 },
  targetContent: { fontSize: 14, color: '#1C1B1F', lineHeight: 20 },
  targetAuthor: { fontSize: 12, color: '#757575' },
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
});
