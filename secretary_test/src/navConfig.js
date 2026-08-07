import { C } from './theme';

export const ICONS = {
  홈: { active: '⬡', inactive: '⬡' }, 일정: { active: '◈', inactive: '◈' },
  거래처: { active: '◉', inactive: '◉' }, 프로젝트: { active: '◧', inactive: '◧' },
  메세지: { active: '◫', inactive: '◫' }, 회의록: { active: '◍', inactive: '◍' },
  설정: { active: '◎', inactive: '◎' }, 회사관리: { active: '◆', inactive: '◆' },
};

export function tabColor(name) {
  const map = { 홈: C.gold, 일정: C.accentBlue, 거래처: C.accentTeal, 프로젝트: C.red, 메세지: C.accentPurple, 회의록: C.accentTeal, 설정: C.textSecondary, 회사관리: C.companyIndigo };
  return map[name] || C.textPrimary;
}
