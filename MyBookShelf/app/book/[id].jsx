import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getBookById, updateBook } from '../../database/database';
import StatusBadge from '../../components/StatusBadge';
import StarRating from '../../components/StarRating';
import BookShareCard from '../../components/BookShareCard';

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const cardRef = useRef(null);
  const [book, setBook] = useState(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  const tsToDateStr = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const dateStrToTs = (str) => {
    if (!str.trim()) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.getTime();
  };

  useEffect(() => {
    const data = getBookById(parseInt(id));
    if (data) {
      setBook(data);
      setRating(data.rating || 0);
      setReview(data.review || '');
      setCurrentPage(data.currentPage > 0 ? data.currentPage.toString() : '');
      setStartDateStr(tsToDateStr(data.startDate));
      setEndDateStr(tsToDateStr(data.endDate));
    }
  }, [id]);

  const handleShare = async () => {
    if (!book) return;
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '책 카드 공유' });
    } catch {
      Alert.alert('오류', '이미지 생성에 실패했습니다.');
    }
  };

  const handleSave = () => {
    if (!book) return;
    updateBook({
      ...book,
      rating,
      review,
      currentPage: parseInt(currentPage) || 0,
      startDate: dateStrToTs(startDateStr),
      endDate: dateStrToTs(endDateStr),
    });
    Alert.alert('저장 완료', '변경사항이 저장되었습니다.', [
      { text: '확인', onPress: () => router.back() },
    ]);
  };

  const handleMarkCompleted = () => {
    if (!book) return;
    Alert.alert('완독 처리', '이 책을 완독 처리할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '완독',
        onPress: () => {
          updateBook({
            ...book,
            rating,
            review,
            currentPage: parseInt(currentPage) || 0,
            status: 'completed',
            endDate: Date.now(),
          });
          router.back();
        },
      },
    ]);
  };

  if (!book) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: '#49454F' }}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <>
    <View style={{ position: 'absolute', top: -9999, left: 0 }} pointerEvents="none">
      <View ref={cardRef} collapsable={false}>
        <BookShareCard
          title={book.title}
          author={book.author}
          status={book.status}
          rating={rating}
          startDate={startDateStr}
          endDate={endDateStr}
          review={review}
        />
      </View>
    </View>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{book.title}</Text>
        {book.author ? <Text style={styles.author}>{book.author}</Text> : null}
        <View style={styles.badgeRow}>
          <StatusBadge status={book.status} />
        </View>

        <Text style={styles.sectionLabel}>별점</Text>
        <StarRating rating={rating} onRate={setRating} size={32} />

        <Text style={styles.sectionLabel}>현재 페이지</Text>
        <TextInput
          style={styles.input}
          value={currentPage}
          onChangeText={setCurrentPage}
          keyboardType="numeric"
          placeholder={book.totalPages > 0 ? `전체 ${book.totalPages}p` : '페이지 입력'}
          placeholderTextColor="#CAC4D0"
        />

        {(book.status === 'reading' || book.status === 'completed') && (
          <>
            <Text style={styles.sectionLabel}>독서 시작일</Text>
            <TextInput
              style={styles.input}
              value={startDateStr}
              onChangeText={setStartDateStr}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#CAC4D0"
            />
            <Text style={styles.sectionLabel}>독서 종료일</Text>
            <TextInput
              style={styles.input}
              value={endDateStr}
              onChangeText={setEndDateStr}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#CAC4D0"
            />
          </>
        )}

        <Text style={styles.sectionLabel}>독서 메모</Text>
        <TextInput
          style={[styles.input, styles.reviewInput]}
          value={review}
          onChangeText={setReview}
          multiline
          placeholder="감상이나 메모를 적어보세요..."
          placeholderTextColor="#CAC4D0"
          textAlignVertical="top"
        />

        {book.status !== 'completed' && (
          <TouchableOpacity style={styles.completedBtn} onPress={handleMarkCompleted}>
            <Text style={styles.completedBtnText}>완독 처리</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>공유하기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1C1B1F', marginTop: 8, marginBottom: 4 },
  author: { fontSize: 15, color: '#49454F', marginBottom: 12 },
  badgeRow: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#1C1B1F', marginBottom: 8, marginTop: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1C1B1F',
  },
  reviewInput: { height: 120 },
  completedBtn: {
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  completedBtnText: { color: '#6750A4', fontSize: 16, fontWeight: '600' },
  shareBtn: {
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  shareBtnText: { color: '#6750A4', fontSize: 16, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 40,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
