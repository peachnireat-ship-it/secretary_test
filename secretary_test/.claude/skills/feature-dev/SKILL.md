---
name: feature-dev
description: secretary_test Expo/React Native 화면 개발 가이드. 신규 기능 구현, 화면 컴포넌트 작성, AsyncStorage CRUD, AI API 호출, Bottom Sheet 모달, 달력 UI 등 코드 작성 작업 시 이 스킬을 사용한다.
---

## 개요

secretary_test는 Expo SDK v53, React Native 기반이다. 구현 전 `@AGENTS.md`의 안내에 따라 `https://docs.expo.dev/versions/v53.0.0/` 공식 문서를 확인한다.

## 테마 색상

`src/theme.js`의 `C` 객체를 사용한다. 색상 하드코딩 금지.

```js
import { C } from '../theme';
// C.bg, C.surface, C.surfaceHigh, C.border
// C.gold, C.accentBlue, C.accentTeal, C.accentPurple, C.red
// C.textPrimary, C.textSecondary, C.textDim
```

탭별 대표 색상: 홈=C.gold, 일정=C.accentBlue, 거래처/회의록=C.accentTeal, 프로젝트=C.red, 메세지=C.accentPurple

## AsyncStorage

`src/services/storage.js`의 함수를 재사용한다. 새 데이터 타입 추가 시 키 패턴: `{type}_v1_${userId}`.

CLAUDE.md의 "AsyncStorage 키 목록"을 반드시 참조한다. 잘못된 키 사용은 데이터 손실로 이어진다.

## AI 호출

```js
import { askClaude } from '../services/claude';

// 순수 텍스트 응답 (한국어 안내 문구 등)
const text = await askClaude(messages, systemPrompt);             // raw: false 기본값

// JSON 액션 파싱이 필요한 경우 — raw: true 필수
// stripNonKorean이 { } " : - # 등을 제거하므로 JSON/마크다운 구조가 파괴됨
const raw = await askClaude(messages, systemPrompt, { raw: true });
const match = raw.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
if (match) {
  try { const action = JSON.parse(match[0]); /* ... */ } catch {}
}
```

`raw: true`가 필요한 경우:
- JSON 액션 파싱 (`create_schedule`, `update_project` 등)
- 마크다운 형식 응답 (`## 헤더`, `- 목록` 포함)

## 주요 UI 패턴

### Bottom Sheet 모달
```jsx
<Modal visible={visible} animationType="slide" transparent>
  <View style={s.overlay}>
    <View style={s.sheet}>
      <View style={s.handle} {...panHandlers} />
      {/* 내용 */}
    </View>
  </View>
</Modal>
```

### 드래그 닫기
기존 `useSwipeClose` 훅을 재사용한다. `dy > 80` 또는 `vy > 0.8`이면 닫힘.

### FAB 버튼
`position: 'absolute', bottom: 24, right: 20`. 각 탭 우하단에 배치.

### 긴급도 애니메이션
마감 임박/초과 항목에 `Animated.loop` 테두리 깜빡임 — 기존 패턴 재사용.

## 구현 순서

1. CLAUDE.md에서 관련 데이터 모델·키·색상 확인
2. 영향받는 파일 특정 (Screen + storage.js + claude.js 중 최소 범위)
3. 기존 패턴 재사용 여부 판단
4. Edit 도구로 필요한 부분만 수정 (전체 재작성 금지)
5. 인라인 스타일은 최소화 (style-guard가 정리)

## 금지 사항

- 색상 하드코딩 (`#FFFFFF` 직접 사용)
- 새 npm 패키지 추가 (기존 의존성 우선)
- 파일 전체 재작성
- 존재하지 않는 AsyncStorage 키 사용
