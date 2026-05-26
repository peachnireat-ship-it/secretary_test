import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAllBooks, getBooksByStatus, deleteBook, getGuildId, getUserId, getUsername } from '../../database/database';
import { revokeInvalidBadges } from '../../database/badges';
import { syncWeeklyScore } from '../../database/guildDatabase';
import BookCard from '../../components/BookCard';
import { takePendingLibraryStatus } from './_libraryFilter';

const TABS = [
  { key: 'all', label: '전체' },
  { key: 'reading', label: '읽는 중' },
  { key: 'completed', label: '완독' },
  { key: 'want_to_read', label: '읽고 싶음' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [activeTab, setActiveTab] = useState('all');

  const loadBooks = useCallback((tab) => {
    const key = tab || activeTab;
    const data = key === 'all' ? getAllBooks() : getBooksByStatus(key);
    setBooks(data);
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      const pendingStatus = takePendingLibraryStatus();
      if (pendingStatus && TABS.some(t => t.key === pendingStatus)) {
        setActiveTab(pendingStatus);
        setBooks(getBooksByStatus(pendingStatus));
      } else {
        setActiveTab('all');
        setBooks(getAllBooks());
      }
    }, [])
  );

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    loadBooks(tabKey);
  };

  const handleDelete = (book) => {
    Alert.alert(
      '책 삭제',
      `"${book.title}"을(를) 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deleteBook(book.id);
            revokeInvalidBadges();
            loadBooks();
            const guildId = getGuildId();
            if (guildId) {
              syncWeeklyScore(guildId, getUserId(), getUsername() || '독서가').catch(() => {});
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => handleTabChange(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={books}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            onPress={() => router.push(`/book/${item.id}`)}
            onLongPress={() => handleDelete(item)}
          />
        )}
        contentContainerStyle={books.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>책을 추가해보세요!</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/add-book')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#6750A4',
  },
  tabText: { fontSize: 13, color: '#49454F' },
  activeTabText: { color: '#6750A4', fontWeight: '600' },
  listContent: { paddingVertical: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: '#49454F' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6750A4',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
