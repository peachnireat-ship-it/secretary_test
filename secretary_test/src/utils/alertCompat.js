// react-native-web의 Alert.alert가 완전한 no-op(class Alert { static alert() {} })이기 때문에,
// 웹 빌드에서 확인/취소 다이얼로그가 조용히 아무 동작도 하지 않는 문제를 우회하기 위한 드롭인 교체 모듈.
//
// 네이티브(iOS/Android)에서는 react-native의 실제 Alert.alert로 그대로 위임하여 동작을 100% 보존한다.
// 웹에서는 buttons 개수에 따라 window.alert/window.confirm으로 대체한다.
//
// 사용법: 각 파일에서 `import { Alert } from 'react-native'` 대신
// `import { Alert } from '../utils/alertCompat'` 로만 바꾸면 기존 Alert.alert(...) 호출은 그대로 동작한다.
import { Platform, Alert as RNAlert } from 'react-native';

function webAlert(title, message, buttons) {
  const text = [title, message].filter(Boolean).join('\n\n');

  // 버튼이 없거나 1개면 window.alert. 버튼이 1개면 확인 후 그 버튼의 onPress 호출.
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    const only = buttons && buttons[0];
    if (only && typeof only.onPress === 'function') {
      only.onPress();
    }
    return;
  }

  // 버튼이 2개 이상이면 window.confirm.
  // style === 'cancel'인 버튼을 취소 버튼으로 간주하고, 나머지 중 첫 번째를 확인 버튼으로 간주한다.
  const confirmed = window.confirm(text);
  const cancelButton = buttons.find((b) => b && b.style === 'cancel');
  const otherButtons = buttons.filter((b) => b !== cancelButton);
  const target = confirmed ? otherButtons[0] : cancelButton;

  if (target && typeof target.onPress === 'function') {
    target.onPress();
  }
}

export const Alert = {
  alert(title, message, buttons, options) {
    if (Platform.OS !== 'web') {
      return RNAlert.alert(title, message, buttons, options);
    }
    return webAlert(title, message, buttons);
  },
};
