import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import { useCallback } from 'react';
import { useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFiveStarBooks } from '../../database/database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHELF_PADDING = 34; // bookcase marginHorizontal(12) + CASE_THICKNESS(20) + shelfRow paddingHorizontal(2)
const BOOK_GAP = 5;
const BOOKS_PER_SHELF = 4;
const BOOK_WIDTH = Math.floor((SCREEN_WIDTH - SHELF_PADDING * 2 - BOOK_GAP * (BOOKS_PER_SHELF - 1)) / BOOKS_PER_SHELF);
const BOOK_HEIGHT = Math.round(BOOK_WIDTH * 1.65);

// 클래식 하드커버 배색 — 어두운 진한 색 + 금색 악센트
const SPINE_COLORS = [
  { bg: '#1A3A5C', fg: '#F5E6C8', binding: '#0F2238', accent: '#C9A84C' },
  { bg: '#6B1E2A', fg: '#F5E6C8', binding: '#4A1018', accent: '#D4A854' },
  { bg: '#1E4A20', fg: '#F5E6C8', binding: '#102812', accent: '#B8A860' },
  { bg: '#4A2C0E', fg: '#F5E6C8', binding: '#2E1A08', accent: '#C8A040' },
  { bg: '#2A1A4A', fg: '#F5E6C8', binding: '#1A0E2E', accent: '#B090D0' },
  { bg: '#1A3A2C', fg: '#F5E6C8', binding: '#0E221A', accent: '#90C8A0' },
  { bg: '#4A1A10', fg: '#F5E6C8', binding: '#2E0E08', accent: '#D4A854' },
  { bg: '#0E2A3A', fg: '#F5E6C8', binding: '#081820', accent: '#60A8C8' },
  { bg: '#3A2A1A', fg: '#F5E6C8', binding: '#221A10', accent: '#C8A840' },
  { bg: '#1A2A3A', fg: '#F5E6C8', binding: '#0E1A24', accent: '#C8B870' },
];

function bookColor(index) {
  return SPINE_COLORS[index % SPINE_COLORS.length];
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 60);
  const g = Math.min(255, ((n >> 8) & 0xff) + 60);
  const b = Math.min(255, (n & 0xff) + 60);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const HEIGHT_VARIANTS = [0, 8, 4, 12, 2, 7, 1, 10, 5, 3];

function BookSpine({ book, index, onPress }) {
  const colors = bookColor(index);
  const bookH = BOOK_HEIGHT - HEIGHT_VARIANTS[index % HEIGHT_VARIANTS.length];
  return (
    <TouchableOpacity
      style={[styles.bookSpine, { width: BOOK_WIDTH, height: bookH, backgroundColor: colors.bg }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {book.cover ? (
        <Image source={{ uri: book.cover }} style={styles.coverImage} />
      ) : (
        <>
          {/* 클로스 바인딩 — 왼쪽 가죽/천 재질 띠 */}
          <View style={[styles.spineBinding, { backgroundColor: colors.binding }]}>
            <View style={styles.bindingRib} />
            <View style={styles.bindingRib} />
            <View style={styles.bindingRib} />
          </View>

          {/* 척추 본문 — 금색 밴드 + 제목/저자 */}
          <View style={styles.spineCenter}>
            <View style={[styles.goldBand, { backgroundColor: colors.accent }]} />
            <View style={styles.spineTitleWrap}>
              <Text style={[styles.spineTitle, { color: colors.fg }]} numberOfLines={5}>
                {book.title}
              </Text>
              {book.author ? (
                <Text style={[styles.spineAuthor, { color: colors.fg }]} numberOfLines={2}>
                  {book.author}
                </Text>
              ) : null}
            </View>
            <View style={[styles.goldBand, { backgroundColor: colors.accent }]} />
          </View>

          {/* 페이지 단면 — 오른쪽 크림색 */}
          <View style={styles.spinePageEdge} />

          {/* 상단 광택 라인 */}
          <View style={[styles.spineTopEdge, { backgroundColor: lighten(colors.bg) }]} />
        </>
      )}
    </TouchableOpacity>
  );
}

function Shelf({ books, startIndex, onPressBook }) {
  const fillers = BOOKS_PER_SHELF - books.length;
  return (
    <View style={styles.shelfWrapper}>
      <View style={styles.shelfRow}>
        {books.map((book, i) => (
          <BookSpine
            key={book.id}
            book={book}
            index={startIndex + i}
            onPress={() => onPressBook(book.id)}
          />
        ))}
        {Array.from({ length: fillers }).map((_, i) => (
          <View key={`filler-${i}`} style={[styles.fillerBook, { width: BOOK_WIDTH, height: BOOK_HEIGHT }]} />
        ))}
      </View>
      {/* 선반 판자 앞면 하이라이트 */}
      <View style={styles.shelfEdge} />
      {/* 선반 판자 본체 (나무 결) */}
      <View style={styles.shelfBoard}>
        <View style={styles.shelfGrainLine} />
        <View style={[styles.shelfGrainLine, { top: 8 }]} />
        <View style={[styles.shelfGrainLine, { top: 14, opacity: 0.06 }]} />
      </View>
      {/* 선반 아래 그림자 */}
      <View style={styles.shelfShadow} />
    </View>
  );
}

export default function HallOfFameScreen() {
  const router = useRouter();
  const [books, setBooks] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setBooks(getFiveStarBooks());
    }, [])
  );

  const shelves = [];
  for (let i = 0; i < books.length; i += BOOKS_PER_SHELF) {
    shelves.push(books.slice(i, i + BOOKS_PER_SHELF));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="star" size={22} color="#C9A84C" />
        <Text style={styles.headerTitle}>명예의 전당</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{books.length}</Text>
        </View>
      </View>
      <Text style={styles.headerSub}>별점 5점에 빛나는 나의 인생책들✨</Text>

      {books.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="book-outline" size={64} color="#CAC4D0" />
          <Text style={styles.emptyTitle}>아직 인생 도서가 없어요</Text>
          <Text style={styles.emptyDesc}>완독한 책에 별점 5점을 주면{'\n'}이곳에 모입니다.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.bookcase}>
            {/* 나무 결 세로 선 */}
            <View style={styles.woodGrain1} />
            <View style={styles.woodGrain2} />
            <View style={styles.woodGrain3} />
            {/* 프레임 — 상/좌/우/하 패널 */}
            <View style={styles.bookcaseTop} />
            <View style={styles.bookcaseLeft} />
            <View style={styles.bookcaseRight} />
            {/* 뒷벽 — 책 뒤로 보이는 안쪽 판 */}
            <View style={styles.bookcaseBackPanel} />
            <View style={styles.bookcaseInner}>
              {shelves.map((shelf, idx) => (
                <Shelf
                  key={idx}
                  books={shelf}
                  startIndex={idx * BOOKS_PER_SHELF}
                  onPressBook={(id) => router.push(`/book/${id}`)}
                />
              ))}
            </View>
            <View style={styles.bookcaseBottom} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const CASE_THICKNESS = 20;
const BOARD_HEIGHT = 20;
const BINDING_WIDTH = 10;
const PAGE_EDGE_WIDTH = 5;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEE8DC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C1A0E',
    flex: 1,
  },
  headerBadge: {
    backgroundColor: '#5C3A1E',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  headerBadgeText: {
    color: '#F5E6C8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  headerSub: {
    fontSize: 13,
    color: '#7A6552',
    paddingHorizontal: 20,
    marginBottom: 12,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // ── 책장 (월넛 원목) ───────────────────────────────
  bookcase: {
    marginHorizontal: 12,
    backgroundColor: '#7A4E28',
    borderRadius: 4,
    padding: CASE_THICKNESS,
    paddingBottom: CASE_THICKNESS + 4,
    elevation: 12,
    shadowColor: '#1A0800',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  woodGrain1: {
    position: 'absolute',
    top: 0,
    left: '28%',
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.09)',
  },
  woodGrain2: {
    position: 'absolute',
    top: 0,
    left: '58%',
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  woodGrain3: {
    position: 'absolute',
    top: 0,
    left: '80%',
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  bookcaseLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: CASE_THICKNESS,
    backgroundColor: '#5C3A1E', // 그림자 쪽 — 어둡게
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  bookcaseRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: CASE_THICKNESS,
    backgroundColor: '#9A6040', // 빛 쪽 — 밝게
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  bookcaseTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: CASE_THICKNESS,
    backgroundColor: '#A07050', // 상판 — 가장 밝음
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  bookcaseBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CASE_THICKNESS + 4,
    backgroundColor: '#4A2810', // 하판 — 가장 어둠
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  bookcaseBackPanel: {
    position: 'absolute',
    left: CASE_THICKNESS,
    right: CASE_THICKNESS,
    top: CASE_THICKNESS,
    bottom: CASE_THICKNESS + 4,
    backgroundColor: '#6A3C20', // 안쪽 뒷벽
  },
  bookcaseInner: {
    gap: 0,
  },

  // ── 선반 ──────────────────────────────────────────
  shelfWrapper: {
    marginBottom: 0,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BOOK_GAP,
    paddingHorizontal: 2,
    paddingTop: 10,
    paddingBottom: 0,
  },
  shelfEdge: {
    height: 3,
    backgroundColor: '#C8986A', // 선반 앞면 하이라이트
  },
  shelfBoard: {
    height: BOARD_HEIGHT,
    backgroundColor: '#8B5E30',
    elevation: 4,
    shadowColor: '#1A0800',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  shelfGrainLine: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  shelfShadow: {
    height: 9,
    backgroundColor: 'rgba(20,8,0,0.38)',
    marginBottom: 8,
  },

  // ── 책 척추 ────────────────────────────────────────
  bookSpine: {
    borderRadius: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 5 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  // 왼쪽 클로스/가죽 바인딩 띠
  spineBinding: {
    width: BINDING_WIDTH,
    height: '100%',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 18,
  },
  bindingRib: {
    width: 6,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 1,
  },
  // 중앙 — 금색 밴드 + 제목
  spineCenter: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  goldBand: {
    height: 4,
    width: '100%',
  },
  spineTitleWrap: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  spineTitle: {
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 12,
    letterSpacing: 0,
  },
  spineAuthor: {
    fontSize: 7,
    textAlign: 'center',
    marginTop: 3,
    opacity: 0.72,
    lineHeight: 10,
  },
  // 오른쪽 — 종이 단면
  spinePageEdge: {
    width: PAGE_EDGE_WIDTH,
    height: '100%',
    backgroundColor: '#EDE5D0',
    borderLeftWidth: 0.5,
    borderLeftColor: 'rgba(0,0,0,0.18)',
  },
  // 상단 광택 하이라이트
  spineTopEdge: {
    position: 'absolute',
    top: 0,
    left: BINDING_WIDTH,
    right: PAGE_EDGE_WIDTH,
    height: 3,
    opacity: 0.38,
  },

  fillerBook: {
    backgroundColor: 'transparent',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  // ── 빈 상태 ────────────────────────────────────────
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#49454F',
  },
  emptyDesc: {
    fontSize: 14,
    color: '#7A6552',
    textAlign: 'center',
    lineHeight: 22,
  },
});
