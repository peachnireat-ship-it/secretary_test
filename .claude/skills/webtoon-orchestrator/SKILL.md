---
name: webtoon-orchestrator
description: 웹툰 에피소드 제작 하네스의 오케스트레이터 스킬. 스토리 작성, 캐릭터 디자인 프롬프트, 패널 레이아웃, 대사 편집, 스타일 일관성 리뷰, 에피소드 패키지 생성 등 웹툰 제작 전반을 요청하거나 재실행·수정·업데이트·보완·이전 결과 기반 개선을 요청할 때 반드시 이 스킬을 사용한다. 단순 질문은 직접 응답한다.
---

## 목적

웹툰 에피소드 제작 전 과정을 5개 에이전트가 협업하여 완성한다. 스토리 → 창작팀 상호 리뷰 → 스타일 검증 순서의 하이브리드 아키텍처로 실행한다.

## 실행 아키텍처

**하이브리드 모드 (서브 에이전트 + 에이전트 팀 + 서브 에이전트)**

```
Phase 1 [서브]: story-writer
  → _webtoon/{slug}/00_style_sheet.md
  → _webtoon/{slug}/01_story.md

Phase 2 [팀]: character-designer + panel-planner + dialogue-editor
  (3방향 상호 스타일 일관성 리뷰 포함)
  → _webtoon/{slug}/02_characters.md
  → _webtoon/{slug}/03_panels.md
  → _webtoon/{slug}/04_dialogue.md

Phase 3 [서브]: style-reviewer
  → _webtoon/{slug}/05_style_review.md
  → _webtoon/{slug}/06_episode_package.md
```

## Phase 0: 컨텍스트 확인

**반드시 Phase 1 시작 전에 실행한다.**

1. `_webtoon/` 디렉토리 존재 확인
2. 실행 모드 결정:
   - `_webtoon/{slug}/` 없음 → **초기 실행** (전체 Phase 진행)
   - `_webtoon/{slug}/` 존재 + 사용자가 특정 부분 수정 요청 → **부분 재실행** (해당 에이전트만)
   - `_webtoon/{slug}/` 존재 + 새 에피소드 요청 → **새 실행** (새 slug로 디렉토리 생성)
3. slug 결정: `ep{번호}-{에피소드-제목-요약}` (예: `ep01-first-meeting`)

## Phase 1: 스토리 작성 [서브 에이전트]

**실행 모드:** 서브 에이전트 (독립 선행 — 창작팀의 공통 기반)

```
Agent(
  agent: "story-writer",
  model: "opus",
  prompt: """
  _webtoon/{slug}/ 디렉토리를 생성하고 다음 두 파일을 작성하라:
  1. 00_style_sheet.md — 창작팀 공통 스타일 가이드 (세계관 톤, 캐릭터별 스타일, 비주얼 언어, 선 스타일)
  2. 01_story.md — 에피소드 스토리 (장면 분할, 감정 흐름, 패널 힌트 포함)
  
  에피소드 정보: {사용자 입력}
  
  webtoon-story 스킬을 참조하라.
  """
)
```

**완료 조건:** `00_style_sheet.md`, `01_story.md` 두 파일 생성 확인 후 Phase 2 진행.

## Phase 2: 창작팀 상호 리뷰 [에이전트 팀]

**실행 모드:** 에이전트 팀 (상호 스타일 일관성 리뷰가 핵심)

Phase 1 완료 후 창작팀을 구성한다.

### 팀 구성 및 작업 할당

```
TeamCreate(
  team_name: "webtoon-creative-team",
  members: ["character-designer", "panel-planner", "dialogue-editor"]
)
```

### 작업 순서 (의존성 포함)

**1단계 — 초안 작성 (병렬):**
- character-designer: `00_style_sheet.md` + `01_story.md` 읽고 `02_characters.md` 초안 작성
- panel-planner: `00_style_sheet.md` + `01_story.md` 읽고 `03_panels.md` 초안 작성
- dialogue-editor: `00_style_sheet.md` + `01_story.md` 읽고 `04_dialogue.md` 초안 작성

**2단계 — 상호 스타일 리뷰 (팀 내 SendMessage):**

| 발신자 | 수신자 | 리뷰 내용 |
|--------|--------|---------|
| character-designer | panel-planner | 캐릭터 등신·시각적 무게 → 패널 비율 조정 요청 |
| character-designer | dialogue-editor | 장면별 표정이 전달하는 감정 → 대사 톤 일치 확인 |
| panel-planner | character-designer | 패널별 앵글·클로즈업 여부 → 표정/포즈 프롬프트 조정 요청 |
| panel-planner | dialogue-editor | 패널별 말풍선 공간(위치+비율) → 대사 분량 제한 전달 |
| dialogue-editor | character-designer | 대사 감정 상태 → 표정 프롬프트 일치 확인 |
| dialogue-editor | panel-planner | 공간 초과 패널 목록 → 패널 크기 조정 요청 |

**3단계 — 피드백 반영 (병렬):**
- 각 에이전트: 수신한 피드백을 자신의 산출물에 반영하여 최종화
- 최종 파일 저장: `02_characters.md`, `03_panels.md`, `04_dialogue.md`

**완료 조건:** 3개 파일 모두 팀 통신 기록 포함 최종 버전 저장 확인.

## Phase 3: 스타일 검증 [서브 에이전트]

**실행 모드:** 서브 에이전트 (독립 최종 검증)

```
Agent(
  agent: "style-reviewer",
  model: "opus",
  prompt: """
  _webtoon/{slug}/ 폴더의 모든 파일(00~04)을 읽고 스타일 일관성을 교차 검증하라:
  1. 05_style_review.md — 7대 경계면 검증 결과 + 점수 + 판정
  2. 06_episode_package.md — 모든 파일 통합 에피소드 패키지
  
  style-consistency 스킬을 참조하라.
  """
)
```

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|---------|---------|
| story-writer 실패 | 에피소드 정보 보완 후 1회 재시도. 재실패 시 사용자에게 추가 입력 요청. |
| 창작팀 에이전트 1명 실패 | 해당 에이전트만 재호출. 나머지 2명 산출물은 보존. |
| style-reviewer 60점 미만 | 패키지 생성 후 "재작업 권고" 플래그 + 핵심 개선 3항목 사용자에게 보고. |
| 파일 누락 | 있는 파일로 검증 진행, 누락 파일 명시. |

## 부분 재실행 가이드

사용자가 특정 부분만 수정 요청 시:

| 요청 | 재실행 에이전트 |
|------|-------------|
| "스토리 수정해줘" | story-writer → Phase 2 전체 재실행 |
| "캐릭터 표정만 바꿔줘" | character-designer만 재실행 → style-reviewer 재실행 |
| "대사 분량 줄여줘" | dialogue-editor만 재실행 → style-reviewer 재실행 |
| "패널 구도 다시" | panel-planner만 재실행 → dialogue-editor 재실행 → style-reviewer 재실행 |
| "전체 다시 해줘" | Phase 0부터 전체 재실행 |

## 데이터 흐름

```
_webtoon/{slug}/
├── 00_style_sheet.md   ← story-writer 생성, 창작팀 전원 참조
├── 01_story.md         ← story-writer 생성, 창작팀 전원 참조
├── 02_characters.md    ← character-designer 생성
├── 03_panels.md        ← panel-planner 생성
├── 04_dialogue.md      ← dialogue-editor 생성
├── 05_style_review.md  ← style-reviewer 생성
└── 06_episode_package.md ← style-reviewer 생성 (최종 통합)
```

## 테스트 시나리오

### 정상 흐름
```
입력: "고등학교 전학생 첫날 에피소드. 주인공 지우(소녀)가 같은 반 미스터리한 남학생 현을 만남. 긴장감과 설렘이 공존하는 분위기."

예상 출력:
- 00_style_sheet.md: 학원 배경, 따뜻한 색온도, 지우(밝은 헤어, 수줍음), 현(단정한 헤어, 무표정)
- 01_story.md: 3~4 장면 (등교 → 교실 → 첫 대화 → 엔딩 복선)
- 02_characters.md: 지우/현 기본 프롬프트 + 장면별 변형
- 03_panels.md: 총 15~20컷 레이아웃
- 04_dialogue.md: 지우 수줍은 말투, 현 짧고 단호한 말투
- 05_style_review.md: 80점 이상 예상
- 06_episode_package.md: 전체 통합
```

### 에러 흐름
```
입력: "에피소드 만들어줘" (정보 불충분)

처리: story-writer가 5W1H로 추가 입력 요청:
- 누가 등장하는가?
- 어디서 일어나는가?
- 무슨 사건이 발생하는가?
- 어떤 감정이 주조인가?
- 독립 에피소드인가, 연속인가?
```
