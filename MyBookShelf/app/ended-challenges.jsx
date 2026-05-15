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

function ExpiredCard({ book, onPress, isSuccess }) {
  const overDays = (!isSuccess && book.goalDate)
    ? Math.ceil((Date.now() - book.goalDate) / 86400000)
    : null;

  const checkins = (() => {
    try { return JSON.parse(book.checkins || '[]'); } catch { return []; }
  })();

  const startTs = book.startDate || book.createdAt;
  const totalDays = (book.goalDate && startTs)
    ? Math.max(Math.ceil((book.goalDate - startTs) / 86400000), 1)
    : null;

  const progressPct = isSuccess
    ? 100
    : (book.goalDate && startTs && totalDays)
    ? Math.min(100, Math.round(((Date.now() - startTs) / (book.goalDate - startTs)) * 100))
    : null;

  const completionDays = (isSuccess && book.endDate && startTs)
    ? Math.max(1, Math.round((new Date(book.endDate).setHours(0, 0, 0, 0) - new Date(startTs).setHours(0, 0, 0, 0)) / 86400000) + 1)
    : null;

  return (
    <TouchableOpacity style={[styles.card, isSuccess && styles.cardSuccess]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
          {book.author ? <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {isSuccess ? (
            <View style={styles.successBadge}>
              <Text style={styles.successBadgeText}>🎉 성공!</Text>
            </View>
          ) : overDays !== null ? (
            <View style={styles.overBadge}>
              <Text style={styles.overBadgeText}>D+{overDays}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.totalDaysTxt}>총 {totalDays}일 챌린지 중 
          {isSuccess && completionDays !== null
            ? ` ${completionDays}일 만에 완독`
            : `시작: ${fmtDate(startTs) ?? '?'}`}
        </Text>
        <Text style={styles.dateLabel}>
          {isSuccess
            ? `완독일: ${fmtDate(book.endDate) ?? '?'}`
            : `목표: ${fmtDate(book.goalDate) ?? '?'}`}
        </Text>
      </View>

      {totalDays !== null && (
        <View style={{ marginTop: 10 }}>
          <View style={styles.progressBg}>
            <View style={[
              styles.progressFill,
              { width: `${Math.min(100, progressPct ?? 0)}%`, backgroundColor: isSuccess ? '#4CAF50' : PURPLE },
            ]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.checkinCount}>인증 {checkins.length}회</Text>
            
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
      const data = getExpiredChallengeBooks();
      const testBook = data.find(b => b.title === 'test');
      if (testBook) {
        const now = Date.now();
        const goalDate = testBook.goalDate;
        const startTs = testBook.startDate || testBook.createdAt;
        const overDaysRaw = goalDate ? (now - goalDate) / 86400000 : null;
        const overDays = goalDate ? Math.ceil(overDaysRaw) : null;
        const goalDateObj = goalDate ? new Date(goalDate) : null;
        const goalLocalMidnight = goalDate ? new Date(goalDate).setHours(0, 0, 0, 0) : null;
        const todayLocalMidnight = new Date().setHours(0, 0, 0, 0);

        console.log('=== [test] 독서 기록 상세 ===');
        console.log('id:', testBook.id);
        console.log('title:', testBook.title);
        console.log('status:', testBook.status);
        console.log('goalDate (raw ts):', goalDate);
        console.log('goalDate (UTC ISO):', goalDateObj ? goalDateObj.toISOString() : null);
        console.log('goalDate (Local):', goalDateObj ? goalDateObj.toLocaleString('ko-KR') : null);
        console.log('startDate (raw ts):', startTs);
        console.log('startDate (Local):', startTs ? new Date(startTs).toLocaleString('ko-KR') : null);
        console.log('endDate (raw ts):', testBook.endDate);
        console.log('endDate (Local):', testBook.endDate ? new Date(testBook.endDate).toLocaleString('ko-KR') : null);
        console.log('createdAt (raw ts):', testBook.createdAt);
        console.log('--- D-day 계산 ---');
        console.log('Date.now():', now, '→', new Date(now).toLocaleString('ko-KR'));
        console.log('goalDate가 UTC 자정 기준임:', goalDateObj ? goalDateObj.getHours() === 0 && goalDateObj.getMinutes() === 0 && goalDateObj.getSeconds() === 0 : 'N/A');
        console.log('(Date.now() - goalDate)ms:', goalDate ? now - goalDate : null);
        console.log('overDays (현재 계산):', overDays, '← Math.ceil(', overDaysRaw?.toFixed(4), ')');
        console.log('goalDate 로컬 자정:', goalLocalMidnight, '→', goalLocalMidnight ? new Date(goalLocalMidnight).toLocaleString('ko-KR') : null);
        console.log('오늘 로컬 자정:', todayLocalMidnight, '→', new Date(todayLocalMidnight).toLocaleString('ko-KR'));
        console.log('overDays (수정 계산):', goalLocalMidnight ? Math.ceil((todayLocalMidnight - goalLocalMidnight) / 86400000) : null);
        console.log('checkins:', testBook.checkins);
        console.log('=============================');
      } else {
        console.log('[ended-challenges] "test" 제목 도서를 찾을 수 없음. 전체 목록:', data.map(b => b.title));
      }
      setBooks(data);
    }, [])
  );

  const isSuccess = (b) => {
    if (!(b.status === 'completed' && b.endDate && b.goalDate)) return false;
    return new Date(b.endDate).setHours(0, 0, 0, 0) <= new Date(b.goalDate).setHours(0, 0, 0, 0);
  };
  const successBooks = books.filter(isSuccess);
  const failedBooks = books.filter((b) => !isSuccess(b));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >

      {books.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>🎉</Text>
          <Text style={styles.emptyText}>종료된 챌린지가 없습니다</Text>
        </View>
      ) : (
        <>
          {successBooks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>챌린지 성공 🎉</Text>
              {successBooks.map((book) => (
                <ExpiredCard
                  key={book.id}
                  book={book}
                  isSuccess
                  onPress={() => router.push(`/book/${book.id}`)}
                />
              ))}
            </>
          )}
          {failedBooks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>미완료 챌린지</Text>
              {failedBooks.map((book) => (
                <ExpiredCard
                  key={book.id}
                  book={book}
                  onPress={() => router.push(`/book/${book.id}`)}
                />
              ))}
            </>
          )}
        </>
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

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B1F', marginBottom: 12, marginTop: 4 },
  cardSuccess: { borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  successBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#E8F5E9',
  },
  successBadgeText: { fontSize: 11, fontWeight: '700', color: '#388E3C' },
});
