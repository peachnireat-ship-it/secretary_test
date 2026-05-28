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
  getComments,
  addComment,
  deleteComment,
  getUsername,
} from '../../database/database';

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM = { bookId: null, bookTitle: '', topic: '', content: '', questions: [''], discussionType: 'debate' };

const TYPE_OPTIONS = [
  { value: 'debate', label: '찬반 토론', icon: 'git-compare-outline', color: '#6750A4' },
  { value: 'free',   label: '자유 댓글', icon: 'chatbubbles-outline',  color: '#2196F3' },
  { value: 'qa',     label: '질문 답변', icon: 'help-circle-outline',   color: '#4CAF50' },
];

const TYPE_META = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o]));

export default function BookDiscussionScreen() {
  const [discussions, setDiscussions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookMap, setBookMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [commentsMap, setCommentsMap] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bookPickerVisible, setBookPickerVisible] = useState(false);
  const [allBooks, setAllBooks] = useState([]);
  const [cmtModal, setCmtModal] = useState({
    visible: false, discussionId: null, discussionType: 'debate',
    vote: 'agree', questionIndex: null, questionText: '', content: '',
  });

  const reload = useCallback(() => {
    setDiscussions(getDiscussions());
    const books = getAllBooks();
    const map = {};
    books.forEach((b) => { map[b.id] = b; });
    setBookMap(map);
  }, []);
  useFocusEffect(reload);

  const filteredDiscussions = searchQuery.trim()
    ? discussions.filter((d) => {
        const q = searchQuery.toLowerCase();
        const author = (d.bookId && bookMap[d.bookId]?.author) || '';
        return (
          (d.bookTitle || '').toLowerCase().includes(q) ||
          author.toLowerCase().includes(q) ||
          (d.createdBy || '').toLowerCase().includes(q)
        );
      })
    : discussions;

  const reloadComments = (discussionId) => {
    setCommentsMap((m) => ({ ...m, [discussionId]: getComments(discussionId) }));
  };

  const toggleExpand = (disc) => {
    if (expandedId === disc.id) {
      setExpandedId(null);
    } else {
      setExpandedId(disc.id);
      reloadComments(disc.id);
    }
  };

  const openCreate = () => { setEditTarget(null); setForm(EMPTY_FORM); setModalVisible(true); };

  const openEdit = (disc) => {
    setEditTarget(disc);
    let qs = [];
    try { qs = JSON.parse(disc.questions); } catch (_) {}
    if (!qs.length) qs = [''];
    setForm({
      bookId: disc.bookId, bookTitle: disc.bookTitle,
      topic: disc.topic, content: disc.content, questions: qs,
      discussionType: disc.discussionType || 'debate',
    });
    setModalVisible(true);
  };

  const openBookPicker = () => { setAllBooks(getAllBooks()); setBookPickerVisible(true); };
  const pickBook = (book) => { setForm((f) => ({ ...f, bookId: book.id, bookTitle: book.title })); setBookPickerVisible(false); };
  const clearBook = () => setForm((f) => ({ ...f, bookId: null, bookTitle: '' }));

  const setQuestion = (idx, val) => setForm((f) => { const qs = [...f.questions]; qs[idx] = val; return { ...f, questions: qs }; });
  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, ''] }));
  const removeQuestion = (idx) => setForm((f) => {
    const qs = f.questions.filter((_, i) => i !== idx);
    return { ...f, questions: qs.length ? qs : [''] };
  });

  const saveDiscussion = () => {
    if (!form.topic.trim()) { Alert.alert('필수 입력', '토론 주제를 입력해 주세요.'); return; }
    const cleanedQs = form.questions.filter((q) => q.trim());
    if (form.discussionType === 'qa' && cleanedQs.length === 0) {
      Alert.alert('질문 필요', '질문별 답변 방식은 질문을 1개 이상 입력해 주세요.');
      return;
    }
    if (editTarget) {
      updateDiscussion({ id: editTarget.id, topic: form.topic.trim(), content: form.content.trim(), questions: cleanedQs });
    } else {
      addDiscussion({
        bookId: form.bookId, bookTitle: form.bookTitle,
        topic: form.topic.trim(), content: form.content.trim(),
        questions: cleanedQs, discussionType: form.discussionType,
        createdBy: getUsername(),
      });
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

  const openCmtModal = (disc, questionIndex = null, questionText = '') => {
    setCmtModal({
      visible: true,
      discussionId: disc.id,
      discussionType: disc.discussionType || 'debate',
      vote: 'agree',
      questionIndex,
      questionText,
      content: '',
    });
  };

  const submitComment = () => {
    if (!cmtModal.content.trim()) { Alert.alert('입력 필요', '내용을 입력해 주세요.'); return; }
    addComment({
      discussionId: cmtModal.discussionId,
      vote: cmtModal.discussionType === 'debate' ? cmtModal.vote : null,
      questionIndex: cmtModal.questionIndex,
      content: cmtModal.content.trim(),
      createdBy: getUsername(),
    });
    setCmtModal((m) => ({ ...m, visible: false }));
    reloadComments(cmtModal.discussionId);
  };

  const confirmDeleteComment = (cId, discussionId) => {
    Alert.alert('삭제', '댓글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { deleteComment(cId); reloadComments(discussionId); } },
    ]);
  };

  const renderParticipation = (disc) => {
    const comments = commentsMap[disc.id] || [];
    const dtype = disc.discussionType || 'debate';

    if (dtype === 'debate') {
      const agrees = comments.filter((c) => c.vote === 'agree');
      const disagrees = comments.filter((c) => c.vote === 'disagree');
      const total = agrees.length + disagrees.length;
      const agreePct = total ? Math.round((agrees.length / total) * 100) : 50;
      const disagreePct = 100 - agreePct;

      return (
        <View style={styles.participationSection}>
          {total > 0 ? (
            <View style={styles.voteBarContainer}>
              <View style={styles.voteBarRow}>
                <View style={[styles.voteBarFill, { flex: agreePct, backgroundColor: '#4CAF50' }]} />
                <View style={[styles.voteBarFill, { flex: disagreePct, backgroundColor: '#F44336' }]} />
              </View>
              <View style={styles.voteLabelRow}>
                <Text style={[styles.voteCountLabel, { color: '#4CAF50' }]}>찬성 {agrees.length}명 ({agreePct}%)</Text>
                <Text style={[styles.voteCountLabel, { color: '#F44336' }]}>반대 {disagrees.length}명 ({disagreePct}%)</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noCommentText}>아직 의견이 없습니다. 첫 번째로 의견을 남겨보세요!</Text>
          )}

          {comments.map((c) => (
            <View key={c.id} style={styles.commentItem}>
              <View style={[styles.voteBadge, { backgroundColor: c.vote === 'agree' ? '#E8F5E9' : '#FFEBEE' }]}>
                <Text style={[styles.voteBadgeText, { color: c.vote === 'agree' ? '#4CAF50' : '#F44336' }]}>
                  {c.vote === 'agree' ? '찬성' : '반대'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {c.createdBy ? (
                  <Text style={styles.commentAuthor}>{c.createdBy}</Text>
                ) : null}
                <Text style={styles.commentText}>{c.content}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDeleteComment(c.id, disc.id)}>
                <Ionicons name="close-circle-outline" size={16} color="#DDD" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.participateBtn} onPress={() => openCmtModal(disc)}>
            <Ionicons name="add-circle-outline" size={15} color="#6750A4" />
            <Text style={styles.participateBtnText}>의견 남기기</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (dtype === 'free') {
      return (
        <View style={styles.participationSection}>
          {comments.length === 0 && <Text style={styles.noCommentText}>아직 댓글이 없습니다.</Text>}
          {comments.map((c) => (
            <View key={c.id} style={styles.commentItem}>
              <Ionicons name="chatbubble-outline" size={14} color="#9C8DC4" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                {c.createdBy ? (
                  <Text style={styles.commentAuthor}>{c.createdBy}</Text>
                ) : null}
                <Text style={styles.commentText}>{c.content}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDeleteComment(c.id, disc.id)}>
                <Ionicons name="close-circle-outline" size={16} color="#DDD" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.participateBtn} onPress={() => openCmtModal(disc)}>
            <Ionicons name="add-circle-outline" size={15} color="#6750A4" />
            <Text style={styles.participateBtnText}>댓글 달기</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // qa type — questions + answers combined
    let qs = [];
    try { qs = JSON.parse(disc.questions); } catch (_) {}
    return (
      <View style={styles.participationSection}>
        {qs.map((q, qi) => {
          const answers = comments.filter((c) => c.questionIndex === qi);
          return (
            <View key={qi} style={styles.qaBlock}>
              <View style={styles.qaQuestionRow}>
                <Text style={styles.qaQuestionNum}>Q{qi + 1}.</Text>
                <Text style={styles.qaQuestionText}>{q}</Text>
              </View>
              {answers.map((a) => (
                <View key={a.id} style={styles.answerItem}>
                  <Ionicons name="return-down-forward-outline" size={14} color="#B0A0D8" />
                  <View style={{ flex: 1 }}>
                    {a.createdBy ? (
                      <Text style={styles.commentAuthor}>{a.createdBy}</Text>
                    ) : null}
                    <Text style={styles.answerText}>{a.content}</Text>
                  </View>
                  <TouchableOpacity onPress={() => confirmDeleteComment(a.id, disc.id)}>
                    <Ionicons name="close-circle-outline" size={16} color="#DDD" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.participateBtn, { alignSelf: 'flex-start', marginTop: 6 }]}
                onPress={() => openCmtModal(disc, qi, q)}
              >
                <Ionicons name="pencil-outline" size={13} color="#6750A4" />
                <Text style={styles.participateBtnText}>답변 달기</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="책 이름, 작성자로 검색"
          placeholderTextColor="#bbb"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#BDBDBD" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {filteredDiscussions.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={52} color="#C9B8E8" />
            {searchQuery.trim() ? (
              <>
                <Text style={styles.emptyTitle}>검색 결과가 없습니다</Text>
                <Text style={styles.emptyDesc}>다른 책 이름이나 작성자로 검색해 보세요.</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>토론이 없습니다</Text>
                <Text style={styles.emptyDesc}>+ 버튼을 눌러 첫 번째 독서 토론을 만들어보세요.</Text>
              </>
            )}
          </View>
        )}

        {filteredDiscussions.map((disc) => {
          const expanded = expandedId === disc.id;
          const dtype = disc.discussionType || 'debate';
          const typeMeta = TYPE_META[dtype] || TYPE_META.debate;
          let qs = [];
          try { qs = JSON.parse(disc.questions); } catch (_) {}

          return (
            <TouchableOpacity
              key={disc.id}
              style={[styles.card, expanded && styles.cardExpanded]}
              onPress={() => toggleExpand(disc)}
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
                  <View style={[styles.typeTag, { backgroundColor: typeMeta.color + '1A' }]}>
                    <Ionicons name={typeMeta.icon} size={10} color={typeMeta.color} />
                    <Text style={[styles.typeTagText, { color: typeMeta.color }]}>{typeMeta.label}</Text>
                  </View>
                  {disc.createdBy ? (
                    <View style={styles.creatorTag}>
                      <Ionicons name="person-outline" size={10} color="#888" />
                      <Text style={styles.creatorTagText}>{disc.createdBy}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.dateText}>{fmtDate(disc.createdAt)}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
              </View>

              <Text style={styles.topicText} numberOfLines={expanded ? undefined : 2}>{disc.topic}</Text>

              {expanded && (
                <>
                  {disc.content ? <Text style={styles.contentText}>{disc.content}</Text> : null}

                  {/* debate/free 방식에서만 질문 박스 별도 표시 */}
                  {dtype !== 'qa' && qs.length > 0 && (
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

                  {renderParticipation(disc)}

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
                  {/* 토론 방식 선택 (새 토론일 때만) */}
                  {!editTarget && (
                    <>
                      <Text style={styles.fieldLabel}>토론 방식 <Text style={styles.requiredLabel}>*</Text></Text>
                      <View style={styles.typeSelector}>
                        {TYPE_OPTIONS.map((opt) => {
                          const active = form.discussionType === opt.value;
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              style={[styles.typeOption, active && { borderColor: opt.color, backgroundColor: opt.color + '18' }]}
                              onPress={() => setForm((f) => ({ ...f, discussionType: opt.value, questions: [''] }))}
                            >
                              <Ionicons name={opt.icon} size={20} color={active ? opt.color : '#BBB'} />
                              <Text style={[styles.typeOptionLabel, active && { color: opt.color, fontWeight: 'bold' }]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

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
                    placeholder={
                      form.discussionType === 'debate' ? '예: 이 책의 결말은 납득이 되나요?' :
                      form.discussionType === 'qa'     ? '예: 이 책에서 가장 인상 깊었던 장면' :
                                                         '예: 이 책에 대한 생각을 자유롭게 나눠요'
                    }
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

                  {/* 질문 목록 — qa 방식일 때만 표시 */}
                  {form.discussionType === 'qa' && (
                    <>
                      <View style={styles.questionsHeader}>
                        <Text style={styles.fieldLabel}>
                          토론 질문{' '}
                          <Text style={styles.requiredLabel}>*</Text>
                        </Text>
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
                    </>
                  )}

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

      {/* 댓글/의견/답변 입력 모달 */}
      <Modal
        visible={cmtModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setCmtModal((m) => ({ ...m, visible: false }))}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.overlay} onPress={() => setCmtModal((m) => ({ ...m, visible: false }))}>
            <Pressable style={styles.cmtSheet} onPress={() => {}}>
              <View style={styles.pickerHandle} />
              <Text style={styles.cmtSheetTitle}>
                {cmtModal.discussionType === 'debate' ? '의견 남기기' :
                 cmtModal.questionIndex !== null      ? '답변 달기'   : '댓글 달기'}
              </Text>

              {cmtModal.discussionType === 'debate' && (
                <View style={styles.voteToggleRow}>
                  <TouchableOpacity
                    style={[styles.voteToggleBtn, cmtModal.vote === 'agree' && styles.voteToggleBtnAgree]}
                    onPress={() => setCmtModal((m) => ({ ...m, vote: 'agree' }))}
                  >
                    <Ionicons name="thumbs-up-outline" size={16} color={cmtModal.vote === 'agree' ? '#fff' : '#999'} />
                    <Text style={[styles.voteToggleBtnText, cmtModal.vote === 'agree' && { color: '#fff' }]}>찬성</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voteToggleBtn, cmtModal.vote === 'disagree' && styles.voteToggleBtnDisagree]}
                    onPress={() => setCmtModal((m) => ({ ...m, vote: 'disagree' }))}
                  >
                    <Ionicons name="thumbs-down-outline" size={16} color={cmtModal.vote === 'disagree' ? '#fff' : '#999'} />
                    <Text style={[styles.voteToggleBtnText, cmtModal.vote === 'disagree' && { color: '#fff' }]}>반대</Text>
                  </TouchableOpacity>
                </View>
              )}

              {cmtModal.questionIndex !== null && cmtModal.questionText ? (
                <View style={styles.cmtQuestionRef}>
                  <Text style={styles.cmtQuestionRefText}>Q{cmtModal.questionIndex + 1}. {cmtModal.questionText}</Text>
                </View>
              ) : null}

              <TextInput
                style={[styles.input, styles.inputMulti, { marginTop: 12 }]}
                placeholder={
                  cmtModal.discussionType === 'debate'    ? '찬성 또는 반대하는 이유를 작성해 주세요.' :
                  cmtModal.questionIndex !== null         ? '이 질문에 대한 답변을 작성해 주세요.'      :
                                                            '자유롭게 댓글을 작성해 주세요.'
                }
                placeholderTextColor="#bbb"
                value={cmtModal.content}
                onChangeText={(v) => setCmtModal((m) => ({ ...m, content: v }))}
                multiline
                textAlignVertical="top"
                maxLength={300}
                autoFocus
              />

              <TouchableOpacity style={[styles.saveBtn, { marginTop: 12 }]} onPress={submitComment}>
                <Text style={styles.saveBtnText}>등록</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    margin: 12, marginBottom: 4,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333', paddingVertical: 0 },
  list: { padding: 12, paddingBottom: 80 },
  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#9E9E9E' },
  emptyDesc: { fontSize: 13, color: '#BDBDBD', textAlign: 'center', paddingHorizontal: 32 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4,
  },
  cardExpanded: { borderColor: '#D0BCFF', borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  bookTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: 140,
  },
  bookTagGeneral: { backgroundColor: '#F5F5F5' },
  bookTagText: { fontSize: 11, color: '#6750A4', fontWeight: '600', flexShrink: 1 },
  typeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3,
  },
  typeTagText: { fontSize: 11, fontWeight: '600' },
  dateText: { fontSize: 11, color: '#BDBDBD' },
  creatorTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  creatorTagText: { fontSize: 11, color: '#999' },
  topicText: { fontSize: 15, fontWeight: 'bold', color: '#212121', lineHeight: 22 },
  contentText: { fontSize: 13, color: '#555', marginTop: 10, lineHeight: 20 },

  questionsBox: { marginTop: 12, backgroundColor: '#F8F4FF', borderRadius: 10, padding: 12 },
  questionsLabel: { fontSize: 12, fontWeight: 'bold', color: '#6750A4', marginBottom: 8 },
  questionRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  questionNum: { fontSize: 13, fontWeight: 'bold', color: '#9C8DC4', width: 28 },
  questionText: { fontSize: 13, color: '#444', flex: 1, lineHeight: 20 },

  // 참여 섹션
  participationSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#F0EBF8', paddingTop: 12 },
  noCommentText: { fontSize: 13, color: '#BDBDBD', textAlign: 'center', paddingVertical: 8 },

  // 찬반 바
  voteBarContainer: { marginBottom: 12 },
  voteBarRow: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 5 },
  voteBarFill: { height: 10 },
  voteLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  voteCountLabel: { fontSize: 12, fontWeight: '600' },

  // 댓글 아이템
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  voteBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  voteBadgeText: { fontSize: 11, fontWeight: 'bold' },
  commentAuthor: { fontSize: 11, fontWeight: 'bold', color: '#9C8DC4', marginBottom: 2 },
  commentText: { fontSize: 13, color: '#444', lineHeight: 19 },

  // 참여 버튼
  participateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'center', marginTop: 8,
    borderWidth: 1, borderColor: '#D0BCFF', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  participateBtnText: { fontSize: 13, color: '#6750A4', fontWeight: '600' },

  // QA 방식
  qaBlock: { backgroundColor: '#F8F4FF', borderRadius: 10, padding: 12, marginBottom: 10 },
  qaQuestionRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  qaQuestionNum: { fontSize: 13, fontWeight: 'bold', color: '#6750A4', width: 28 },
  qaQuestionText: { fontSize: 13, color: '#333', flex: 1, fontWeight: '600', lineHeight: 19 },
  answerItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6, paddingLeft: 8 },
  answerText: { fontSize: 13, color: '#555', lineHeight: 18 },

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
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#6750A4',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#6750A4', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 6,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },

  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 14 },
  pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F3EEF8' },
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

  // 토론 방식 선택
  typeSelector: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  typeOption: {
    flex: 1, alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10,
    paddingVertical: 10,
  },
  typeOptionLabel: { fontSize: 12, color: '#BBB', textAlign: 'center' },

  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#333', backgroundColor: '#FAFAFA', marginBottom: 4,
  },
  inputMulti: { minHeight: 90 },
  selectedBook: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EDE7F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
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
  questionInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  questionInputNum: { fontSize: 13, fontWeight: 'bold', color: '#9C8DC4', width: 24 },
  removeQBtn: { padding: 2 },
  saveBtn: { backgroundColor: '#6750A4', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // 댓글 입력 모달
  cmtSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  cmtSheetTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 14 },
  cmtQuestionRef: { backgroundColor: '#F0EBF8', borderRadius: 8, padding: 10 },
  cmtQuestionRefText: { fontSize: 13, color: '#6750A4', lineHeight: 18 },

  // 찬반 토글
  voteToggleRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  voteToggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10, paddingVertical: 10,
  },
  voteToggleBtnAgree: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  voteToggleBtnDisagree: { backgroundColor: '#F44336', borderColor: '#F44336' },
  voteToggleBtnText: { fontSize: 14, fontWeight: 'bold', color: '#999' },
});
