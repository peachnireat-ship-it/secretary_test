---
name: code-parsing
description: JavaScript/TypeScript 소스 파일에서 export된 함수를 추출하는 스킬. 함수 시그니처, 파라미터, 반환값, 에러 케이스, 의존 함수를 정적 분석으로 파악한다. endpoint-analyzer 에이전트가 사용한다.
---

## export 함수 식별

JavaScript에서 export 패턴:
- `export async function fnName(...)` — 비동기 직접 export
- `export function fnName(...)` — 동기 직접 export
- `export const fnName = async (...) =>` — const arrow export

**포함 기준**: `export` 키워드가 있는 함수 선언
**제외 기준**: export 없는 내부 helper (`function`, `const` 등). 예: `callGroq`, `formatSec`, `isValidSegment`, `buildTranscript`, `polishTranscript`, `getSample*`, `todayStr`, `userKey`, `fmtDate`

## 파라미터 타입 추론

JSDoc 없이 코드 문맥에서 추론한다:

| 패턴 | 추론 타입 |
|------|----------|
| 이름이 `id` | string |
| 이름이 `fields`/`changes` | object |
| 이름이 `count` | number |
| `JSON.parse(x)` | string |
| `x.id`, `x.title` 접근 | object |
| `= null` 기본값 | `타입 \| null` |
| `{ raw = false } = {}` | `{raw?: boolean}` (옵션 오브젝트) |
| AsyncStorage `setItem(key, JSON.stringify(x))` | x의 원형 타입 |

## 반환값 추론

| 코드 패턴 | 반환 타입 |
|----------|---------|
| `return JSON.parse(raw)` | 해당 데이터 모델 배열 |
| `return list.filter(...)` / `list.map(...)` | 동일 타입 배열 |
| `return { id, name, ... }` | 명시된 오브젝트 |
| `return AsyncStorage.setItem(...)` | `Promise<void>` |
| `return res.json()` | API 응답 오브젝트 |
| `return null` (catch 블록) | null (에러 은닉) |
| `return raw ? result : stripNonKorean(result)` | string |

## 에러 케이스 식별

- `throw new Error('...')` → 명시적 에러 (메시지 그대로 기록)
- `if (!apiKey) throw new Error('API_KEY_MISSING')` → 전제조건 에러
- `if (!res.ok) { throw new Error(...) }` → HTTP 에러
- `try { ... } catch { return null }` → null 반환 (에러 은닉 — 호출자가 null 체크 필요)

## 함수 그룹화 (storage.js 기준)

1. **인증/계정**: `login`, `logout`, `getCurrentUser`, `switchAccount`, `getTestAccounts`
2. **API 키/설정**: `getApiKey`, `setApiKey`, `getGrokApiKey`, `setGrokApiKey`, `getAiProvider`, `setAiProvider`, `getPyannoteUrl`, `setPyannoteUrl`
3. **일정**: `getSchedules`, `saveSchedules`, `addSchedule`, `updateSchedule`, `deleteSchedule`
4. **거래처**: `getClients`, `saveClients`, `addClient`, `updateClient`
5. **히스토리**: `getHistories`, `saveHistories`, `addHistory`, `updateHistory`, `deleteHistory`, `getHistoriesByClient`
6. **프로젝트**: `getProjects`, `saveProjects`, `addProject`, `updateProject`, `deleteProject`
7. **메세지**: `getMessages`, `saveMessages`, `addMessage`, `addMessageForUser`, `updateMessage`, `updateMessageForUser`, `deleteMessage`
8. **회의록**: `getMeetingRecords`, `saveMeetingRecords`, `addMeetingRecord`, `updateMeetingRecord`, `deleteMeetingRecord`
9. **기타**: `getWorkTopics`, `saveWorkTopics`, `getClientFavorites`, `toggleClientFavorite`, `getUserProfile`, `saveUserProfile`

## 사용자별 키 격리 패턴

`storage.js`의 `userKey(base)` 내부 헬퍼는 `${base}_${user.id}` 형태의 키를 반환한다. get/save 계열 모든 데이터 함수가 이를 사용 → 문서에 "현재 로그인 사용자 ID별로 격리됨" 반드시 명시.
