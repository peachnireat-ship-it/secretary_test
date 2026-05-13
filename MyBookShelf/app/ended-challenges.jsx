import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExpiredChallengeBooks } from '../database/database';

const PURPLE = '#6750A4';
const PURPLE_LIGHT = '#E8DEF8';

function fmtDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_LABEL = {
  reading: '읽는 중',
  want_to_read: '읽고 싶음',
  completed: '완독',
};

const STATUS_COLOR = {
  reading: '#1976D2',
  want_to_read: '#6B6278',
  completed: '#388E3C',
};

function ExpiredCard({ book, onPress }) {
  const overDays = book.goalDate
    ? Math.ceil((Date.now() - book.goalDate) / 86400000)
    : null;

  const checkins = (() => {
    try { return JSON.parse(book.checkins || '[]'); } catch { return []; }
  })();

  const startTs = book.startDate || book.createdAt;
  const totalDays = (book.goalDate && startTs)
    ? Math.max(Math.ceil((book.goalDate - startTs) / 86400000), 1)
    : null;

  const progressPct = (book.goalDate && startTs && totalDays)
    ? Math.min(100, Math.round(((Date.now() - startTs) / (book.goalDate - startTs)) * 100))
    : null;

  const statusColor = STATUS_COLOR[book.status] || '#6B6278';
  const statusLabel = STATUS_LABEL[book.status] || book.status;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
          {book.author ? <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {overDays !== null && (
            <View style={styles.overBadge}>
              <Text style={styles.overBadgeText}>D+{overDays}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>
          시작: {fmtDate(startTs) ?? '?'}
        </Text>
        <Text style={styles.dateLabel}>
          목표: {fmtDate(book.goalDate) ?? '?'}
        </Text>
      </View>

      {totalDays !== null && (
        <View style={{ marginTop: 10 }}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${Math.min(100, progressPct ?? 0)}%` }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.checkinCount}>인증 {checkins.length}회</Text>
            <Text style={styles.totalDaysTxt}>총 {totalDays}일 챌린지</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function EndedChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setBooks(getExpiredChallengeBooks());
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>{'← 뒤로'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.screenTitle}>종료된 챌린지 목록</Text>
      <Text style={styles.screenSub}>완독 목표일이 지난 책들입니다.</Text>

      {books.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>🎉</Text>
          <Text style={styles.emptyText}>종료된 챌린지가 없습니다</Text>
        </View>
      ) : (
        books.map((book) => (
          <ExpiredCard
            key={book.id}
            book={book}
            onPress={() => router.push(`/book/${book.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },

  headerRow: { marginBottom: 8 },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { fontSize: 14, color: PURPLE, fontWeight: '600' },

  screenTitle: { fontSize: 22, fontWeight: 'bold', color: '#1C1B1F', marginBottom: 4 },
  screenSub: { fontSize: 13, color: '#6B6278', marginBottom: 20 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  bookTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B1F' },
  bookAuthor: { fontSize: 12, color: '#6B6278', marginTop: 2 },

  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  overBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFEBEE',
  },
  overBadgeText: { fontSize: 11, fontWeight: '700', color: '#C62828' },

  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dateLabel: { fontSize: 11, color: '#9E8FB2' },

  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: PURPLE_LIGHT,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: PURPLE,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  checkinCount: { fontSize: 11, color: '#6B6278' },
  totalDaysTxt: { fontSize: 11, color: '#9E8FB2' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9E9E9E', textAlign: 'center' },
});
