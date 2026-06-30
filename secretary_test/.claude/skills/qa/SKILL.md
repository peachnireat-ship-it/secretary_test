---
name: qa
description: secretary_test 코드 검증 스킬. 구현된 기능이 기존 화면과 충돌하지 않는지, 데이터 모델이 올바르게 사용되었는지 검증한다. "검증해줘", "QA", "확인해줘", "리뷰해줘", "테스트해줘" 요청 시 이 스킬을 사용한다.
---

## 검증 체크리스트

### 데이터 모델 정합성
- AsyncStorage 키가 CLAUDE.md "AsyncStorage 키 목록"과 일치하는지
- 새 키 추가 시 `{type}_v1_${userId}` 패턴 준수 여부
- 데이터 형식이 CLAUDE.md 스키마와 일치하는지

### 화면 간 충돌
- 수정한 화면의 state/effect가 다른 탭에 영향을 주지 않는지
- `current_user_v1` 기반 userId 사용이 올바른지
- 네비게이션 파라미터가 올바르게 전달되는지

### 스타일 준수
- 인라인 스타일이 남아있지 않은지 (동적 스타일 제외)
- 미사용 스타일이 없는지
- `C.*` 색상 변수 사용, 하드코딩 없는지

### AI API 호출
- `askClaude()` 시그니처 정확성 (`messages`, `systemPrompt`, `{raw}`)
- JSON 파싱 블록 내 예외 처리 포함 여부
- **JSON 파싱 또는 마크다운 응답 사용 시 `{ raw: true }` 적용 여부** — 미적용 시 `stripNonKorean`이 `{}":#-` 등을 제거하여 구조 파괴됨

## 경계면 교차 비교

단순 "존재 확인"이 아니라 경계면을 교차로 확인한다:
- `storage.js`의 키 상수 ↔ Screen에서 사용하는 실제 키 문자열
- AI 액션 JSON 형식 (`create_schedule`, `update_project`) ↔ 파싱 코드의 expected shape
- 모달 열기/닫기 state ↔ `Modal`의 `visible` prop 연결

## 보고 형식

```
[검증 결과]
✅ 통과: N개 항목
❌ 실패: N개 항목
  - [파일명:라인] 문제 설명
⚠️ 주의: N개 항목
  - [파일명:라인] 권고 내용
```

버그 발견 시 검증 결과에 버그 목록(파일·라인·수정 방법)을 포함하여 반환한다. 오케스트레이터가 이 결과를 받아 developer 재호출 여부를 결정한다.
