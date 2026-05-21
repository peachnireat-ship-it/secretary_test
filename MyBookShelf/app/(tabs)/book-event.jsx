import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getBooksByStatus, getBookReviews, getPref, setPref, addXp, isDoubleXpActive,
} from '../../database/database';

const PURPLE = '#6750A4';
const PURPLE_LIGHT = '#E8DEF8';

const EVENT_POOL = [
  { type: 'checkin',    icon: '✅', label: '오늘 독서 체크인하기',  xp: 20 },
  { type: 'memo1',      icon: '✏️', label: '메모 1개 남기기',      xp: 25 },
  { type: 'memo3',      icon: '📝', label: '메모 3개 남기기',      xp: 60 },
  { type: 'pages10',    icon: '📖', label: '오늘 10페이지 읽기',   xp: 20 },
  { type: 'pages20',    icon: '📖', label: '오늘 20페이지 읽기',   xp: 35 },
  { type: 'pages30',    icon: '📖', label: '오늘 30페이지 읽기',   xp: 50 },
  { type: 'pages50',    icon: '📖', label: '오늘 50페이지 읽기',   xp: 80 },
  { type: 'progress5',  icon: '🚀', label: '진행률 5% 올리기',     xp: 40 },
  { type: 'progress10', icon: '🚀', label: '진행률 10% 올리기',    xp: 70 },
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function pickTemplate(bookId, book) {
  let s = ((bookId * 31337) + parseInt(todayKey(), 10)) & 0x7fffffff;
  const rand = () => { s = ((s * 1664525) + 1013904223) & 0x7fffffff; return s; };
  const tp = book.totalPages || 0;
  const pool = EVENT_POOL.filter((e) => {
    if (tp === 0 && e.type.startsWith('progress')) return false;
    if (tp > 0 && tp < 10 && e.type === 'pages10') return false;
    if (tp > 0 && tp < 20 && e.type === 'pages20') return false;
    if (tp > 0 && tp < 30 && e.type === 'pages30') return false;
    if (tp > 0 && tp < 50 && e.type === 'pages50') return false;
    return true;
  });
  return pool[rand() % pool.length];
}

function calcProgress(saved, book) {
  const { type, startVal, joinedAt } = saved;
  if (type === 'checkin') {
    const todayTs = new Date().setHours(0, 0, 0, 0);
    return { current: JSON.parse(book.checkins || '[]').includes(todayTs) ? 1 : 0, target: 1 };
  }
  if (type.startsWith('pages')) {
    const target = parseInt(type.replace('pages', ''), 10);
    return { current: Math.min(Math.max(0, (book.currentPage || 0) - startVal), target), target };
  }
  if (type.startsWith('memo')) {
    const target = parseInt(type.replace('memo', ''), 10);
    const count = getBookReviews(book.id).filter((r) => r.createdAt >= joinedAt).length;
    return { current: Math.min(count, target), target };
  }
  if (type.startsWith('progress')) {
    const target = parseInt(type.replace('progress', ''), 10);
    return { current: Math.min(Math.max(0, (book.progressPct || 0) - startVal), target), target };
  }
  return { current: 0, target: 1 };
}

function fmtProgress(type, current, target) {
  if (type === 'checkin') return current ? '체크인 완료!' : '체크인 전';
  if (type.startsWith('pages')) return `${current} / ${target}페이지`;
  if (type.startsWith('memo')) return `${current} / ${target}개`;
  if (type.startsWith('progress')) return `+${current}% / +${target}%`;
  return `${current} / ${target}`;
}

function EventCard({ book }) {
  const prefKey = `ev_${book.id}_${todayKey()}`;
  const [saved, setSaved] = useState(() => {
    const raw = getPref(prefKey);
    return raw ? JSON.parse(raw) : null;
  });

  const template = pickTemplate(book.id, book);
  const progress = saved && !saved.claimed ? calcProgress(saved, book) : null;
  const isDone = progress ? progress.current >= progress.target : false;
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

  const handleJoin = () => {
    let startVal = 0;
    if (template.type.startsWith('pages')) startVal = book.currentPage || 0;
    else if (template.type.startsWith('progress')) startVal = book.progressPct || 0;
    const data = { ...template, joinedAt: Date.now(), startVal, claimed: false };
    setPref(prefKey, JSON.stringify(data));
    setSaved(data);
  };

  const handleClaim = () => {
    const mult = isDoubleXpActive() ? 2 : 1;
    const earned = saved.xp * mult;
    addXp(earned);
    const next = { ...saved, claimed: true };
    setPref(prefKey, JSON.stringify(next));
    setSaved(next);
    Alert.alert('보상 획득!', `${saved.icon} ${saved.label}\n+${earned} XP 획득했습니다!`);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
          {book.author ? <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text> : null}
        </View>
        <View style={[styles.xpTag, saved?.claimed && styles.xpTagDone]}>
          <Text style={[styles.xpTagText, saved?.claimed && styles.xpTagTextDone]}>
            {saved?.claimed ? '✓ 완료' : `+${template.xp} XP`}
          </Text>
        </View>
      </View>

      <View style={styles.eventRow}>
        <Text style={styles.eventIcon}>{template.icon}</Text>
        <Text style={styles.eventLabel}>{template.label}</Text>
      </View>

      {saved && !saved.claimed && (
        <>
          <View style={styles.progBg}>
            <View style={[styles.progFill, { width: `${pct}%` }, isDone && styles.progFillDone]} />
          </View>
          <Text style={styles.progText}>
            {isDone ? '달성! 보상을 받아가세요 🎉' : fmtProgress(saved.type, progress.current, progress.target)}
          </Text>
        </>
      )}

      {saved?.claimed && (
        <Text style={styles.doneText}>오늘 이벤트 완료! 내일 새로운 이벤트가 기다려요</Text>
      )}

      {!saved && (
        <TouchableOpacity style={styles.joinBtn} onPress={handleJoin}>
          <Ionicons name="flash-outline" size={15} color="#fff" />
          <Text style={styles.joinBtnText}>이벤트 참여하기</Text>
        </TouchableOpacity>
      )}

      {saved && !saved.claimed && isDone && (
        <TouchableOpacity style={styles.claimBtn} onPress={handleClaim}>
          <Ionicons name="gift-outline" size={15} color="#fff" />
          <Text style={styles.claimBtnText}>보상 받기</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function BookEventScreen() {
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setBooks(getBooksByStatus('reading'));
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.title}>오늘의 독서 이벤트</Text>
      <Text style={styles.subtitle}>읽는 중인 책별 랜덤 미션에 도전하세요!</Text>

      {books.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📚</Text>
          <Text style={styles.emptyText}>
            읽는 중인 책이 없습니다.{'\n'}책을 추가하고 이벤트에 참여해보세요!
          </Text>
        </View>
      ) : (
        books.map((book) => (
          <EventCard key={book.id} book={book} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1C1B1F', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6B6278', marginBottom: 20 },
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  bookTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B1F' },
  bookAuthor: { fontSize: 12, color: '#6B6278', marginTop: 2 },
  xpTag: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  xpTagDone: { backgroundColor: '#E8F5E9' },
  xpTagText: { fontSize: 12, fontWeight: '700', color: PURPLE },
  xpTagTextDone: { color: '#388E3C' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  eventIcon: { fontSize: 22 },
  eventLabel: { fontSize: 15, fontWeight: '600', color: '#1C1B1F', flex: 1 },
  progBg: {
    height: 6,
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progFill: { height: '100%', backgroundColor: PURPLE, borderRadius: 3 },
  progFillDone: { backgroundColor: '#4CAF50' },
  progText: { fontSize: 11, color: '#9E8FB2', marginBottom: 10 },
  doneText: { fontSize: 12, color: '#388E3C', fontWeight: '600', marginTop: 4 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PURPLE,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  joinBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  claimBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9E9E9E', textAlign: 'center', lineHeight: 22 },
});
