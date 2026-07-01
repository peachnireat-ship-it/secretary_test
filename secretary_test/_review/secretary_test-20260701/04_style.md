# 코드 스타일 감사 리포트

대상: `C:\Users\user\secretary_test`
날짜: 2026-07-01
점수: 63/100

---

## 요약

`useSwipeClose` 훅이 2개 화면에 코드 복사로 중복되어 있으며, `SettingsScreen`의 Groq/Grok 관련 함수·계산식이 동일 패턴을 그대로 반복한다. `ClientScreen` 내 구조 분해 변수명(`c, h, m, p, favs, me`)처럼 단일 문자 이름이 복잡한 로직 안에서 가독성을 저하시키는 사례가 여럿 발견된다.

---

## 발견 사항

### [심각도: HIGH] useSwipeClose 훅 완전 중복

- 위치: `src/screens/ScheduleScreen.js:40-62` / `src/screens/ClientScreen.js:14-36`
- 설명: 드래그 닫기 훅 `useSwipeClose`가 23줄 전체를 두 파일에 복사·붙여넣기 형태로 중복 정의되어 있다. 로직·임계값(`dy > 80`, `vy > 0.8`, `duration: 220`, `bounciness: 4`)이 완전히 동일하다.
- 권고: `src/hooks/useSwipeClose.js`로 추출하여 두 화면에서 import한다.

```js
// 현재: ScheduleScreen.js와 ClientScreen.js에 동일하게 존재
function useSwipeClose(onClose) { /* 23줄 */ }

// 개선: src/hooks/useSwipeClose.js 단일 파일로 분리
export function useSwipeClose(onClose) { /* ... */ }
```

---

### [심각도: HIGH] SettingsScreen — Groq/Grok 처리 로직 반복

- 위치: `src/screens/SettingsScreen.js:39-102`
- 설명: `handleSave` / `handleSaveGrok`, `handleClear` / `handleClearGrok`, 그리고 `displayKey` / `displayGrokKey` 마스킹 계산이 각각 동일 구조를 두 번 반복한다. 서로 다른 것은 참조하는 상태 변수명과 색상뿐이다.

```js
// handleSave (39-45행) vs handleSaveGrok (54-59행) — 구조 동일
async function handleSave() {
  const trimmed = apiKey.trim();
  if (!trimmed) { Alert.alert('오류', 'API 키를 입력해주세요.'); return; }
  await setApiKey(trimmed);
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
}

// displayKey (96-98행) vs displayGrokKey (100-102행) — 로직 동일
const displayKey = masked && apiKey.length > 8
  ? apiKey.slice(0, 6) + '•••••••••••••••' + apiKey.slice(-4)
  : apiKey;
```

- 권고: 공통 로직을 헬퍼로 추출한다.

```js
function maskApiKey(key, isMasked) {
  return isMasked && key.length > 8
    ? key.slice(0, 6) + '•••••••••••••••' + key.slice(-4)
    : key;
}

function createApiKeyHandlers(getter, setter, savedSetter) {
  async function handleSave() { /* ... */ }
  async function handleClear(label) { /* ... */ }
  return { handleSave, handleClear };
}
```

---

### [심각도: HIGH] storage.js — login / switchAccount 중복 구조

- 위치: `src/services/storage.js:29-51`
- 설명: `login(email, password)`과 `switchAccount(accountId)` 두 함수가 "계정 탐색 → 없으면 throw → user 객체 생성 → AsyncStorage 저장 → return user" 흐름을 동일하게 반복한다. user 객체를 만드는 6개 필드 목록도 동일하다.

```js
// login:33 / switchAccount:48 — 동일 패턴 반복
const user = { id: account.id, email: account.email, name: account.name,
               role: account.role, team: account.team };
await AsyncStorage.setItem(KEYS.currentUser, JSON.stringify(user));
return user;
```

- 권고: `saveAndReturnUser(account)` 내부 함수로 추출한다.

```js
async function saveAndReturnUser(account) {
  const user = { id: account.id, email: account.email, name: account.name,
                 role: account.role, team: account.team };
  await AsyncStorage.setItem(KEYS.currentUser, JSON.stringify(user));
  return user;
}
```

---

### [심각도: MED] groqStt.js — countHint 생성 코드 중복

- 위치: `src/services/groqStt.js:55-57` / `86-88`
- 설명: `diarizeSegments`와 `rediarizeTranscript` 두 함수 모두 동일한 3줄 `countHint` 문자열을 독립적으로 생성한다.
- 권고:

```js
function buildCountHint(speakerCount) {
  return speakerCount
    ? `\n\n※ 이 회의 참석자는 총 ${speakerCount}명입니다. 반드시 ${speakerCount}명의 화자로만 구분하세요.`
    : '';
}
```

---

### [심각도: MED] 복잡한 구조 분해에 단일 문자 변수명 사용

- 위치: `src/screens/ClientScreen.js:100`
- 설명: `const [c, h, m, p, favs, me] = await Promise.all([...])` 형태로 6개 데이터를 단일 문자로 받는다. `c`가 clients인지 clients 단건인지, `p`가 projects인지 provider인지 코드 내 다른 곳과 혼동된다. (`SettingsScreen`에서 `p`는 provider 상태, `ClientScreen`에서 `p`는 projects)
- 권고:

```js
// 현재
const [c, h, m, p, favs, me] = await Promise.all([...]);

// 개선
const [clients, histories, meetingRecords, projects, favorites, currentUser]
  = await Promise.all([...]);
```

---

### [심각도: MED] todayStr() 함수 두 파일에 중복 정의

- 위치: `src/screens/HomeScreen.js:39-42` / `src/services/storage.js:378-382`
- 설명: `HomeScreen`에 `todayStr()`(인자 없음)이, `storage.js`에 `todayStr(offsetDays = 0)`(인자 있음)이 별도 정의되어 있다. 날짜 포맷 로직이 동일하며, `HomeScreen`이 storage의 함수를 재사용하거나 공통 유틸로 분리할 수 있다.
- 권고: `src/utils/dateUtils.js` 유틸 파일을 만들어 단일 출처로 관리한다.

---

### [심각도: MED] ScheduleScreen — load() 이중 등록

- 위치: `src/screens/ScheduleScreen.js:178` / `196`
- 설명: `useEffect(() => { load(); }, [])` (마운트 1회)와 `useFocusEffect(useCallback(() => { load(); }, []))` (포커스마다)가 모두 존재한다. 초기 마운트에서 `load()`가 2번 연속 호출된다.
- 권고: 마운트 시 로드는 `useFocusEffect` 하나로 충분하므로 `useEffect` 쪽 `load()` 호출을 제거한다.

---

### [심각도: MED] 상태 리셋 클러스터 — 한 줄에 8개 setter

- 위치: `src/screens/MessageScreen.js:134-136` / `src/screens/ClientScreen.js:186`
- 설명: `handleAdd` 완료 후 폼 초기화를 위해 8개 setter를 한 줄에 연속 호출한다. 가독성이 낮고 필드 누락을 발견하기 어렵다.

```js
// 현재 (MessageScreen.js:134-136)
setNewSender(''); setNewCompany(''); setNewSubject('');
setNewContent(''); setNewPriority('일반'); setNewStatus('미확인');
setNewDirection('sent'); setNewToId(null);
```

- 권고: 개별 상태를 폼 객체 하나(`newForm`)로 묶고 단일 `resetForm()` 함수로 초기화한다.

---

### [심각도: LOW] 매직 넘버 여러 곳에 산재

- 위치:
  - `useSwipeClose` (ScheduleScreen:51, ClientScreen:25): `80`, `0.8`, `220`, `4`
  - `storage.js:397-437`: `86400000` (밀리초 단위 하루)가 약 10회 반복
  - `ScheduleScreen.js:145`: `60` (캘린더 스와이프 임계값)
- 권고: 상수로 추출한다.

```js
const ONE_DAY_MS = 86400000;
const SWIPE_CLOSE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.8;
const CALENDAR_SWIPE_THRESHOLD = 60;
```

---

### [심각도: LOW] App.js:101 — 매우 긴 단일 라인

- 위치: `App.js:101`
- 설명: `tabColor` 함수 내 맵 객체가 한 줄에 87자 이상으로 작성되어 있다. 줄이 스크롤 없이 읽히지 않는다.
- 권고: 멀티라인 형태로 정렬한다.

```js
function tabColor(name) {
  const map = {
    홈: C.gold,
    일정: C.accentBlue,
    거래처: C.accentTeal,
    프로젝트: C.red,
    메세지: C.accentPurple,
    회의록: C.accentTeal,
    설정: C.textSecondary,
  };
  return map[name] || C.textPrimary;
}
```

---

### [심각도: LOW] groqStt.js — 주석 위치 오류 및 eslint-disable 중복

- 위치: `src/services/groqStt.js:102-131`
- 설명:
  1. 102행 주석("pyannote 세그먼트와 Whisper 세그먼트를 병합…")이 `convertToMonoViaServer` 함수 위에 있으나, 실제로는 아래의 `diarizeWithPyannote` 또는 `buildTranscript`를 설명하는 내용이다. 함수 설명이 잘못된 위치에 배치되었다.
  2. `eslint-disable-next-line import/namespace` 주석이 127행과 130행에 2회 반복된다. ESLint 설정을 수정하거나 FileSystem API 사용 패턴을 변경하는 것이 근본 해결책이다.
- 권고: 주석을 올바른 함수 위로 이동시키고, eslint 규칙 예외가 필요한 이유를 팀과 공유한다.

---

### [심각도: LOW] ClientScreen — 히스토리 필드에 불명확한 h 접두사

- 위치: `src/screens/ClientScreen.js:77-80`
- 설명: `hType`, `hTitle`, `hContent`, `hResult` — `h` 접두사가 "history"를 뜻한다는 것을 알아야만 이해된다. 같은 화면 내 `hh` / `mm` (HomeScreen에서 시·분 약어)과의 혼동 가능성도 있다.
- 권고: `historyType`, `historyTitle`, `historyContent`, `historyResult`로 변경한다.

---

## 코드 메트릭 요약

| 지표 | 측정값 | 권장값 |
|------|--------|--------|
| 평균 함수 길이 | ~14줄 | <20줄 |
| 최대 함수 길이 | `buildTranscript` ~45줄 | <50줄 |
| 최대 중첩 깊이 | 4단계 (`buildTranscript`, calPanResponder release) | <4단계 |
| 최고 복잡도 함수 | `buildTranscript` (추정 11) | <10 |
| 중복 코드 비율 | ~4% (`useSwipeClose` 23줄 + SettingsScreen 이중 패턴) | <5% |
| 파일별 최대 줄 수 | ScheduleScreen.js 추정 500+ | <300줄 |

---

## 우수 코드 패턴

**1. KEYS 상수 중앙화 (storage.js:3-18)**
AsyncStorage 키를 `KEYS` 객체에 집중 관리하여 오타 위험을 없앤다. 키 버전 관리(`_v1`, `_v3`)도 명확하다.

**2. 불리언 상태 변수 명명 (MessageScreen.js, SettingsScreen.js)**
`showAdd`, `editMode`, `aiLoading`, `grokMasked`, `pyannoteChecking` 등 상태가 무엇인지 이름에서 즉시 읽힌다. is/has 접두사를 쓰지 않아도 의도가 명확하다.

**3. 색상 맵 함수 패턴 (statusColor, priorityColor, tagColor)**
`const map = { ... }; return map[key] || fallback;` 패턴이 일관되게 사용된다. switch 문 없이 간결하고 확장하기 쉽다.

**4. userKey 헬퍼 (storage.js:89-92)**
사용자 격리 키를 생성하는 로직을 `userKey(base)` 한 줄로 추상화한 설계가 깔끔하다.

**5. CRUD 함수 명명 일관성 (storage.js 전체)**
`getX`, `saveX`, `addX`, `updateX`, `deleteX` 동사 패턴이 모든 엔티티에서 균일하게 적용된다.

---

## 종합 평가

**점수: 63/100**

React Native/Expo 코드베이스 전반에서 camelCase, StyleSheet.create 분리, 상수 대문자화 등 언어 컨벤션은 잘 지켜진다. 핵심 약점은 두 가지다.

첫째, **DRY 위반**이 세 군데에서 발생한다. `useSwipeClose` 훅 복사, `storage.js`의 login/switchAccount 중복, `SettingsScreen`의 Groq/Grok 대칭 패턴이 모두 단순 추출로 해결 가능하다.

둘째, **단일 문자 변수명**이 짧은 콜백 내부를 벗어나 복잡한 구조 분해와 다중 분기 로직에서도 사용된다. 의도를 표현하는 이름으로 교체하면 유지보수 진입 비용이 크게 낮아진다.

우선순위 개선 순서:
1. `useSwipeClose` → `src/hooks/useSwipeClose.js` 추출 (즉시 효과)
2. `SettingsScreen` Groq/Grok 핸들러 통합 (중복 제거)
3. `ClientScreen:100` 구조 분해 변수명 명확화
4. `storage.js` `saveAndReturnUser` 헬퍼 추출
