import { Platform } from 'react-native';
import { C } from '../theme';

// popupScrollbar.js와 달리 `*` 전역 선택자를 쓰지 않고 특정 DOM id(`#${elementId}`)에만 스코프된
// 스크롤바 스타일을 주입한다. 앱 메인 화면들은 showsVerticalScrollIndicator={false}로 스크롤바를
// 숨기는 미니멀 디자인 컨벤션을 따르므로, 특정 리스트 하나에만 스크롤바를 노출해야 할 때 이 함수를 쓴다.
// 같은 id로 여러 번 호출돼도 <style> 태그가 중복 주입되지 않도록 가드한다.
export function applyScopedScrollbarStyle(elementId) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const styleTagId = `secretary-scoped-scrollbar-${elementId}`;
  if (document.getElementById(styleTagId)) return;

  const style = document.createElement('style');
  style.id = styleTagId;
  style.textContent = `
    #${elementId} { scrollbar-width: thin; scrollbar-color: ${C.borderHigh} ${C.bg}; }
    #${elementId}::-webkit-scrollbar { width: 8px; height: 8px; }
    #${elementId}::-webkit-scrollbar-track { background: ${C.bg}; }
    #${elementId}::-webkit-scrollbar-thumb { background: ${C.borderHigh}; border-radius: 6px; }
    #${elementId}::-webkit-scrollbar-thumb:hover { background: ${C.textDim}; }
    #${elementId}::-webkit-scrollbar-corner { background: ${C.bg}; }
  `;
  document.head.appendChild(style);
}
