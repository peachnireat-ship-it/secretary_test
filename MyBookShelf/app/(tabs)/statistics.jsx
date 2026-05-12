import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStats } from '../../database/database';

function StatItem({ label, value, color }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function StatisticsScreen() {
  const [stats, setStats] = useState({ total: 0, completed: 0, reading: 0, want: 0 });

  useFocusEffect(
    useCallback(() => {
      setStats(getStats());
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
