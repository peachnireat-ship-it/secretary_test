---
name: code-review-orchestrator
description: 종합 코드 리뷰 하네스의 오케스트레이터 스킬. 코드 리뷰, 아키텍처 감사, 보안 취약점 점검, 성능 병목 분석, 코드 스타일 감사, 리뷰 리포트 생성, 재실행·수정·업데이트·이전 결과 기반 개선 요청 시 반드시 이 스킬을 사용한다. 단순 질문은 직접 응답한다.
---

## 목적

코드베이스를 4개 영역에서 병렬 감사하고 하나의 우선순위 리포트로 통합한다.

## 실행 아키텍처

**팬아웃/팬인 (병렬 서브 에이전트 → 통합 서브 에이전트)**

```
Phase 1 [병렬 팬아웃 — 4개 동시 실행]
  architecture-auditor (background) → 01_architecture.md
  security-auditor     (background) → 02_security.md
  performance-auditor  (background) → 03_performance.md
  style-auditor        (background) → 04_style.md
  
Phase 2 [팬인]
  review-synthesizer → 05_review_report.md
```

## Phase 0: 컨텍스트 확인

1. 리뷰 대상 경로 결정:
   - 사용자가 경로 지정 → 해당 경로 사용
   - 지정 없음 → 현재 작업 디렉토리
   - `_review/` 기존 결과 확인

2. 실행 모드:
   - `_review/{slug}/` 없음 → **초기 실행**
   - `_review/{slug}/` 존재 + 재실행 요청 → **재검토** (이전 결과와 비교)
   - 특정 영역만 요청 ("보안만 다시 해줘") → **부분 재실행**

3. slug 결정: `{프로젝트명}-{YYYYMMDD}` (예: `secretary_test-20260630`)

## Phase 1: 병렬 감사 [서브 에이전트 ×4, 동시 실행]

```
// 4개를 동시에 실행 (run_in_background: true)
Agent(agent: "architecture-auditor", model: "sonnet", run_in_background: true,
  prompt: """
  {대상 경로}의 코드베이스 아키텍처를 감사하라.
  _review/{slug}/01_architecture.md에 결과를 저장.
  architecture-review 스킬 참조.
  """)

Agent(agent: "security-auditor", model: "sonnet", run_in_background: true,
  prompt: """
  {대상 경로}의 보안 취약점을 감사하라.
  _review/{slug}/02_security.md에 결과를 저장.
  security-review 스킬 참조.
  """)

Agent(agent: "performance-auditor", model: "sonnet", run_in_background: true,
  prompt: """
  {대상 경로}의 성능 병목을 감사하라.
  _review/{slug}/03_performance.md에 결과를 저장.
  performance-review 스킬 참조.
  """)

Agent(agent: "style-auditor", model: "sonnet", run_in_background: true,
  prompt: """
  {대상 경로}의 코드 스타일을 감사하라.
  _review/{slug}/04_style.md에 결과를 저장.
  code-style-review 스킬 참조.
  """)

// 4개 완료 대기 후 Phase 2 진행
```

**완료 조건:** `01~04.md` 4개 파일 모두 생성 확인 후 Phase 2 진행.

## Phase 2: 통합 리포트 [서브 에이전트]

```
Agent(agent: "review-synthesizer", model: "sonnet",
  prompt: """
  _review/{slug}/01~04.md를 모두 읽고 교차 분석하여:
  1. 05_review_report.md — 종합 리포트 생성
  
  review-synthesis 스킬 참조.
  """)
```

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|---------|---------|
| 감사 에이전트 1~2개 실패 | 성공한 파일로 부분 통합 + 실패 영역 "미감사" 명시 |
| 대상 경로 없음 | 사용자에게 경로 재확인 요청 |
| 파일 수가 너무 많음(500+) | 핵심 디렉토리(`src/`, `app/`, `lib/`) 우선 감사, 전체 감사는 영역별 분리 실행 권장 |

## 부분 재실행 가이드

| 요청 | 재실행 에이전트 |
|------|-------------|
| "보안만 다시 검토해줘" | security-auditor → review-synthesizer |
| "성능 최적화 후 재검토" | performance-auditor → review-synthesizer |
| "전체 다시" | Phase 1 전체 → Phase 2 |
| "리포트만 다시 통합해줘" | review-synthesizer만 |

## 데이터 흐름

```
_review/{slug}/
├── 01_architecture.md   ← architecture-auditor
├── 02_security.md       ← security-auditor
├── 03_performance.md    ← performance-auditor
├── 04_style.md          ← style-auditor
└── 05_review_report.md  ← review-synthesizer (최종)
```

## 테스트 시나리오

### 정상 흐름
```
입력: "secretary_test 폴더 코드 리뷰해줘"
대상: ./secretary_test/

예상 출력:
- 01: 스크린별 로직 분리 현황, 서비스 레이어 구조
- 02: API 키 하드코딩 여부, AsyncStorage 보안
- 03: 불필요한 리렌더링, AsyncStorage 반복 호출
- 04: 컴포넌트 크기, 함수 복잡도
- 05: 종합 점수 + 핫스팟 파일 + 우선순위 액션
```

### 에러 흐름
```
입력: "코드 리뷰해줘" (경로 미지정)
처리: 현재 작업 디렉토리(secretary_test) 사용 → 사용자에게 "secretary_test/ 폴더를 리뷰합니다" 확인
```
