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

// 타임스탬프(ms)를 'YYYY-MM-DD HH:MM' 형식으로 변환 (Project.startDate 자동 채움용)
export function dateTimeFromTimestamp(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${mi}`;
}

// 두 날짜 구간 [start1, end1]과 [start2, end2]('YYYY-MM-DD' 형식)이 하나라도 겹치는지 판단.
// 단일 날짜는 start와 end를 동일하게 넘기면 된다. 문자열 비교로도 날짜 순서와 동일하므로 Date 변환 불필요.
export function hasDateRangeOverlap(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return false;
  return start1 <= end2 && start2 <= end1;
}

// 일정 객체에서 겹침 판단에 쓸 유효 시작/종료 날짜(YYYY-MM-DD)를 추출.
// 기간 일정(startDate/endDate)이면 그 날짜 부분을, 아니면 단일 날짜(date)를 시작=종료로 취급.
export function scheduleDateRange(schedule) {
  const start = (schedule.startDate || '').split(' ')[0] || schedule.date;
  const end = (schedule.endDate || '').split(' ')[0] || schedule.date;
  return { start, end };
}

// 프로젝트 객체에서 겹침 판단에 쓸 유효 시작/종료 날짜(YYYY-MM-DD)를 추출.
// startDate가 없으면 마감일(deadline)을 시작일로 대체해 단일 날짜 구간으로 취급.
export function projectDateRange(project) {
  const deadlineDate = (project.deadline || '').split(' ')[0];
  const start = (project.startDate || '').split(' ')[0] || deadlineDate;
  return { start, end: deadlineDate };
}

// 새로 등록/수정하려는 기간(start~end)과 겹치는 기존 일정·프로젝트 목록을 찾는다.
// - 완료/취소 상태 프로젝트는 ProjectScreen/HomeScreen의 기존 관례(마감 임박·활성 통계 등에서 제외)를 따라 검사 대상에서 제외한다.
// - excludeId/excludeType: 수정 중인 항목 자기 자신은 비교 대상에서 제외한다(신규 등록 시 excludeId 없이 호출).
export function findOverlappingItems({ start, end, schedules = [], projects = [], excludeId = null, excludeType = null }) {
  const overlaps = [];
  for (const sc of schedules) {
    if (excludeType === 'schedule' && excludeId && sc.id === excludeId) continue;
    const { start: s2, end: e2 } = scheduleDateRange(sc);
    if (hasDateRangeOverlap(start, end, s2, e2)) {
      overlaps.push({ type: 'schedule', title: sc.title, start: s2, end: e2 });
    }
  }
  for (const p of projects) {
    if (p.status === '완료' || p.status === '취소') continue;
    if (excludeType === 'project' && excludeId && p.id === excludeId) continue;
    const { start: s2, end: e2 } = projectDateRange(p);
    if (hasDateRangeOverlap(start, end, s2, e2)) {
      overlaps.push({ type: 'project', title: p.title, start: s2, end: e2 });
    }
  }
  return overlaps;
}

// findOverlappingItems() 결과를 Alert 메시지용 텍스트로 변환 ("- 제목 (시작 ~ 종료)" 목록)
export function formatOverlapMessage(overlaps) {
  return overlaps.map((o) => `- ${o.title} (${o.start} ~ ${o.end})`).join('\n');
}
