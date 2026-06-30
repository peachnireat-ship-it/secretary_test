---
name: research-orchestrator
description: 어떤 주제든 웹·학술·커뮤니티 3각도에서 병렬 조사하고, 교차 검증 후 종합 보고서를 작성하는 리서치 오케스트레이터. "조사해줘", "리서치해줘", "분석해줘", "알아봐줘", "최신 동향", "트렌드 파악", "심층 분석", "보고서 작성" 요청 시 이 스킬을 사용한다. 후속 요청("다시 조사", "더 깊이 파줘", "추가로 알아봐", "이전 결과 업데이트", "보고서 보완") 시에도 이 스킬을 사용한다.
---

## 목적

다각도 리서치 파이프라인 오케스트레이터. 사용자 주제를 받아 3개 관점에서 병렬 조사 → 교차 검증 → 종합 보고서 순서로 실행한다.

**실행 모드:** 서브 에이전트 파이프라인 (하이브리드)
- Phase 2: 서브 에이전트 x3 병렬 (`run_in_background: true`) — 조사 작업은 독립적이므로 팀 통신 불필요
- Phase 3-4: 서브 에이전트 순차 — 이전 단계 파일이 입력이므로 순차 실행

**데이터 전달:** 파일 기반 (`_research/{슬러그}/`)

---

## Phase 0: 컨텍스트 확인

`_research/` 폴더 존재 여부 확인:
- `_research/{슬러그}/` 존재 + 부분 재조사 요청 → 해당 에이전트만 재호출 (Phase 2로 건너뜀, 대상 에이전트만)
- `_research/{슬러그}/` 존재 + 새 입력·업데이트 요청 → 기존 폴더를 `_research/{슬러그}_prev/`로 이동 후 새 실행
- 없음 → Phase 1부터 초기 실행

---

## Phase 1: 주제 분해

1. 사용자 요청에서 핵심 주제 추출
2. 주제 슬러그 생성 (예: "AI 규제 현황 2025" → `ai-regulation-2025`)
3. `_research/{슬러그}/` 폴더 생성
4. 3개 조사 방향 구체화:
   - **웹**: 최신 뉴스, 공식 발표, 업계 동향
   - **학술**: 논문, 연구 보고서, 메타분석
   - **커뮤니티**: 실사용자 반응, 논쟁점, 감성 흐름

---

## Phase 2: 병렬 조사 — 서브 에이전트 x3

세 에이전트를 동시에 실행한다:

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  run_in_background: true,
  prompt: """
    C:\\Users\\user\\.claude\\agents\\web-searcher.md 의 역할 정의를 읽는다.
    C:\\Users\\user\\.claude\\skills\\web-search\\SKILL.md 를 읽고 검색 전략을 따른다.

    조사 주제: {주제}
    조사 방향: {웹 조사 방향}
    출력 경로: _research/{슬러그}/01_web.md

    SKILL.md 출력 형식에 맞춰 결과를 파일에 저장하고, 완료 보고를 반환한다.
  """
)

Agent(
  subagent_type: "general-purpose",
  model: "opus",
  run_in_background: true,
  prompt: """
    C:\\Users\\user\\.claude\\agents\\academic-researcher.md 의 역할 정의를 읽는다.
    C:\\Users\\user\\.claude\\skills\\academic-search\\SKILL.md 를 읽고 검색 전략을 따른다.

    조사 주제: {주제}
    출력 경로: _research/{슬러그}/01_academic.md

    SKILL.md 출력 형식에 맞춰 결과를 파일에 저장하고, 완료 보고를 반환한다.
  """
)

Agent(
  subagent_type: "general-purpose",
  model: "opus",
  run_in_background: true,
  prompt: """
    C:\\Users\\user\\.claude\\agents\\community-analyst.md 의 역할 정의를 읽는다.
    C:\\Users\\user\\.claude\\skills\\community-analysis\\SKILL.md 를 읽고 분석 프레임워크를 따른다.

    조사 주제: {주제}
    출력 경로: _research/{슬러그}/01_community.md

    SKILL.md 출력 형식에 맞춰 결과를 파일에 저장하고, 완료 보고를 반환한다.
  """
)
```

세 에이전트 모두 완료될 때까지 대기한다.

---

## Phase 3: 교차 검증 — 순차

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\fact-checker.md 의 역할 정의를 읽는다.
    C:\\Users\\user\\.claude\\skills\\fact-check\\SKILL.md 를 읽고 검증 절차를 따른다.

    조사 결과 파일:
    - _research/{슬러그}/01_web.md (없으면 누락으로 표시)
    - _research/{슬러그}/01_academic.md (없으면 누락으로 표시)
    - _research/{슬러그}/01_community.md (없으면 누락으로 표시)

    출력 경로: _research/{슬러그}/02_verified.md

    SKILL.md 출력 형식에 맞춰 교차 검증 결과를 파일에 저장하고, 완료 보고를 반환한다.
  """
)
```

---

## Phase 4: 종합 보고서 — 순차

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\synthesizer.md 의 역할 정의를 읽는다.
    C:\\Users\\user\\.claude\\skills\\synthesis\\SKILL.md 를 읽고 보고서 구조를 따른다.

    검증 결과: _research/{슬러그}/02_verified.md
    원본 조사: _research/{슬러그}/01_web.md, 01_academic.md, 01_community.md
    주제: {주제}

    출력 경로: _research/{슬러그}/03_report.md

    SKILL.md 보고서 구조에 맞춰 종합 보고서를 작성하고, 완료 보고를 반환한다.
  """
)
```

완료 후 사용자에게 `_research/{슬러그}/03_report.md` 경로를 안내한다.

---

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|----------|----------|
| 조사 에이전트 1개 실패 | 나머지 2개로 진행, 보고서에 "누락: {에이전트}" 명시 |
| 조사 에이전트 2개 이상 실패 | 사용자에게 보고 후 재시도 여부 확인 |
| fact-checker 실패 | 미검증 데이터로 synthesizer 호출, 보고서에 "교차 검증 미완" 경고 |
| synthesizer 실패 | 1회 재시도, 재실패 시 `02_verified.md` 경로만 안내 |

---

## 테스트 시나리오

### 정상 흐름: "2025년 AI 규제 현황 조사해줘"

1. 슬러그: `ai-regulation-2025`
2. Phase 2: web-searcher + academic-researcher + community-analyst 병렬 실행
3. `01_web.md`, `01_academic.md`, `01_community.md` 생성
4. Phase 3: fact-checker → `02_verified.md` 생성
5. Phase 4: synthesizer → `03_report.md` 생성
6. 사용자에게 `_research/ai-regulation-2025/03_report.md` 안내

### 에러 흐름: 학술 조사 에이전트 실패

1. `01_web.md`, `01_community.md` 정상 생성, `01_academic.md` 없음
2. fact-checker가 2개 파일로 검증 진행
3. synthesizer가 보고서에 "학술 자료 미수집 — 웹·커뮤니티 기반만 포함" 경고 삽입
4. 최종 보고서 안내 + "학술 자료 재조사가 필요하면 말씀해 주세요" 안내
