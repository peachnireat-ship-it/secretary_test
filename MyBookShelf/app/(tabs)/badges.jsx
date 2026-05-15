import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useCallback } from 'react';
import { useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getBadgesWithStatus } from '../../database/badges';

function BadgeCard({ badge }) {
  const pct = Math.min(100, Math.round((badge.progress.current / badge.progress.max) * 100));
  return (
    <View style={[styles.badgeCard, badge.unlocked && styles.badgeCardUnlocked]}>
      <Text style={[styles.badgeEmoji, !badge.unlocked && styles.badgeEmojiLocked]}>{badge.emoji}</Text>
      <Text style={[styles.badgeName, !badge.unlocked && styles.badgeNameLocked]}>{badge.name}</Text>
      <Text style={styles.badgeDesc}>{badge.desc}</Text>
      <View style={styles.badgeBarBg}>
        <View style={[styles.badgeBarFill, { width: `${pct}%` }, badge.unlocked && styles.badgeBarFillDone]} />
      </View>
      <Text style={styles.badgeProgressText}>
        {badge.unlocked ? '✓ 달성!' : `${badge.progress.current} / ${badge.progress.max}`}
      </Text>
    </View>
  );
}

export default function BadgesScreen() {
  const [badges, setBadges] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setBadges(getBadgesWithStatus());
    }, [])
  );

  const unlocked = badges.filter(b => b.unlocked).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>
        🏅 나의 뱃지 ({unlocked}/{badges.length})
      </Text>
      <View style={styles.badgeGrid}>
        {badges.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  badgeCardUnlocked: {
    borderColor: '#6750A4',
    backgroundColor: '#F3EFFE',
  },
  badgeEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  badgeEmojiLocked: {
    opacity: 0.35,
  },
  badgeName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1B1F',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: '#9E9E9E',
  },
  badgeDesc: {
    fontSize: 11,
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 15,
  },
  badgeBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  badgeBarFill: {
    height: '100%',
    backgroundColor: '#9E9E9E',
    borderRadius: 2,
  },
  badgeBarFillDone: {
    backgroundColor: '#6750A4',
  },
  badgeProgressText: {
    fontSize: 10,
    color: '#9E9E9E',
    fontWeight: '600',
  },
});
