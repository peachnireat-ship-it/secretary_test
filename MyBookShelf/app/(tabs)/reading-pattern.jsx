import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getGenreCompletedStats,
  getDayOfWeekStats,
  getRatingDistribution,
  getCompletionTimeStats,
  getPageCountDistribution,
  getTimeOfDayStats,
} from '../../database/database';

function EmptyNotice() {
  return <Text style={styles.emptyText}>데이터가 없습니다.</Text>;
}

function VertBarChart({ data, color = '#6750A4', height = 150, labelLines = 1 }) {
  const [chartWidth, setChartWidth] = useState(0);
  if (!data || data.every(d => d.count === 0)) return <EmptyNotice />;

  const maxVal = Math.max(...data.map(d => d.count), 1);
  const PAD_B = 32;
  const barArea = height - PAD_B;

  return (
    <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)}>
      {chartWidth > 0 && (
        <View style={{ height, flexDirection: 'row', alignItems: 'flex-end' }}>
          {data.map((d, i) => {
            const barH = d.count > 0
              ? Math.max((d.count / maxVal) * barArea, 4)
              : 0;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', height }}>
                <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                  {d.count > 0 && (
                    <Text style={styles.barValue}>{d.count}</Text>
                  )}
                  <View
                    style={{
                      width: '55%',
                      height: barH,
                      backgroundColor: color,
                      borderRadius: 3,
                      marginBottom: 4,
                    }}
                  />
                </View>
                <Text style={styles.barLabel} numberOfLines={labelLines}>{d.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function HorzBarChart({ data, color = '#6750A4' }) {
  const [chartWidth, setChartWidth] = useState(0);
  if (!data || data.every(d => d.count === 0)) return <EmptyNotice />;

  const maxVal = Math.max(...data.map(d => d.count), 1);
  const LABEL_W = 76;
  const COUNT_W = 28;

  return (
    <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)}>
      {chartWidth > 0 && data.map((d, i) => {
        const available = chartWidth - LABEL_W - COUNT_W - 12;
        const barW = d.count > 0
          ? Math.max((d.count / maxVal) * available, 4)
          : 0;
        return (
          <View key={i} style={styles.horzRow}>
            <Text style={[styles.horzLabel, { width: LABEL_W }]} numberOfLines={1}>
              {d.label}
            </Text>
            <View style={[styles.horzTrack, { flex: 1 }]}>
              <View style={[styles.horzFill, { width: barW, backgroundColor: color }]} />
            </View>
            <Text style={[styles.horzCount, { width: COUNT_W }]}>{d.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

function YearEndBanner({ year, onPress }) {
  return (
    <TouchableOpacity style={styles.yearBanner} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.yearBannerLeft}>
        <Text style={styles.yearBannerEmoji}>📖</Text>
        <View>
          <Text style={styles.yearBannerTitle}>{year}년 독서 리포트 오픈!</Text>
          <Text style={styles.yearBannerSub}>올 한 해 나의 독서를 돌아봐요</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#fff" />
    </TouchableOpacity>
  );
}

export default function ReadingPatternScreen() {
  const router = useRouter();
  const isDecember = useMemo(() => new Date().getMonth() === 11, []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [genreStats, setGenreStats] = useState([]);
  const [dayStats, setDayStats] = useState([]);
  const [ratingStats, setRatingStats] = useState([]);
  const [completionStats, setCompletionStats] = useState([]);
  const [pageCountStats, setPageCountStats] = useState([]);
  const [timeOfDayStats, setTimeOfDayStats] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setGenreStats(getGenreCompletedStats());
      setDayStats(getDayOfWeekStats());
      setRatingStats(getRatingDistribution());
      setCompletionStats(getCompletionTimeStats());
      setPageCountStats(getPageCountDistribution());
      setTimeOfDayStats(getTimeOfDayStats());
    }, [])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isDecember && (
        <YearEndBanner
          year={currentYear}
          onPress={() => router.push('/year-wrapped')}
        />
      )}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>장르별 완독 현황</Text>
        <HorzBarChart data={genreStats} />
      </View>

      <View style={[styles.card, styles.mt]}>
        <Text style={styles.cardTitle}>요일별 독서 활동</Text>
        <VertBarChart data={dayStats} color="#7E57C2" />
      </View>

      <View style={[styles.card, styles.mt]}>
        <Text style={styles.cardTitle}>별점 분포</Text>
        <VertBarChart data={ratingStats} color="#FF8F00" />
      </View>

      <View style={[styles.card, styles.mt]}>
        <Text style={styles.cardTitle}>완독 소요 기간 분포</Text>
        <VertBarChart data={completionStats} color="#26A69A" />
      </View>

      <View style={[styles.card, styles.mt]}>
        <Text style={styles.cardTitle}>완독 도서 페이지 수 분포</Text>
        <VertBarChart data={pageCountStats} color="#EF5350" />
      </View>

      <View style={[styles.card, styles.mt]}>
        <Text style={styles.cardTitle}>시간대별 독서 활동</Text>
        <VertBarChart data={timeOfDayStats} color="#29B6F6" height={160} labelLines={2} />
      </View>

      <TouchableOpacity
        style={[styles.resultButton, styles.mt]}
        onPress={() => router.push('/pattern-result')}
        activeOpacity={0.85}
      >
        <Text style={styles.resultButtonText}>패턴 분석 결과보기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mt: { marginTop: 12 },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1B1F',
    marginBottom: 18,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#BDBDBD',
    textAlign: 'center',
    paddingVertical: 20,
  },
  barValue: {
    fontSize: 11,
    color: '#6750A4',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  barLabel: {
    fontSize: 11,
    color: '#757575',
    textAlign: 'center',
    minHeight: 28,
    paddingTop: 2,
  },
  horzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  horzLabel: {
    fontSize: 12,
    color: '#49454F',
    marginRight: 8,
  },
  horzTrack: {
    height: 18,
    backgroundColor: '#F3F0FA',
    borderRadius: 4,
    overflow: 'hidden',
  },
  horzFill: {
    height: '100%',
    borderRadius: 4,
  },
  horzCount: {
    fontSize: 12,
    color: '#6750A4',
    fontWeight: 'bold',
    textAlign: 'right',
    marginLeft: 4,
  },
  yearBanner: {
    backgroundColor: '#1A0A3C',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    elevation: 4,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  yearBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  yearBannerEmoji: {
    fontSize: 32,
  },
  yearBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  yearBannerSub: {
    fontSize: 12,
    color: '#B39DDB',
  },
  resultButton: {
    backgroundColor: '#6750A4',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  resultButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
