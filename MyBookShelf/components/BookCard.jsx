import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StatusBadge from './StatusBadge';
import StarRating from './StarRating';

function fmtDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function BookCard({ book, onPress, onLongPress }) {
  const goalDateStr = book.status === 'reading' && book.goalDate ? fmtDate(book.goalDate) : null;
  const progress = book.status === 'reading'
    ? (book.totalPages > 0 && book.currentPage > 0
        ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
        : (book.progressPct || 0))
    : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{book.title}</Text>
        <StatusBadge status={book.status} />
      </View>
      {book.author ? (
        <Text style={styles.author} numberOfLines={1}>{book.author}</Text>
      ) : null}
      {goalDateStr && (
        <View style={styles.goalRow}>
          <Ionicons name="flag-outline" size={12} color="#6750A4" />
          <Text style={styles.goalText}>완독 목표 {goalDateStr}</Text>
        </View>
      )}
      {book.status === 'reading' && (
        <View style={styles.progressRow}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      )}
      {book.rating > 0 && (
        <View style={styles.ratingRow}>
          <StarRating rating={book.rating} size={16} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1B1F',
    flex: 1,
  },
  author: {
    fontSize: 13,
    color: '#49454F',
    marginBottom: 6,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  goalText: {
    fontSize: 12,
    color: '#6750A4',
  },
  ratingRow: {
    marginTop: 4,
  },
  progressRow: {
    marginTop: 4,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#E8DEF8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: '#6750A4',
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },
});
