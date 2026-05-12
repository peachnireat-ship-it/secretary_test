import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import StatusBadge from './StatusBadge';
import StarRating from './StarRating';

export default function BookCard({ book, onPress, onLongPress }) {
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
  ratingRow: {
    marginTop: 4,
  },
});
