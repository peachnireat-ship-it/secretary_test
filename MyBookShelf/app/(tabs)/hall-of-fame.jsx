import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useCallback } from 'react';
import { useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFiveStarBooks } from '../../database/database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHELF_PADDING = 16;
const BOOK_GAP = 6;
const BOOKS_PER_SHELF = 4;
const BOOK_WIDTH = Math.floor((SCREEN_WIDTH - SHELF_PADDING * 2 - BOOK_GAP * (BOOKS_PER_SHELF - 1)) / BOOKS_PER_SHELF);
const BOOK_HEIGHT = Math.round(BOOK_WIDTH * 1.55);

const SPINE_COLORS = [
  ['#6750A4', '#fff'],
  ['#B5838D', '#fff'],
  ['#2D6A4F', '#fff'],
  ['#1565C0', '#fff'],
  ['#BF6900', '#fff'],
  ['#6D4C41', '#fff'],
  ['#37474F', '#fff'],
  ['#AD1457', '#fff'],
  ['#283593', '#fff'],
  ['#558B2F', '#fff'],
];

function bookColor(index) {
  return SPINE_COLORS[index % SPINE_COLORS.length];
}

function BookSpine({ book, index, onPress }) {
  const [bg, fg] = bookColor(index);
  const bookH = BOOK_HEIGHT - HEIGHT_VARIANTS[index % HEIGHT_VARIANTS.length];
  return (
    <TouchableOpacity
      style={[styles.bookSpine, { width: BOOK_WIDTH, height: bookH, backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.spineBinding, { backgroundColor: darken(bg) }]} />
      <View style={styles.spineTitleWrap}>
        <Text style={[styles.spineTitle, { color: fg }]} numberOfLines={4}>
          {book.title}
        </Text>
        {book.author ? (
          <Text style={[styles.spineAuthor, { color: fg }]} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}
      </View>
      <View style={styles.spinePageEdge} />
      <View style={[styles.spineTopEdge, { backgroundColor: lighten(bg) }]} />
      <View style={[styles.spineDecoBandTop, { backgroundColor: darken(bg) }]} />
      <View style={[styles.spineDecoBandBottom, { backgroundColor: darken(bg) }]} />
      <View style={styles.spineStars}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Ionicons key={s} name="star" size={6} color="#FFD700" />
        ))}
      </View>
    </TouchableOpacity>
  );
}

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 40);
  const g = Math.max(0, ((n >> 8) & 0xff) - 40);
  const b = Math.max(0, (n & 0xff) - 40);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 50);
  const g = Math.min(255, ((n >> 8) & 0xff) + 50);
  const b = Math.min(255, (n & 0xff) + 50);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const HEIGHT_VARIANTS = [0, 7, 3, 9, 2, 6, 1, 8];

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
      <View style={styles.shelfBoardHighlight} />
      <View style={styles.shelfBoard} />
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
        <Ionicons name="star" size={22} color="#FFD700" />
        <Text style={styles.headerTitle}>명예의 전당</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{books.length}</Text>
        </View>
      </View>
      <Text style={styles.headerSub}>별점 5점을 부여한 나의 인생 도서들</Text>

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
            <View style={styles.bookcaseTop} />
            <View style={styles.bookcaseLeft} />
            <View style={styles.bookcaseRight} />
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

const CASE_THICKNESS = 14;
const BOARD_HEIGHT = 18;
const BINDING_WIDTH = 8;
const PAGE_EDGE_WIDTH = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
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
    color: '#3E2A1A',
    flex: 1,
  },
  headerBadge: {
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  headerBadgeText: {
    color: '#fff',
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

  bookcase: {
    marginHorizontal: 16,
    backgroundColor: '#8B5E3C',
    borderRadius: 6,
    padding: CASE_THICKNESS,
    paddingBottom: CASE_THICKNESS + 4,
    elevation: 6,
    shadowColor: '#3E2A1A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  bookcaseLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: CASE_THICKNESS,
    backgroundColor: '#6B4423',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  bookcaseRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: CASE_THICKNESS,
    backgroundColor: '#6B4423',
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  bookcaseTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: CASE_THICKNESS,
    backgroundColor: '#7A5030',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  bookcaseBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CASE_THICKNESS + 4,
    backgroundColor: '#6B4423',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  bookcaseInner: {
    gap: 0,
  },

  shelfWrapper: {
    marginBottom: 2,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BOOK_GAP,
    paddingHorizontal: 2,
    backgroundColor: '#C4956A',
    paddingTop: 10,
    paddingBottom: 0,
  },
  shelfBoardHighlight: {
    height: 4,
    backgroundColor: '#B8895D',
  },
  shelfBoard: {
    height: BOARD_HEIGHT,
    backgroundColor: '#9A6B44',
    elevation: 4,
    shadowColor: '#3E2A1A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  shelfShadow: {
    height: 6,
    backgroundColor: '#5C3D1E',
    opacity: 0.45,
    marginBottom: 10,
  },

  bookSpine: {
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'row',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
  },
  spineBinding: {
    width: BINDING_WIDTH,
    height: '100%',
    opacity: 0.85,
  },
  spinePageEdge: {
    width: PAGE_EDGE_WIDTH,
    height: '100%',
    backgroundColor: '#EDE8DC',
  },
  spineTopEdge: {
    position: 'absolute',
    top: 0,
    left: BINDING_WIDTH,
    right: PAGE_EDGE_WIDTH,
    height: 3,
    opacity: 0.35,
  },
  spineDecoBandTop: {
    position: 'absolute',
    top: 12,
    left: BINDING_WIDTH,
    right: PAGE_EDGE_WIDTH,
    height: 2,
    opacity: 0.5,
  },
  spineDecoBandBottom: {
    position: 'absolute',
    bottom: 18,
    left: BINDING_WIDTH,
    right: PAGE_EDGE_WIDTH,
    height: 2,
    opacity: 0.5,
  },
  spineTitleWrap: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spineTitle: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 13,
  },
  spineAuthor: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 3,
    opacity: 0.8,
    lineHeight: 10,
  },
  spineStars: {
    position: 'absolute',
    bottom: 5,
    left: BINDING_WIDTH,
    right: PAGE_EDGE_WIDTH,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 1,
  },
  fillerBook: {
    backgroundColor: 'transparent',
  },

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
