---
name: api-doc-orchestrator
description: secretary_test 서비스 API 문서 자동 생성 오케스트레이터. 엔드포인트 분석 → 문서 작성 → 예제 생성 → 완성도 리뷰 순서로 서브 에이전트를 조율하여 최종 API 문서 패키지를 생성한다. "API 문서 만들어줘", "서비스 함수 문서화해줘", "storage.js 문서화", "API 문서 업데이트", "예제 다시 만들어줘", "문서 리뷰해줘" 요청 시 이 스킬을 사용한다. 후속 요청("특정 함수 문서 수정", "예제 보완", "리뷰 결과 반영") 시에도 이 스킬을 사용한다.
---

## 목적

secretary_test 서비스 레이어(`storage.js`, `claude.js`, `groqStt.js`) API 문서 자동 생성.

**실행 모드:** 서브 에이전트 직렬 파이프라인
- Step 1: `endpoint-analyzer` → 함수 목록 추출
- Step 2: `doc-writer` → 한국어 문서 작성
- Step 3: `example-generator` → 사용 예제 생성
- Step 4: `doc-reviewer` → 검증 + 최종 통합

**데이터 전달:** 파일 기반 (반환값 기반 상태 확인 병행)
**작업 공간:** `secretary_test/_apidocs/{slug}/`

---

## Phase 0: 컨텍스트 확인

`secretary_test/_apidocs/` 폴더 존재 여부 확인:
- `_apidocs/{slug}/` 존재 + 부분 수정 요청 → 해당 Step만 재실행 (Phase 2로 이동, 대상 에이전트만)
- `_apidocs/{slug}/` 존재 + 전체 재실행 요청 → 기존 폴더를 `_apidocs/{slug}_prev/`로 이동 후 새 실행
- 없음 → Phase 1부터 초기 실행

---

## Phase 1: 초기화

1. 슬러그 생성: `services-{YYYYMMDD}` (예: `services-20260630`)
2. `secretary_test/_apidocs/{slug}/` 폴더 생성
3. 대상 파일 확인:
   - `secretary_test/src/services/storage.js`
   - `secretary_test/src/services/claude.js`
   - `secretary_test/src/services/groqStt.js`

---

## Phase 2: 서브 에이전트 파이프라인

### Step 1: 엔드포인트 분석

```
Agent(
  name: "endpoint-analyzer",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\endpoint-analyzer.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\code-parsing\\SKILL.md 를 읽고 분석 방법론을 따른다.

    분석 대상:
    - secretary_test/src/services/storage.js
    - secretary_test/src/services/claude.js
    - secretary_test/src/services/groqStt.js

    출력: secretary_test/_apidocs/{slug}/01_endpoints.md

    완료 후 반환 메시지: "분석 완료. 총 N개 함수 추출."
  """
)
```

→ 반환 메시지 확인 후 Step 2 진행

### Step 2: 문서 작성

```
Agent(
  name: "doc-writer",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\doc-writer.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\api-doc-writing\\SKILL.md 를 읽고 작성 원칙을 따른다.

    입력: secretary_test/_apidocs/{slug}/01_endpoints.md
    소스 참조: secretary_test/src/services/ (불명확 시 직접 읽기)
    출력: secretary_test/_apidocs/{slug}/02_docs.md

    완료 후 반환 메시지: "문서 작성 완료. N개 함수 문서화."
  """
)
```

→ 반환 메시지 확인 후 Step 3 진행

### Step 3: 예제 생성

```
Agent(
  name: "example-generator",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\example-generator.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\example-generation\\SKILL.md 를 읽고 작성 기준을 따른다.

    입력: secretary_test/_apidocs/{slug}/02_docs.md
    화면 참조: secretary_test/src/screens/ (실제 사용 패턴)
    출력: secretary_test/_apidocs/{slug}/03_examples.md

    완료 후 반환 메시지: "예제 생성 완료. N개 함수 예제 작성."
  """
)
```

→ 반환 메시지 확인 후 Step 4 진행

### Step 4: 검증 + 최종 통합

```
Agent(
  name: "doc-reviewer",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\doc-reviewer.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\doc-review\\SKILL.md 를 읽고 검증 기준을 따른다.

    입력: secretary_test/_apidocs/{slug}/01_endpoints.md
          secretary_test/_apidocs/{slug}/02_docs.md
          secretary_test/_apidocs/{slug}/03_examples.md
    소스 참조: secretary_test/src/services/

    출력:
    - secretary_test/_apidocs/{slug}/04_review.md (리뷰 보고서)
    - secretary_test/_apidocs/{slug}/05_final_docs.md (최종 통합 문서)

    완료 후 반환 메시지: "리뷰 완료. 완성도 N/100. Critical N건, Major N건."
  """
)
```

---

## Phase 3: 완료 보고

사용자에게 다음을 안내한다:
- 최종 문서 경로: `secretary_test/_apidocs/{slug}/05_final_docs.md`
- 완성도 점수 + 주요 발견 사항 요약
- 후속 작업 옵션: "특정 함수 문서 수정 요청 가능"

---

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|----------|----------|
| Step 1 실패 (소스 읽기 오류) | 사용자에게 파일 경로 확인 요청 후 중단 |
| Step 2 실패 | 01_endpoints.md만으로 재시도 1회 |
| Step 3 실패 | 화면 파일 없이 문서 기반 예제로 대체 후 계속 |
| Step 4 실패 | 02_docs.md를 05_final_docs.md로 복사 후 "리뷰 생략" 표시 |

---

## 테스트 시나리오

### 정상 흐름: "API 문서 만들어줘"

1. 슬러그: `services-20260630`
2. Step 1: endpoint-analyzer → `01_endpoints.md` (총 44개 함수)
3. Step 2: doc-writer → `02_docs.md` (44개 함수 문서)
4. Step 3: example-generator → `03_examples.md` (화면 패턴 기반 예제)
5. Step 4: doc-reviewer → `04_review.md` + `05_final_docs.md`
6. 사용자에게 `05_final_docs.md` 경로 안내

### 부분 재실행: "예제만 다시 만들어줘"

1. `_apidocs/services-20260630/` 확인 → 기존 산출물 있음
2. Step 3만 재실행 (example-generator)
3. Step 4도 재실행 (03_examples.md 변경됐으므로)

### 에러 흐름: Step 3 화면 파일 읽기 실패

1. example-generator가 화면 파일 접근 실패
2. `02_docs.md` 기반 직접 작성 예제로 대체
3. 예제 상단에 `// 직접 작성 예제 (화면 참조 실패)` 태그
4. 나머지 Step 4는 정상 진행
