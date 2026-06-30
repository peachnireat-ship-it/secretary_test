---
name: doc-review
description: 생성된 API 문서를 소스 코드와 교차 검증하여 완성도를 평가하는 스킬. 누락 함수, 파라미터 오류, 반환값 불일치, 예제 품질을 체계적으로 검토한다. doc-reviewer 에이전트가 사용한다.
---

## 검증 체크리스트

### 1. 완전성 검증 (누락 감지)

소스 파일에서 export된 함수 총 수를 세고, 02_docs.md에 문서화된 함수 수와 비교한다.

```
소스 export 함수 수: N
문서화 함수 수: M
누락: N - M개
```

누락 함수 목록을 04_review.md에 기록하고, 05_final_docs.md에서 직접 추가한다.

### 2. 정확성 검증 (오류 감지)

소스 파일과 02_docs.md를 함수별로 비교:

| 검증 항목 | 확인 방법 |
|----------|---------|
| 파라미터 이름/타입 일치 | 함수 선언문과 문서 비교 |
| 반환값 형태 일치 | return 문과 문서 비교 |
| 에러 메시지 일치 | throw 문과 문서 비교 |
| 필수/선택 파라미터 정확성 | 기본값 유무 확인 |

### 3. secretary_test 특수 동작 검증

다음 항목은 놓치면 버그로 직결되므로 Critical/Major로 처리:

| 항목 | 검증 기준 | 심각도 |
|------|---------|-------|
| `askClaude` raw:true 필요 케이스 | buildTaskExtractionSystem, update_project JSON 응답 예제에 raw:true 포함 여부 | 🔴 Critical |
| 사용자별 키 격리 | get/add/update/delete 계열 함수 문서에 격리 언급 여부 | 🟡 Major |
| `diarizeWithPyannote` null 반환 | 주의 섹션에 null 체크 필요 언급 여부 | 🟡 Major |
| 샘플 데이터 자동 초기화 | getSchedules 등 최초 호출 시 동작 설명 여부 | 🟢 Minor |

### 4. 예제 품질 검증

- 문법 오류 여부 (괄호 불일치, 잘못된 키워드 등)
- raw:true 필요 함수에 raw:true 포함 여부
- 에러 처리 포함 여부 (API 호출 함수)

## 점수 산정

| 항목 | 감점 |
|------|------|
| 🔴 Critical 1건 | -10점 |
| 🟡 Major 1건 | -5점 |
| 🟢 Minor 1건 | -2점 |
| 함수 누락 1개 | -3점 |
| 기준점 | 100점 |

## 최종 문서(05_final_docs.md) 구조

```markdown
# secretary_test 서비스 API 문서
버전: {날짜}
완성도: {점수}/100

## 개요

| 모듈 | 함수 수 | 주요 역할 |
|------|--------|---------|
| storage.js | N | AsyncStorage CRUD (사용자별 격리) |
| claude.js | N | AI 호출, 시스템 프롬프트 빌더 |
| groqStt.js | N | STT, 화자 분리 |

## 핵심 주의사항

1. **raw:true 필수 케이스** — JSON 응답 기대 시
2. **사용자별 키 격리** — 로그인 없이 get* 호출 시 공유 키 사용됨
3. **Pyannote null 처리** — 서버 없으면 null 반환, LLM fallback 필요

---

{02_docs.md 내용 + 수정사항 반영 + 예제 인라인 삽입}
```
