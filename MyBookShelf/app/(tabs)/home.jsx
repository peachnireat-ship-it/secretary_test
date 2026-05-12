import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getStats, getBooksByStatus } from '../../database/database';
import BookCard from '../../components/BookCard';

function StatCard({ icon, label, value, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, completed: 0, reading: 0, want: 0 });
  const [readingBooks, setReadingBooks] = useState([]);
  const [wishlistBooks, setWishlistBooks] = useState([]);
  const [completedBooks, setCompletedBooks] = useState([]);

  useFocusEffect(
    useCallback(() => {
      setStats(getStats());
      setReadingBooks(getBooksByStatus('reading').slice(0, 3));
      setWishlistBooks(getBooksByStatus('want_to_read').slice(0, 3));
      setCompletedBooks(getBooksByStatus('completed').slice(0, 3));
    }, [])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>안녕하세요 👋</Text>
        <Text style={styles.subtitle}>오늘도 독서를 즐겨보세요</Text>
      </View>
	
	  <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-book')}>
        <Ionicons name="add-circle-outline" size={10} color="#fff" />
        <Text style={styles.addButtonText}>책 추가하기</Text>
      </TouchableOpacity>
	  
      <View style={styles.statsRow}>
        <StatCard icon="book-outline" label="전체" value={stats.total} color="#6750A4" />
        <StatCard icon="checkmark-circle-outline" label="완독" value={stats.completed} color="#4CAF50" />
        <StatCard icon="reader-outline" label="읽는 중" value={stats.reading} color="#2196F3" />
        <StatCard icon="bookmark-outline" label="읽고 싶음" value={stats.want} color="#FF9800" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>읽는 중인 책</Text>
        {readingBooks.length > 0 ? (
          readingBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onPress={() => router.push(`/book/${book.id}`)}
            />
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Ionicons name="book-outline" size={36} color="#C4C4C4" />
            <Text style={styles.emptyText}>읽는 중인 책이 없습니다</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>읽고 싶은 책</Text>
        {wishlistBooks.length > 0 ? (
          wishlistBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onPress={() => router.push(`/book/${book.id}`)}
            />
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Ionicons name="bookmark-outline" size={36} color="#C4C4C4" />
            <Text style={styles.emptyText}>위시리스트가 비어 있습니다</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>완독한 책</Text>
        {completedBooks.length > 0 ? (
          completedBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onPress={() => router.push(`/book/${book.id}`)}
            />
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-circle-outline" size={36} color="#C4C4C4" />
            <Text style={styles.emptyText}>완독한 책이 없습니다</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1B1F',
  },
  subtitle: {
    fontSize: 14,
    color: '#49454F',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#49454F',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 12,
  },
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
