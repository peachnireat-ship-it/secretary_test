import { Text, View, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import Slider from '@react-native-community/slider';
import { Alert } from '../utils/alertCompat';
import { C } from '../theme';
import { formatDeadline, fmtTime12 } from '../hooks/useProjectForm';
import { statusColor, priorityColor } from '../utils/colors';

const STATUSES = ['진행중', '위험', '지연', '완료', '취소'];
const PRIORITIES = ['높음', '보통', '낮음'];

// 프로젝트 추가 폼 UI. useProjectForm() 훅이 반환하는 입력 상태·저장 로직을 그대로 props로 받아
// 렌더링만 담당한다(순수 프레젠테이션 컴포넌트). ProjectScreen.js "새 프로젝트 추가"와 회의록 화면
// 내 중앙 고정폭 팝업(MeetingScreen) 양쪽에서 재사용된다. 팝업 닫기 같은 호출 측 전용
// 동작은 onCancel로 위임하고, 이 컴포넌트는 그런 컨테이너 로직을 알지 못한다.
export default function ProjectAddForm({
  newTitle, setNewTitle, newStartDate, setNewStartDate,
  newStartTime, setNewStartTime, newStartAmPm, setNewStartAmPm, newDeadline, setNewDeadline,
  newDeadlineTime, setNewDeadlineTime, newDeadlineAmPm, setNewDeadlineAmPm, newStatus, setNewStatus,
  newProgress, setNewProgress, setNewKeepProgress, newPriority, setNewPriority, newNotes, setNewNotes,
  newClientIds, setNewClientIds, newNotifyEmail, setNewNotifyEmail,
  missingEmailModalVisible, missingEmailPeople, missingEmailDrafts, setMissingEmailDrafts,
  confirmMissingEmailAndSave, skipMissingEmailAndSave,
  handleAdd,
  clients,
  peopleSearch, setPeopleSearch,
  onCancel,
}) {
  function onPressStatus(st) {
    if (st === '완료' && newProgress !== 100) {
      Alert.alert('상태 변경', "상태를 '완료'로 변경하시겠습니까?", [
        { text: '아니오', style: 'cancel' },
        { text: '예', onPress: () => { setNewStatus('완료'); setNewKeepProgress(true); } },
      ]);
      return;
    }
    setNewKeepProgress(false);
    setNewStatus(st);
    if (st === '완료') setNewProgress(100);
  }

  const q = peopleSearch.trim();
  const filteredClients = q
    ? clients.filter((c) => c.name.includes(q) || (c.company || '').includes(q))
    : clients;

  return (
    <>
      <View style={s.header}>
        <Text style={s.headerTitle}>새 프로젝트</Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
        <Text style={s.inputLabel}>제목</Text>
        <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="프로젝트 이름" placeholderTextColor={C.textDim} />

        <Text style={s.inputLabel}>시작일시 (선택)</Text>
        <TextInput style={[s.input, s.mb8]} value={newStartDate} onChangeText={(t) => setNewStartDate(formatDeadline(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
        <View style={s.timeRow}>
          <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오전' && s.ampmBtnActive]} onPress={() => setNewStartAmPm('오전')}>
            <Text style={[s.ampmBtnText, newStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오후' && s.ampmBtnActive]} onPress={() => setNewStartAmPm('오후')}>
            <Text style={[s.ampmBtnText, newStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
          </TouchableOpacity>
          <TextInput style={[s.input, s.flex1]} value={newStartTime} onChangeText={(t) => setNewStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
        </View>

        <Text style={s.inputLabel}>마감일시</Text>
        <TextInput style={[s.input, s.mb8]} value={newDeadline} onChangeText={(t) => setNewDeadline(formatDeadline(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
        <View style={s.timeRow}>
          <TouchableOpacity style={[s.ampmBtn, newDeadlineAmPm === '오전' && s.ampmBtnActive]} onPress={() => setNewDeadlineAmPm('오전')}>
            <Text style={[s.ampmBtnText, newDeadlineAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ampmBtn, newDeadlineAmPm === '오후' && s.ampmBtnActive]} onPress={() => setNewDeadlineAmPm('오후')}>
            <Text style={[s.ampmBtnText, newDeadlineAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
          </TouchableOpacity>
          <TextInput style={[s.input, s.flex1]} value={newDeadlineTime} onChangeText={(t) => setNewDeadlineTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
        </View>

        <Text style={s.inputLabel}>상태</Text>
        <View style={s.optionRow}>
          {STATUSES.map((st) => (
            <TouchableOpacity key={st} style={[s.optionBtn, newStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => onPressStatus(st)}>
              <Text style={[s.optionText, newStatus === st && { color: statusColor(st) }]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.inputLabel}>우선순위</Text>
        <View style={s.optionRow}>
          {PRIORITIES.map((pr) => (
            <TouchableOpacity key={pr} style={[s.optionBtn, newPriority === pr && { borderColor: priorityColor(pr) + '88', backgroundColor: priorityColor(pr) + '18' }]} onPress={() => setNewPriority(pr)}>
              <Text style={[s.optionText, newPriority === pr && { color: priorityColor(pr) }]}>{pr}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.inputLabel}>진행률 (%)</Text>
        <View style={s.sliderWrap}>
          <Text style={s.sliderVal}>{newProgress}%</Text>
          <Slider
            style={s.slider}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={newProgress}
            onValueChange={(v) => {
              setNewKeepProgress(false);
              const rounded = Math.round(v);
              setNewProgress(rounded);
              if (rounded === 100) setNewStatus('완료');
              else if (newStatus === '완료') setNewStatus('진행중');
            }}
            minimumTrackTintColor={statusColor(newStatus)}
            maximumTrackTintColor={C.border}
            thumbTintColor={statusColor(newStatus)}
          />
        </View>

        <Text style={s.inputLabel}>메모 (선택)</Text>
        <TextInput style={[s.input, s.h64]} value={newNotes} onChangeText={setNewNotes} placeholder="지연 원인, 진행 상황 등" placeholderTextColor={C.textDim} multiline />

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
        <TextInput style={s.input} value={peopleSearch} onChangeText={setPeopleSearch} placeholder="이름 또는 회사로 검색" placeholderTextColor={C.textDim} />
        <ScrollView style={s.peopleList} nestedScrollEnabled>
          {filteredClients.length === 0 ? (
            <Text style={s.peopleEmpty}>검색 결과가 없습니다</Text>
          ) : (
            filteredClients.slice(0, 50).map((c) => {
              const selected = newClientIds.includes(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[s.peopleRow, selected && s.peopleRowSelected]}
                  onPress={() => setNewClientIds((prev) => (selected ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                >
                  <Text style={[s.peopleRowName, selected && s.peopleRowNameSelected]} numberOfLines={1}>{c.name}</Text>
                  <Text style={s.peopleRowCompany} numberOfLines={1}>{c.company}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

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

      <View style={s.mainFooter}>
        <TouchableOpacity style={s.mainConfirmBtn} onPress={handleAdd}>
          <Text style={s.confirmBtnText}>추가</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.mainCancelBtn} onPress={onCancel}>
          <Text style={s.cancelBtnText}>취소</Text>
        </TouchableOpacity>
      </View>

      {missingEmailModalVisible && (
        <View style={s.overlay}>
          <View style={s.overlayCard}>
            <Text style={s.overlayTitle}>이메일 미등록</Text>
            <Text style={s.overlayDesc}>다음 인물은 이메일이 없어 알림 메일을 받을 수 없습니다. 지금 입력하거나 건너뛸 수 있습니다.</Text>
            <ScrollView style={s.overlayList}>
              {missingEmailPeople.map((p) => (
                <View key={p.id} style={s.overlayRow}>
                  <Text style={s.overlayRowName}>{p.name}</Text>
                  <TextInput
                    style={s.overlayInput}
                    placeholder="이메일 입력 (선택)"
                    placeholderTextColor={C.textDim}
                    value={missingEmailDrafts[p.id] || ''}
                    onChangeText={(t) => setMissingEmailDrafts((prev) => ({ ...prev, [p.id]: t }))}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
              ))}
            </ScrollView>
            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={skipMissingEmailAndSave}>
                <Text style={s.cancelBtnText}>건너뛰기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={confirmMissingEmailAndSave}>
                <Text style={s.confirmBtnText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '600' },
  closeBtn: { color: C.textDim, fontSize: 18, paddingLeft: 12 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },

  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  mb8: { marginBottom: 8 },
  flex1: { flex: 1 },
  h64: { height: 64 },

  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 },
  ampmBtn: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  ampmBtnActive: { borderColor: C.gold + '88', backgroundColor: C.gold + '22' },
  ampmBtnText: { color: C.textDim, fontSize: 13 },
  ampmBtnTextActive: { color: C.gold, fontWeight: '600' },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionText: { color: C.textDim, fontSize: 12 },

  sliderWrap: { marginBottom: 4, alignItems: 'center' },
  slider: { width: '100%', height: 40 },
  sliderVal: { color: C.textPrimary, fontSize: 20, fontWeight: '200', textAlign: 'center', marginBottom: 2 },

  selectedPeopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPersonChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '55', borderRadius: 12 },
  selectedPersonChipText: { color: C.red, fontSize: 12, fontWeight: '500' },
  selectedPersonChipX: { color: C.red, fontSize: 11 },

  peopleList: { maxHeight: 160, marginTop: 8, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface },
  peopleEmpty: { color: C.textDim, fontSize: 12, padding: 14, textAlign: 'center' },
  peopleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  peopleRowSelected: { backgroundColor: C.red + '14' },
  peopleRowName: { color: C.textSecondary, fontSize: 13, flexShrink: 1 },
  peopleRowNameSelected: { color: C.red, fontWeight: '600' },
  peopleRowCompany: { color: C.textDim, fontSize: 11, marginLeft: 8 },

  notifyEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  notifyEmailCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  notifyEmailCheckboxChecked: { backgroundColor: C.red, borderColor: C.red },
  notifyEmailCheckmark: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  notifyEmailLabel: { color: C.textSecondary, fontSize: 13 },

  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { color: C.textSecondary, fontSize: 14 },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center' },
  confirmBtnText: { color: '#09090E', fontSize: 14, fontWeight: '600' },

  mainFooter: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border, justifyContent: 'center' },
  mainCancelBtn: { flex: 0, minWidth: 120, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  mainConfirmBtn: { flex: 0, minWidth: 120, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center' },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  overlayCard: { width: '100%', maxWidth: 440, maxHeight: '80%', backgroundColor: C.surfaceHigh, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20 },
  overlayTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  overlayDesc: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  overlayList: { maxHeight: 260 },
  overlayRow: { marginBottom: 10 },
  overlayRowName: { color: C.textPrimary, fontSize: 13, marginBottom: 6 },
  overlayInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
});
