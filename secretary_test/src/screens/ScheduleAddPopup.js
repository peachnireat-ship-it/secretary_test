import { useEffect, useRef, useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, StyleSheet, TextInput, Modal, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Alert } from '../utils/alertCompat';
import { C } from '../theme';
import { useUser } from '../context/UserContext';
import { getSchedules, addSchedule, getProjects, getClients, addClient } from '../services/storage';
import { findOverlappingItems, formatOverlapMessage, isValidOptionalDateStr } from '../utils/dateUtils';
import { to24h, fmtTime12, fmtDate } from './ScheduleScreen';
import { applyPopupScrollbarStyle } from '../utils/popupScrollbar';

applyPopupScrollbarStyle();

const TAGS = ['회의', '업무', '영업', '개인', '기타'];
const TITLE_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 2000;
// 국내 전화번호 형식 검증: 010-1234-5678, 02-123-4567, 031-1234-5678 등. 하이픈은 선택. (ScheduleScreen.js와 동일, 다른 화면들도 각자 중복 보유)
const PHONE_REGEX = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

// 하이픈 없이 입력해도 기존 회원 데이터와 동일한 010-0000-0000 형식으로 자동 정렬 (ScheduleScreen.js와 동일)
function fmtPhone(text) {
  const d = text.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.startsWith('02')) {
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

// 팝업은 opener의 selectedDate/calYear/calMonth 컨텍스트를 알 수 없으므로 항상 오늘 날짜를 기본값으로 쓴다.
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// PC 웹에서 ScheduleScreen의 "새 일정" 버튼이 window.open()으로 띄우는 실제 브라우저 팝업 창.
// 같은 origin이라 Supabase 세션(localStorage)을 공유하므로 별도 로그인 없이 바로 열린다.
// 저장 성공 시 opener(원래 탭)에 postMessage로 알리고 스스로 창을 닫는다.
export default function ScheduleAddPopup() {
  const { user } = useUser();
  const [dataLoading, setDataLoading] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);

  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState('회의');
  const [newNotes, setNewNotes] = useState('');
  const [newClientIds, setNewClientIds] = useState([]);
  const [newProjectId, setNewProjectId] = useState(null);
  const [newStartDate, setNewStartDate] = useState(todayDateStr());
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newStartAmPm, setNewStartAmPm] = useState('오전');
  const [newEndDate, setNewEndDate] = useState('');
  const [newEndTime, setNewEndTime] = useState('06:00');
  const [newEndAmPm, setNewEndAmPm] = useState('오후');
  const [newNotifyEmail, setNewNotifyEmail] = useState(true);

  const [showClientPicker, setShowClientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTempIds, setPickerTempIds] = useState([]);
  const pickerCallback = useRef(null);

  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectPickerCurrentId, setProjectPickerCurrentId] = useState(null);
  const projectPickerCallback = useRef(null);

  const [showPickerAddClient, setShowPickerAddClient] = useState(false);
  const [pickerNewName, setPickerNewName] = useState('');
  const [pickerNewCompany, setPickerNewCompany] = useState('');
  const [pickerNewRole, setPickerNewRole] = useState('');
  const [pickerNewContact, setPickerNewContact] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [scheduleList, projectList, clientList] = await Promise.all([getSchedules(), getProjects(), getClients()]);
      if (cancelled) return;
      setSchedules(scheduleList);
      setProjects(projectList);
      setClients(clientList);
      setDataLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 관련 인물이 1명 이상 선택되면 알림 메일 발송을 기본 켜짐으로(ScheduleScreen.js와 동일 규칙)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNewNotifyEmail(newClientIds.length > 0);
  }, [newClientIds]);

  function openClientPicker(currentIds, onConfirm) {
    setPickerTempIds([...new Set(currentIds)]);
    setPickerSearch('');
    pickerCallback.current = onConfirm;
    setShowClientPicker(true);
  }

  function confirmClientPicker() {
    if (pickerCallback.current) pickerCallback.current(pickerTempIds);
    setShowClientPicker(false);
  }

  function openProjectPicker(currentId, onSelect) {
    setProjectPickerCurrentId(currentId || null);
    projectPickerCallback.current = onSelect;
    setShowProjectPicker(true);
  }

  function selectProject(id) {
    if (projectPickerCallback.current) projectPickerCallback.current(id);
    setShowProjectPicker(false);
  }

  // 관련 프로젝트를 선택하면 그 프로젝트의 관련 인물을 일정의 관련 인물에도 추가할지 확인 후 반영한다
  // (이미 선택돼 있던 인물은 유지, 중복은 제거). ScheduleScreen.js applyProjectClientIds와 동일 로직.
  function applyProjectClientIds(projectId, setClientIds) {
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project?.clientIds?.length) return;
    Alert.alert(
      '관련 인물 세팅',
      '선택한 프로젝트의 관련 인물을 이 일정의 관련 인물에도 추가할까요?',
      [
        { text: '아니오', style: 'cancel' },
        { text: '예', onPress: () => setClientIds((prev) => [...new Set([...prev, ...project.clientIds])]) },
      ]
    );
  }

  async function handlePickerAddClient() {
    if (!pickerNewName.trim() || !pickerNewCompany.trim() || !pickerNewContact.trim()) {
      Alert.alert('필수 항목 누락', '이름, 회사명, 연락처는 필수입니다.');
      return;
    }
    if (!PHONE_REGEX.test(pickerNewContact.trim())) {
      Alert.alert('연락처 형식 오류', '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
      return;
    }
    const updated = await addClient({ name: pickerNewName.trim(), company: pickerNewCompany.trim(), role: pickerNewRole.trim(), contact: pickerNewContact.trim(), notes: '' });
    setClients(updated);
    const newClient = updated[0]; // addClient prepends, so index 0 is the new entry
    if (newClient) setPickerTempIds((prev) => prev.includes(newClient.id) ? prev : [...prev, newClient.id]);
    setPickerNewName(''); setPickerNewCompany(''); setPickerNewRole(''); setPickerNewContact('');
    setShowPickerAddClient(false);
  }

  async function saveNewSchedule(scheduleDate, startDateStr, endDateStr) {
    await addSchedule({ date: scheduleDate, time: to24h(newStartAmPm, newStartTime), title: newTitle.trim(), tag: newTag, notes: newNotes.trim(), clientIds: newClientIds, projectId: newProjectId, startDate: startDateStr, endDate: endDateStr, notifyEmail: newNotifyEmail });
    try {
      window.opener?.postMessage({ type: 'secretary:schedule-created' }, window.location.origin);
    } catch {
      // opener가 이미 닫혔거나 접근 불가한 경우 무시
    }
    window.close();
  }

  async function handleAdd() {
    if (!newTitle.trim()) return;
    if (newTitle.trim().length > TITLE_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${TITLE_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (newNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const startTrim = newStartDate.trim();
    const endTrim = newEndDate.trim();
    if (!isValidOptionalDateStr(startTrim)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (!isValidOptionalDateStr(endTrim)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (startTrim.length === 10 && endTrim.length === 10 && endTrim < startTrim) {
      Alert.alert('날짜 오류', '마감일시는 시작일시보다 빠를 수 없습니다.');
      return;
    }
    const scheduleDate = startTrim.length === 10 ? startTrim : todayDateStr();
    const startDateStr = startTrim ? `${startTrim} ${to24h(newStartAmPm, newStartTime)}` : '';
    const endDateStr = endTrim ? `${endTrim} ${to24h(newEndAmPm, newEndTime)}` : '';

    const rangeEnd = endTrim.length === 10 ? endTrim : scheduleDate;
    const overlaps = findOverlappingItems({ start: scheduleDate, end: rangeEnd, schedules, projects, excludeType: 'schedule' });
    if (overlaps.length > 0) {
      Alert.alert(
        '일정 겹침',
        `다음 일정/프로젝트와 기간이 겹칩니다.\n\n${formatOverlapMessage(overlaps)}\n\n그래도 이 일자로 등록하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '그대로 등록', onPress: () => saveNewSchedule(scheduleDate, startDateStr, endDateStr) },
        ]
      );
      return;
    }
    await saveNewSchedule(scheduleDate, startDateStr, endDateStr);
  }

  function handleCancel() {
    window.close();
  }

  if (user === null) {
    return (
      <View style={s.center}>
        <Text style={s.centerText}>로그인이 필요합니다. 창을 닫고 다시 시도해주세요.</Text>
      </View>
    );
  }

  if (user === undefined || dataLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accentBlue} />
      </View>
    );
  }

  return (
    <View style={s.page}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.headerTitle}>일정 추가</Text>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
        <Text style={s.inputLabel}>제목</Text>
        <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="일정 제목" placeholderTextColor={C.textDim} />

        <Text style={s.inputLabel}>시작일시</Text>
        <TextInput style={[s.input, s.mb8]} value={newStartDate} onChangeText={(t) => setNewStartDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
        <View style={s.timeRow}>
          <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오전' && s.optionActive]} onPress={() => setNewStartAmPm('오전')}>
            <Text style={[s.ampmBtnText, newStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오후' && s.optionActive]} onPress={() => setNewStartAmPm('오후')}>
            <Text style={[s.ampmBtnText, newStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
          </TouchableOpacity>
          <TextInput style={[s.input, s.flex1]} value={newStartTime} onChangeText={(t) => setNewStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
        </View>

        <Text style={s.inputLabel}>마감일시 (선택)</Text>
        <TextInput style={[s.input, s.mb8]} value={newEndDate} onChangeText={(t) => setNewEndDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
        <View style={s.timeRow}>
          <TouchableOpacity style={[s.ampmBtn, newEndAmPm === '오전' && s.optionActive]} onPress={() => setNewEndAmPm('오전')}>
            <Text style={[s.ampmBtnText, newEndAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ampmBtn, newEndAmPm === '오후' && s.optionActive]} onPress={() => setNewEndAmPm('오후')}>
            <Text style={[s.ampmBtnText, newEndAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
          </TouchableOpacity>
          <TextInput style={[s.input, s.flex1]} value={newEndTime} onChangeText={(t) => setNewEndTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
        </View>

        <Text style={s.inputLabel}>분류</Text>
        <View style={s.tagRow}>
          {TAGS.map((t) => (
            <TouchableOpacity key={t} style={[s.tagOption, newTag === t && s.optionActive]} onPress={() => setNewTag(t)}>
              <Text style={[s.tagOptionText, newTag === t && s.tagOptionTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.inputLabel}>관련 인물 · 담당자 (선택)</Text>
        {newClientIds.length > 0 && (
          <View style={s.selectedPeopleRow}>
            {newClientIds.map((id) => {
              const c = clients.find((cl) => cl.id === id);
              if (!c) return null;
              return (
                <TouchableOpacity key={id} style={s.selectedPersonChip} onPress={() => setNewClientIds((prev) => prev.filter((x) => x !== id))}>
                  <Text style={s.selectedPersonChipText}>{c.name}</Text>
                  <Text style={s.selectedPersonChipX}> ✕</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <TouchableOpacity style={s.pickerTrigger} onPress={() => openClientPicker(newClientIds, setNewClientIds)}>
          <Text style={[s.pickerTriggerText, newClientIds.length > 0 && s.pickerTriggerTextActive]}>
            {newClientIds.length > 0 ? `${newClientIds.length}명 선택됨 · 변경` : '담당자 인원 선택'}
          </Text>
          <Text style={s.pickerTriggerIcon}>›</Text>
        </TouchableOpacity>

        <Text style={s.inputLabel}>관련 프로젝트 (선택)</Text>
        <TouchableOpacity style={s.pickerTrigger} onPress={() => openProjectPicker(newProjectId, (id) => { setNewProjectId(id); applyProjectClientIds(id, setNewClientIds); })}>
          <Text style={[s.pickerTriggerText, newProjectId && s.pickerTriggerTextActive]}>
            {newProjectId ? (projects.find((p) => p.id === newProjectId)?.title || '선택된 프로젝트') : '프로젝트 선택'}
          </Text>
          <Text style={s.pickerTriggerIcon}>›</Text>
        </TouchableOpacity>

        <Text style={s.inputLabel}>메모 (선택)</Text>
        <TextInput style={[s.input, s.h72]} value={newNotes} onChangeText={setNewNotes} placeholder="추가 메모" placeholderTextColor={C.textDim} multiline />

        {/* 알림 메일 발송 여부 */}
        <TouchableOpacity
          style={s.notifyEmailRow}
          activeOpacity={0.7}
          onPress={() => {
            if (newClientIds.length === 0) {
              Alert.alert('안내', '선택된 관련 인물이 없습니다.');
              return;
            }
            setNewNotifyEmail((prev) => !prev);
          }}
        >
          <View style={[s.notifyEmailCheckbox, newNotifyEmail && s.notifyEmailCheckboxChecked]}>
            {newNotifyEmail && <Text style={s.notifyEmailCheckmark}>✓</Text>}
          </View>
          <Text style={s.notifyEmailLabel}>관련 인물에게 알림 메일 발송</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
          <Text style={s.cancelBtnText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.confirmBtn} onPress={handleAdd}>
          <Text style={s.confirmBtnText}>추가</Text>
        </TouchableOpacity>
      </View>

      {/* ── 담당자 인원 선택 (콤보박스) ── */}
      <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={() => setShowClientPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowClientPicker(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>담당자 인원 선택</Text>
              <TouchableOpacity onPress={confirmClientPicker} style={s.pickerHeaderBtn}>
                <Text style={s.pickerConfirmText}>
                  확인{pickerTempIds.length > 0 ? ` (${pickerTempIds.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={s.pickerSearchWrap}>
              <TextInput
                style={s.pickerSearchInput}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="이름 또는 회사 검색"
                placeholderTextColor={C.textDim}
              />
            </View>

            <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={s.pickerAddNewBtn} onPress={() => setShowPickerAddClient(true)}>
                <Text style={s.pickerAddNewText}>+ 신규 담당자 인원 등록</Text>
              </TouchableOpacity>
              {(() => {
                const isSelf = (c) =>
                  user &&
                  c.name === user.name &&
                  (c.role || '') === (user.role || '') &&
                  (c.company || '') === (user.team || '');
                const filtered = clients.filter((c) =>
                  !isSelf(c) &&
                  (pickerSearch.trim() === '' ||
                    c.name.includes(pickerSearch.trim()) ||
                    (c.company || '').includes(pickerSearch.trim()))
                );
                if (filtered.length === 0) {
                  return <Text style={s.clientSearchEmpty}>검색 결과 없음</Text>;
                }
                return filtered.map((c) => {
                  const selected = pickerTempIds.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.pickerRow, selected && s.pickerRowSelected]}
                      onPress={() => setPickerTempIds((prev) =>
                        selected ? prev.filter((x) => x !== c.id) : prev.includes(c.id) ? prev : [...prev, c.id]
                      )}
                      activeOpacity={0.7}
                    >
                      <View style={[s.pickerAvatar, selected && s.pickerAvatarSelected]}>
                        <Text style={[s.pickerAvatarText, selected && s.pickerAvatarTextSelected]}>{c.name[0]}</Text>
                      </View>
                      <View style={s.pickerNameWrap}>
                        <Text style={[s.pickerName, selected && s.pickerNameSelected]}>{c.name}</Text>
                        {c.company ? <Text style={s.pickerSub}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                      </View>
                      <View style={[s.pickerCheck, selected && s.pickerCheckSelected]}>
                        {selected && <Text style={s.pickerCheckMark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
              <View style={s.spacerH40} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 관련 프로젝트 선택 (콤보박스) ── */}
      <Modal visible={showProjectPicker} animationType="slide" transparent onRequestClose={() => setShowProjectPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowProjectPicker(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>관련 프로젝트 선택</Text>
              <View style={s.pickerHeaderBtn} />
            </View>

            <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[s.pickerRow, !projectPickerCurrentId && s.pickerRowSelected]}
                onPress={() => selectProject(null)}
                activeOpacity={0.7}
              >
                <View style={s.pickerNameWrap}>
                  <Text style={[s.pickerName, !projectPickerCurrentId && s.pickerNameSelected]}>선택 안 함</Text>
                </View>
              </TouchableOpacity>
              {projects.length === 0 ? (
                <Text style={s.clientSearchEmpty}>등록된 프로젝트가 없습니다</Text>
              ) : projects.map((p) => {
                const selected = p.id === projectPickerCurrentId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.pickerRow, selected && s.pickerRowSelected]}
                    onPress={() => selectProject(p.id)}
                    activeOpacity={0.7}
                  >
                    <View style={s.pickerNameWrap}>
                      <Text style={[s.pickerName, selected && s.pickerNameSelected]}>{p.title}</Text>
                      <Text style={s.pickerSub}>{p.status}{p.deadline ? ` · ${p.deadline}` : ''}</Text>
                    </View>
                    <View style={[s.pickerCheck, selected && s.pickerCheckSelected]}>
                      {selected && <Text style={s.pickerCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <View style={s.spacerH40} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 신규 담당자 인원 등록 (피커에서 진입) ── */}
      <Modal visible={showPickerAddClient} animationType="slide" transparent onRequestClose={() => setShowPickerAddClient(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowPickerAddClient(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>신규 담당자 인원 등록</Text>
              <TouchableOpacity onPress={handlePickerAddClient} style={s.pickerHeaderBtn}>
                <Text style={s.pickerConfirmText}>추가</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.pickerAddForm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.inputLabel}>이름 *</Text>
              <TextInput style={s.input} value={pickerNewName} onChangeText={setPickerNewName} placeholder="홍길동" placeholderTextColor={C.textDim} />
              <Text style={s.inputLabel}>회사명 *</Text>
              <TextInput style={s.input} value={pickerNewCompany} onChangeText={setPickerNewCompany} placeholder="(주)ABC" placeholderTextColor={C.textDim} />
              <Text style={s.inputLabel}>직책</Text>
              <TextInput style={s.input} value={pickerNewRole} onChangeText={setPickerNewRole} placeholder="구매팀장" placeholderTextColor={C.textDim} />
              <Text style={s.inputLabel}>연락처 *</Text>
              <TextInput style={s.input} value={pickerNewContact} onChangeText={(v) => setPickerNewContact(fmtPhone(v))} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <View style={s.spacerH40} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, minHeight: '100vh', backgroundColor: C.bg },
  center: { flex: 1, minHeight: '100vh', backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: C.textSecondary, fontSize: 14, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '600' },
  closeBtn: { color: C.textDim, fontSize: 18, paddingLeft: 12 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },

  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  mb8: { marginBottom: 8 },
  flex1: { flex: 1 },
  h72: { height: 72 },

  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ampmBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionActive: { borderColor: C.accentBlue + '88', backgroundColor: C.accentBlue + '22' },
  ampmBtnText: { color: C.textDim, fontSize: 14 },
  ampmBtnTextActive: { color: C.accentBlue, fontWeight: '500' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tagOptionText: { color: C.textDim, fontSize: 12 },
  tagOptionTextActive: { color: C.accentBlue },

  selectedPeopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPersonChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 12 },
  selectedPersonChipText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  selectedPersonChipX: { color: C.accentBlue, fontSize: 11 },
  clientSearchEmpty: { color: C.textDim, fontSize: 12, padding: 12, textAlign: 'center' },

  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pickerTriggerText: { color: C.textDim, fontSize: 14, flex: 1 },
  pickerTriggerTextActive: { color: C.accentBlue, fontWeight: '500' },
  pickerTriggerIcon: { color: C.textDim, fontSize: 18 },

  notifyEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  notifyEmailCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.borderHigh, alignItems: 'center', justifyContent: 'center' },
  notifyEmailCheckboxChecked: { backgroundColor: C.accentBlue, borderColor: C.accentBlue },
  notifyEmailCheckmark: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  notifyEmailLabel: { color: C.textSecondary, fontSize: 13 },

  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { color: C.textSecondary, fontSize: 14 },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentBlue, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // 담당자/프로젝트 콤보박스 및 신규 담당자 등록 서브 모달 (ScheduleScreen.js 피커 모달과 동일 스타일).
  // 이 팝업은 항상 웹 팝업 창(Platform.OS==='web')에서만 렌더링되므로 네이티브 분기 없이 web 전용 값만 사용한다.
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' },
  sheetBase: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 480 },
  pickerSheet: { height: '80%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerHeaderBtn: { minWidth: 52 },
  pickerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  pickerCancelText: { color: C.textSecondary, fontSize: 15 },
  pickerConfirmText: { color: C.accentBlue, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  pickerSearchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerSearchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  pickerList: { flex: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowSelected: { backgroundColor: C.accentBlue + '0D' },
  pickerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarSelected: { backgroundColor: C.accentBlue + '33' },
  pickerAvatarText: { color: C.textDim, fontSize: 14, fontWeight: '600' },
  pickerAvatarTextSelected: { color: C.accentBlue },
  pickerNameWrap: { flex: 1 },
  pickerName: { color: C.textPrimary, fontSize: 14 },
  pickerNameSelected: { color: C.accentBlue, fontWeight: '500' },
  pickerSub: { color: C.textDim, fontSize: 11, marginTop: 2 },
  pickerCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerCheckSelected: { backgroundColor: C.accentBlue, borderColor: C.accentBlue },
  pickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickerAddNewBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.accentBlue + '0A' },
  pickerAddNewText: { color: C.accentBlue, fontSize: 14, fontWeight: '500' },
  pickerAddForm: { flex: 1, paddingHorizontal: 20 },
  spacerH40: { height: 40 },
});
