import { View, Text, StyleSheet } from 'react-native';

const STATUS_CONFIG = {
  want_to_read: { label: '읽고 싶음', color: '#FF9800' },
  reading:      { label: '읽는 중',   color: '#2196F3' },
  completed:    { label: '완독',      color: '#4CAF50' },
};

export default function BookShareCard({ title, author, status, rating, startDate, endDate, review }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#6750A4' };
  const ratingNum = Math.round(rating || 0);
  const stars = ratingNum > 0 ? '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum) : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.emoji}>📚</Text>
        <Text style={styles.title}>{title || '제목 없음'}</Text>
        {author ? <Text style={styles.author}>{author}</Text> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {stars ? <Text style={styles.stars}>{stars}</Text> : null}
        </View>

        {(startDate || endDate) ? (
          <Text style={styles.dateText}>
            📅 {startDate || ''}{startDate && endDate ? ' ~ ' : ''}{endDate || ''}
          </Text>
        ) : null}

        {review ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.review} numberOfLines={5}>{review}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.appName}>MyBookShelf</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#6750A4',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  emoji: { fontSize: 36, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', lineHeight: 30, marginBottom: 6 },
  author: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic' },
  body: { padding: 24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  stars: { fontSize: 16, color: '#FFB300', letterSpacing: 1 },
  dateText: { fontSize: 13, color: '#6B6278', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#F0EBF8', marginVertical: 16 },
  review: {
    fontSize: 14,
    color: '#49454F',
    lineHeight: 22,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    borderLeftColor: '#D0BCFF',
    paddingLeft: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#F5F0FF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'flex-end',
  },
  appName: { fontSize: 12, color: '#9E8FB2', fontWeight: '700', letterSpacing: 1.5 },
});
