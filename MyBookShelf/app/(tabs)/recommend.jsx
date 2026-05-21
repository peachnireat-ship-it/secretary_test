import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Modal, Pressable, Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { insertBook } from '../../database/database';

const CATEGORIES = [
  { key: 'fiction',                        googleKey: '소설',      label: '소설' },
  { key: 'mystery_and_detective_stories',  googleKey: '추리소설',  label: '추리/미스터리' },
  { key: 'science_fiction',               googleKey: 'SF소설',    label: 'SF' },
  { key: 'fantasy',                        googleKey: '판타지',    label: '판타지' },
  { key: 'historical_fiction',             googleKey: '역사소설',  label: '역사소설' },
  { key: 'science',                        googleKey: '과학',      label: '과학' },
  { key: 'biography',                      googleKey: '자서전',    label: '인물/자서전' },
  { key: 'children',                       googleKey: '동화',      label: '어린이' },
];

function todayCatIndex() {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now - new Date(now.getFullYear(), 0, 0)) / 86_400_000
  );
  return dayOfYear % CATEGORIES.length;
}

const ALADIN_TTB_KEY = '***ALADIN_TTB_KEY_REMOVED***';

async function fetchAladinBooks(keyword) {
  const res = await fetch(
    `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_TTB_KEY}&Query=${encodeURIComponent(keyword)}&QueryType=Keyword&SearchTarget=Book&MaxResults=13&output=js&Version=20131101&Cover=Big`
  );
  if (!res.ok) throw new Error('fetch error');
  const data = await res.json();
  return (data.item || []).filter(item => item.cover && !item.cover.includes('noimg'));
}

function normalizeAladinBook(item) {
  const author = item.author
    ? item.author.replace(/\s*\(.*?\)/g, '').split(',')[0].trim() || '저자 미상'
    : '저자 미상';
  return {
    id: String(item.itemId),
    title: item.title || '',
    author,
    coverUrl: item.cover || null,
    coverUrlLarge: item.cover || null,
    year: item.pubDate ? parseInt(item.pubDate.slice(0, 4), 10) : null,
    description: item.description || null,
    source: 'aladin',
    rawKey: String(item.itemId),
  };
}

function normalizeOpenLibBook(work) {
  return {
    id: work.key,
    title: work.title || '',
    author: work.authors?.[0]?.name || '저자 미상',
    coverUrl: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` : null,
    coverUrlLarge: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg` : null,
    year: work.first_publish_year || null,
    description: null,
    source: 'openlib',
    rawKey: work.key,
  };
}

async function fetchSubjectBooks(subject) {
  const res = await fetch(
    `https://openlibrary.org/subjects/${subject}.json?limit=13`
  );
  if (!res.ok) throw new Error('fetch error');
  const data = await res.json();
  return (data.works || []).filter(w => w.cover_id);
}

async function fetchWorkDetail(key) {
  const res = await fetch(`https://openlibrary.org${key}.json`);
  if (!res.ok) throw new Error('fetch error');
  return res.json();
}

export default function RecommendScreen() {
  const [catIdx, setCatIdx]           = useState(todayCatIndex);
  const [bookRegion, setBookRegion]   = useState('korean');
  const [books, setBooks]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadBooks = useCallback(async (idx, region) => {
    setLoading(true);
    setBooks([]);
    try {
      let normalized;
      if (region === 'foreign') {
        const works = await fetchSubjectBooks(CATEGORIES[idx].key);
        normalized = works.map(normalizeOpenLibBook);
      } else {
        const items = await fetchAladinBooks(CATEGORIES[idx].googleKey);
        normalized = items.map(normalizeAladinBook);
      }
      setBooks(normalized);
    } catch {
      // 네트워크 오류 → 빈 목록 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { loadBooks(catIdx, bookRegion); }, [catIdx, bookRegion])
  );

  const openBook = async (book) => {
    setSelected(book);
    setDetail(null);
    if (book.source === 'openlib') {
      setDetailLoading(true);
      try {
        const d = await fetchWorkDetail(book.rawKey);
        setDetail(d);
      } catch {
        // 상세 로드 실패는 무시
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const closeModal = () => {
    setSelected(null);
    setDetail(null);
  };

  const addToShelf = () => {
    if (!selected) return;
    try {
      insertBook({
        title:      selected.title,
        author:     selected.author,
        totalPages: 0,
        status:     'want_to_read',
        bookType:   'physical',
        genre:      CATEGORIES[catIdx].label,
        review:     '',
      });
      Alert.alert('추가 완료', `"${selected.title}"을(를) 서재에 추가했습니다.`);
      closeModal();
    } catch {
      Alert.alert('오류', '서재 추가에 실패했습니다.');
    }
  };

  const todayLabel = (() => {
    const d = new Date();
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  })();

  const featured = books[0] ?? null;
  const rest     = books.slice(1);

  const descText = (() => {
    if (selected?.source === 'google' || selected?.source === 'aladin') {
      const raw = selected.description || '';
      return raw.length > 300 ? raw.slice(0, 300) + '…' : raw || null;
    }
    if (!detail?.description) return null;
    const raw = typeof detail.description === 'string'
      ? detail.description
      : detail.description?.value ?? '';
    return raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
  })();

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <Text style={styles.dateLabel}>{todayLabel}</Text>
        <Text style={styles.headerTitle}>오늘의 추천 도서</Text>
        <Text style={styles.headerSub}>
          오늘의 장르: <Text style={styles.catHighlight}>{CATEGORIES[catIdx].label}</Text>
        </Text>
      </View>

      {/* ── 한국/외국 탭 ── */}
      <View style={styles.regionTabs}>
        <TouchableOpacity
          style={[styles.regionTab, bookRegion === 'korean' && styles.regionTabActive]}
          onPress={() => setBookRegion('korean')}
        >
          <Text style={[styles.regionTabText, bookRegion === 'korean' && styles.regionTabTextActive]}>
            한국도서
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.regionTab, bookRegion === 'foreign' && styles.regionTabActive]}
          onPress={() => setBookRegion('foreign')}
        >
          <Text style={[styles.regionTabText, bookRegion === 'foreign' && styles.regionTabTextActive]}>
            외국도서
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── 장르 칩 ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBar}
        contentContainerStyle={styles.chipContent}
      >
        {CATEGORIES.map((cat, i) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.chip, catIdx === i && styles.chipActive]}
            onPress={() => setCatIdx(i)}
          >
            <Text style={[styles.chipText, catIdx === i && styles.chipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── 콘텐츠 ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6750A4" />
          <Text style={styles.loadingText}>책을 불러오는 중…</Text>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="wifi-outline" size={48} color="#BDBDBD" />
          <Text style={styles.emptyText}>추천 도서를 불러올 수 없습니다.</Text>
          <Text style={styles.emptyHint}>네트워크 연결을 확인해주세요.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadBooks(catIdx, bookRegion)}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.bookScroll} contentContainerStyle={styles.scroll}>
          {/* 오늘의 추천 (첫 번째 책) */}
          {featured && (
            <>
              <Text style={styles.sectionLabel}>오늘의 추천</Text>
              <TouchableOpacity style={styles.featuredCard} onPress={() => openBook(featured)} activeOpacity={0.85}>
                <Image
                  source={{ uri: featured.coverUrlLarge || featured.coverUrl }}
                  style={styles.featuredCover}
                  resizeMode="cover"
                />
                <View style={styles.featuredInfo}>
                  <View style={styles.todayBadge}>
                    <Ionicons name="star" size={11} color="#FFB800" />
                    <Text style={styles.todayBadgeText}>추천</Text>
                  </View>
                  <Text style={styles.featuredTitle} numberOfLines={3}>{featured.title}</Text>
                  <Text style={styles.featuredAuthor}>{featured.author}</Text>
                  {featured.year ? (
                    <Text style={styles.featuredYear}>{featured.year}년</Text>
                  ) : null}
                  <View style={styles.moreRow}>
                    <Text style={styles.moreText}>자세히 보기</Text>
                    <Ionicons name="chevron-forward" size={14} color="#6750A4" />
                  </View>
                </View>
              </TouchableOpacity>
            </>
          )}

          {/* 나머지 책 그리드 */}
          {rest.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                {CATEGORIES[catIdx].label} 추천 도서
              </Text>
              <View style={styles.grid}>
                {rest.map((book, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.bookCard}
                    onPress={() => openBook(book)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: book.coverUrl }}
                      style={styles.bookCover}
                      resizeMode="cover"
                    />
                    <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                    <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ── 상세 모달 ── */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.overlay} onPress={closeModal}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {selected && (
                <>
                  <View style={styles.sheetTop}>
                    {selected.coverUrl ? (
                      <Image
                        source={{ uri: selected.coverUrlLarge || selected.coverUrl }}
                        style={styles.sheetCover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.sheetCover, styles.noCover]}>
                        <Ionicons name="book-outline" size={36} color="#CAC4D0" />
                      </View>
                    )}
                    <View style={styles.sheetMeta}>
                      <Text style={styles.sheetTitle}>{selected.title}</Text>
                      <Text style={styles.sheetAuthor}>{selected.author}</Text>
                      {selected.year ? (
                        <Text style={styles.sheetYear}>{selected.year}년 출판</Text>
                      ) : null}
                      <View style={styles.genreBadge}>
                        <Text style={styles.genreBadgeText}>{CATEGORIES[catIdx].label}</Text>
                      </View>
                    </View>
                  </View>

                  {detailLoading ? (
                    <ActivityIndicator color="#6750A4" style={{ marginVertical: 16 }} />
                  ) : descText ? (
                    <Text style={styles.sheetDesc}>{descText}</Text>
                  ) : null}

                  <TouchableOpacity style={styles.addBtn} onPress={addToShelf}>
                    <Ionicons name="add-circle-outline" size={20} color="#fff" />
                    <Text style={styles.addBtnText}>내 서재에 추가</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  header: {
    backgroundColor: '#6750A4',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  dateLabel:     { fontSize: 12, color: '#D0BCFF', marginBottom: 2 },
  headerTitle:   { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSub:     { fontSize: 13, color: '#D0BCFF', marginTop: 4 },
  catHighlight:  { color: '#fff', fontWeight: 'bold' },

  chipBar:     { flexGrow: 0, flexShrink: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EDE7F6' },
  bookScroll:  { flex: 1 },
  chipContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#F3F0FA',
    borderWidth: 1, borderColor: '#E8E0F0',
  },
  chipActive:    { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  chipText:      { fontSize: 13, color: '#49454F', lineHeight: 20, includeFontPadding: false },
  chipTextActive:{ fontSize: 13, color: '#fff', fontWeight: 'bold', lineHeight: 20, includeFontPadding: false },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 14, color: '#9E9E9E' },
  emptyText:   { fontSize: 15, color: '#757575', fontWeight: '500' },
  emptyHint:   { fontSize: 13, color: '#BDBDBD' },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: '#6750A4', borderRadius: 20,
  },
  retryText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  scroll:        { padding: 16, paddingBottom: 32 },
  sectionLabel:  { fontSize: 14, fontWeight: 'bold', color: '#49454F', marginBottom: 10 },

  featuredCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  featuredCover: { width: 110, height: 160 },
  featuredInfo:  { flex: 1, padding: 14, justifyContent: 'center', gap: 6 },
  todayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF8E1', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  todayBadgeText: { fontSize: 11, color: '#F59E0B', fontWeight: 'bold' },
  featuredTitle:  { fontSize: 15, fontWeight: 'bold', color: '#1C1B1F', lineHeight: 22 },
  featuredAuthor: { fontSize: 13, color: '#6750A4' },
  featuredYear:   { fontSize: 11, color: '#9E9E9E' },
  moreRow:        { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  moreText:       { fontSize: 12, color: '#6750A4', fontWeight: '500' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bookCard: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  bookCover: {
    width: '100%', aspectRatio: 0.67,
    borderRadius: 6, backgroundColor: '#EDE7F6',
  },
  bookTitle:  { fontSize: 11, color: '#1C1B1F', marginTop: 6, fontWeight: '500', lineHeight: 15 },
  bookAuthor: { fontSize: 10, color: '#9E9E9E', marginTop: 2 },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: '#E0E0E0',
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  sheetTop:    { flexDirection: 'row', gap: 14, marginBottom: 16 },
  sheetCover: {
    width: 100, height: 150,
    borderRadius: 10, backgroundColor: '#EDE7F6',
  },
  noCover:    { alignItems: 'center', justifyContent: 'center' },
  sheetMeta:  { flex: 1, gap: 6 },
  sheetTitle: { fontSize: 16, fontWeight: 'bold', color: '#1C1B1F', lineHeight: 22 },
  sheetAuthor:{ fontSize: 13, color: '#6750A4' },
  sheetYear:  { fontSize: 12, color: '#9E9E9E' },
  genreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE7F6', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  genreBadgeText: { fontSize: 11, color: '#6750A4', fontWeight: '500' },
  sheetDesc: {
    fontSize: 13, color: '#49454F', lineHeight: 20,
    marginBottom: 20,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6750A4', borderRadius: 14,
    paddingVertical: 14, gap: 8, marginTop: 8,
  },
  addBtnText: { fontSize: 15, color: '#fff', fontWeight: 'bold' },

  regionTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE7F6',
  },
  regionTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  regionTabActive:     { borderBottomColor: '#6750A4' },
  regionTabText:       { fontSize: 14, color: '#9E9E9E', fontWeight: '500' },
  regionTabTextActive: { color: '#6750A4', fontWeight: 'bold' },
});
