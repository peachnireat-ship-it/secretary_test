import { StyleSheet } from 'react-native';
import { C } from '../theme';

// src/screens/ 7개 화면(HomeScreen, LoginScreen, ClientScreen, MeetingScreen,
// MessageScreen, ProjectScreen, ScheduleScreen)에 이름·값이 동일하게 중복 정의돼 있던
// 스타일을 공통으로 분리한 것. css-todo.md "공통 스타일 분리 완료" 섹션 참고.
export const commonStyles = StyleSheet.create({
  // Layout
  flex1: { flex: 1 },
  gap12: { gap: 12 },

  // Opacity / border
  opacity40: { opacity: 0.4 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: C.border },

  // Spacing modifiers
  mb0: { marginBottom: 0 },
  mb8: { marginBottom: 8 },
  mt8: { marginTop: 8 },
  mt16: { marginTop: 16 },
  mt20: { marginTop: 20 },
  ml8: { marginLeft: 8 },
  ml12: { marginLeft: 12 },
  spacerH20: { height: 20 },

  // Modal height variants
  h85pct: { height: '85%' },
  maxH80pct: { maxHeight: '80%' },
  maxH85pct: { maxHeight: '85%' },
  maxH90pct: { maxHeight: '90%' },

  // Transcript
  speakerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
});
