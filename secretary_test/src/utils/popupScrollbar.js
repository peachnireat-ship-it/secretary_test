import { Platform } from 'react-native';
import { C } from '../theme';

const STYLE_ID = 'secretary-popup-scrollbar';

// window.open()으로 뜨는 실제 브라우저 팝업 창은 OS 기본 스크롤바를 그대로 쓰기 때문에, 밝은 기본
// 스크롤바가 앱의 어두운 팝업 배경과 충돌한다. 트랙은 팝업 배경색(C.bg)과 같게 칠해 배경에 묻히도록
// 하고, 썸은 테마의 보더 톤으로 칠해 튀지 않으면서도 드래그는 가능하게 만든다.
export function applyPopupScrollbarStyle() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    * { scrollbar-width: thin; scrollbar-color: ${C.borderHigh} ${C.bg}; }
    *::-webkit-scrollbar { width: 10px; height: 10px; }
    *::-webkit-scrollbar-track { background: ${C.bg}; }
    *::-webkit-scrollbar-thumb { background: ${C.borderHigh}; border-radius: 6px; }
    *::-webkit-scrollbar-thumb:hover { background: ${C.textDim}; }
    *::-webkit-scrollbar-corner { background: ${C.bg}; }
  `;
  document.head.appendChild(style);
}
