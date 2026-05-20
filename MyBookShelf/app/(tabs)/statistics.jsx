import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStats, getMonthlyReadingStats } from '../../database/database';

function StatItem({ label, value, color }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LineSegment({ x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <View
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - 1,
        width: length,
        height: 2,
        backgroundColor: '#6750A4',
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function MonthlyLineChart({ data }) {
  const [chartWidth, setChartWidth] = useState(0);
  if (!data || data.length < 2) return null;

  const CHART_H = 160;
  const PAD_L = 28;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 36;
  const plotW = Math.max(chartWidth - PAD_L - PAD_R, 0);
  const plotH = CHART_H - PAD_T - PAD_B;

  const maxVal = Math.max(...data.map(d => d.count), 10);
  const gridVals = Array.from({ length: maxVal + 1 }, (_, i) => i);

  const pts = data.map((d, i) => ({
    x: PAD_L + (i / (data.length - 1)) * plotW,
    y: PAD_T + plotH - (d.count / maxVal) * plotH,
    count: d.count,
    label: d.label,
  }));

  return (
    <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)}>
      {chartWidth > 0 && (
        <View style={{ height: CHART_H }}>
          {gridVals.map(v => {
            const gy = PAD_T + plotH - (v / maxVal) * plotH;
            return (
              <View key={v}>
                <View style={{ position: 'absolute', left: PAD_L, top: gy, width: plotW, height: 1, backgroundColor: '#EEEEEE' }} />
                <Text style={{ position: 'absolute', left: 0, top: gy - 7, width: PAD_L - 4, fontSize: 10, color: '#BDBDBD', textAlign: 'right' }}>
                  {v}
                </Text>
              </View>
            );
          })}

          {pts.slice(1).map((pt, i) => (
            <LineSegment key={i} x1={pts[i].x} y1={pts[i].y} x2={pt.x} y2={pt.y} />
          ))}

          {pts.map((pt, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: pt.x - 4,
                top: pt.y - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: pt.count > 0 ? '#6750A4' : '#E0E0E0',
                borderWidth: 2,
                borderColor: '#fff',
              }}
            />
          ))}

          {pts.map((pt, i) =>
            i % 2 === 0 ? (
              <Text
                key={i}
                style={{
                  position: 'absolute',
                  left: pt.x - 12,
                  top: CHART_H - PAD_B + 8,
                  width: 24,
                  fontSize: 10,
                  color: '#9E9E9E',
                  textAlign: 'center',
                }}
              >
                {pt.label}
              </Text>
            ) : null
          )}
        </View>
      )}
    </View>
  );
}

export default function StatisticsScreen() {
  const [stats, setStats] = useState({ total: 0, completed: 0, reading: 0, want: 0 });
  const [monthlyStats, setMonthlyStats] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setStats(getStats());
      setMonthlyStats(getMonthlyReadingStats());
    }, [])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>내 독서 현황</Text>
        <View style={styles.statsRow}>
          <StatItem label="전체" value={stats.total} color="#6750A4" />
          <StatItem label="완독" value={stats.completed} color="#4CAF50" />
          <StatItem label="읽는 중" value={stats.reading} color="#2196F3" />
          <StatItem label="읽고 싶음" value={stats.want} color="#FF9800" />
        </View>
      </View>

      <View style={[styles.card, styles.chartCard]}>
        <Text style={styles.cardTitle}>월별 완독 현황</Text>
        <MonthlyLineChart data={monthlyStats} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  card: {
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  chartCard: { marginTop: 12 },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1B1F',
    marginBottom: 24,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 36, fontWeight: 'bold' },
  statLabel: { fontSize: 13, color: '#49454F', marginTop: 4 },
});
