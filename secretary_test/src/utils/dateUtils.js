export const ONE_DAY_MS = 86400000;

// HomeScreen.todayStr, storage.todayStr 통합 (storage 쪽 offsetDays 파라미터로 흡수, 기본값 0이라 HomeScreen 호출부는 변경 없음)
export function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ClientScreen.formatDate, MeetingScreen.formatDate 통합 (완전 동일 로직)
export function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ScheduleScreen.daysUntil, ProjectScreen.daysUntil 통합 (동일 로직, 'YYYY-MM-DD HH:MM' 형식도 날짜 부분만 사용)
export function daysUntil(deadlineStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const datePart = (deadlineStr || '').split(' ')[0];
  return Math.round((new Date(datePart) - today) / ONE_DAY_MS);
}

// ScheduleScreen.daysLabel, ProjectScreen.daysLabel 통합 (완전 동일 로직)
export function daysLabel(days) {
  if (days > 0) return `${days}일 후 마감`;
  if (days === 0) return '오늘 마감';
  return `${Math.abs(days)}일 초과`;
}
