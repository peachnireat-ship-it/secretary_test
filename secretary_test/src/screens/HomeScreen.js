import { Text, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { getSchedules, getClients, getProjects } from '../services/storage';

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
  if (h < 6) return '늦은 밤입니다';
  if (h < 12) return '좋은 아침입니다';
  if (h < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function HomeScreen({ navigation }) {
  const now = useNow();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateLabel = `${now.getFullYear()}년 ${MONTHS[now.getMonth()]} ${now.getDate()}일 ${DAYS[now.getDay()]}요일`;

  const [todaySchedules, setTodaySchedules] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [activeProjectCount, setActiveProjectCount] = useState(0);
  const [delayedProjectCount, setDelayedProjectCount] = useState(0);

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
          .filter((s) => s.date === today)
          .sort((a, b) => a.time.localeCompare(b.time));
        setTodaySchedules(todays);
        setClientCount(clients.length);
        const active = projects.filter((p) => p.status !== '완료' && p.status !== '취소');
        setActiveProjectCount(active.length);
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
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 헤더 ── */}
      <View style={s.header}>
        <View style={s.badge}>
          <View style={s.badgeDot} />
          <Text style={s.badgeText}>PRIVATE</Text>
        </View>
        <Text style={s.clockText}>{hh}:{mm}</Text>
        <Text style={s.dateText}>{dateLabel}</Text>
        <Text style={s.greetingText}>{greeting(now.getHours())}</Text>
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
        <Text style={s.sectionLabel}>TODAY'S AGENDA</Text>
        <View style={s.card}>
          {todaySchedules.length === 0 ? (
            <View style={s.agendaEmpty}>
              <Text style={s.agendaEmptyText}>오늘 일정이 없습니다</Text>
            </View>
          ) : (
            todaySchedules.slice(0, 4).map((item, i) => (
              <View key={item.id} style={[s.agendaRow, i < Math.min(todaySchedules.length, 4) - 1 && s.agendaRowBorder]}>
                <Text style={s.agendaTime}>{item.time}</Text>
                <View style={s.agendaMiddle}>
                  <View style={s.agendaLine} />
                </View>
                <View style={s.agendaRight}>
                  <Text style={s.agendaTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.agendaTag}>{item.tag}</Text>
                </View>
              </View>
            ))
          )}
          {todaySchedules.length > 4 && (
            <TouchableOpacity style={s.agendaMore} onPress={() => navigation.navigate('일정')}>
              <Text style={s.agendaMoreText}>+{todaySchedules.length - 4}건 더 보기</Text>
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

      {/* ── AI 기능 안내 ── */}
      <View style={[s.section, { marginBottom: 48 }]}>
        <Text style={s.sectionLabel}>AI FEATURES</Text>
        <View style={s.aiCard}>
          <View style={s.aiRow}>
            <View style={[s.aiDot, { backgroundColor: C.accentBlue }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.aiTitle}>AI 일정 관리</Text>
              <Text style={s.aiDesc}>자연어로 일정 추가 · 일정 충돌 감지 · AI 질문 응답</Text>
            </View>
          </View>
          <View style={[s.aiRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
            <View style={[s.aiDot, { backgroundColor: C.accentTeal }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.aiTitle}>AI 거래처 히스토리</Text>
              <Text style={s.aiDesc}>관계 요약 · 히스토리 분석 · 후속 조치 제안</Text>
            </View>
          </View>
          <View style={[s.aiRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
            <View style={[s.aiDot, { backgroundColor: C.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.aiTitle}>AI 프로젝트 지연 분석</Text>
              <Text style={s.aiDesc}>지연 원인 패턴 분석 · 위험 프로젝트 식별 · 개선 액션 플랜</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingTop: 60, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  badgeText: { color: C.goldDim, fontSize: 10, letterSpacing: 3, fontWeight: '600' },
  clockText: { color: C.textPrimary, fontSize: 64, fontWeight: '200', letterSpacing: -2, lineHeight: 68 },
  dateText: { color: C.textSecondary, fontSize: 13, marginTop: 6, letterSpacing: 0.5 },
  greetingText: { color: C.textDim, fontSize: 12, marginTop: 4, letterSpacing: 1 },
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
  aiCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  aiDot: { width: 8, height: 8, borderRadius: 4 },
  aiTitle: { color: C.textPrimary, fontSize: 13, fontWeight: '500', marginBottom: 3 },
  aiDesc: { color: C.textSecondary, fontSize: 11, lineHeight: 17 },
});
