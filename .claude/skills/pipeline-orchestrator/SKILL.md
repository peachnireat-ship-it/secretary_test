---
name: pipeline-orchestrator
description: 데이터 파이프라인 설계 오케스트레이터. 스키마 설계 → ETL 조직 → 데이터 검증 규칙 → 모니터링 설정을 계층적으로 위임하여 완전한 파이프라인 스펙을 생성한다. "데이터 파이프라인 설계해줘", "ETL 설계해줘", "스키마 짜줘", "데이터 검증 규칙 만들어줘", "파이프라인 모니터링 설정해줘", "파이프라인 스펙 작성해줘", "파이프라인 업데이트해줘", "ETL 수정해줘", "검증 규칙 보완해줘" 요청 시 반드시 이 스킬을 사용한다.
---

## 목적

데이터 파이프라인 전체 설계를 계층적 위임 패턴으로 조율.

**실행 모드:** 하이브리드 (계층적 위임)
- Phase 1 (아키텍처 초안): 서브 에이전트 (pipeline-architect 독립 실행)
- Phase 2 (스키마+ETL 협업): 에이전트 팀 (상호 의존, 실시간 피드백)
- Phase 3 (검증 규칙): 서브 에이전트 (독립 분석)
- Phase 4 (모니터링): 서브 에이전트 (독립 설정)
- Phase 5 (최종 통합): 서브 에이전트 (pipeline-architect 통합 실행)

**작업 공간:** `_pipeline/{slug}/` (slug = `pipeline-{YYYYMMDD}`)

---

## Phase 0: 컨텍스트 확인

`_pipeline/` 폴더 존재 여부 확인:
- `_pipeline/{slug}/` 존재 + 부분 수정 요청 → 해당 Phase만 재실행 (Phase 2로 이동)
- `_pipeline/{slug}/` 존재 + 새 파이프라인 요청 → 기존 폴더를 `_pipeline/{slug}_prev/`로 이동 후 새 실행
- 없음 → Phase 1부터 초기 실행

---

## Phase 1: 아키텍처 초안 (서브 에이전트)

**실행 모드:** 서브 에이전트

```
Agent(
  name: "pipeline-architect",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\pipeline-architect.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\pipeline-architecture\\SKILL.md 를 읽고 설계 원칙을 따른다.

    요청: {사용자 입력 — 소스, 처리 목표, 타깃, 기술 스택 힌트}
    출력: _pipeline/{slug}/01_architecture.md

    완료 후 반환: "아키텍처 초안 완료. 레이어 N개, 기술 스택: {목록}."
  """
)
```

→ 반환 확인 후 Phase 2 진행

---

## Phase 2: 스키마 + ETL 협업 (에이전트 팀)

**실행 모드:** 에이전트 팀 (스키마가 ETL에 즉시 영향 → 실시간 협의 필요)

```
TeamCreate(
  team_name: "pipeline-design-team",
  members: ["schema-designer", "etl-organizer"]
)

TaskCreate([
  {
    id: "schema-raw",
    agent: "schema-designer",
    description: "01_architecture.md 기반 Raw/Cleansed/Curated 레이어 스키마 초안 작성. Raw 완성 즉시 컬럼·타입·파티션 키를 etl-organizer에게 SendMessage로 공유.",
    output: "_pipeline/{slug}/02_schema.md"
  },
  {
    id: "etl-design",
    agent: "etl-organizer",
    description: "01_architecture.md 기반 ETL 로직 초안 작성. schema-designer의 Raw 스키마 수신 후 Extract→Transform 컬럼 매핑 확정. 스키마에서 구현 불가한 JOIN 발견 시 schema-designer에게 비정규화 요청.",
    output: "_pipeline/{slug}/03_etl.md",
    depends_on: ["schema-raw의 컬럼 정보 공유"]
  },
  {
    id: "schema-final",
    agent: "schema-designer",
    description: "etl-organizer의 비정규화 요청 또는 파티션 변경 요청 수신 후 스키마 최종화.",
    depends_on: ["etl-design"]
  }
])
```

팀 통신 완료 후 `TeamDelete("pipeline-design-team")` → Phase 3 진행

---

## Phase 3: 데이터 검증 규칙 (서브 에이전트)

**실행 모드:** 서브 에이전트

```
Agent(
  name: "validation-rule-writer",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\validation-rule-writer.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\data-validation\\SKILL.md 를 읽고 검증 설계 원칙을 따른다.

    입력:
    - _pipeline/{slug}/02_schema.md
    - _pipeline/{slug}/03_etl.md
    출력: _pipeline/{slug}/04_validation.md

    완료 후 반환: "검증 규칙 완료. Critical N개, Warning N개 규칙 정의."
  """
)
```

→ 반환 확인 후 Phase 4 진행

---

## Phase 4: 모니터링 설정 (서브 에이전트)

**실행 모드:** 서브 에이전트

```
Agent(
  name: "monitoring-configurator",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\monitoring-configurator.md 를 읽고 역할을 따른다.
    C:\\Users\\user\\.claude\\skills\\pipeline-monitoring\\SKILL.md 를 읽고 모니터링 설계 원칙을 따른다.

    입력:
    - _pipeline/{slug}/01_architecture.md
    - _pipeline/{slug}/02_schema.md
    - _pipeline/{slug}/03_etl.md
    - _pipeline/{slug}/04_validation.md
    출력: _pipeline/{slug}/05_monitoring.md

    완료 후 반환: "모니터링 설정 완료. Critical 알림 N개, 대시보드 패널 N개."
  """
)
```

→ 반환 확인 후 Phase 5 진행

---

## Phase 5: 최종 통합 (pipeline-architect 재호출)

**실행 모드:** 서브 에이전트

```
Agent(
  name: "pipeline-architect",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\pipeline-architect.md 를 읽고 역할을 따른다. 통합 실행 모드로 동작한다.

    입력:
    - _pipeline/{slug}/01_architecture.md
    - _pipeline/{slug}/02_schema.md
    - _pipeline/{slug}/03_etl.md
    - _pipeline/{slug}/04_validation.md
    - _pipeline/{slug}/05_monitoring.md
    출력: _pipeline/{slug}/06_pipeline_spec.md

    완료 후 반환: "최종 스펙 완료. 갭 N개 발견, 수정 사항 N건."
  """
)
```

---

## Phase 6: 완료 보고

사용자에게 다음을 안내:
- 최종 스펙: `_pipeline/{slug}/06_pipeline_spec.md`
- 갭/충돌 요약 + 권고 사항
- 후속 옵션: "스키마 수정", "ETL 로직 변경", "검증 규칙 보완", "모니터링 알림 조정" 요청 가능

---

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|----------|----------|
| 데이터 소스·타깃 불명확 | 사용자에게 "소스·처리 목표·타깃 3가지" 재입력 요청 |
| Phase 1 실패 | 사용자에게 "아키텍처 초안 실패" 보고 후 중단 |
| 스키마-ETL 교착 (2회 협의 후 미해결) | 충돌 내용 02/03 파일에 병기 후 Phase 3 진행 |
| Phase 3 실패 | 04 없이 Phase 4 진행, 06에 "검증 규칙 생략" 표시 |
| Phase 4 실패 | 05 없이 Phase 5 진행, 06에 "모니터링 설정 생략" 표시 |

---

## 테스트 시나리오

### 정상 흐름: "PostgreSQL → Redshift 일별 배치 파이프라인 설계해줘. 주문·고객·상품 데이터 집계."

1. 슬러그: `pipeline-20260630`
2. Phase 1: pipeline-architect → 01 (3레이어, Airflow + dbt, 야간 배치)
3. Phase 2: schema-designer ↔ etl-organizer → 02 (Raw/Cleansed/Curated 스키마) + 03 (일별 증분 ETL)
4. Phase 3: validation-rule-writer → 04 (Critical 12개, Warning 8개 규칙)
5. Phase 4: monitoring-configurator → 05 (P1 알림 3개, 대시보드 5패널, 런북 3개)
6. Phase 5: pipeline-architect → 06 (최종 통합 스펙)

### 부분 재실행: "ETL 로직 수정해줘. 증분 처리로 바꿔야 해"

1. `_pipeline/pipeline-20260630/` 확인 → 기존 산출물 있음
2. Phase 2의 etl-organizer만 재실행 (피드백 반영)
3. schema-designer는 파티션 키 변경 필요 시에만 재실행
4. Phase 3: validation-rule-writer 재실행 (ETL 변경으로 검증 규칙 영향)
5. Phase 4: monitoring-configurator 재실행 (처리량 지표 변경)
6. Phase 5: pipeline-architect 통합 재실행

### 에러 흐름: 스키마-ETL 교착

1. etl-organizer: "5개 테이블 JOIN 없이는 불가" 요청
2. schema-designer: "정규화 원칙상 비정규화 불가" 거부
3. 2회 협의 후 교착 → 충돌 내용 병기
4. 06 파일에 "스키마-ETL 충돌 지점 수동 해결 필요" 표시
5. 추천 해결책 2가지 제시 (비정규화 vs. ETL 로직 재설계)
