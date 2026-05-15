import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getBadgesWithStatus } from '../../database/badges';

function BadgeCard({ badge }) {
  const pct = Math.min(100, Math.round((badge.progress.current / badge.progress.max) * 100));
  const opacity = useRef(new Animated.Value(0)).current;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handlePress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltipVisible(true);
    opacity.setValue(1);
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }).start(
        () => setTooltipVisible(false)
      );
    }, 4300);
  };

  return (
    <TouchableOpacity
      style={[styles.badgeCard, badge.unlocked && styles.badgeCardUnlocked, tooltipVisible && styles.badgeCardActive]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {tooltipVisible && (
        <Animated.View style={[styles.tooltip, { opacity }]} pointerEvents="none">
          <Text style={styles.tooltipText}>{badge.desc}</Text>
          <View style={styles.tooltipArrow} />
        </Animated.View>
      )}
      <Text style={[styles.badgeEmoji, !badge.unlocked && styles.badgeEmojiLocked]}>{badge.emoji}</Text>
      <Text style={[styles.badgeName, !badge.unlocked && styles.badgeNameLocked]}>{badge.name}</Text>
      <View style={styles.badgeBarBg}>
        <View style={[styles.badgeBarFill, { width: `${pct}%` }, badge.unlocked && styles.badgeBarFillDone]} />
      </View>
      <Text style={styles.badgeProgressText}>
        {badge.unlocked ? '✓ 달성!' : `${badge.progress.current} / ${badge.progress.max}`}
      </Text>
    </TouchableOpacity>
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
  badgeCardActive: {
    zIndex: 10,
    elevation: 5,
  },
  tooltip: {
    position: 'absolute',
    bottom: '105%',
    left: '50%',
    marginLeft: -75,
    width: 150,
    backgroundColor: 'rgba(33, 33, 33, 0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 100,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(33, 33, 33, 0.92)',
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
