import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, Image,
} from 'react-native';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { insertBook, getAge } from '../database/database';
import { GENRES, checkAndUnlockBadges } from '../database/badges';
import BookShareCard from '../components/BookShareCard';

const ALADIN_TTB_KEY = process.env.EXPO_PUBLIC_ALADIN_TTB_KEY;
const cleanAladinAuthor = (str) =>
  str ? str.replace(/\s*\(.*?\)/g, '').split(',')[0].trim() || '저자 미상' : '저자 미상';

const STATUS_OPTIONS = [
  { key: 'want_to_read', label: '읽고 싶음' },
  { key: 'reading', label: '읽는 중' },
  { key: 'completed', label: '완독' },
];

const BOOK_TYPE_OPTIONS = [
  { key: 'physical', label: '종이책' },
  { key: 'ebook', label: 'E-Book' },
];

export default function AddBookScreen() {
  const router = useRouter();
  const cardRef = useRef(null);
  const scrollViewRef = useRef(null);
  const authorRef = useRef(null);
  const totalPagesRef = useRef(null);
  const reviewRef = useRef(null);

  const scrollToInput = (ref) => {
    setTimeout(() => {
      ref.current?.measureLayout(
        scrollViewRef.current,
        (left, top) => scrollViewRef.current?.scrollTo({ y: top - 120, animated: true }),
        () => {}
      );
    }, 300);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [status, setStatus] = useState('want_to_read');
  const [bookType, setBookType] = useState('physical');
  const [genre, setGenre] = useState('');
  const [review, setReview] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isAdult, setIsAdult] = useState(false);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      Alert.alert('알림', '검색어를 입력해주세요.');
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_TTB_KEY}&Query=${encodeURIComponent(q)}&QueryType=Keyword&SearchTarget=Book&MaxResults=10&output=js&Version=20131101&Cover=Big&OptResult=subInfo`
      );
      if (!res.ok) throw new Error('fetch error');
      const data = await res.json();
      const items = (data.item || []).filter(item => item.cover && !item.cover.includes('noimg'));
      if (items.length === 0) {
        Alert.alert('검색 결과 없음', '일치하는 책 정보가 없습니다.\n다른 검색어를 시도해보세요.');
        return;
      }
      setSearchResults(items);
    } catch {
      Alert.alert('오류', '책 정보를 가져오지 못했습니다. 네트워크를 확인해주세요.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectBook = (item) => {
    const isAdultBook = item.adult === 1 || item.adult === '1';
    setTitle(item.title || '');
    setAuthor(cleanAladinAuthor(item.author));
    const pages = item.subInfo?.itemPage;
    if (pages && pages > 0) setTotalPages(String(pages));
    setCoverImage(item.cover || '');
    setIsAdult(isAdultBook);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleShare = async () => {
    if (!title.trim()) {
      Alert.alert('알림', '공유하려면 책 제목을 입력해주세요.');
      return;
    }
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '책 카드 공유' });
    } catch {
      Alert.alert('오류', '이미지 생성에 실패했습니다.');
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('알림', '책 제목을 입력해주세요.');
      return;
    }
    if (isAdult) {
      const age = getAge();
      if (age === 0) {
        Alert.alert('성인 인증 필요', '성인 도서입니다.\n프로필에서 나이를 먼저 설정해주세요.');
        return;
      }
      if (age < 19) {
        Alert.alert('성인 도서 제한', '만 19세 이상만 성인 도서를 추가할 수 있습니다.');
        return;
      }
    }
    insertBook({
      title: title.trim(),
      author: author.trim(),
      totalPages: parseInt(totalPages) || 0,
      status,
      bookType,
      genre,
      review: review.trim(),
      cover: coverImage,
      isAdult,
    });
    checkAndUnlockBadges();
    router.back();
  };

  return (
    <>
    <View style={{ position: 'absolute', top: -9999, left: 0 }} pointerEvents="none">
      <View ref={cardRef} collapsable={false}>
        <BookShareCard title={title} author={author} status={status} review={review} />
      </View>
    </View>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

        <Text style={styles.label}>도서 검색 <Text style={styles.labelOptional}>(선택 · 알라딘)</Text></Text>
        <View style={styles.isbnRow}>
          <TextInput
            style={[styles.input, styles.isbnInput]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="책 제목, 저자 또는 ISBN 입력"
            placeholderTextColor="#CAC4D0"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={[styles.isbnBtn, isSearching && styles.isbnBtnDisabled]}
            onPress={handleSearch}
            disabled={isSearching}
          >
            {isSearching
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.isbnBtnText}>검색</Text>
            }
          </TouchableOpacity>
        </View>
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((item) => (
              <TouchableOpacity
                key={String(item.itemId)}
                style={styles.searchResultItem}
                onPress={() => selectBook(item)}
              >
                <Image source={{ uri: item.cover }} style={styles.searchResultCover} />
                <View style={styles.searchResultInfo}>
                  <Text style={styles.searchResultTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.searchResultAuthor} numberOfLines={1}>{cleanAladinAuthor(item.author)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {coverImage ? (
          <View style={styles.selectedCoverContainer}>
            <Image source={{ uri: coverImage }} style={styles.selectedCoverImage} />
          </View>
        ) : null}

        <Text style={styles.label}>책 제목 *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="책 제목을 입력하세요"
          placeholderTextColor="#CAC4D0"
        />

        <Text style={styles.label}>저자</Text>
        <TextInput
          ref={authorRef}
          style={styles.input}
          value={author}
          onChangeText={setAuthor}
          onFocus={() => scrollToInput(authorRef)}
          placeholder="저자를 입력하세요"
          placeholderTextColor="#CAC4D0"
        />

        <Text style={styles.label}>총 페이지 수</Text>
        <TextInput
          ref={totalPagesRef}
          style={styles.input}
          value={totalPages}
          onChangeText={setTotalPages}
          onFocus={() => scrollToInput(totalPagesRef)}
          placeholder="페이지 수를 입력하세요"
          placeholderTextColor="#CAC4D0"
          keyboardType="numeric"
        />

        <Text style={styles.label}>독서 후기</Text>
        <TextInput
          ref={reviewRef}
          style={[styles.input, styles.reviewInput]}
          value={review}
          onChangeText={setReview}
          onFocus={() => scrollToInput(reviewRef)}
          placeholder="독서 후기를 입력하세요"
          placeholderTextColor="#CAC4D0"
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>장르</Text>
        <View style={styles.genreGroup}>
          {GENRES.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genreBtn, genre === g && styles.genreBtnActive]}
              onPress={() => setGenre(genre === g ? '' : g)}
            >
              <Text style={[styles.genreBtnText, genre === g && styles.genreBtnTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>책 형태</Text>
        <View style={styles.statusGroup}>
          {BOOK_TYPE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.statusBtn, bookType === option.key && styles.statusBtnActive]}
              onPress={() => setBookType(option.key)}
            >
              <Text style={[styles.statusBtnText, bookType === option.key && styles.statusBtnTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>읽기 상태</Text>
        <View style={styles.statusGroup}>
          {STATUS_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.statusBtn, status === option.key && styles.statusBtnActive]}
              onPress={() => setStatus(option.key)}
            >
              <Text style={[styles.statusBtnText, status === option.key && styles.statusBtnTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>공유하기</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 16 },

  label: { fontSize: 14, fontWeight: '600', color: '#1C1B1F', marginBottom: 8, marginTop: 16 },
  labelOptional: { fontSize: 12, fontWeight: '400', color: '#9E8FB2' },
  input: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1B1F',
    backgroundColor: '#fff',
  },

  isbnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  isbnInput: { flex: 1 },
  isbnBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  isbnBtnDisabled: { backgroundColor: '#CAC4D0' },
  isbnBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  genreGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  genreBtnActive: { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  genreBtnText: { fontSize: 13, color: '#49454F' },
  genreBtnTextActive: { color: '#fff', fontWeight: '600' },

  statusGroup: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    alignItems: 'center',
  },
  statusBtnActive: { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  statusBtnText: { fontSize: 13, color: '#49454F' },
  statusBtnTextActive: { color: '#fff', fontWeight: '600' },
  reviewInput: { height: 120, paddingTop: 12 },

  searchResults: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDF6',
  },
  searchResultCover: {
    width: 38,
    height: 54,
    borderRadius: 4,
    resizeMode: 'cover',
    backgroundColor: '#EDE9F6',
  },
  searchResultInfo: { flex: 1 },
  selectedCoverContainer: { alignItems: 'center', marginTop: 20 },
  selectedCoverImage: { width: 80, height: 114, borderRadius: 6, resizeMode: 'cover', backgroundColor: '#EDE9F6' },
  searchResultTitle: { fontSize: 13, fontWeight: '600', color: '#1C1B1F', marginBottom: 2 },
  searchResultAuthor: { fontSize: 12, color: '#49454F' },
  saveBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  shareBtn: {
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  shareBtnText: { color: '#6750A4', fontSize: 16, fontWeight: '600' },
});
