import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getAllBooks,
  getDiscussions,
  addDiscussion,
  updateDiscussion,
  deleteDiscussion,
} from '../../database/database';

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM = { bookId: null, bookTitle: '', topic: '', content: '', questions: [''] };

export default function BookDiscussionScreen() {
  const [discussions, setDiscussions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bookPickerVisible, setBookPickerVisible] = useState(false);
  const [allBooks, setAllBooks] = useState([]);

  const reload = useCallback(() => {
    setDiscussions(getDiscussions());
  }, []);

  useFocusEffect(reload);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (disc) => {
    setEditTarget(disc);
    let qs = [];
    try { qs = JSON.parse(disc.questions); } catch (_) {}
    if (!qs.length) qs = [''];
    setForm({
      bookId: disc.bookId,
      bookTitle: disc.bookTitle,
      topic: disc.topic,
      content: disc.content,
      questions: qs,
    });
    setModalVisible(true);
  };

  const openBookPicker = () => {
    setAllBooks(getAllBooks());
    setBookPickerVisible(true);
  };

  const pickBook = (book) => {
    setForm((f) => ({ ...f, bookId: book.id, bookTitle: book.title }));
    setBookPickerVisible(false);
  };

  const clearBook = () => setForm((f) => ({ ...f, bookId: null, bookTitle: '' }));

  const setQuestion = (idx, val) => {
    setForm((f) => {
      const qs = [...f.questions];
      qs[idx] = val;
      return { ...f, questions: qs };
    });
  };

  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, ''] }));

  const removeQuestion = (idx) => {
    setForm((f) => {
      const qs = f.questions.filter((_, i) => i !== idx);
      return { ...f, questions: qs.length ? qs : [''] };
    });
  };

  const saveDiscussion = () => {
    if (!form.topic.trim()) {
      Alert.alert('필수 입력', '토론 주제를 입력해 주세요.');
      return;
    }
    const cleanedQs = form.questions.filter((q) => q.trim());
    if (editTarget) {
      updateDiscussion({ id: editTarget.id, topic: form.topic.trim(), content: form.content.trim(), questions: cleanedQs });
    } else {
      addDiscussion({ bookId: form.bookId, bookTitle: form.bookTitle, topic: form.topic.trim(), content: form.content.trim(), questions: cleanedQs });
    }
    setModalVisible(false);
    reload();
  };

  const confirmDelete = (id) => {
    Alert.alert('토론 삭제', '이 토론을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { deleteDiscussion(id); setExpandedId(null); reload(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        {discussions.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={52} color="#C9B8E8" />
            <Text style={styles.emptyTitle}>토론이 없습니다</Text>
            <Text style={styles.emptyDesc}>+ 버튼을 눌러 첫 번째 독서 토론을 만들어보세요.</Text>
          </View>
        )}

        {discussions.map((disc) => {
          const expanded = expandedId === disc.id;
          let qs = [];
          try { qs = JSON.parse(disc.questions); } catch (_) {}

          return (
            <TouchableOpacity
              key={disc.id}
              style={[styles.card, expanded && styles.cardExpanded]}
              onPress={() => setExpandedId(expanded ? null : disc.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardMeta}>
                  {disc.bookTitle ? (
                    <View style={styles.bookTag}>
                      <Ionicons name="book-outline" size={12} color="#6750A4" />
                      <Text style={styles.bookTagText} numberOfLines={1}>{disc.bookTitle}</Text>
                    </View>
                  ) : (
                    <View style={[styles.bookTag, styles.bookTagGeneral]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color="#888" />
                      <Text style={[styles.bookTagText, { color: '#888' }]}>자유 토론</Text>
                    </View>
                  )}
                  <Text style={styles.dateText}>{fmtDate(disc.createdAt)}</Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#999"
                />
              </View>

              <Text style={styles.topicText} numberOfLines={expanded ? undefined : 2}>{disc.topic}</Text>

              {expanded && (
                <>
                  {disc.content ? (
                    <Text style={styles.contentText}>{disc.content}</Text>
                  ) : null}

                  {qs.length > 0 && (
                    <View style={styles.questionsBox}>
                      <Text style={styles.questionsLabel}>토론 질문</Text>
                      {qs.map((q, i) => (
                        <View key={i} style={styles.questionRow}>
                          <Text style={styles.questionNum}>Q{i + 1}.</Text>
                          <Text style={styles.questionText}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(disc)}>
                      <Ionicons name="pencil-outline" size={16} color="#6750A4" />
                      <Text style={styles.actionBtnText}>편집</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => confirmDelete(disc.id)}>
                      <Ionicons name="trash-outline" size={16} color="#E53935" />
                      <Text style={[styles.actionBtnText, { color: '#E53935' }]}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openCreate} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* 책 선택 모달 */}
      <Modal visible={bookPickerVisible} transparent animationType="slide" onRequestClose={() => setBookPickerVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setBookPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>책 선택</Text>
            <ScrollView>
              {allBooks.map((b) => (
                <TouchableOpacity key={b.id} style={styles.pickerItem} onPress={() => pickBook(b)}>
                  <Ionicons name="book-outline" size={18} color="#6750A4" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemTitle} numberOfLines={1}>{b.title}</Text>
                    {b.author ? <Text style={styles.pickerItemSub} numberOfLines={1}>{b.author}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 토론 작성/편집 모달 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.formSheet} onPress={() => {}}>
              <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.formHeader}>
                  <Text style={styles.formTitle}>{editTarget ? '토론 편집' : '새 토론'}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {/* 책 연결 */}
                  <Text style={styles.fieldLabel}>연결된 책 <Text style={styles.optionalLabel}>(선택)</Text></Text>
                  {form.bookTitle ? (
                    <View style={styles.selectedBook}>
                      <Ionicons name="book-outline" size={16} color="#6750A4" />
                      <Text style={styles.selectedBookTitle} numberOfLines={1}>{form.bookTitle}</Text>
                      <TouchableOpacity onPress={clearBook}>
                        <Ionicons name="close-circle" size={18} color="#999" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.pickBookBtn} onPress={openBookPicker}>
                      <Ionicons name="search-outline" size={16} color="#6750A4" />
                      <Text style={styles.pickBookBtnText}>내 서재에서 책 선택</Text>
                    </TouchableOpacity>
                  )}

                  {/* 토론 주제 */}
                  <Text style={styles.fieldLabel}>토론 주제 <Text style={styles.requiredLabel}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: 이 책의 결말은 납득이 되나요?"
                    placeholderTextColor="#bbb"
                    value={form.topic}
                    onChangeText={(v) => setForm((f) => ({ ...f, topic: v }))}
                    maxLength={100}
                  />

                  {/* 내용 */}
                  <Text style={styles.fieldLabel}>토론 내용 <Text style={styles.optionalLabel}>(선택)</Text></Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    placeholder="토론 배경, 핵심 내용, 생각 등을 자유롭게 작성하세요."
                    placeholderTextColor="#bbb"
                    value={form.content}
                    onChangeText={(v) => setForm((f) => ({ ...f, content: v }))}
                    multiline
                    textAlignVertical="top"
                    maxLength={500}
                  />

                  {/* 질문 목록 */}
                  <View style={styles.questionsHeader}>
                    <Text style={styles.fieldLabel}>토론 질문 <Text style={styles.optionalLabel}>(선택)</Text></Text>
                    <TouchableOpacity onPress={addQuestion} style={styles.addQBtn}>
                      <Ionicons name="add-circle-outline" size={20} color="#6750A4" />
                      <Text style={styles.addQBtnText}>추가</Text>
                    </TouchableOpacity>
                  </View>
                  {form.questions.map((q, idx) => (
                    <View key={idx} style={styles.questionInputRow}>
                      <Text style={styles.questionInputNum}>Q{idx + 1}</Text>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder={`질문 ${idx + 1}`}
                        placeholderTextColor="#bbb"
                        value={q}
                        onChangeText={(v) => setQuestion(idx, v)}
                        maxLength={100}
                      />
                      {form.questions.length > 1 && (
                        <TouchableOpacity onPress={() => removeQuestion(idx)} style={styles.removeQBtn}>
                          <Ionicons name="remove-circle-outline" size={20} color="#E53935" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  <View style={{ height: 16 }} />
                </ScrollView>

                <TouchableOpacity style={styles.saveBtn} onPress={saveDiscussion}>
                  <Text style={styles.saveBtnText}>{editTarget ? '수정 완료' : '토론 만들기'}</Text>
                </TouchableOpacity>
              </SafeAreaView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  list: { padding: 12, paddingBottom: 80 },
  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#9E9E9E' },
  emptyDesc: { fontSize: 13, color: '#BDBDBD', textAlign: 'center', paddingHorizontal: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  cardExpanded: { borderColor: '#D0BCFF', borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  bookTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: 160,
  },
  bookTagGeneral: { backgroundColor: '#F5F5F5' },
  bookTagText: { fontSize: 11, color: '#6750A4', fontWeight: '600', flexShrink: 1 },
  dateText: { fontSize: 11, color: '#BDBDBD', marginLeft: 4 },
  topicText: { fontSize: 15, fontWeight: 'bold', color: '#212121', lineHeight: 22 },
  contentText: { fontSize: 13, color: '#555', marginTop: 10, lineHeight: 20 },
  questionsBox: {
    marginTop: 12, backgroundColor: '#F8F4FF',
    borderRadius: 10, padding: 12,
  },
  questionsLabel: { fontSize: 12, fontWeight: 'bold', color: '#6750A4', marginBottom: 8 },
  questionRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  questionNum: { fontSize: 13, fontWeight: 'bold', color: '#9C8DC4', width: 28 },
  questionText: { fontSize: 13, color: '#444', flex: 1, lineHeight: 20 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#D0BCFF', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  actionBtnDanger: { borderColor: '#FFCDD2' },
  actionBtnText: { fontSize: 13, color: '#6750A4', fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#6750A4',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginBottom: 14,
  },
  pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3EEF8',
  },
  pickerItemTitle: { fontSize: 14, color: '#333', fontWeight: '500' },
  pickerItemSub: { fontSize: 12, color: '#999', marginTop: 1 },
  formSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 16, maxHeight: '92%', flex: 1,
  },
  formHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  formTitle: { fontSize: 17, fontWeight: 'bold', color: '#6750A4' },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#333', marginTop: 14, marginBottom: 6 },
  optionalLabel: { fontWeight: 'normal', color: '#BDBDBD' },
  requiredLabel: { color: '#E53935' },
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#333', backgroundColor: '#FAFAFA', marginBottom: 4,
  },
  inputMulti: { minHeight: 90 },
  selectedBook: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EDE7F6', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  selectedBookTitle: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },
  pickBookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#D0BCFF', borderRadius: 10, borderStyle: 'dashed',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  pickBookBtnText: { fontSize: 14, color: '#6750A4' },
  questionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addQBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addQBtnText: { fontSize: 13, color: '#6750A4', fontWeight: '600' },
  questionInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  questionInputNum: { fontSize: 13, fontWeight: 'bold', color: '#9C8DC4', width: 24 },
  removeQBtn: { padding: 2 },
  saveBtn: {
    backgroundColor: '#6750A4', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    marginTop: 8, marginBottom: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
