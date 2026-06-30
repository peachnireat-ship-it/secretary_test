---
name: example-generation
description: API 문서와 실제 화면 소스 코드를 읽고 각 함수의 사용 예제를 생성하는 스킬. 실제 화면 코드에서 패턴을 추출하고, 없으면 문서 기반으로 직접 작성한다. example-generator 에이전트가 사용한다.
---

## 예제 우선순위

1. **실제 화면 패턴** (최우선): 화면 파일에서 실제 사용 코드를 추출하여 예제로 사용
2. **문서 기반 직접 작성**: 화면에 사용 패턴 없는 함수는 02_docs.md 기반으로 자연스럽게 작성

예제 상단에 반드시 출처를 명시한다:
- `// ScheduleScreen.js 패턴 기반`
- `// 직접 작성 예제`

## 예제 작성 기준

**필수 포함 요소:**
- `async/await` 패턴 (콜백/Promise.then 금지)
- `try/catch` 에러 처리 (단순 조회 함수는 생략 가능)
- 의미 있는 변수명 (x, result, data 금지)

**그룹 작성 권장:**
단일 함수보다 실제 사용 시나리오 단위로 묶어 작성한다. 예:
```js
// 일정 추가 후 목록 갱신
const updated = await addSchedule({ ... });
setSchedules(updated);
```

## secretary_test 예제 작성 주의사항

### raw:true 필수 케이스
JSON 응답을 기대하는 askClaude 호출은 반드시 `{ raw: true }` 포함:
```js
// 태스크 추출 — raw:true 없으면 JSON 깨짐
const raw = await askClaude(
  [{ role: 'user', content: transcript }],
  buildTaskExtractionSystem(),
  { raw: true }
);
const tasks = JSON.parse(raw);
```

### 공급자 중립 AI 호출
`askClaude`는 내부에서 현재 설정된 provider(groq/grok)를 자동 선택하므로, 예제에서 provider 분기 코드를 직접 작성하지 않는다.

### 사용자별 격리 맥락 제공
get* 함수 예제에 `await getCurrentUser()` 선행 호출을 보여주어 격리 컨텍스트를 명확히 한다.

### Pyannote null 처리
```js
const diarized = await diarizeWithPyannote(uri, mime, segments);
if (!diarized) {
  // Pyannote 서버 없음 → LLM fallback
  return diarizeSegments(segments, speakerCount);
}
```

## 함수별 화면 매핑 (참조 위치)

| 함수 | 주요 사용 화면 |
|------|--------------|
| `getSchedules`, `addSchedule`, `updateSchedule`, `deleteSchedule` | ScheduleScreen.js |
| `getClients`, `addClient`, `updateClient` | ClientScreen.js |
| `getHistories`, `addHistory`, `getHistoriesByClient` | ClientScreen.js |
| `getProjects`, `addProject`, `updateProject`, `deleteProject` | ProjectScreen.js |
| `getMessages`, `addMessageForUser`, `updateMessage` | MessageScreen.js |
| `getMeetingRecords`, `addMeetingRecord`, `updateMeetingRecord` | MeetingScreen.js |
| `getApiKey`, `setApiKey`, `getAiProvider`, `setAiProvider` | SettingsScreen.js |
| `askClaude`, `buildScheduleSystem`, `buildClientSystem` | ScheduleScreen.js, ClientScreen.js |
| `buildProjectDelaySystem` | ProjectScreen.js |
| `buildTaskExtractionSystem` | MeetingScreen.js |
| `fixForeignWordsInText` | MeetingScreen.js |
| `transcribeAudio`, `diarizeSegments`, `diarizeWithPyannote` | MeetingScreen.js |
