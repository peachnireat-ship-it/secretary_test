---
name: style-cleanup
description: secretary_test css-guide.md 규칙 적용 스킬. 인라인 스타일을 StyleSheet.create로 이관하고 미사용 스타일을 제거한다. "스타일 정리", "인라인 스타일 제거", "CSS 정리", "StyleSheet 이관", "css-guide 적용" 요청 시 반드시 이 스킬을 사용한다.
---

## css-guide.md 규칙 (4가지)

1. 모든 인라인 스타일 → `StyleSheet.create`로 이관
2. 미사용 스타일 클래스 제거
3. 중복 공통 스타일 메모 (추출은 사용자 확인 후)
4. 스타일 정의는 컴포넌트 코드 하단에 위치

## 동적 스타일 예외 (인라인 유지)

다음은 인라인 그대로 유지한다. 이것들을 StyleSheet으로 옮기면 런타임 오류가 발생한다:

- `statusColor()`, `priorityColor()`, `tagColor()` 등 함수 반환 색상
- `{ paddingTop: insets.top }` 등 SafeArea 기반 동적 값
- `Animated.Value` 기반 트랜스폼 (`transform: [{ translateY: anim }]`)
- `C.color + '22'` 등 알파 블렌딩 계산식 (문자열 연산)

## 작업 절차

1. 대상 파일 읽기
2. 인라인 스타일 목록 추출 → 동적/정적 구분
3. 정적 인라인 스타일을 `StyleSheet.create` 블록에 추가
4. JSX에서 `style={{ ... }}` → `style={s.키이름}` 교체
5. 미사용 스타일 탐색 (JSX에서 참조되지 않는 key)
6. 미사용 스타일 제거
7. 변경 사항 요약 보고

## 보고 형식

```
[파일명] 정리 완료
- 이관된 인라인 스타일: N개
- 제거된 미사용 스타일: N개 (이름 목록)
- 동적 스타일 유지: N개 (이유)
```
