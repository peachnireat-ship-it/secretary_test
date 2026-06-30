---
name: youtube-orchestrator
description: 유튜브 콘텐츠 제작 파이프라인 오케스트레이터. 감독자(content-director) 에이전트를 중심으로 트렌드 조사 → 대본 → SEO → 썸네일 순서로 팀을 조율하고 최종 콘텐츠 패키지를 작성한다. "유튜브 콘텐츠 만들어줘", "영상 기획해줘", "유튜브 대본 써줘", "유튜브 썸네일 기획", "유튜브 SEO 최적화", "콘텐츠 패키지", "영상 제작 준비" 요청 시 이 스킬을 사용한다. 후속 요청("대본 다시 써줘", "썸네일 수정해줘", "SEO 업데이트", "이전 결과 개선", "다른 주제로 다시") 시에도 이 스킬을 사용한다.
---

## 목적

유튜브 콘텐츠 제작 오케스트레이터. 주제를 받아 트렌드 조사 → 대본 → SEO + 썸네일 → 통합 패키지 순서로 에이전트 팀을 조율한다.

**실행 모드:** 에이전트 팀 (감독자 패턴)
- 감독자: `content-director` — 전체 워크플로우 조율, 품질 게이팅, 최종 패키지 통합
- 팀원: `trend-researcher`, `script-writer`, `seo-optimizer`, `thumbnail-designer`

**데이터 전달:** 태스크 기반(조율) + 파일 기반(산출물) + 메시지 기반(실시간 소통)

**작업 공간:** `_youtube/{슬러그}/`

---

## Phase 0: 컨텍스트 확인

`_youtube/` 폴더 존재 여부 확인:
- `_youtube/{슬러그}/` 존재 + 부분 수정 요청 → 해당 에이전트만 재호출 (Phase 2로 이동, 대상 에이전트만)
- `_youtube/{슬러그}/` 존재 + 새 주제 제공 → 기존 폴더를 `_youtube/{슬러그}_prev/`로 이동 후 새 실행
- 없음 → Phase 1부터 초기 실행

---

## Phase 1: 주제 분해

1. 사용자 요청에서 영상 주제 추출
2. 슬러그 생성 (예: "AI 생산성 툴 2025" → `ai-productivity-2025`)
3. `_youtube/{슬러그}/` 폴더 생성
4. 채널 정보가 있다면 확인 (타깃 시청자, 채널 톤, 영상 길이 선호)
5. content-director에게 전달할 브리핑 준비:
   - 주제, 슬러그, 작업 공간 경로
   - 채널 정보 (없으면 "정보 없음"으로 전달)
   - 사용자 특별 요청 사항

---

## Phase 2: 에이전트 팀 구성 및 작업 할당

```
Agent(
  name: "content-director",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    C:\\Users\\user\\.claude\\agents\\content-director.md 를 읽고 역할을 따른다.

    === 영상 브리핑 ===
    주제: {주제}
    슬러그: {슬러그}
    작업 공간: _youtube/{슬러그}/
    채널 정보: {채널 정보 또는 "없음"}
    특별 요청: {사용자 요청 사항}

    === 팀 구성 ===
    다음 에이전트들을 순서에 따라 조율한다. 각 에이전트 호출 시 해당 .md 파일을 읽도록 프롬프트에 명시한다.

    [Step 1: 트렌드 조사]
    Agent(
      name: "trend-researcher",
      subagent_type: "general-purpose",
      model: "opus",
      prompt: "C:\\Users\\user\\.claude\\agents\\trend-researcher.md 를 읽고...
               C:\\Users\\user\\.claude\\skills\\youtube-trend-research\\SKILL.md 를 읽고...
               주제: {주제}, 출력: _youtube/{슬러그}/01_trend.md"
    )
    → 완료 후 01_trend.md 핵심 인사이트 3줄 추출 → Step 2 전달

    [Step 2: 대본 작성]
    Agent(
      name: "script-writer",
      subagent_type: "general-purpose",
      model: "opus",
      prompt: "C:\\Users\\user\\.claude\\agents\\script-writer.md 를 읽고...
               C:\\Users\\user\\.claude\\skills\\script-writing\\SKILL.md 를 읽고...
               트렌드 보고서: _youtube/{슬러그}/01_trend.md
               방향: {트렌드 핵심 인사이트}
               출력: _youtube/{슬러그}/02_script.md"
    )
    → 완료 후 품질 게이팅: 훅/본론/CTA 구조 확인 → 기준 충족 시 Step 3 진행

    [Step 3: SEO + 썸네일 병렬]
    동시에 실행 (run_in_background: true):
    - Agent("seo-optimizer"): C:\\Users\\user\\.claude\\agents\\seo-optimizer.md + skills\\youtube-seo\\SKILL.md
                              입력: 02_script.md + 01_trend.md, 출력: 03_seo.md
    - Agent("thumbnail-designer"): C:\\Users\\user\\.claude\\agents\\thumbnail-designer.md + skills\\thumbnail-concept\\SKILL.md
                                   입력: 02_script.md + 03_seo.md(완료 시), 출력: 04_thumbnail.md
    → 둘 다 완료 대기

    [Step 4: 통합 패키지 작성]
    content-director가 직접 작성:
    - 4개 파일(01~04) 읽기
    - _youtube/{슬러그}/05_package.md 생성
    - 최종 보고 반환
  """
)
```

---

## Phase 3: 최종 패키지 구조

`_youtube/{슬러그}/05_package.md`:

```markdown
# 유튜브 콘텐츠 패키지: {주제}
제작일: {날짜}

## 📊 트렌드 핵심 인사이트
(01_trend.md 요약 3줄)

## 📝 대본
→ 전문: _youtube/{슬러그}/02_script.md

**훅 미리보기** (첫 30초):
(대본 첫 30초 인용)

## 🔍 SEO 패키지
**추천 제목**: {추천 제목}
**대체 제목**: {2~3개}
**핵심 태그**: {상위 10개}
→ 전체: _youtube/{슬러그}/03_seo.md

## 🎨 썸네일 컨셉
**추천 시안**: {시안명}
(추천 시안 핵심 요소 요약)
→ 전체 3개 시안: _youtube/{슬러그}/04_thumbnail.md

## ✅ 제작 체크리스트
- [ ] 대본 최종 검토
- [ ] 썸네일 제작 (추천: {시안명})
- [ ] 영상 촬영 및 편집
- [ ] 제목/설명/태그 업로드 세팅
- [ ] 예약 발행 또는 즉시 공개
```

---

## 에러 핸들링

| 에러 상황 | 처리 방법 |
|----------|----------|
| 트렌드 조사 실패 | 주제만으로 대본 진행, 패키지에 "트렌드 데이터 미수집" 명시 |
| 대본 품질 미달 | content-director가 1회 재작업 지시, 재실패 시 현재 버전으로 진행 |
| SEO 생성 실패 | 대본에서 키워드 직접 추출하여 간소화된 SEO 패키지 생성 |
| 썸네일 생성 실패 | 패키지에 "썸네일 컨셉 미완성" 표시, SEO 추천 제목을 임시 텍스트 오버레이로 제안 |

---

## 테스트 시나리오

### 정상 흐름: "AI 생산성 툴 유튜브 영상 만들어줘"

1. 슬러그: `ai-productivity-2025`
2. content-director 팀 조율:
   - trend-researcher → `01_trend.md` (AI 툴 트렌드, 경쟁 채널 3개 분석)
   - script-writer → `02_script.md` (훅+본론+CTA, 약 1500단어)
   - seo-optimizer → `03_seo.md` (제목 5개, 태그 18개)
   - thumbnail-designer → `04_thumbnail.md` (시안 3개)
3. content-director → `05_package.md` 통합
4. 사용자에게 `_youtube/ai-productivity-2025/05_package.md` 안내

### 에러 흐름: 트렌드 조사 실패

1. `01_trend.md` 생성 실패
2. content-director가 주제 + 사용자 채널 정보만으로 script-writer에게 대본 지시
3. 패키지에 "⚠️ 트렌드 데이터 없이 작성됨 — 경쟁 채널 직접 확인 권고" 경고 삽입
4. 나머지 SEO + 썸네일은 대본 기반으로 정상 생성

### 부분 재실행: "썸네일 시안 B를 다른 색상으로 바꿔줘"

1. `_youtube/ai-productivity-2025/` 폴더 확인 → 기존 산출물 있음
2. thumbnail-designer만 재호출 (04_thumbnail.md 읽고 시안 B만 수정)
3. content-director가 05_package.md 썸네일 섹션만 업데이트
