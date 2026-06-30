---
name: web-dev-orchestrator
description: 풀스택 웹사이트 개발 하네스의 오케스트레이터 스킬. 웹사이트 개발, Next.js 프로젝트 생성, 풀스택 앱 구현, 와이어프레임부터 배포까지 전체 파이프라인, React/Next.js 프론트엔드와 백엔드 API 동시 개발, 재실행·수정·업데이트·보완 요청 시 반드시 이 스킬을 사용한다. 단순 질문은 직접 응답한다.
---

## 목적

풀스택 웹사이트를 요구사항 분석부터 배포까지 6개 에이전트가 협업하여 완성한다.

## 실행 아키텍처

**하이브리드 파이프라인 (서브 → 서브 → 팀 → 서브 → 서브)**

```
Phase 1 [서브]  requirements-analyst → 01_requirements.md
Phase 2 [서브]  ux-designer → 02_design/
Phase 3 [팀]    frontend-developer ↔ backend-developer
                └ 선합의: 03_api_contract.md
                └ 병렬 구현: 04_frontend/ + 05_backend/
Phase 4 [서브]  qa-engineer → 06_qa/ (테스트 + 리포트)
Phase 5 [서브]  devops-engineer → 07_deployment/ + 08_project_package.md
```

## Phase 0: 컨텍스트 확인

**Phase 1 시작 전 실행.**

1. `_webdev/` 디렉토리 존재 확인
2. 실행 모드:
   - 없음 → **초기 실행** (전체 Phase)
   - 존재 + 특정 수정 요청 → **부분 재실행** (해당 Phase만)
   - 존재 + 새 프로젝트 → **새 실행** (새 slug)
3. slug 결정: `{프로젝트-이름}-{날짜}` (예: `todo-app-20260630`)

## Phase 1: 요구사항 분석 [서브 에이전트]

```
Agent(
  agent: "requirements-analyst",
  model: "sonnet",
  prompt: """
  _webdev/{slug}/ 디렉토리를 생성하고 01_requirements.md를 작성하라.
  requirements-analysis 스킬을 참조하라.
  
  사용자 요구사항: {사용자 입력}
  """
)
```

**완료 조건:** `01_requirements.md` 생성 확인 후 Phase 2 진행.

## Phase 2: UX 디자인 [서브 에이전트]

```
Agent(
  agent: "ux-designer",
  model: "sonnet",
  prompt: """
  _webdev/{slug}/01_requirements.md를 읽고 다음 파일을 작성하라:
  - 02_design/design-system.md (디자인 토큰)
  - 02_design/component-specs.md (컴포넌트 명세)
  - 02_design/wireframes.md (페이지별 상세 와이어프레임)
  
  ux-design 스킬을 참조하라.
  """
)
```

**완료 조건:** `02_design/` 3개 파일 생성 확인 후 Phase 3 진행.

## Phase 3: 개발팀 [에이전트 팀]

**실행 모드:** 에이전트 팀 (API contract 선합의가 핵심)

```
TeamCreate(
  team_name: "web-dev-team",
  members: ["frontend-developer", "backend-developer"]
)
```

### 3-1단계: API Contract 합의 (팀 우선 과제)

두 에이전트가 구현 시작 전 `03_api_contract.md`를 공동 작성:

```
TaskCreate({
  title: "API Contract 합의",
  assignees: ["frontend-developer", "backend-developer"],
  description: """
  구현 전 API contract를 먼저 합의하라:
  1. frontend-developer: 필요한 엔드포인트 목록 + 응답 스키마 요구사항 작성
  2. backend-developer: 구현 가능성 검토 + 수정사항 SendMessage로 협의
  3. 합의 완료 후 _webdev/{slug}/03_api_contract.md 작성
  """
})
```

### 3-2단계: 병렬 구현

API contract 합의 완료 후 각자 독립 구현:

```
TaskCreate({
  title: "프론트엔드 구현",
  assignee: "frontend-developer",
  description: "02_design/ + 03_api_contract.md 기반으로 04_frontend/ 구현. frontend-development 스킬 참조."
})

TaskCreate({
  title: "백엔드 구현",
  assignee: "backend-developer",
  description: "01_requirements.md + 03_api_contract.md 기반으로 05_backend/ 구현. backend-development 스킬 참조."
})
```

### 3-3단계: 통합 검증

구현 완료 후 팀 내 상호 검토:

| 발신 | 수신 | 확인 내용 |
|------|------|---------|
| frontend-developer | backend-developer | "API 응답에서 {필드} 누락 확인 요청" |
| backend-developer | frontend-developer | "{엔드포인트} 구현 완료 — Mock 교체 가능" |

**완료 조건:** `03_api_contract.md`, `04_frontend/`, `05_backend/` 모두 생성 확인.

## Phase 4: QA 테스트 [서브 에이전트]

```
Agent(
  agent: "qa-engineer",
  model: "sonnet",
  prompt: """
  _webdev/{slug}/ 전체 파일(01~05)을 읽고 다음을 작성하라:
  1. 06_qa/test-scenarios.md — 전체 테스트 시나리오
  2. 06_qa/e2e/ — Playwright E2E 테스트 코드
  3. 06_qa/api/ — Jest + Supertest API 테스트 코드
  4. 06_qa/qa-report.md — 경계면 검증 + 완성도 점수
  
  web-qa-testing 스킬을 참조하라.
  """
)
```

## Phase 5: 배포 설정 [서브 에이전트]

```
Agent(
  agent: "devops-engineer",
  model: "sonnet",
  prompt: """
  _webdev/{slug}/ 파일들을 읽고 다음을 작성하라:
  1. 07_deployment/docker/ — Dockerfile.frontend, Dockerfile.backend, docker-compose.yml
  2. 07_deployment/.github/workflows/ — ci.yml, deploy.yml
  3. 07_deployment/deployment-guide.md — 단계별 배포 가이드
  4. 08_project_package.md — 최종 프로젝트 요약 패키지
  
  web-deployment 스킬을 참조하라.
  """
)
```

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|---------|---------|
| requirements-analyst 정보 부족 | 5가지 체크리스트 재질문 |
| API contract 합의 실패 | 오케스트레이터가 중재 — 프론트 요구사항 우선 |
| 개발팀 에이전트 1명 실패 | 해당 에이전트만 재호출, 상대 산출물 보존 |
| QA 60점 미만 | 배포 설정은 완료, 사용자에게 "재작업 권고" 보고 |

## 부분 재실행 가이드

| 요청 | 재실행 대상 |
|------|----------|
| "디자인 수정" | ux-designer → frontend-developer → qa-engineer → devops-engineer |
| "API 엔드포인트 추가" | backend-developer → frontend-developer → qa-engineer |
| "컴포넌트만 수정" | frontend-developer → qa-engineer |
| "배포 설정 변경" | devops-engineer |
| "전체 다시" | Phase 0부터 |

## 데이터 흐름

```
_webdev/{slug}/
├── 01_requirements.md
├── 02_design/
│   ├── design-system.md
│   ├── component-specs.md
│   └── wireframes.md
├── 03_api_contract.md         ← 프론트·백엔드 공통 계약
├── 04_frontend/               ← Next.js 소스
├── 05_backend/                ← Express API 소스
├── 06_qa/
│   ├── test-scenarios.md
│   ├── e2e/                   ← Playwright 테스트
│   ├── api/                   ← Supertest 테스트
│   └── qa-report.md
├── 07_deployment/
│   ├── docker/
│   ├── .github/workflows/
│   └── deployment-guide.md
└── 08_project_package.md      ← 최종 요약 패키지
```

## 테스트 시나리오

### 정상 흐름
```
입력: "할 일 관리 웹앱. 로그인 후 할 일을 추가/완료/삭제할 수 있어야 함. Next.js + PostgreSQL."

예상 출력:
- 01: CRUD 기능 명세, 기술 스택 확정
- 02: 심플한 디자인 시스템 + TodoCard 컴포넌트 명세
- 03: /api/v1/todos CRUD + /api/v1/auth API contract
- 04: Next.js TodoList, TodoItem, AddTodoForm 컴포넌트
- 05: Express todos.routes, auth.routes, Prisma Todo 모델
- 06: E2E + API 테스트 코드, QA 리포트 80점 이상
- 07: Docker + GitHub Actions + 배포 가이드
```

### 에러 흐름
```
입력: "웹사이트 만들어줘" (정보 부족)
처리: requirements-analyst가 5가지 항목 재질문
```
