import { useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from '../theme';
import { useUser } from '../context/UserContext';
import { getClients, getProjects, getSchedules } from '../services/storage';
import { useProjectForm } from '../hooks/useProjectForm';
import { applyPopupScrollbarStyle } from '../utils/popupScrollbar';
import ProjectAddForm from '../components/ProjectAddForm';

applyPopupScrollbarStyle();

// PC 웹에서 window.open()으로 뜨는 별도 브라우저 창(진짜 팝업)으로 렌더링되는 "프로젝트 추가" 전용 화면.
// 같은 origin이라 Supabase 세션(localStorage)을 그대로 공유하므로 별도 로그인 절차가 필요 없다.
// 저장 성공 시 opener(원래 탭)에 postMessage로 알리고 스스로 창을 닫는다.
export default function ProjectAddPopup() {
  const { user } = useUser();
  const [dataLoading, setDataLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  // 'idle' → 데이터 로딩 전 / 'opening' → setShowAdd(true) 호출 직후 / true → 폼이 실제로 열린 상태 확인됨
  const openedRef = useRef('idle');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [clientList, projectList, scheduleList] = await Promise.all([getClients(), getProjects(), getSchedules()]);
      if (cancelled) return;
      setClients(clientList);
      setProjects(projectList);
      setSchedules(scheduleList);
      setDataLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const {
    showAdd, setShowAdd, newTitle, setNewTitle, newStartDate, setNewStartDate,
    newStartTime, setNewStartTime, newStartAmPm, setNewStartAmPm, newDeadline, setNewDeadline,
    newDeadlineTime, setNewDeadlineTime, newDeadlineAmPm, setNewDeadlineAmPm, newStatus, setNewStatus,
    newProgress, setNewProgress, setNewKeepProgress, newPriority, setNewPriority, newNotes, setNewNotes,
    newClientIds, setNewClientIds, newNotifyEmail, setNewNotifyEmail,
    missingEmailModalVisible, missingEmailPeople, missingEmailDrafts, setMissingEmailDrafts,
    confirmMissingEmailAndSave, skipMissingEmailAndSave,
    handleAdd,
  } = useProjectForm({ meetingRecords: [], projects, schedules, clients, setProjects: () => {} });

  useEffect(() => {
    if (!dataLoading && openedRef.current === 'idle') {
      openedRef.current = 'opening';
      setShowAdd(true);
    }
  }, [dataLoading, setShowAdd]);

  useEffect(() => {
    if (openedRef.current === 'opening' && showAdd) openedRef.current = true;
  }, [showAdd]);

  // showAdd가 true였다가 false로 바뀌는 시점은 useProjectForm의 saveNewProject()가 addProject() 저장을
  // 마친 직후뿐이다(이 파일의 취소 버튼은 setShowAdd를 건드리지 않고 바로 window.close()한다) — 그래서
  // 이 전환을 "저장 완료" 신호로 그대로 사용할 수 있다.
  useEffect(() => {
    if (openedRef.current === true && !showAdd) {
      try {
        window.opener?.postMessage({ type: 'secretary:project-created' }, window.location.origin);
      } catch {
        // opener가 이미 닫혔거나 접근 불가한 경우 무시
      }
      window.close();
    }
  }, [showAdd]);

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
      <ProjectAddForm
        newTitle={newTitle} setNewTitle={setNewTitle} newStartDate={newStartDate} setNewStartDate={setNewStartDate}
        newStartTime={newStartTime} setNewStartTime={setNewStartTime} newStartAmPm={newStartAmPm} setNewStartAmPm={setNewStartAmPm}
        newDeadline={newDeadline} setNewDeadline={setNewDeadline}
        newDeadlineTime={newDeadlineTime} setNewDeadlineTime={setNewDeadlineTime} newDeadlineAmPm={newDeadlineAmPm} setNewDeadlineAmPm={setNewDeadlineAmPm}
        newStatus={newStatus} setNewStatus={setNewStatus}
        newProgress={newProgress} setNewProgress={setNewProgress} setNewKeepProgress={setNewKeepProgress} newPriority={newPriority} setNewPriority={setNewPriority}
        newNotes={newNotes} setNewNotes={setNewNotes}
        newClientIds={newClientIds} setNewClientIds={setNewClientIds} newNotifyEmail={newNotifyEmail} setNewNotifyEmail={setNewNotifyEmail}
        missingEmailModalVisible={missingEmailModalVisible} missingEmailPeople={missingEmailPeople}
        missingEmailDrafts={missingEmailDrafts} setMissingEmailDrafts={setMissingEmailDrafts}
        confirmMissingEmailAndSave={confirmMissingEmailAndSave} skipMissingEmailAndSave={skipMissingEmailAndSave}
        handleAdd={handleAdd}
        clients={clients}
        peopleSearch={peopleSearch} setPeopleSearch={setPeopleSearch}
        onCancel={handleCancel}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, minHeight: '100vh', backgroundColor: C.bg },
  center: { flex: 1, minHeight: '100vh', backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: C.textSecondary, fontSize: 14, textAlign: 'center' },
});
