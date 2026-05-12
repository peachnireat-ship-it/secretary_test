import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, findNodeHandle,
  ActivityIndicator,
} from 'react-native';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { insertBook } from '../database/database';
import BookShareCard from '../components/BookShareCard';

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
        findNodeHandle(scrollViewRef.current),
        (left, top) => scrollViewRef.current?.scrollTo({ y: top - 120, animated: true }),
        () => {}
      );
    }, 300);
  };
  const [isbn, setIsbn] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [status, setStatus] = useState('want_to_read');
  const [bookType, setBookType] = useState('physical');
  const [review, setReview] = useState('');

  const handleIsbnSearch = async () => {
    const cleaned = isbn.replace(/[-\s]/g, '');
    if (!cleaned) {
      Alert.alert('알림', 'ISBN을 입력해주세요.');
      return;
    }
    if (!/^\d{10}$|^\d{13}$/.test(cleaned)) {
      Alert.alert('알림', 'ISBN은 10자리 또는 13자리 숫자입니다.');
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${cleaned}&format=json&jscmd=data`
      );
      const json = await res.json();
      const data = json[`ISBN:${cleaned}`];
      if (!data) {
        Alert.alert('검색 결과 없음', 'ISBN으로 책 정보를 찾을 수 없습니다.\n제목 등을 직접 입력해 등록할 수 있습니다.');
        return;
      }
      if (data.title) setTitle(data.title);
      if (data.authors?.length > 0) setAuthor(data.authors[0].name || '');
      if (data.number_of_pages) setTotalPages(String(data.number_of_pages));
    } catch {
      Alert.alert('오류', '책 정보를 가져오지 못했습니다. 네트워크를 확인해주세요.');
    } finally {
      setIsSearching(false);
    }
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
    insertBook({
      title: title.trim(),
      author: author.trim(),
      totalPages: parseInt(totalPages) || 0,
      status,
      bookType,
      review: review.trim(),
    });
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

        <Text style={styles.label}>ISBN 검색 <Text style={styles.labelOptional}>(선택)</Text></Text>
        <View style={styles.isbnRow}>
          <TextInput
            style={[styles.input, styles.isbnInput]}
            value={isbn}
            onChangeText={setIsbn}
            placeholder="ISBN 10자리 또는 13자리"
            placeholderTextColor="#CAC4D0"
            keyboardType="numeric"
            returnKeyType="search"
            onSubmitEditing={handleIsbnSearch}
          />
          <TouchableOpacity
            style={[styles.isbnBtn, isSearching && styles.isbnBtnDisabled]}
            onPress={handleIsbnSearch}
            disabled={isSearching}
          >
            {isSearching
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.isbnBtnText}>검색</Text>
            }
          </TouchableOpacity>
        </View>

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
  labelOptional: { fontSize: 12, fontWeight: '400', color: '#9E8FB2' },

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
