import { Text, View, ScrollView, TouchableOpacity, StyleSheet, Modal, Dimensions, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { getSchedules, getClients, getProjects } from '../services/storage';
import { watchLocation } from '../services/location';
import { statusColor, tagColor } from '../utils/colors';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greeting(h) {
  if (h < 6) return '늦은 밤입니다 🌃';
  if (h < 12) return '좋은 아침입니다 🌄';
  if (h < 18) return '좋은 오후입니다 🏙️';
  return '좋은 저녁입니다';
}

// 1초 인터벌 시계 표시 전용 컴포넌트 — 이 컴포넌트만 매초 재렌더되고 HomeScreen 본체는 영향받지 않음
function ClockDisplay({ userName }) {
  const now = useNow();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateLabel = `${now.getFullYear()}년 ${MONTHS[now.getMonth()]} ${now.getDate()}일 ${DAYS[now.getDay()]}요일`;
  return (
    <>
      <Text style={s.greetingText}>{userName ? `${userName}님 ` : ''}{greeting(now.getHours())}</Text>
      <Text style={s.dateText}>{dateLabel} {hh}:{mm}</Text>
    </>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomeScreen({ navigation, user }) {
  const insets = useSafeAreaInsets();

  const [todaySchedules, setTodaySchedules] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [activeProjectCount, setActiveProjectCount] = useState(0);
  const [delayedProjectCount, setDelayedProjectCount] = useState(0);
  const [activeProjects, setActiveProjects] = useState([]);
  const [locationText, setLocationText] = useState('위치 확인 중...');
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    const unwatch = watchLocation((loc) => {
      if (!loc) { setLocationText('위치를 가져올 수 없습니다'); return; }
      setLocationText(loc.address ?? '');
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
    });
    return unwatch;
  }, []);

  async function openMapApp() {
    if (!coords) return;
    const { latitude, longitude } = coords;
    const naverUrl = `nmap://map?lat=${latitude}&lng=${longitude}&zoom=16&appname=com.secretary_test`;
    const googleUrl = `comgooglemaps://?center=${latitude},${longitude}&zoom=16`;
    const browserUrl = `https://maps.google.com/?q=${latitude},${longitude}`;

    if (await Linking.canOpenURL(naverUrl)) {
      Linking.openURL(naverUrl);
    } else if (await Linking.canOpenURL(googleUrl)) {
      Linking.openURL(googleUrl);
    } else {
      Linking.openURL(browserUrl);
    }
  }

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [schedules, clients, projects] = await Promise.all([
          getSchedules(),
          getClients(),
          getProjects(),
        ]);
        const today = todayStr();
        const todays = schedules
          .filter((s) => {
            if (s.startDate && s.endDate) {
              const start = s.startDate.split(' ')[0];
              const end = s.endDate.split(' ')[0];
              return start <= today && today <= end;
            }
            return s.date === today;
          })
          .sort((a, b) => a.time.localeCompare(b.time));
        setTodaySchedules(todays);
        setClientCount(clients.length);
        const active = projects.filter((p) => p.status !== '완료' && p.status !== '취소');
        setActiveProjectCount(active.length);
        setActiveProjects(active);
        setDelayedProjectCount(projects.filter((p) => p.status === '지연' || p.status === '위험').length);
      }
      load();
    }, [])
  );

  const STATS = [
    { label: '오늘 일정', value: String(todaySchedules.length), unit: '건', color: C.accentBlue, tab: '일정' },
    { label: '프로젝트', value: String(activeProjectCount), unit: '건', color: C.accentPurple, tab: '프로젝트' },
    { label: '거래처', value: String(clientCount), unit: '곳', color: C.accentTeal, tab: '거래처' },
    { label: '지연·위험', value: String(delayedProjectCount), unit: '건', color: delayedProjectCount > 0 ? C.red : C.textSecondary, tab: '프로젝트' },
  ];

  return (
    <>
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 헤더 ── */}
      <View style={s.header}>
        <View style={s.badgeRow}>
          <View style={s.badge}>
            <View style={s.badgeDot} />
            <Text style={s.badgeText}>PRIVATE</Text>
          </View>
          {user?.team && (
            <View style={s.teamBadge}>
              <Text style={s.teamBadgeText}>{user.team}</Text>
            </View>
          )}
        </View>
        <ClockDisplay userName={user?.name} />
      </View>

      <View style={s.rule} />

      {/* ── 개요 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>OVERVIEW</Text>
        <View style={s.statsRow}>
          {STATS.map((item) => (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.7}
              style={s.statCard}
              onPress={() => item.tab && navigation.navigate(item.tab)}
            >
              <Text style={[s.statValue, { color: item.color }]}>{item.value}</Text>
              <Text style={s.statUnit}>{item.unit}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── 오늘 일정 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>{"TODAY'S AGENDA"}</Text>
        <View style={s.card}>
          {todaySchedules.length === 0 ? (
            <View style={s.agendaEmpty}>
              <Text style={s.agendaEmptyText}>오늘 일정이 없습니다</Text>
            </View>
          ) : (
            todaySchedules.slice(0, 4).map((item, i) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                style={[s.agendaRow, i < Math.min(todaySchedules.length, 4) - 1 && s.agendaRowBorder]}
                onPress={() => setSelectedSchedule(item)}
              >
                <Text style={s.agendaTime}>{item.time}</Text>
                <View style={s.agendaMiddle}>
                  <View style={s.agendaLine} />
                </View>
                <View style={s.agendaRight}>
                  <Text style={s.agendaTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.agendaTag}>{item.tag}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          {todaySchedules.length > 4 && (
            <TouchableOpacity style={s.agendaMore} onPress={() => navigation.navigate('일정')}>
              <Text style={s.agendaMoreText}>+{todaySchedules.length - 4}건 더 보기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 진행중 프로젝트 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>ACTIVE PROJECTS</Text>
        <View style={s.card}>
          {activeProjects.length === 0 ? (
            <View style={s.agendaEmpty}>
              <Text style={s.agendaEmptyText}>진행중인 프로젝트가 없습니다</Text>
            </View>
          ) : (
            activeProjects.slice(0, 3).map((item, i) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                style={[s.projectRow, i < Math.min(activeProjects.length, 3) - 1 && s.agendaRowBorder]}
                onPress={() => navigation.navigate('프로젝트')}
              >
                <View style={[s.projectStatusDot, { backgroundColor: statusColor(item.status) }]} />
                <View style={s.projectMiddle}>
                  <Text style={s.projectTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={s.progressBarBg}>
                    <View style={[s.progressBarFill, { width: `${item.progress}%`, backgroundColor: statusColor(item.status) }]} />
                  </View>
                </View>
                <View style={s.projectRight}>
                  <Text style={[s.projectStatus, { color: statusColor(item.status) }]}>{item.status}</Text>
                  <Text style={s.projectDeadline}>{item.deadline}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          {activeProjects.length > 3 && (
            <TouchableOpacity style={s.agendaMore} onPress={() => navigation.navigate('프로젝트')}>
              <Text style={s.agendaMoreText}>+{activeProjects.length - 3}건 더 보기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 퀵 액션 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
        <View style={s.actionsRow}>
          {[
            { label: '일정 관리', color: C.accentBlue, tab: '일정' },
            { label: '거래처 관리', color: C.accentTeal, tab: '거래처' },
            { label: '프로젝트', color: C.red, tab: '프로젝트' },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              activeOpacity={0.7}
              style={[s.actionBtn, { borderColor: a.color + '55' }]}
              onPress={() => navigation.navigate(a.tab)}
            >
              <View style={[s.actionDot, { backgroundColor: a.color }]} />
              <Text style={[s.actionText, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── 현재 위치 지도 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>CURRENT LOCATION</Text>
        <TouchableOpacity activeOpacity={0.85} onPress={openMapApp} disabled={!coords} style={s.mapCard}>
          {coords ? (
            <>
              <MapView
                style={s.map}
                region={{ ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                userInterfaceStyle="dark"
                pointerEvents="none"
              >
                <Marker coordinate={coords} />
              </MapView>
              <View style={s.mapAddressRow}>
                <Text style={s.mapAddressText} numberOfLines={1}>◎ {locationText || '주소 불러오는 중...'}</Text>
                <Text style={s.mapOpenHint}>지도 앱으로 열기 ›</Text>
              </View>
            </>
          ) : (
            <View style={s.mapPlaceholder}>
              <Text style={s.mapPlaceholderText}>{locationText}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── AI 기능 안내 ── */}
      <View style={[s.section, s.sectionLast]}>
        <Text style={s.sectionLabel}>AI FEATURES</Text>
        <View style={s.aiCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.aiRow}
            onPress={() => navigation.navigate('일정', { openAI: true })}
          >
            <View style={[s.aiDot, { backgroundColor: C.accentBlue }]} />
            <View style={s.flex1}>
              <Text style={s.aiTitle}>AI 일정 관리</Text>
              <Text style={s.aiDesc}>자연어로 일정 추가 · 일정 충돌 감지 · AI 질문 응답</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[s.aiRow, s.aiRowBordered]}
            onPress={() => navigation.navigate('거래처', { openHistoryAI: true })}
          >
            <View style={[s.aiDot, { backgroundColor: C.accentTeal }]} />
            <View style={s.flex1}>
              <Text style={s.aiTitle}>AI 거래처 히스토리</Text>
              <Text style={s.aiDesc}>관계 요약 · 히스토리 분석 · 후속 조치 제안</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[s.aiRow, s.aiRowBordered]}
            onPress={() => navigation.navigate('프로젝트', { openAI: true })}
          >
            <View style={[s.aiDot, { backgroundColor: C.red }]} />
            <View style={s.flex1}>
              <Text style={s.aiTitle}>AI 프로젝트 지연 분석</Text>
              <Text style={s.aiDesc}>지연 원인 패턴 분석 · 위험 프로젝트 식별 · 개선 액션 플랜</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>

      {/* ── 일정 상세 모달 ── */}
      <Modal visible={!!selectedSchedule} animationType="slide" transparent onRequestClose={() => setSelectedSchedule(null)}>
        <TouchableOpacity style={s.detailOverlay} activeOpacity={1} onPress={() => setSelectedSchedule(null)}>
          <TouchableOpacity activeOpacity={1} style={s.detailSheet}>
            <View style={s.detailHandle} />
            {selectedSchedule && (
              <>
                <View style={s.detailHeader}>
                  <View style={[s.detailTagBadge, { backgroundColor: tagColor(selectedSchedule.tag) + '22', borderColor: tagColor(selectedSchedule.tag) + '55' }]}>
                    <Text style={[s.detailTagText, { color: tagColor(selectedSchedule.tag) }]}>{selectedSchedule.tag}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedSchedule(null)}>
                    <Text style={s.detailClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.detailTime}>{selectedSchedule.time}</Text>
                <Text style={s.detailTitle}>{selectedSchedule.title}</Text>
                {selectedSchedule.notes ? (
                  <View style={s.detailNotesBox}>
                    <Text style={s.detailNotesLabel}>메모</Text>
                    <Text style={s.detailNotesText}>{selectedSchedule.notes}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={s.detailNavBtn}
                  onPress={() => { setSelectedSchedule(null); navigation.navigate('일정'); }}
                >
                  <Text style={s.detailNavBtnText}>일정 탭에서 보기</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingTop: 60, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  badgeText: { color: C.goldDim, fontSize: 10, letterSpacing: 3, fontWeight: '600' },
  teamBadge: { backgroundColor: C.accentBlue + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  teamBadgeText: { color: C.accentBlue, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  dateText: { color: C.textDim, fontSize: 17, marginTop: 6, letterSpacing: 0.5 },
  mapCard: { borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  map: { width: '100%', height: 180 },
  mapAddressRow: { backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapAddressText: { color: C.textSecondary, fontSize: 12, letterSpacing: 0.3, flex: 1 },
  mapOpenHint: { color: C.accentBlue, fontSize: 11, marginLeft: 8 },
  mapPlaceholder: { height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  mapPlaceholderText: { color: C.textDim, fontSize: 13 },
  greetingText: { color: C.textSecondary, fontSize: 20, marginTop: 4, letterSpacing: 1 },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 32 },
  section: { marginBottom: 32 },
  sectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '600', marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 14, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '300' },
  statUnit: { color: C.textDim, fontSize: 10 },
  statLabel: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  agendaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  agendaRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  agendaTime: { color: C.textSecondary, fontSize: 12, fontWeight: '500', width: 44, letterSpacing: 0.5 },
  agendaMiddle: { width: 24, alignItems: 'center' },
  agendaLine: { width: 1, height: 24, backgroundColor: C.borderHigh },
  agendaRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  agendaTitle: { color: C.textPrimary, fontSize: 13, flex: 1 },
  agendaTag: { color: C.textDim, fontSize: 10, letterSpacing: 0.5 },
  agendaEmpty: { paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' },
  agendaEmptyText: { color: C.textDim, fontSize: 13 },
  agendaMore: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center' },
  agendaMoreText: { color: C.accentBlue, fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: C.surface, borderWidth: 1, borderRadius: 10 },
  actionDot: { width: 5, height: 5, borderRadius: 2.5 },
  actionText: { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  detailHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  detailTagBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  detailTagText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  detailClose: { color: C.textDim, fontSize: 18, paddingLeft: 12 },
  detailTime: { color: C.accentBlue, fontSize: 28, fontWeight: '200', letterSpacing: -0.5, marginBottom: 6 },
  detailTitle: { color: C.textPrimary, fontSize: 20, fontWeight: '400', lineHeight: 28, marginBottom: 20 },
  detailNotesBox: { backgroundColor: C.bg, borderRadius: 10, padding: 14, marginBottom: 20 },
  detailNotesLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 6 },
  detailNotesText: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  detailNavBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  detailNavBtnText: { color: C.textSecondary, fontSize: 13 },
  aiCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  aiDot: { width: 8, height: 8, borderRadius: 4 },
  aiTitle: { color: C.textPrimary, fontSize: 13, fontWeight: '500', marginBottom: 3 },
  aiDesc: { color: C.textSecondary, fontSize: 11, lineHeight: 17 },
  flex1: { flex: 1 },
  sectionLast: { marginBottom: 48 },
  aiRowBordered: { borderTopWidth: 1, borderTopColor: C.border },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  projectStatusDot: { width: 8, height: 8, borderRadius: 4 },
  projectMiddle: { flex: 1, gap: 6 },
  projectTitle: { color: C.textPrimary, fontSize: 13 },
  progressBarBg: { height: 3, backgroundColor: C.border, borderRadius: 2 },
  progressBarFill: { height: 3, borderRadius: 2 },
  projectRight: { alignItems: 'flex-end', gap: 3 },
  projectStatus: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  projectDeadline: { color: C.textDim, fontSize: 10 },
});
