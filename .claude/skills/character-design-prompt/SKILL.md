---
name: character-design-prompt
description: 웹툰 캐릭터 디자인을 이미지 생성 AI용 프롬프트로 작성하는 스킬. 캐릭터 외모·표정·의상·포즈 설계, 이미지 AI 프롬프트 생성(Midjourney/NovelAI/Stable Diffusion), 캐릭터 시트 작성, 장면별 캐릭터 상태 명세 요청 시 반드시 이 스킬을 사용한다. webtoon-orchestrator가 character-designer 에이전트를 호출할 때 참조한다.
---

## 목적

웹툰 캐릭터의 비주얼을 이미지 생성 AI가 그릴 수 있는 수준으로 상세히 명세한다. 스타일 시트를 기반으로 캐릭터 일관성을 유지하면서 장면별 감정·포즈 변화를 표현한다.

## 핵심 원칙

### 프롬프트 구조 (반드시 이 순서로)

```
[스타일] + [캐릭터 외모 기반] + [장면 표정/포즈] + [의상 상태] + [배경 힌트] + [품질 태그]
```

**각 항목 설명:**
- **스타일**: `webtoon style, manhwa art style, clean line art` 등
- **캐릭터 외모 기반**: 기본 외모 프롬프트 참조 (매번 반복)
- **장면 표정/포즈**: `surprised expression, covering mouth with right hand` 등
- **의상 상태**: `uniform, slightly wrinkled sleeve` (연속성 주의)
- **배경 힌트**: `school hallway background, soft blur` 등
- **품질 태그**: `high quality, detailed, best quality` 등

### 기본 캐릭터 프롬프트 (일관성 레퍼런스)

각 캐릭터마다 **기본 외모 프롬프트**를 정의하고, 모든 장면별 프롬프트는 이 기본값에서 변형만 추가한다. 매 프롬프트를 처음부터 쓰면 일관성이 깨진다.

```
# 기본 (공통 부분)
1girl, [헤어 스타일·색], [눈 색], [얼굴형], [키·체형 키워드], webtoon style

# 장면별 변형 (추가 부분)
+ [표정], [포즈], [의상 상태], [배경]
```

### 표정 선택 가이드

감정 상태를 영어로 표현할 때 이미지 AI가 잘 이해하는 표현:
- 기쁨: `happy smile`, `beaming smile`, `laughing`
- 슬픔: `teary eyes`, `crying`, `sad expression`, `downcast eyes`
- 놀람: `surprised expression`, `wide eyes`, `open mouth`
- 분노: `frowning`, `angry expression`, `clenched teeth`
- 긴장: `nervous expression`, `sweat drop`, `biting lip`
- 공포: `frightened expression`, `trembling`, `pale face`

### 포즈 설명 원칙

- **구체적 신체 부위 기준**: "손을 들었다"가 아니라 "right hand raised to chin height"
- **카메라 앵글 연동**: 클로즈업이면 상반신/얼굴만 명세, 롱샷이면 전신 자세 명세
- **패널 플래너 의존**: 각도(측면/정면/부감)는 panel-planner가 결정 → 결정 수신 후 반영

### 의상 연속성 관리

같은 날 다른 장면이면 의상이 같아야 한다 (특별한 이유 없으면). 의상 변경이 발생하면 스토리에 근거가 있는지 확인하고, 없으면 `⚠️ 의상 변경 이유 없음 — 수정 필요` 표시.

### 네거티브 프롬프트

각 캐릭터 프롬프트에 네거티브를 반드시 포함:
```
negative: deformed, bad anatomy, wrong proportions, extra limbs, blurry, low quality, ugly, duplicate
```

## 출력 형식

**`_webtoon/{slug}/02_characters.md`:**

```markdown
# 캐릭터 디자인 프롬프트
에피소드: {번호}

## 기본 캐릭터 프롬프트 (일관성 레퍼런스)

### {캐릭터명}
```
{기본 프롬프트}
```
- 등신: {N}등신
- 스타일 특징: {키워드}

## 장면별 캐릭터 프롬프트

### 장면 N — {장면 제목}
**{캐릭터명}** (상태: {감정/포즈 한 줄 요약})
```
{기본 프롬프트}, {장면별 추가}
```
negative: {네거티브}

## 팀 통신 기록
{panel-planner, dialogue-editor로부터 수신한 피드백 및 반영 내용}
```
