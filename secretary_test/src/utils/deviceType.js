import { Platform } from 'react-native';

const MOBILE_UA_RE = /Android|iPhone|iPod|Mobile|Windows Phone/i;

function detectIsPC() {
  if (Platform.OS !== 'web') return false; // 네이티브 앱은 항상 모바일
  if (typeof navigator === 'undefined') return false;
  return !MOBILE_UA_RE.test(navigator.userAgent || '');
}

// 창 크기 변경에 반응하지 않도록 모듈 로드 시 1회만 계산한다.
export const IS_PC = detectIsPC();
