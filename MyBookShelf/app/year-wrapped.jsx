import {
  View, Text, StyleSheet, Dimensions, FlatList,
  TouchableOpacity, StatusBar, SafeAreaView,
} from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getYearlyWrappedStats,
  getTimeOfDayStats,
  getGenreCompletedStats,
  getCompletionTimeStats,
  getRatingDistribution,
} from '../database/database';

const { width: W, height: H } = Dimensions.get('window');

function computePersonalityType(timeStats, genreStats, completionStats, ratingStats) {
  const TIME_MAP = {
    '새벽\n0-5시':   { icon: 'moon-outline',        label: '새벽 독서가' },
    '아침\n6-9시':   { icon: 'sunny-outline',         label: '아침형 독자' },
    '낮\n10-13시':  { icon: 'sunny-outline',         label: '낮 시간 독서가' },
    '오후\n14-17시': { icon: 'sunny-outline',         label: '오후 독서가' },
    '저녁\n18-21시': { icon: 'star-outline',          label: '저녁형 독자' },
    '밤\n22-23시':  { icon: 'moon-outline',          label: '밤 올빼미 독자' },
  };
  const totalTime = timeStats.reduce((s, d) => s + d.count, 0);
  if (totalTime > 0) {
    const maxTime = timeStats.reduce((a, b) => (b.count > a.count ? b : a));
    const t = TIME_MAP[maxTime.label];
    if (t) return t;
  }

  const totalDone = completionStats.reduce((s, d) => s + d.count, 0);
  if (totalDone >= 2) {
    const fast = (completionStats[0]?.count ?? 0) + (completionStats[1]?.count ?? 0);
    const slow = (completionStats[3]?.count ?? 0) + (completionStats[4]?.count ?? 0);
    if (fast / totalDone >= 0.5) return { icon: 'flash-outline', label: '속독형 독자' };
    if (slow / totalDone >= 0.4) return { icon: 'search-outline', label: '정독형 독자' };
    return { icon: 'analytics-outline', label: '균형형 독자' };
  }
  return null;
}

function buildSlides(stats, personalityType) {
  const slides = [];

  slides.push({ id: 'opening', type: 'opening', year: stats.year });

  if (stats.completed > 0) {
    slides.push({ id: 'completed', type: 'completed', count: stats.completed });
  }

  if (stats.totalPages > 0) {
    slides.push({ id: 'pages', type: 'pages', pages: stats.totalPages });
  }

  if (stats.bestMonth && stats.bestMonthCount > 0) {
    slides.push({ id: 'bestmonth', type: 'bestmonth', month: stats.bestMonth, count: stats.bestMonthCount });
  }

  if (stats.topGenre) {
    slides.push({ id: 'genre', type: 'genre', genre: stats.topGenre, count: stats.topGenreCount });
  }

  if (stats.memos > 0) {
    slides.push({ id: 'memos', type: 'memos', count: stats.memos });
  }

  if (stats.bestBook) {
    slides.push({ id: 'bestbook', type: 'bestbook', book: stats.bestBook });
  }

  if (personalityType) {
    slides.push({ id: 'personality', type: 'personality', personality: personalityType });
  }

  slides.push({ id: 'closing', type: 'closing', year: stats.year });

  return slides;
}

const SLIDE_CONFIGS = {
  opening:     { bg: '#1A0A3C', accent: '#B39DDB' },
  completed:   { bg: '#6750A4', accent: '#E8DEF8' },
  pages:       { bg: '#1B5E20', accent: '#A5D6A7' },
  bestmonth:   { bg: '#BF360C', accent: '#FFCCBC' },
  genre:       { bg: '#880E4F', accent: '#F8BBD9' },
  memos:       { bg: '#004D40', accent: '#80CBC4' },
  bestbook:    { bg: '#1A237E', accent: '#9FA8DA' },
  personality: { bg: '#212121', accent: '#EEE' },
  closing:     { bg: '#1A0A3C', accent: '#B39DDB' },
};

function SlideOpening({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.opening;
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name="book" size={72} color={accent} style={{ marginBottom: 32 }} />
      <Text style={[ss.eyebrow, { color: accent }]}>{slide.year}년</Text>
      <Text style={[ss.heroTitle, { color: '#fff' }]}>나의 독서 리포트</Text>
      <Text style={[ss.subText, { color: accent, marginTop: 20 }]}>올 한 해 함께한 책들을{'\n'}돌아봐요</Text>
    </View>
  );
}

function SlideCompleted({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.completed;
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Text style={[ss.eyebrow, { color: accent }]}>올해 완독</Text>
      <Text style={[ss.bigNumber, { color: '#fff' }]}>{slide.count}</Text>
      <Text style={[ss.bigUnit, { color: accent }]}>권</Text>
      <Text style={[ss.subText, { color: '#E8DEF8', marginTop: 24 }]}>
        {slide.count >= 12
          ? '한 달에 한 권 이상!\n정말 대단한 독서가예요.'
          : slide.count >= 5
          ? '꾸준히 책을 읽은\n한 해였어요.'
          : '소중한 한 걸음을\n내디뎠어요.'}
      </Text>
    </View>
  );
}

function SlidePages({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.pages;
  const formatted = slide.pages.toLocaleString();
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name="document-text-outline" size={52} color={accent} style={{ marginBottom: 20 }} />
      <Text style={[ss.eyebrow, { color: accent }]}>올해 읽은 페이지</Text>
      <Text style={[ss.bigNumber, { color: '#fff' }]}>{formatted}</Text>
      <Text style={[ss.bigUnit, { color: accent }]}>페이지</Text>
      <Text style={[ss.subText, { color: '#C8E6C9', marginTop: 24 }]}>
        {slide.pages >= 10000
          ? '무려 책 한 박스 분량을\n읽어냈어요!'
          : slide.pages >= 3000
          ? '손가락이 기억하는\n묵직한 독서량이에요.'
          : '꾸준히 쌓아온\n소중한 독서량이에요.'}
      </Text>
    </View>
  );
}

function SlideBestMonth({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.bestmonth;
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name="calendar-outline" size={52} color={accent} style={{ marginBottom: 20 }} />
      <Text style={[ss.eyebrow, { color: accent }]}>가장 뜨거웠던 달</Text>
      <Text style={[ss.bigNumber, { color: '#fff' }]}>{slide.month}월</Text>
      <Text style={[ss.subText, { color: accent, marginTop: 16 }]}>
        {slide.month}월에만 {slide.count}권을 완독했어요
      </Text>
      <Text style={[ss.subText, { color: '#FFCCBC', marginTop: 12, fontSize: 15 }]}>
        이 달, 책과 가장 깊이 연결됐어요.
      </Text>
    </View>
  );
}

function SlideGenre({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.genre;
  const GENRE_ICON = {
    '소설': 'book-outline', '문학': 'create-outline', '자기계발': 'trending-up-outline',
    '경제/경영': 'briefcase-outline', '역사': 'time-outline', '과학': 'flask-outline',
    '판타지': 'sparkles-outline', '에세이': 'leaf-outline',
  };
  const icon = GENRE_ICON[slide.genre] || 'library-outline';
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={60} color={accent} style={{ marginBottom: 20 }} />
      <Text style={[ss.eyebrow, { color: accent }]}>올해 가장 사랑한 장르</Text>
      <Text style={[ss.heroTitle, { color: '#fff', fontSize: 38 }]}>{slide.genre}</Text>
      <Text style={[ss.subText, { color: accent, marginTop: 16 }]}>
        {slide.count}권을 읽은 당신은{'\n'}{slide.genre} 애독가예요.
      </Text>
    </View>
  );
}

function SlideMemos({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.memos;
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name="pencil-outline" size={52} color={accent} style={{ marginBottom: 20 }} />
      <Text style={[ss.eyebrow, { color: accent }]}>남긴 독서 메모</Text>
      <Text style={[ss.bigNumber, { color: '#fff' }]}>{slide.count}</Text>
      <Text style={[ss.bigUnit, { color: accent }]}>개</Text>
      <Text style={[ss.subText, { color: '#B2DFDB', marginTop: 24 }]}>
        생각을 기록하는 습관,{'\n'}독서를 더 깊게 만들어요.
      </Text>
    </View>
  );
}

function SlideBestBook({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.bestbook;
  const stars = Math.round(slide.book.rating);
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name="trophy-outline" size={52} color="#FFD700" style={{ marginBottom: 20 }} />
      <Text style={[ss.eyebrow, { color: accent }]}>올해 최고의 책</Text>
      <Text style={[ss.bookTitle, { color: '#fff' }]} numberOfLines={3}>{slide.book.title}</Text>
      <View style={ss.starsRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={26} color="#FFD700" />
        ))}
      </View>
      <Text style={[ss.subText, { color: accent, marginTop: 16 }]}>
        {slide.book.rating}점으로 빛났던 책이에요.
      </Text>
    </View>
  );
}

function SlidePersonality({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.personality;
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <View style={ss.personalityBadge}>
        <Ionicons name={slide.personality.icon} size={44} color="#fff" />
      </View>
      <Text style={[ss.eyebrow, { color: '#9E9E9E', marginTop: 28 }]}>올해 나의 독서 유형</Text>
      <Text style={[ss.heroTitle, { color: '#fff', fontSize: 30 }]}>{slide.personality.label}</Text>
      <Text style={[ss.subText, { color: '#BDBDBD', marginTop: 16 }]}>
        독서 패턴이 만들어낸{'\n'}나만의 독서 스타일이에요.
      </Text>
    </View>
  );
}

function SlideClosing({ slide }) {
  const { bg, accent } = SLIDE_CONFIGS.closing;
  return (
    <View style={[ss.slide, { backgroundColor: bg }]}>
      <Ionicons name="heart" size={64} color="#EF5350" style={{ marginBottom: 28 }} />
      <Text style={[ss.heroTitle, { color: '#fff' }]}>{slide.year + 1}년에도</Text>
      <Text style={[ss.heroTitle, { color: accent }]}>함께해요</Text>
      <Text style={[ss.subText, { color: '#B39DDB', marginTop: 24 }]}>
        책과 함께한 {slide.year}년,{'\n'}정말 수고했어요.
      </Text>
    </View>
  );
}

const SLIDE_COMPONENTS = {
  opening: SlideOpening,
  completed: SlideCompleted,
  pages: SlidePages,
  bestmonth: SlideBestMonth,
  genre: SlideGenre,
  memos: SlideMemos,
  bestbook: SlideBestBook,
  personality: SlidePersonality,
  closing: SlideClosing,
};

export default function YearWrappedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [slides, setSlides] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      const year = new Date().getFullYear();
      const stats = getYearlyWrappedStats(year);
      const timeStats = getTimeOfDayStats();
      const genreStats = getGenreCompletedStats();
      const completionStats = getCompletionTimeStats();
      const ratingStats = getRatingDistribution();
      const personalityType = computePersonalityType(timeStats, genreStats, completionStats, ratingStats);
      setSlides(buildSlides(stats, personalityType));
      setCurrentIndex(0);
    }, [])
  );

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  });

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const goNext = () => {
    if (currentIndex < slides.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };

  if (slides.length === 0) {
    return (
      <View style={[ss.slide, { backgroundColor: '#1A0A3C', justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#B39DDB', fontSize: 16 }}>데이터를 불러오는 중...</Text>
      </View>
    );
  }

  const currentBg = SLIDE_CONFIGS[slides[currentIndex]?.type]?.bg ?? '#1A0A3C';
  const isLast = currentIndex === slides.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: currentBg }}>
      <StatusBar barStyle="light-content" backgroundColor={currentBg} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={ss.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={26} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={ss.dotsRow}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[ss.dot, i === currentIndex ? ss.dotActive : ss.dotInactive]}
              />
            ))}
          </View>
          <View style={{ width: 26 }} />
        </View>

        <FlatList
          ref={flatRef}
          data={slides}
          keyExtractor={item => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          renderItem={({ item }) => {
            const SlideComp = SLIDE_COMPONENTS[item.type];
            return SlideComp ? <SlideComp slide={item} /> : null;
          }}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
        />

        <View style={[ss.bottomBar, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          {isLast ? (
            <TouchableOpacity style={ss.finishBtn} onPress={() => router.back()}>
              <Text style={ss.finishBtnText}>돌아가기</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={ss.nextBtn} onPress={goNext}>
              <Text style={ss.nextBtnText}>다음</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const ss = StyleSheet.create({
  slide: {
    width: W,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  dotActive: {
    width: 20,
    backgroundColor: '#fff',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  eyebrow: {
    fontSize: 14,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 44,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 52,
  },
  bigNumber: {
    fontSize: 96,
    fontWeight: 'bold',
    lineHeight: 108,
    textAlign: 'center',
  },
  bigUnit: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: -4,
  },
  subText: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
  },
  bookTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 32,
    marginTop: 12,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  personalityBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#6750A4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    paddingHorizontal: 32,
    paddingBottom: 24,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  finishBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  finishBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
