---
name: campaign-orchestrator
description: 마케팅 캠페인 제작 오케스트레이터. 타깃 시장 조사 → 광고 카피 작성 → 비주얼 컨셉 설계 → A/B 테스트 계획 → 품질 리뷰 파이프라인을 조율하여 최종 캠페인 패키지를 생성한다. "마케팅 캠페인 만들어줘", "광고 카피 작성해줘", "캠페인 기획해줘", "비주얼 컨셉 잡아줘", "A/B 테스트 설계해줘", "캠페인 리뷰해줘", "카피 다시 써줘", "캠페인 업데이트해줘" 요청 시 반드시 이 스킬을 사용한다. 후속 요청("특정 단계만 다시", "카피 보완", "비주얼 수정", "A/B 계획 개선")에도 이 스킬을 사용한다.
---

## 목적

마케팅 캠페인 제작 전 과정을 에이전트 팀 + 서브 에이전트 하이브리드로 조율.

**실행 모드:** 하이브리드
- Phase 1 (시장 조사): 서브 에이전트 — 독립 리서치
- Phase 2 (창작): 에이전트 팀 — 카피+비주얼 상호 피드백
- Phase 3 (기획+검증): 서브 에이전트 — 독립 분석

**작업 공간:** `_campaign/{slug}/` (slug = `campaign-{YYYYMMDD}`)

---

## Phase 0: 컨텍스트 확인

`_campaign/` 폴더 존재 여부 확인:
- `_campaign/{slug}/` 존재 + 부분 수정 요청 → 해당 Phase만 재실행 (Phase 2로 이동)
- `_campaign/{slug}/` 존재 + 새 캠페인 요청 → 기존 폴더를 `_campaign/{slug}_prev/`로 이동 후 새 실행
- 없음 → Phase 1부터 초기 실행

---

## Phase 1: 시장 조사 (서브 에이전트)

**실행 모드:** 서브 에이전트 (독립 실행)

```
Agent(
  name: "market-researcher",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\market-researcher.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\market-research\\SKILL.md 를 읽고 조사 방법론을 따른다.

    캠페인 주제: {사용자 입력}
    출력: _campaign/{slug}/01_market_research.md

    완료 후 반환: "시장 조사 완료. 페르소나 N개, 경쟁사 N개 분석."
  """
)
```

→ 반환 확인 후 Phase 2 진행

---

## Phase 2: 창작팀 (에이전트 팀)

**실행 모드:** 에이전트 팀 (카피라이터 ↔ 비주얼 디자이너 상호 협업)

```
TeamCreate(
  team_name: "campaign-creative-team",
  members: ["copywriter", "visual-concept-designer"]
)

TaskCreate([
  {
    id: "copy-draft",
    agent: "copywriter",
    description: "01_market_research.md 기반 광고 카피 초안 작성. 완료 후 핵심 감성 키워드를 visual-concept-designer에게 SendMessage로 공유.",
    output: "_campaign/{slug}/02_ad_copy.md"
  },
  {
    id: "visual-draft",
    agent: "visual-concept-designer",
    description: "01_market_research.md 기반 비주얼 컨셉 초안 작성. copywriter의 카피 방향 수신 후 통합. 완료 후 비주얼 분위기 3단어를 copywriter에게 공유.",
    output: "_campaign/{slug}/03_visual_concept.md",
    depends_on: ["copy-draft의 초안 감성 키워드 공유"]
  },
  {
    id: "copy-final",
    agent: "copywriter",
    description: "visual-concept-designer의 비주얼 분위기 피드백 수신 후 카피 최종화.",
    depends_on: ["visual-draft"]
  }
])
```

팀 통신 완료 후 `TeamDelete("campaign-creative-team")` → Phase 3 진행

---

## Phase 3: 기획 + 검증 (서브 에이전트, 순차)

**실행 모드:** 서브 에이전트 (순차)

### Step 3-1: A/B 테스트 계획

```
Agent(
  name: "ab-test-planner",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\ab-test-planner.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\ab-testing\\SKILL.md 를 읽고 설계 원칙을 따른다.

    입력:
    - _campaign/{slug}/02_ad_copy.md
    - _campaign/{slug}/03_visual_concept.md
    출력: _campaign/{slug}/04_ab_test_plan.md

    완료 후 반환: "A/B 계획 완료. 테스트 N개, 1순위: {테스트명}."
  """
)
```

### Step 3-2: 품질 리뷰 + 최종 패키지

```
Agent(
  name: "campaign-qa",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\campaign-qa.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\campaign-review\\SKILL.md 를 읽고 검증 기준을 따른다.

    입력:
    - _campaign/{slug}/01_market_research.md
    - _campaign/{slug}/02_ad_copy.md
    - _campaign/{slug}/03_visual_concept.md
    - _campaign/{slug}/04_ab_test_plan.md
    출력:
    - _campaign/{slug}/05_qa_review.md
    - _campaign/{slug}/06_campaign_package.md

    완료 후 반환: "리뷰 완료. 완성도 N/100. Critical N건, Major N건."
  """
)
```

---

## Phase 4: 완료 보고

사용자에게 다음을 안내:
- 최종 패키지: `_campaign/{slug}/06_campaign_package.md`
- 완성도 점수 + 주요 발견 사항
- 후속 옵션: "카피 수정", "비주얼 방향 변경", "A/B 계획 보완" 요청 가능

---

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|----------|----------|
| 캠페인 주제가 너무 추상적 | 사용자에게 제품명·타깃·목적 3가지 재입력 요청 |
| Phase 1 실패 | 사용자에게 "시장 조사 실패" 보고 후 중단 |
| 팀 통신 교착 (카피-비주얼 충돌 2회) | 두 버전 병기 후 Phase 3로 진행, QA에서 최종 선택 |
| Phase 3-1 실패 | 04 없이 Phase 3-2 진행, 패키지에 "A/B 계획 생략" 표시 |
| 완성도 60점 미만 | 핵심 개선 3항목 제시 + 재실행 여부 사용자에게 확인 |

---

## 테스트 시나리오

### 정상 흐름: "SNS 광고 캠페인 만들어줘. 제품: 20대 직장인용 스마트 플래너 앱"

1. 슬러그: `campaign-20260630`
2. Phase 1: market-researcher → 페르소나(20대 직장인), 경쟁사 3개, 트렌드 2개
3. Phase 2: copywriter ↔ visual-concept-designer → 카피 3헤드라인 + 비주얼 2방향
4. Phase 3-1: ab-test-planner → 헤드라인 A/B + 비주얼 A/B 2개 계획
5. Phase 3-2: campaign-qa → 85/100, Critical 0, Major 1
6. 사용자에게 `06_campaign_package.md` 안내

### 부분 재실행: "카피 다시 써줘. 좀 더 유머러스하게"

1. `_campaign/campaign-20260630/` 확인 → 기존 산출물 있음
2. Phase 2의 copywriter만 재실행 (피드백 반영)
3. visual-concept-designer는 카피 톤 변경 통보만 수신 (비주얼 수정 필요하면 재실행)
4. Phase 3-2: campaign-qa 재실행 (05_qa_review.md 비교 표시)

### 에러 흐름: 카피-비주얼 방향 충돌

1. copywriter: "밝고 유머러스한 톤" → visual-concept-designer에게 공유
2. visual-concept-designer: "프리미엄 다크톤으로 가야 한다" → 협의 1회
3. copywriter: 조정 불가 → 협의 2회 후 교착
4. 두 버전 병기: 02_ad_copy.md (유머 버전), 03_visual_concept.md (프리미엄 버전)
5. campaign-qa가 불일치 발견 → 🔴 Critical, 점수 -15점 → 재작업 권고
