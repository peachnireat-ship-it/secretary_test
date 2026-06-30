---
name: api-doc-writing
description: 분석된 함수 목록을 읽고 한국어 API 문서를 작성하는 스킬. 함수 목적, 파라미터, 반환값, 에러, 주의사항을 표준 포맷으로 작성한다. doc-writer 에이전트가 사용한다.
---

## 문서 작성 원칙

**정확성 우선**: 소스 코드에서 확인한 동작만 기록한다. 불확실하면 소스를 읽어 확인하고, 그래도 불명확하면 `⚠️ 소스 확인 필요` 태그를 남긴다.

**실용성 우선**: 개발자가 함수를 처음 사용할 때 필요한 정보를 즉시 제공한다. 명백한 사항("id는 고유합니다")은 쓰지 않는다.

**주의사항은 비관적으로**: 잘못 사용하면 버그가 나는 부분을 명확히 경고한다.

## 함수 문서 템플릿

```markdown
#### {함수명}

```js
{함수명}({파라미터}: {타입}): {반환타입}
```

{함수 목적 — 1~2줄. 무엇을 하는지, 언제 쓰는지}

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| {이름} | {타입} | 필수/선택 | {설명} |

**반환값**
{반환값 형태 또는 타입 + 간단한 설명}

**에러**
- {에러 메시지 또는 조건}: {언제 발생하는지}

**주의**
- {잘못 사용하기 쉬운 부분, 사이드 이펙트, 필수 전제조건}
```

파라미터/에러/주의 섹션은 해당 내용이 없으면 생략한다.

## secretary_test 특수 동작 — 반드시 문서화

### 사용자별 키 격리
get/save/add/update/delete 계열 함수는 모두 "현재 로그인 사용자 ID별로 데이터가 격리됩니다"를 명시한다. 내부적으로 `${key}_${user.id}` 패턴 사용.

### askClaude의 raw 옵션
- `raw: false` (기본): `stripNonKorean()` 적용 → 한국어·숫자·기본 부호만 남김
- `raw: true` 필수인 경우: JSON 파싱 결과를 기대하는 모든 호출 (`buildTaskExtractionSystem`, `buildProjectDelaySystem`의 update_project 응답 등)
- 주의 섹션에 "JSON 응답을 기대할 때는 반드시 `{ raw: true }` 전달"을 명시한다

### Pyannote 함수 null 반환
`diarizeWithPyannote`, `convertToMonoViaServer`는 Pyannote 서버 URL 미설정이거나 서버 오류 시 `null` 반환. 호출자는 null 체크 후 LLM fallback 필요. 주의 섹션에 명시한다.

### 샘플 데이터 자동 초기화
`getSchedules`, `getClients`, `getProjects`, `getMessages`, `getHistories`는 해당 키가 없으면 샘플 데이터를 자동으로 설정하고 반환한다. 새 사용자/계정 전환 시 동작에 영향.

## 모듈별 인트로 작성

각 파일 섹션 상단에 1~3줄 모듈 개요를 추가한다:
- `storage.js`: AsyncStorage 기반 로컬 CRUD. 서버 없음. 사용자별 키 격리.
- `claude.js`: AI 호출 진입점 + 시스템 프롬프트 빌더. Groq/Grok 공급자 자동 선택.
- `groqStt.js`: Groq Whisper STT + AI 화자 분리. Pyannote 서버 선택적.
