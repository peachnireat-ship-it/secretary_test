import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getBookById, updateBook, trackDailyReading, onBookCompleted, getBookReviews, insertBookReview, deleteBookReview, addXp, XP_REWARDS, getUserStats, isDoubleXpActive } from '../../database/database';
import StatusBadge from '../../components/StatusBadge';
import StarRating from '../../components/StarRating';
import BookShareCard from '../../components/BookShareCard';
import LevelUpModal from '../../components/LevelUpModal';

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cardRef = useRef(null);
  const scrollViewRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const goalDateRef = useRef(null);
  const [book, setBook] = useState(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [reviews, setReviews] = useState([]);
  const [newReviewText, setNewReviewText] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [goalDateStr, setGoalDateStr] = useState('');
  const [bookType, setBookType] = useState('physical');
  const [progressPct, setProgressPct] = useState('');
  const [levelUpModal, setLevelUpModal] = useState({ visible: false, level: 1, navigateBack: false });

  const tsToDateStr = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const scrollToInput = (ref) => {
    setTimeout(() => {
      ref.current?.measureLayout(
        scrollViewRef.current,
        (left, top) => scrollViewRef.current?.scrollTo({ y: top - 120, animated: true }),
        () => {}
      );
    }, 300);
  };

  const formatDateInput = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };

  const dateStrToTs = (str) => {
    if (!str.trim()) return null;
    const parts = str.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : d.getTime();
  };

  const loadReviews = () => {
    setReviews(getBookReviews(parseInt(id)));
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
      setGoalDateStr(tsToDateStr(data.goalDate));
      setBookType(data.bookType || 'physical');
      setProgressPct(data.progressPct > 0 ? data.progressPct.toString() : '');
    }
    loadReviews();
  }, [id]);

  const handleAddReview = () => {
    const text = newReviewText.trim();
    if (!text) return;
    const prevLevel = getUserStats().level;
    insertBookReview(parseInt(id), text);
    setNewReviewText('');
    loadReviews();
    const newLevel = getUserStats().level;
    if (newLevel > prevLevel) {
      setLevelUpModal({ visible: true, level: newLevel, navigateBack: false });
    }
  };

  const handleDeleteReview = (reviewId) => {
    Alert.alert('삭제', '이 메모를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { deleteBookReview(reviewId); loadReviews(); } },
    ]);
  };

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
    const startTs = dateStrToTs(startDateStr);
    const endTs = dateStrToTs(endDateStr);
    const goalTs = dateStrToTs(goalDateStr);
    if (startTs && endTs && endTs < startTs) {
      Alert.alert('날짜 오류', '독서 종료일은 시작일 이전으로 설정할 수 없습니다.');
      return;
    }
    if (startTs && goalTs && goalTs < startTs) {
      Alert.alert('날짜 오류', '완독 목표일은 시작일 이전으로 설정할 수 없습니다.');
      return;
    }
    const autoComplete = book.status !== 'completed' && effectiveProgress === 100;
    const newCurrentPage = parseInt(currentPage) || 0;
    const finalEndDate = autoComplete ? (endTs || Date.now()) : endTs;
    updateBook({
      ...book,
      rating,
      review,
      currentPage: newCurrentPage,
      startDate: startTs,
      endDate: finalEndDate,
      goalDate: goalTs ?? book.goalDate,
      bookType,
      progressPct: parseInt(progressPct) || 0,
      status: autoComplete ? 'completed' : book.status,
    });

    const prevLevel = getUserStats().level;

    let doubleXpApplied = false;
    if (book.status === 'reading' || autoComplete) {
      const pageDelta = Math.max(0, newCurrentPage - (book.currentPage || 0));
      const pctDelta = Math.max(0, (parseInt(progressPct) || 0) - (book.progressPct || 0));
      if (pageDelta > 0 || pctDelta > 0 || autoComplete) {
        const multiplier = trackDailyReading(book.bookType === 'physical' && book.totalPages > 0 ? pageDelta : 0);
        doubleXpApplied = multiplier === 2;
      }
    }
    if (autoComplete) {
      onBookCompleted({ ...book, endDate: finalEndDate, goalDate: goalTs ?? book.goalDate });
    }

    const isCompleted = book.status === 'completed' || autoComplete;
    if (isCompleted && review.trim() && !book.review) {
      const reviewMultiplier = isDoubleXpActive() ? 2 : 1;
      addXp(XP_REWARDS.BOOK_REVIEW * reviewMultiplier);
      if (reviewMultiplier === 2) doubleXpApplied = true;
    }

    const newLevel = getUserStats().level;
    if (newLevel > prevLevel) {
      setLevelUpModal({ visible: true, level: newLevel, navigateBack: true });
    } else {
      const baseMsg = autoComplete ? '진척률 100%로 완독 처리되었습니다.' : '변경사항이 저장되었습니다.';
      Alert.alert(
        '저장 완료',
        doubleXpApplied ? `${baseMsg}\n⚡ XP 2배 이벤트 적용됨!` : baseMsg,
        [{ text: '확인', onPress: () => router.back() }],
      );
    }
  };

  const handleMarkReading = () => {
    if (!book) return;
    Alert.alert('독서 시작', '이 책을 읽는 중으로 변경할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '독서중',
        onPress: () => {
          const now = Date.now();
          updateBook({
            ...book,
            rating,
            review,
            currentPage: parseInt(currentPage) || 0,
            status: 'reading',
            startDate: dateStrToTs(startDateStr) || now,
            progressPct: parseInt(progressPct) || 0,
          });
          router.back();
        },
      },
    ]);
  };

  const handleMarkCompleted = () => {
    if (!book) return;
    const startTs = dateStrToTs(startDateStr);
    const goalTs = dateStrToTs(goalDateStr);
    if (startTs && goalTs && goalTs < startTs) {
      Alert.alert('날짜 오류', '완독 목표일은 시작일 이전으로 설정할 수 없습니다.');
      return;
    }
    Alert.alert('완독 처리', '이 책을 완독 처리할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '완독',
        onPress: () => {
          const finalEndDate = Date.now();
          updateBook({
            ...book,
            rating,
            review,
            currentPage: parseInt(currentPage) || 0,
            status: 'completed',
            endDate: finalEndDate,
            goalDate: goalTs ?? book.goalDate,
            progressPct: parseInt(progressPct) || 0,
          });
          const prevLevel = getUserStats().level;
          trackDailyReading(0);
          onBookCompleted({ ...book, endDate: finalEndDate, goalDate: goalTs ?? book.goalDate });
          const newLevel = getUserStats().level;
          if (newLevel > prevLevel) {
            setLevelUpModal({ visible: true, level: newLevel, navigateBack: true });
          } else {
            router.back();
          }
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

  const effectiveProgress = book.totalPages > 0
    ? Math.min(100, Math.round((parseInt(currentPage || 0) / book.totalPages) * 100))
    : Math.min(100, parseInt(progressPct) || 0);

  return (
    <>
    <LevelUpModal
      visible={levelUpModal.visible}
      level={levelUpModal.level}
      onClose={() => {
        setLevelUpModal({ visible: false, level: 1, navigateBack: false });
        if (levelUpModal.navigateBack) router.back();
      }}
    />
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{book.title}</Text>
        {book.author ? <Text style={styles.author}>{book.author}</Text> : null}
        <View style={styles.badgeRow}>
          <StatusBadge status={book.status} />
        </View>

        <Text style={styles.sectionLabel}>별점</Text>
        <StarRating
          rating={rating}
          onRate={book.status === 'completed' || effectiveProgress >= 50 || rating > 0 ? setRating : null}
          size={32}
        />
        {book.status !== 'completed' && effectiveProgress < 50 && rating === 0 && (
          <Text style={styles.ratingHint}>진척률 50% 이상부터 별점을 남길 수 있습니다.</Text>
        )}

        <Text style={styles.sectionLabel}>책 형태</Text>
        <View style={styles.typeRow}>
          {[{ key: 'physical', label: '종이책' }, { key: 'ebook', label: 'E-Book' }].map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.typeBtn, bookType === opt.key && styles.typeBtnActive]}
              onPress={() => setBookType(opt.key)}
            >
              <Text style={[styles.typeBtnText, bookType === opt.key && styles.typeBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>
          {bookType === 'ebook' ? '현재 위치 (E-Book)' : '현재 페이지 (종이책)'}
        </Text>
        <TextInput
          style={styles.input}
          value={currentPage}
          onChangeText={setCurrentPage}
          keyboardType="numeric"
          placeholder={
            bookType === 'ebook'
              ? '위치 번호 입력'
              : book.totalPages > 0 ? `전체 ${book.totalPages}p` : '페이지 입력'
          }
          placeholderTextColor="#CAC4D0"
        />

        {book.status === 'reading' && (
          <>
            <Text style={styles.sectionLabel}>독서 진척률</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${effectiveProgress}%` }]} />
            </View>
            {book.totalPages > 0 ? (
              <Text style={styles.progressInfo}>
                {effectiveProgress}% ({parseInt(currentPage) || 0} / {book.totalPages}p)
              </Text>
            ) : (
              <View style={styles.pctInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={progressPct}
                  onChangeText={(v) => {
                    const n = v.replace(/\D/g, '');
                    setProgressPct(n ? Math.min(100, parseInt(n)).toString() : '');
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#CAC4D0"
                />
                <Text style={styles.pctSuffix}>%</Text>
              </View>
            )}
          </>
        )}

        <Text style={styles.sectionLabel}>독서 시작일</Text>
        <TextInput
          ref={startDateRef}
          style={styles.input}
          value={startDateStr}
          onChangeText={(v) => setStartDateStr(formatDateInput(v))}
          onFocus={() => scrollToInput(startDateRef)}
          keyboardType="numeric"
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#CAC4D0"
        />
        <Text style={styles.sectionLabel}>독서 종료일</Text>
        {book.status === 'completed' ? (
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>{endDateStr || '미입력'}</Text>
            <Text style={styles.readonlyTag}>완독일</Text>
          </View>
        ) : (
          <TextInput
            ref={endDateRef}
            style={styles.input}
            value={endDateStr}
            onChangeText={(v) => setEndDateStr(formatDateInput(v))}
            onFocus={() => scrollToInput(endDateRef)}
            keyboardType="numeric"
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#CAC4D0"
          />
        )}

        <Text style={styles.sectionLabel}>완독 목표일 🎯</Text>
        <TextInput
          ref={goalDateRef}
          style={styles.input}
          value={goalDateStr}
          onChangeText={(v) => setGoalDateStr(formatDateInput(v))}
          onFocus={() => scrollToInput(goalDateRef)}
          keyboardType="numeric"
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#CAC4D0"
        />

        <Text style={styles.sectionLabel}>독서 메모 / 하이라이트</Text>
        {reviews.map((item) => (
          <View key={item.id} style={styles.reviewItem}>
            <Text style={styles.reviewSeq}>#{item.sequence}</Text>
            <Text style={styles.reviewContent}>{item.content}</Text>
            <TouchableOpacity onPress={() => handleDeleteReview(item.id)} style={styles.reviewDeleteBtn}>
              <Text style={styles.reviewDeleteText}>삭제</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View style={styles.reviewInputRow}>
          <TextInput
            style={[styles.input, styles.reviewInput, { flex: 1 }]}
            value={newReviewText}
            onChangeText={setNewReviewText}
            multiline
            placeholder="메모나 하이라이트를 입력하세요..."
            placeholderTextColor="#CAC4D0"
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.reviewAddBtn} onPress={handleAddReview}>
            <Text style={styles.reviewAddText}>추가</Text>
          </TouchableOpacity>
        </View>

        {book.status === 'completed' && (
          <>
            <Text style={styles.sectionLabel}>리뷰</Text>
            <TextInput
              style={[styles.input, styles.reviewTextarea]}
              value={review}
              onChangeText={setReview}
              multiline
              placeholder="완독 소감을 남겨보세요..."
              placeholderTextColor="#CAC4D0"
              textAlignVertical="top"
            />
          </>
        )}

        <View style={styles.btnRow}>
          {book.status === 'want_to_read' && (
            <TouchableOpacity style={styles.readingBtn} onPress={handleMarkReading}>
              <Text style={styles.readingBtnText}>읽는 중</Text>
            </TouchableOpacity>
          )}
          {book.status !== 'completed' && (
            <TouchableOpacity style={styles.completedBtn} onPress={handleMarkCompleted}>
              <Text style={styles.completedBtnText}>완독</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>공유</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>저장</Text>
          </TouchableOpacity>
        </View>
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
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  typeBtnText: { fontSize: 14, color: '#49454F' },
  typeBtnTextActive: { color: '#fff', fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 24, marginBottom: 8 },
  readingBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1976D2',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  readingBtnText: { color: '#1976D2', fontSize: 14, fontWeight: '600' },
  completedBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  completedBtnText: { color: '#6750A4', fontSize: 14, fontWeight: '600' },
  shareBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: { color: '#6750A4', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E8DEF8',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 4,
  },
  progressInfo: { fontSize: 13, color: '#6750A4', fontWeight: '600' },
  ratingHint: { fontSize: 12, color: '#9E8FB2', marginTop: 6 },
  pctInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pctSuffix: { fontSize: 18, color: '#49454F', fontWeight: '600' },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F0FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  reviewSeq: { fontSize: 12, fontWeight: '700', color: '#6750A4', minWidth: 28 },
  reviewContent: { flex: 1, fontSize: 14, color: '#1C1B1F', lineHeight: 20 },
  reviewDeleteBtn: { paddingHorizontal: 4 },
  reviewDeleteText: { fontSize: 12, color: '#B00020' },
  reviewInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  reviewAddBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-end',
  },
  reviewAddText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  reviewTextarea: { height: 120, marginBottom: 8 },
  readonlyBox: {
    borderWidth: 1,
    borderColor: '#E0D8F0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F5F0FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readonlyText: { fontSize: 16, color: '#49454F' },
  readonlyTag: { fontSize: 11, color: '#9E8FB2', fontWeight: '600' },
});
