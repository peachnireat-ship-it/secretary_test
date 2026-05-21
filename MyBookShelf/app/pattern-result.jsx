import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getMonthlyReadingStats,
  getMonthlyReport,
  getTimeOfDayStats,
  getGenreCompletedStats,
  getCompletionTimeStats,
  getRatingDistribution,
} from '../database/database';

function computePersonalityTypes(timeStats, genreStats, completionStats, ratingStats) {
  const types = [];

  const totalTime = timeStats.reduce((s, d) => s + d.count, 0);
  if (totalTime > 0) {
    const maxTime = timeStats.reduce((a, b) => (b.count > a.count ? b : a));
    const TIME_MAP = {
      '새벽\n0-5시':   { iconName: 'moon-outline',  title: '새벽 독서가',    desc: '고요한 새벽의 정적 속에서 책과 함께하는 독자입니다.' },
      '아침\n6-9시':   { iconName: 'sunny-outline',  title: '아침형 독자',    desc: '상쾌한 아침 시간으로 하루를 시작하는 독자입니다.' },
      '낮\n10-13시':  { iconName: 'sunny-outline',  title: '낮 시간 독서가', desc: '밝은 대낮의 여유 속에서 독서를 즐기는 독자입니다.' },
      '오후\n14-17시': { iconName: 'sunny-outline',  title: '오후 독서가',    desc: '오후의 햇살 속에서 책 읽기를 즐기는 독자입니다.' },
      '저녁\n18-21시': { iconName: 'star-outline',   title: '저녁형 독자',    desc: '하루를 마무리하며 독서로 쉬어가는 독자입니다.' },
      '밤\n22-23시':  { iconName: 'moon-outline',   title: '밤 올빼미 독자', desc: '밤의 고요함 속에서 책에 빠져드는 독자입니다.' },
    };
    const t = TIME_MAP[maxTime.label];
    if (t) types.push({ ...t, category: '독서 시간대' });
  }

  if (genreStats.length > 0 && genreStats[0].count > 0) {
    const top = genreStats[0].label;
    const GENRE_ICON = {
      '소설': 'book-outline', '문학': 'create-outline', '자기계발': 'trending-up-outline',
      '경제/경영': 'briefcase-outline', '역사': 'time-outline', '과학': 'flask-outline',
      '판타지': 'sparkles-outline', '에세이': 'leaf-outline',
    };
    types.push({
      iconName: GENRE_ICON[top] || 'library-outline',
      title: `${top} 애독가`,
      desc: `${top} 분야를 가장 즐겨 읽는 독자입니다.`,
      category: '선호 장르',
    });
  }

  const totalDone = completionStats.reduce((s, d) => s + d.count, 0);
  if (totalDone >= 2) {
    const fast = (completionStats[0]?.count ?? 0) + (completionStats[1]?.count ?? 0);
    const slow = (completionStats[3]?.count ?? 0) + (completionStats[4]?.count ?? 0);
    if (fast / totalDone >= 0.5) {
      types.push({ iconName: 'flash-outline', title: '속독형 독자', desc: '빠른 속도로 책을 완독하는 집중력 높은 독자입니다.', category: '독서 페이스' });
    } else if (slow / totalDone >= 0.4) {
      types.push({ iconName: 'search-outline', title: '정독형 독자', desc: '한 권을 천천히 깊이 있게 음미하며 읽는 독자입니다.', category: '독서 페이스' });
    } else {
      types.push({ iconName: 'analytics-outline', title: '균형형 독자', desc: '독서 속도와 깊이를 균형 있게 유지하는 독자입니다.', category: '독서 페이스' });
    }
  }

  const totalRated = ratingStats.reduce((s, d) => s + d.count, 0);
  if (totalRated >= 5) {
    const high = (ratingStats[3]?.count ?? 0) + (ratingStats[4]?.count ?? 0);
    const low = (ratingStats[0]?.count ?? 0) + (ratingStats[1]?.count ?? 0);
    if (high / totalRated >= 0.7) {
      types.push({ iconName: 'happy-outline', title: '긍정적인 독자', desc: '읽은 책에 대해 후한 평가를 내리는 관대한 독자입니다.', category: '별점 성향' });
    } else if (low / totalRated >= 0.3) {
      types.push({ iconName: 'options-outline', title: '비평적 독자', desc: '높은 안목으로 책을 평가하는 비평적 독자입니다.', category: '별점 성향' });
    } else {
      types.push({ iconName: 'star-half-outline', title: '객관적인 독자', desc: '균형 잡힌 시각으로 책을 평가하는 독자입니다.', category: '별점 성향' });
    }
  }

  return types;
}

function GrowthBarChart({ data }) {
  const [width, setWidth] = useState(0);
  if (!data || data.every(d => d.count === 0)) {
    return <Text style={s.empty}>완독 기록이 쌓이면 그래프가 표시됩니다.</Text>;
  }
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const H = 120, PAD = 24;
  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end' }}>
          {data.map((d, i) => {
            const barH = d.count > 0 ? Math.max((d.count / maxVal) * (H - PAD), 4) : 0;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', height: H }}>
                <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                  {d.count > 0 && <Text style={s.barVal}>{d.count}</Text>}
                  <View style={{ width: '60%', height: barH, backgroundColor: '#6750A4', borderRadius: 2, marginBottom: 4 }} />
                </View>
                <Text style={s.barLbl}>{d.label.replace('월', '')}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function DiffBadge({ cur, prev }) {
  const diff = cur - prev;
  if (diff === 0) return <Text style={[s.diffBadge, s.diffNeutral]}>-</Text>;
  return (
    <Text style={[s.diffBadge, diff > 0 ? s.diffUp : s.diffDown]}>
      {diff > 0 ? `+${diff}` : `${diff}`}
    </Text>
  );
}

export default function PatternResultScreen() {
  const [report, setReport] = useState(null);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [types, setTypes] = useState([]);

  useFocusEffect(
    useCallback(() => {
      const timeStats = getTimeOfDayStats();
      const genreStats = getGenreCompletedStats();
      const completionStats = getCompletionTimeStats();
      const ratingStats = getRatingDistribution();
      setReport(getMonthlyReport());
      setMonthlyStats(getMonthlyReadingStats());
      setTypes(computePersonalityTypes(timeStats, genreStats, completionStats, ratingStats));
    }, [])
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>월간 독서 리포트</Text>
        {report ? (
          <>
            <View style={s.reportHeader}>
              <View style={{ flex: 1 }} />
              <Text style={[s.colLabel, { color: '#6750A4' }]}>{report.thisMonth.label}</Text>
              <Text style={[s.colLabel, { color: '#9E9E9E' }]}>{report.lastMonth.label}</Text>
              <Text style={[s.colLabel, { color: '#9E9E9E' }]}>변화</Text>
            </View>
            {[
              { label: '완독 권수', cur: report.thisMonth.completed, prev: report.lastMonth.completed, unit: '권' },
              { label: '추가한 책', cur: report.thisMonth.added, prev: report.lastMonth.added, unit: '권' },
              { label: '작성한 메모', cur: report.thisMonth.memos, prev: report.lastMonth.memos, unit: '개' },
            ].map(item => (
              <View key={item.label} style={s.reportRow}>
                <Text style={[s.reportRowLabel, { flex: 1 }]}>{item.label}</Text>
                <Text style={s.reportVal}>{item.cur}{item.unit}</Text>
                <Text style={s.reportValPrev}>{item.prev}{item.unit}</Text>
                <DiffBadge cur={item.cur} prev={item.prev} />
              </View>
            ))}
            {(report.thisMonth.avgRating > 0 || report.lastMonth.avgRating > 0) && (
              <View style={s.reportRow}>
                <Text style={[s.reportRowLabel, { flex: 1 }]}>평균 별점</Text>
                <Text style={s.reportVal}>
                  {report.thisMonth.avgRating > 0 ? `${report.thisMonth.avgRating}점` : '-'}
                </Text>
                <Text style={s.reportValPrev}>
                  {report.lastMonth.avgRating > 0 ? `${report.lastMonth.avgRating}점` : '-'}
                </Text>
                <Text style={[s.diffBadge, s.diffNeutral]}>-</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={s.empty}>데이터를 불러오는 중...</Text>
        )}
      </View>

      <View style={[s.card, s.mt]}>
        <Text style={s.cardTitle}>독서 성장 그래프</Text>
        <Text style={s.cardSubtitle}>최근 12개월 완독 현황</Text>
        <GrowthBarChart data={monthlyStats} />
      </View>

      <View style={[s.card, s.mt]}>
        <Text style={s.cardTitle}>나의 독서 성향</Text>
        {types.length === 0 ? (
          <Text style={s.empty}>독서 기록이 쌓이면 성향이 분석됩니다.</Text>
        ) : (
          types.map((t, i) => (
            <View key={i} style={[s.typeRow, i > 0 && s.typeRowBorder]}>
              <View style={s.typeIconWrap}>
                <Ionicons name={t.iconName} size={24} color="#6750A4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.typeCat}>{t.category}</Text>
                <Text style={s.typeTitle}>{t.title}</Text>
                <Text style={s.typeDesc}>{t.desc}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    padding: 20, backgroundColor: '#fff', borderRadius: 16,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  mt: { marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1C1B1F', marginBottom: 4, textAlign: 'center' },
  cardSubtitle: { fontSize: 12, color: '#9E9E9E', textAlign: 'center', marginBottom: 14 },
  empty: { fontSize: 13, color: '#BDBDBD', textAlign: 'center', paddingVertical: 20 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F3F0FA' },
  colLabel: { fontSize: 12, fontWeight: 'bold', width: 52, textAlign: 'center' },
  reportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F9F9F9' },
  reportRowLabel: { fontSize: 13, color: '#49454F' },
  reportVal: { fontSize: 14, fontWeight: 'bold', color: '#1C1B1F', width: 52, textAlign: 'center' },
  reportValPrev: { fontSize: 13, color: '#9E9E9E', width: 52, textAlign: 'center' },
  diffBadge: { fontSize: 13, fontWeight: 'bold', width: 36, textAlign: 'right' },
  diffUp: { color: '#26A69A' },
  diffDown: { color: '#EF5350' },
  diffNeutral: { color: '#9E9E9E' },
  barVal: { fontSize: 9, color: '#6750A4', fontWeight: 'bold', marginBottom: 1 },
  barLbl: { fontSize: 9, color: '#757575', textAlign: 'center', height: 16 },
  typeRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14 },
  typeRowBorder: { borderTopWidth: 1, borderTopColor: '#F3F0FA' },
  typeIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F3F0FA', justifyContent: 'center', alignItems: 'center',
    marginRight: 14, marginTop: 2,
  },
  typeCat: { fontSize: 11, color: '#9E9E9E', marginBottom: 2 },
  typeTitle: { fontSize: 15, fontWeight: 'bold', color: '#1C1B1F', marginBottom: 3 },
  typeDesc: { fontSize: 12, color: '#49454F', lineHeight: 18 },
});
