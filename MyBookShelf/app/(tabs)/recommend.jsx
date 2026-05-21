import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Modal, Pressable, Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { insertBook, getAge } from '../../database/database';

const CATEGORIES = [
  { key: 'fiction',                        googleKey: '소설',      foreignKey: 'fiction novel',               label: '소설' },
  { key: 'mystery_and_detective_stories',  googleKey: '추리소설',  foreignKey: 'mystery detective thriller',  label: '추리/미스터리' },
  { key: 'science_fiction',               googleKey: 'SF소설',    foreignKey: 'science fiction',             label: 'SF' },
  { key: 'fantasy',                        googleKey: '판타지',    foreignKey: 'fantasy',                     label: '판타지' },
  { key: 'historical_fiction',             googleKey: '역사소설',  foreignKey: 'historical fiction',          label: '역사소설' },
  { key: 'science',                        googleKey: '교양과학',  foreignKey: 'popular science',             label: '과학',
    ageKeys: { child: '어린이 과학', teen: '청소년 과학', adult: '교양과학' },
    foreignAgeKeys: { child: 'children science', teen: 'teen science', adult: 'popular science' } },
  { key: 'biography',                      googleKey: '자서전',    foreignKey: 'biography autobiography',     label: '인물/자서전' },
  { key: 'children',                       googleKey: '동화',      foreignKey: "children picture book",       label: '어린이' },
];

const MODES = [
  { key: 'genre',   label: '장르별' },
  { key: 'popular', label: '인기 순위' },
  { key: 'age',     label: '연령대 추천' },
];

function getAgeGroup(age) {
  if (!age || age <= 0) return null;
  if (age <= 12) return 'child';
  if (age <= 18) return 'teen';
  return 'adult';
}

const AGE_GROUP_INFO = {
  child: { label: '어린이', desc: '~12세',   color: '#4CAF50', icon: 'happy-outline' },
  teen:  { label: '청소년', desc: '13~18세', color: '#2196F3', icon: 'school-outline' },
  adult: { label: '성인',   desc: '19세~',   color: '#6750A4', icon: 'person-outline' },
};

const AGE_ALADIN_CATEGORY = {
  child: '&CategoryId=13789',
  teen:  '&CategoryId=5361',
  adult: '&CategoryId=1',  // 국내도서 종합 (어린이/청소년 제외)
};

const AGE_ALADIN_CATEGORY_FOREIGN = {
  child: '&CategoryId=1366',
  teen:  '&CategoryId=1374',
  adult: '&CategoryId=2',  // 외국도서 종합
};

function todayCatIndex() {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now - new Date(now.getFullYear(), 0, 0)) / 86_400_000
  );
  return dayOfYear % CATEGORIES.length;
}

const ALADIN_TTB_KEY = '***ALADIN_TTB_KEY_REMOVED***';

async function fetchAladinBooks(keyword, target = 'Book', ageGroup = null) {
  const catMap = target === 'Book' ? AGE_ALADIN_CATEGORY : AGE_ALADIN_CATEGORY_FOREIGN;
  const catParam = ageGroup ? (catMap[ageGroup] ?? '') : '';
  const res = await fetch(
    `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_TTB_KEY}&Query=${encodeURIComponent(keyword)}&QueryType=Keyword&SearchTarget=${target}&MaxResults=13&output=js&Version=20131101&Cover=Big${catParam}`
  );
  if (!res.ok) throw new Error('fetch error');
  const data = await res.json();
  return (data.item || []).filter(item => item.cover && !item.cover.includes('noimg'));
}

async function fetchAladinBestsellers(ageGroup, target = 'Book') {
  const catMap = target === 'Book' ? AGE_ALADIN_CATEGORY : AGE_ALADIN_CATEGORY_FOREIGN;
  const catParam = catMap[ageGroup] ?? '';
  const res = await fetch(
    `https://www.aladin.co.kr/ttb/api/ItemList.aspx?ttbkey=${ALADIN_TTB_KEY}&QueryType=Bestseller&MaxResults=20&SearchTarget=${target}&output=js&Version=20131101&Cover=Big${catParam}`
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


export default function RecommendScreen() {
  const router = useRouter();
  const [mode, setMode]             = useState('genre');
  const [catIdx, setCatIdx]         = useState(todayCatIndex);
  const [bookRegion, setBookRegion] = useState('korean');
  const [userAge, setUserAge]       = useState(0);
  const [books, setBooks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null);

  const loadBooks = useCallback(async (currentMode, idx, region) => {
    setLoading(true);
    setBooks([]);
    const target = region === 'foreign' ? 'Foreign' : 'Book';
    try {
      let items;
      if (currentMode === 'popular') {
        const ag = getAgeGroup(getAge()) || 'adult';
        items = await fetchAladinBestsellers(ag, target);
      } else if (currentMode === 'age') {
        const ag = getAgeGroup(getAge()) || 'adult';
        items = await fetchAladinBestsellers(ag, target);
      } else {
        const ag = getAgeGroup(getAge()) || 'adult';
        const cat = CATEGORIES[idx];
        const keyword = region === 'foreign'
          ? (cat.foreignAgeKeys?.[ag] ?? cat.foreignKey)
          : (cat.ageKeys?.[ag] ?? cat.googleKey);
        items = await fetchAladinBooks(keyword, target, ag);
      }
      setBooks(items.map(normalizeAladinBook));
    } catch {
      // 네트워크 오류 → 빈 목록 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setUserAge(getAge());
      loadBooks(mode, catIdx, bookRegion);
    }, [mode, catIdx, bookRegion])
  );

  const openBook = (book) => setSelected(book);

  const closeModal = () => setSelected(null);

  const addToShelf = () => {
    if (!selected) return;
    try {
      insertBook({
        title:      selected.title,
        author:     selected.author,
        totalPages: 0,
        status:     'want_to_read',
        bookType:   'physical',
        genre:      mode === 'genre' ? CATEGORIES[catIdx].label : '',
        review:     '',
      });
      Alert.alert('추가 완료', `"${selected.title}"을(를) 서재에 추가했습니다.`);
      closeModal();
    } catch {
      Alert.alert('오류', '서재 추가에 실패했습니다.');
    }
  };

  const d = new Date();
  const todayLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const ageGroup = getAgeGroup(userAge);

  const headerTitle = mode === 'popular' ? '인기 도서 순위'
    : mode === 'age' ? '연령대별 추천 도서'
    : '오늘의 추천 도서';

  const featured = books[0] ?? null;
  const rest     = books.slice(1);

  const descText = (() => {
    const raw = selected?.description || '';
    return raw.length > 300 ? raw.slice(0, 300) + '…' : raw || null;
  })();

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <Text style={styles.dateLabel}>{todayLabel}</Text>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        {mode === 'genre' ? (
          <Text style={styles.headerSub}>
            오늘의 장르: <Text style={styles.catHighlight}>{CATEGORIES[catIdx].label}</Text>
          </Text>
        ) : mode === 'popular' ? (
          <Text style={styles.headerSub}>지금 가장 많이 읽히는 책</Text>
        ) : (
          <Text style={styles.headerSub}>
            {ageGroup
              ? `${AGE_GROUP_INFO[ageGroup].label}(${AGE_GROUP_INFO[ageGroup].desc})을 위한 추천`
              : '나이를 설정하면 맞춤 추천을 드려요'}
          </Text>
        )}
      </View>

      {/* ── 모드 탭 ── */}
      <View style={styles.modeTabs}>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeTab, mode === m.key && styles.modeTabActive]}
            onPress={() => setMode(m.key)}
          >
            <Text style={[styles.modeTabText, mode === m.key && styles.modeTabTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
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

      {/* ── 장르 칩 (장르별 모드) ── */}
      {mode === 'genre' && (
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
      )}

      {/* ── 연령대 배너 ── */}
      {mode === 'age' && (
        <View style={styles.ageBanner}>
          {ageGroup ? (
            <View style={[styles.ageInfoRow, { borderLeftColor: AGE_GROUP_INFO[ageGroup].color }]}>
              <Ionicons name={AGE_GROUP_INFO[ageGroup].icon} size={18} color={AGE_GROUP_INFO[ageGroup].color} />
              <Text style={[styles.ageInfoText, { color: AGE_GROUP_INFO[ageGroup].color }]}>
                {AGE_GROUP_INFO[ageGroup].label} ({AGE_GROUP_INFO[ageGroup].desc}) 맞춤 추천
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.ageSetupRow} onPress={() => router.push('/profile-edit')}>
              <Ionicons name="person-add-outline" size={16} color="#6750A4" />
              <Text style={styles.ageSetupText}>나이를 설정하면 맞춤 추천을 받을 수 있어요</Text>
              <Ionicons name="chevron-forward" size={14} color="#6750A4" />
            </TouchableOpacity>
          )}
        </View>
      )}

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
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadBooks(mode, catIdx, bookRegion)}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : mode === 'popular' ? (
        <ScrollView style={styles.bookScroll} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>
            {bookRegion === 'korean' ? '한국도서 베스트셀러' : '해외도서 인기 순위'}
          </Text>
          {books.map((book, i) => {
            const rank = i + 1;
            const rankColor = rank === 1 ? '#FFB800' : rank === 2 ? '#9E9E9E' : rank === 3 ? '#CD7F32' : '#BDBDBD';
            return (
              <TouchableOpacity key={i} style={styles.rankRow} onPress={() => openBook(book)} activeOpacity={0.8}>
                <Text style={[styles.rankNum, { color: rankColor }]}>{rank}</Text>
                <Image source={{ uri: book.coverUrl }} style={styles.rankCover} resizeMode="cover" />
                <View style={styles.rankInfo}>
                  <Text style={styles.rankTitle} numberOfLines={2}>{book.title}</Text>
                  <Text style={styles.rankAuthor} numberOfLines={1}>{book.author}</Text>
                  {book.year ? <Text style={styles.rankYear}>{book.year}년</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CAC4D0" />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView style={styles.bookScroll} contentContainerStyle={styles.scroll}>
          {/* 오늘의 추천 (첫 번째 책) */}
          {featured && (
            <>
              <Text style={styles.sectionLabel}>
                {mode === 'age' && ageGroup
                  ? `${AGE_GROUP_INFO[ageGroup].label} 추천 1위`
                  : '오늘의 추천'}
              </Text>
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
                {mode === 'age' && ageGroup
                  ? `${AGE_GROUP_INFO[ageGroup].label} 추천 도서`
                  : `${CATEGORIES[catIdx].label} 추천 도서`}
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

                  {descText ? (
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

  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE7F6',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modeTabActive:     { borderBottomColor: '#6750A4' },
  modeTabText:       { fontSize: 13, color: '#9E9E9E', fontWeight: '500' },
  modeTabTextActive: { color: '#6750A4', fontWeight: 'bold' },

  ageBanner: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE7F6',
  },
  ageInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderLeftWidth: 3, paddingLeft: 10,
  },
  ageInfoText:  { fontSize: 13, fontWeight: '600' },
  ageSetupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  ageSetupText: { flex: 1, fontSize: 13, color: '#6750A4' },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    marginBottom: 8, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2,
  },
  rankNum:    { fontSize: 18, fontWeight: 'bold', width: 28, textAlign: 'center' },
  rankCover:  { width: 48, height: 72, borderRadius: 6, backgroundColor: '#EDE7F6' },
  rankInfo:   { flex: 1, gap: 3 },
  rankTitle:  { fontSize: 13, fontWeight: '600', color: '#1C1B1F', lineHeight: 18 },
  rankAuthor: { fontSize: 11, color: '#6750A4' },
  rankYear:   { fontSize: 10, color: '#9E9E9E' },

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
