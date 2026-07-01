import { C } from '../theme';

// 거래처 히스토리 / 회의록 인물 히스토리 유형 색상 (미팅/통화/이메일/계약/기타)
// ClientScreen.typeColor, MeetingScreen.histTypeColor 통합 (완전 동일 로직)
export function typeColor(type) {
  const map = { 미팅: C.accentBlue, 통화: C.gold, 이메일: C.accentTeal, 계약: C.accentPurple, 기타: C.textSecondary };
  return map[type] || C.textSecondary;
}

// 일정 태그 색상 (회의/업무/영업/개인/기타)
// HomeScreen.tagColor, ScheduleScreen.tagColor 통합 (완전 동일 로직)
export function tagColor(tag) {
  const map = { 회의: C.accentBlue, 업무: C.gold, 영업: C.accentTeal, 개인: C.accentPurple, 기타: C.textSecondary };
  return map[tag] || C.textSecondary;
}

// 항목 우선순위 색상 (높음/보통/낮음), 미매칭 시 C.textDim
// ClientScreen.priorityColorClient, ProjectScreen.priorityColor, ScheduleScreen.priorityColor 통합
// (ScheduleScreen 원본은 높음 색상을 '#C45B5B' 하드코딩했으나 C.red와 동일한 값이라 통합 시 상수로 대체)
export function priorityColor(priority) {
  return { 높음: C.red, 보통: C.gold, 낮음: C.accentTeal }[priority] || C.textDim;
}

// 프로젝트 상태 색상 (진행중/위험/지연/완료/취소), 미매칭 시 C.textDim
// MeetingScreen.statusColor, ClientScreen.projectStatusColor 통합 (완전 동일 로직, fallback C.textDim)
// 주의: HomeScreen/ProjectScreen의 statusColor는 케이스별 값은 동일하지만 fallback이 C.textSecondary로 달라
// 별도 함수(statusColor)로 유지한다. 임의로 fallback을 합치면 동작이 바뀔 수 있어 통합하지 않았다.
export function projectStatusColor(status) {
  const map = { 진행중: C.accentBlue, 위험: C.gold, 지연: C.red, 완료: C.accentTeal, 취소: C.textDim };
  return map[status] || C.textDim;
}

// 프로젝트 상태 색상 (진행중/위험/지연/완료/취소), 미매칭 시 C.textSecondary
// HomeScreen.statusColor, ProjectScreen.statusColor 통합 (완전 동일 로직, fallback C.textSecondary)
export function statusColor(status) {
  const map = { 진행중: C.accentBlue, 위험: C.gold, 지연: C.red, 완료: C.accentTeal, 취소: C.textDim };
  return map[status] || C.textSecondary;
}
