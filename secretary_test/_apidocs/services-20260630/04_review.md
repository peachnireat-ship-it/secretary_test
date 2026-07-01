# 리뷰 보고서: secretary_test API 문서
리뷰일: 2026-06-30
리뷰어: doc-reviewer (소스 교차 검증 기반)

---

## 요약

- 소스 함수: 65개 / 문서화: 65개 — 누락 0개
- Critical: 0건 / Major: 1건 / Minor: 5건
- 완성도 점수: 85/100

---

## 검증 방법

- `storage.js` (391줄), `claude.js` (237줄), `groqStt.js` (228줄) 전체 읽기
- `01_endpoints.md`, `02_docs.md`, `03_examples.md` 항목별 소스 대조

---

## 함수 수 검증

| 파일 | 소스 export | 01_endpoints 기재 | 02_docs 문서화 |
|------|------------|-----------------|--------------|
| storage.js | 51개 | 51개 | 51개 |
| claude.js | 9개 | 9개 | 9개 |
| groqStt.js | 5개 | 5개 | 5개 |
| **합계** | **65개** | **65개** | **65개** |

누락 함수: **없음**

---

## 발견 사항

### 🔴 Critical (문서 오류)

없음.

`raw:true` 필수 케이스(태스크 추출, 일정 생성, 프로젝트 업데이트) 모두 올바르게 문서화됨.  
사용자별 키 격리(`_${user.id}`) 모든 해당 섹션에 언급됨.  
`diarizeWithPyannote` null 반환 케이스 `02_docs.md`에 명확히 기술됨.

---

### 🟡 Major (누락/불완전)

#### 1. `diarizeSegments` — 필터 후 빈 세그먼트 동작 설명 오류

**위치**: `02_docs.md` `diarizeSegments` 주의 섹션

**문서 기술**:
> "필터 후 세그먼트가 없으면 `''` 반환."

**실제 소스** (`groqStt.js` 46–73줄):
```js
export async function diarizeSegments(segments, speakerCount = null) {
  if (!segments?.length) return '';   // ← 여기서만 즉시 '' 반환

  const input = segments
    .filter(isValidSegment)           // ← 필터 후 빈 배열이 되어도 체크 없음
    .map((s) => `...`)
    .filter((l) => l)
    .join('\n');

  return askClaude(                   // ← input이 ''이어도 API 호출함
    [{ role: 'user', content: input }],
    ...
  );
}
```

**실제 동작**: `segments` 배열이 비어 있거나 `null`인 경우에만 즉시 `''`를 반환한다. segments 배열에 원소가 있더라도 모두 `isValidSegment()` 필터를 통과하지 못하면 `input = ''`이 되고, 그 상태로 `askClaude('')`를 호출한다. AI가 빈 입력에 대해 응답하는 결과를 반환하지 `''`을 반환하지 않는다.

**수정 방향**: "세그먼트 배열이 비어 있거나 null이면 즉시 `''` 반환. 유효 세그먼트가 모두 필터링되어도 `askClaude('')`가 호출된다." 로 수정.

---

### 🟢 Minor (개선 권고)

#### 1. `normalizeAIDates` — 반환 타입에 `null` 누락

**위치**: `02_docs.md` 함수 시그니처

**문서**: `normalizeAIDates(text: string | null | undefined): string | undefined`

**실제 소스** (`claude.js` 200–204줄):
```js
export function normalizeAIDates(text) {
  if (!text) return text;   // text가 null이면 null 반환
  return text.replace(...);
}
```

`null` 입력 시 `null`을 반환하므로 반환 타입은 `string | null | undefined`여야 한다. 현재 `undefined`만 표기됨.

**수정**: `string | null | undefined`로 변경.

---

#### 2. `updateMessageForUser` — "raw" 용어 혼동

**위치**: `01_endpoints.md` `updateMessageForUser` 반환값 주석

**문서**: `Promise<void>` (raw 없으면 조기 return)

**실제 소스** (`storage.js` 275–282줄):
```js
export async function updateMessageForUser(userId, id, changes) {
  const key = `${KEYS.messages}_${userId}`;
  const raw = await AsyncStorage.getItem(key);   // ← 이 raw (AsyncStorage 결과)
  if (!raw) return;
  ...
}
```

여기서 `raw`는 AsyncStorage의 조회 결과 변수명이지, `askClaude()`의 `raw:true` 옵션이 아니다. 독자가 API 키워드 `raw:true`와 혼동할 수 있다.

`02_docs.md`에서는 "대상 사용자의 메세지 데이터가 없으면(키 없음) 아무 작업 없이 조기 반환"으로 올바르게 설명하고 있어 `02_docs.md`는 수정 불필요. `01_endpoints.md` 주석만 명확화 권고.

---

#### 3. `addMessage` / `addMessageForUser` — 명시적 `id` override 미언급

**위치**: `02_docs.md` `addMessage` 주의 섹션

**문서**: "id·createdAt 자동 생성"

**실제 소스** (`storage.js` 251–256줄):
```js
export async function addMessage(message) {
  const list = await getMessages();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...message }, ...list];
  ...
}
```

`...message`가 자동 생성 id 뒤에 spread되므로, `message` 객체에 `id`를 명시하면 자동 생성값을 override한다. `03_examples.md`의 메세지 전송 예제가 이 패턴(`id: sentMsgId`)을 실제로 사용하지만, 문서에는 이 동작이 설명되지 않았다.

**수정 권고**: "id·createdAt은 자동 생성된다. 단, message 객체에 `id`를 명시적으로 전달하면 자동 생성값을 덮어쓴다 (sent/received 메세지 ID 연동 패턴에 활용)."

---

#### 4. `addMeetingRecord` — 예제에서 `projectId` 누락

**위치**: `03_examples.md` `addMeetingRecord` 예제

**문서/모델**: `{ title, transcript, summary, source, clientIds, projectId, tasks }` — `projectId` 포함

**예제 코드**:
```js
const updated = await addMeetingRecord({
  title: '2026-07-10 · recording',
  source: 'recording',
  summary: aiSummary,
  transcript: diarizedText,
  tasks: [...],
  clientIds: ['client_id_1'],
  // projectId 없음
});
```

함수 자체는 스프레드로 받으므로 작동하지만, 문서화된 필수 파라미터 `projectId`가 예제에서 빠져 있다. 회의록과 프로젝트가 연결되지 않는 케이스에는 `projectId: ''` 또는 `projectId: null`을 명시할 것을 권고.

---

#### 5. `diarizeSegments` — 01_endpoints.md 반환값 설명 모호

**위치**: `01_endpoints.md` `diarizeSegments` 반환값

**문서**: `(빈 세그먼트면 '\''\'')`

"빈 세그먼트"가 "segments 배열이 빈 경우"인지 "유효 세그먼트가 없는 경우"인지 모호. Major 항목 #1과 연관. `01_endpoints.md`에도 "segments 배열이 비거나 null인 경우에만 `''` 반환"으로 명확화 권고.

---

## 예제 검증 요약

| 예제 대상 | 검증 결과 |
|---------|---------|
| login/logout/getTestAccounts/switchAccount | 소스 일치 ✓ |
| getSchedules + addSchedule + updateSchedule + deleteSchedule | 소스 일치 ✓ |
| getClients + addClient + updateClient (deleteClient 대체 패턴) | 소스 일치 ✓ |
| getHistories + addHistory + updateHistory + deleteHistory | 소스 일치 ✓ |
| getProjects + addProject + updateProject + deleteProject | 소스 일치 ✓ |
| addMessage + addMessageForUser (id override 패턴) | 동작 정확, 문서 보완 필요 (Minor #3) |
| updateMessage + updateMessageForUser + deleteMessage | 소스 일치 ✓ |
| getMeetingRecords + addMeetingRecord + updateMeetingRecord + deleteMeetingRecord | projectId 누락 주의 (Minor #4) |
| askClaude raw:true JSON 파싱 패턴 (3종) | 소스 일치 ✓, raw:true 모두 포함 |
| fixForeignWordsInText | 소스 일치 ✓ |
| buildScheduleSystem + buildProjectDelaySystem + buildTaskExtractionSystem + buildClientSystem | 소스 일치 ✓ |
| transcribeAudio + diarizeWithPyannote + diarizeSegments (fallback 패턴) | 소스 일치 ✓ |
| rediarizeTranscript | meetingSummarySystemPrompt 미정의 변수 사용 (문맥상 이해 가능, 허용) |
| convertToMonoViaServer + diarizeWithPyannote 단독 사용 | 소스 일치 ✓ |

---

## 점수 산정

| 항목 | 건수 | 감점 | 소계 |
|------|------|------|------|
| 기준점 | — | — | 100 |
| 🔴 Critical | 0건 | -10점/건 | 0 |
| 🟡 Major | 1건 | -5점/건 | -5 |
| 🟢 Minor | 5건 | -2점/건 | -10 |
| 함수 누락 | 0개 | -3점/개 | 0 |
| **최종 점수** | | | **85/100** |
