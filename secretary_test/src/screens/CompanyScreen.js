import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import Slider from '@react-native-community/slider';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { getCompanyProjects, updateProjectAsCompanyAdmin, deleteProjectAsCompanyAdmin } from '../services/storage';
import { useSwipeClose } from '../hooks/useSwipeClose';
import { formatDeadline } from '../hooks/useProjectForm';
import { statusColor, priorityColor } from '../utils/colors';
import { daysUntil, daysLabel } from '../utils/dateUtils';

const STATUSES = ['진행중', '위험', '지연', '완료', '취소'];
const PRIORITIES = ['높음', '보통', '낮음'];

export default function CompanyScreen() {
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showDetail, setShowDetail] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editStatus, setEditStatus] = useState('진행중');
  const [editProgress, setEditProgress] = useState(0);
  const [editPriority, setEditPriority] = useState('보통');
  const [editNotes, setEditNotes] = useState('');

  const swipeDetail = useSwipeClose(() => setShowDetail(false), showDetail);

  async function load() {
    setLoading(true);
    try {
      setGroups(await getCompanyProjects());
    } catch {
      Alert.alert('오류', '회사 프로젝트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function openDetail(project) {
    setDetailProject(project);
    setEditTitle(project.title || '');
    setEditDeadline(project.deadline || '');
    setEditStatus(project.status || '진행중');
    setEditProgress(project.progress || 0);
    setEditPriority(project.priority || '보통');
    setEditNotes(project.notes || '');
    setShowDetail(true);
  }

  async function handleSave() {
    if (!editTitle.trim()) {
      Alert.alert('알림', '제목을 입력해주세요.');
      return;
    }
    try {
      await updateProjectAsCompanyAdmin(detailProject.id, {
        title: editTitle.trim(),
        deadline: editDeadline,
        status: editStatus,
        progress: editProgress,
        priority: editPriority,
        notes: editNotes,
      });
      setShowDetail(false);
      await load();
    } catch {
      Alert.alert('오류', '프로젝트를 수정하지 못했습니다.');
    }
  }

  function handleDelete() {
    Alert.alert('삭제', `"${detailProject.title}" 프로젝트를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProjectAsCompanyAdmin(detailProject.id);
            setShowDetail(false);
            await load();
          } catch {
            Alert.alert('오류', '프로젝트를 삭제하지 못했습니다.');
          }
        },
      },
    ]);
  }

  const totalProjectCount = groups.reduce((sum, g) => sum + g.projects.length, 0);

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerTitle}>회사</Text>
          <Text style={s.headerSub}>부서별 프로젝트 {totalProjectCount}건</Text>
        </View>
      </View>

      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {!loading && groups.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>회사 프로젝트가 없습니다</Text>
          </View>
        ) : (
          groups.map((group) => {
            const memberCount = new Set(group.projects.map((p) => p.ownerName)).size;
            return (
              <View key={group.departmentName} style={s.deptSection}>
                <View style={s.deptHeaderRow}>
                  <Text style={s.deptName}>{group.departmentName}</Text>
                  <Text style={s.deptMeta}>{memberCount}명 · {group.projects.length}건</Text>
                </View>
                {group.projects.map((item) => {
                  const days = daysUntil(item.deadline);
                  const isCompleted = item.status === '완료';
                  return (
                    <TouchableOpacity key={item.id} style={s.card} activeOpacity={0.75} onPress={() => openDetail(item)}>
                      <View style={s.cardTop}>
                        <View style={s.cardTitleRow}>
                          <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                        </View>
                        <View style={[s.statusBadge, { borderColor: statusColor(item.status) + '66', backgroundColor: statusColor(item.status) + '18' }]}>
                          <Text style={[s.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
                        </View>
                      </View>

                      <View style={s.progressTrack}>
                        <View style={[s.progressFill, { width: `${item.progress}%`, backgroundColor: statusColor(item.status) }]} />
                      </View>

                      <View style={s.cardMeta}>
                        <View style={s.ownerChip}>
                          <Text style={s.ownerChipText}>{item.ownerName}</Text>
                        </View>
                        <View style={[s.priorityBadge, { borderColor: priorityColor(item.priority) + '55' }]}>
                          <Text style={[s.priorityText, { color: priorityColor(item.priority) }]}>{item.priority}</Text>
                        </View>
                        <Text style={[s.deadlineText, days < 0 && !isCompleted && { color: C.red }, days >= 0 && days <= 3 && { color: C.gold }]}>
                          {item.deadline}{isCompleted && days < 0 ? '' : ` · ${daysLabel(days)}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── 프로젝트 상세 모달 ── */}
      <Modal visible={showDetail} animationType="slide" transparent onRequestClose={() => setShowDetail(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, commonStyles.maxH90pct, swipeDetail.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeDetail.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {detailProject && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.detailHeader}>
                  <View style={commonStyles.flex1}>
                    <Text style={s.inputLabel}>제목</Text>
                    <TextInput style={s.input} value={editTitle} onChangeText={setEditTitle} placeholderTextColor={C.textDim} />
                  </View>
                  <TouchableOpacity onPress={() => setShowDetail(false)} style={s.closeBtnOffset}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.inputLabel}>담당 부서 · 담당자</Text>
                <Text style={s.ownerText}>{detailProject.ownerTeam} · {detailProject.ownerName}</Text>

                <Text style={s.inputLabel}>상태</Text>
                <View style={s.optionRow}>
                  {STATUSES.map((st) => (
                    <TouchableOpacity key={st} style={[s.optionBtn, editStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => setEditStatus(st)}>
                      <Text style={[s.optionText, editStatus === st && { color: statusColor(st) }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>우선순위</Text>
                <View style={s.optionRow}>
                  {PRIORITIES.map((pr) => (
                    <TouchableOpacity key={pr} style={[s.optionBtn, editPriority === pr && { borderColor: priorityColor(pr) + '88', backgroundColor: priorityColor(pr) + '18' }]} onPress={() => setEditPriority(pr)}>
                      <Text style={[s.optionText, editPriority === pr && { color: priorityColor(pr) }]}>{pr}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>진행률 (%)</Text>
                <View style={s.sliderWrap}>
                  <Text style={s.sliderVal}>{editProgress}%</Text>
                  <Slider
                    style={s.slider}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={editProgress}
                    onValueChange={(v) => setEditProgress(Math.round(v))}
                    minimumTrackTintColor={statusColor(editStatus)}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={statusColor(editStatus)}
                  />
                </View>

                <Text style={s.inputLabel}>마감일</Text>
                <TextInput
                  style={s.input}
                  value={editDeadline}
                  onChangeText={(t) => setEditDeadline(formatDeadline(t))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.textDim}
                  keyboardType="numeric"
                  maxLength={10}
                />

                <Text style={s.inputLabel}>메모</Text>
                <TextInput
                  style={[s.input, s.h80]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  placeholder="메모를 입력하세요"
                  placeholderTextColor={C.textDim}
                />

                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.modalCancel} onPress={handleDelete}>
                    <Text style={[s.modalCancelText, s.textRed]}>삭제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalConfirm} onPress={handleSave}>
                    <Text style={s.modalConfirmText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.textSecondary, fontSize: 11, marginTop: 2 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 20 },
  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyText: { color: C.textDim, fontSize: 14 },

  deptSection: { gap: 10 },
  deptHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  deptName: { color: C.companyIndigo, fontSize: 15, fontWeight: '600' },
  deptMeta: { color: C.textDim, fontSize: 11 },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '600' },

  progressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  ownerChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: C.companyIndigo + '18', borderWidth: 1, borderColor: C.companyIndigo + '44' },
  ownerChipText: { color: C.companyIndigo, fontSize: 10, fontWeight: '500' },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  priorityText: { fontSize: 10, fontWeight: '500' },
  deadlineText: { color: C.textDim, fontSize: 11 },

  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center' },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  closeBtnOffset: { marginLeft: 12, marginBottom: 12 },
  closeBtn: { color: C.textDim, fontSize: 18 },
  ownerText: { color: C.textSecondary, fontSize: 13 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  h80: { height: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionText: { color: C.textDim, fontSize: 12 },
  sliderWrap: { gap: 4 },
  sliderVal: { color: C.textSecondary, fontSize: 12, alignSelf: 'flex-end' },
  slider: { width: '100%', height: 32 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  textRed: { color: C.red },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.companyIndigo, alignItems: 'center' },
  modalConfirmText: { color: '#09090E', fontSize: 14, fontWeight: '600' },
});
