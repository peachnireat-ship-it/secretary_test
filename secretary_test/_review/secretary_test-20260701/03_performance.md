# 성능 감사 리포트

대상: `C:\Users\user\secretary_test`
날짜: 2026-07-01
점수: 44/100

---

## 요약

AsyncStorage 모든 CRUD에서 `getCurrentUser()`가 중복 호출되는 구조적 병목이 최상위 위험이다.
ScheduleScreen 달력 그리드는 30개 이상의 state 변수 중 어느 하나만 바뀌어도 O(셀 수 × 항목 수) 필터를 매 렌더마다 반복하며, 컴포넌트 마운트 시 `load()`가 두 번 동시에 실행되어 AsyncStorage를 이중으로 읽는다.

---

## 발견 사항

---

### [심각도: HIGH] userKey() → getCurrentUser() 중복 AsyncStorage 읽기

- 위치: `src/services/storage.js:89-92`
- 설명:
  모든 저장소 함수(`getSchedules`, `addSchedule`, `deleteSchedule`, `updateSchedule`, `getClients`, `addClient`, `updateClient`, `getHistories`, `addHistory`, `updateHistory`, `deleteHistory`, `getProjects`, `getMeetingRecords`, `getClientFavorites`, `toggleClientFavorite`)가 내부적으로 `userKey()`를 호출하고, `userKey()`는 매번 `getCurrentUser()` → `AsyncStorage.getItem(KEYS.currentUser)`을 실행한다.

  ScheduleScreen의 `load()` 함수는 `Promise.all`로 5개 함수를 병렬 실행하는데, 각 함수가 독립적으로 `getCurrentUser()`를 호출하므로 단 한 번의 `load()` 호출에서 `current_user_v1` 키를 5회 병렬 읽는다.

  ```js
  // storage.js:89
  async function userKey(base) {
    const user = await getCurrentUser(); // ← 모든 CRUD에서 반복 호출
    return user ? `${base}_${user.id}` : base;
  }
  ```

- 영향:
  쓰기 1회(예: `addSchedule`)는 내부적으로 AsyncStorage를 최소 4회 호출한다
  (getCurrentUser × 2 + getItem + setItem). 사용자가 일정을 추가하거나 수정할 때마다
  불필요한 I/O가 2배로 발생하며, 저가 기기에서 눈에 띄는 지연으로 나타난다.

- 권고:
  앱 레벨에서 현재 사용자를 인메모리 캐시로 보관하고, storage 함수들은 캐시를 참조하도록 수정한다.

  ```js
  let _cachedUser = null;
  export async function getCurrentUser() {
    if (_cachedUser !== undefined) return _cachedUser;
    const raw = await AsyncStorage.getItem(KEYS.currentUser);
    _cachedUser = raw ? JSON.parse(raw) : null;
    return _cachedUser;
  }
  export async function login(...) {
    // ...저장 후
    _cachedUser = user;
  }
  export async function logout() {
    _cachedUser = null;
    await AsyncStorage.removeItem(KEYS.currentUser);
  }
  ```

---

### [심각도: HIGH] ScheduleScreen: 달력 그리드 O(셀×항목) 무한 재계산

- 위치: `src/screens/ScheduleScreen.js:384-466`
- 설명:
  `buildMonthGrid(calYear, calMonth)` 호출과 그리드 내부의 4개 `.filter()` 연산이
  useMemo 없이 JSX에 직접 위치한다. ScheduleScreen에는 30개 이상의 `useState`가 있으므로
  텍스트 입력 한 글자, 태그 선택, 모달 개폐 등 어떤 상태 변경이라도 달력 전체를 다시 연산한다.

  42개 셀 × (projects.filter × 2 + schedules.filter × 3) = 최대 42 × 5N 연산이
  UI 인터랙션마다 반복된다.

  ```js
  // 렌더 함수 내부 (useMemo 없음)
  {buildMonthGrid(calYear, calMonth).map((cell, i) => {
    const rangeProjs = projects.filter((p) => { ... });      // O(N)
    const rangeSchedules = schedules.filter((sc) => { ... }); // O(N)
    const cellSchedules = schedules.filter((sc) => { ... }); // O(N)
    const deadlineProjs = projects.filter((p) => { ... });   // O(N)
  ```

- 영향:
  모달 입력 중(TextInput onChange 등) 달력 그리드가 매 키 입력마다 재계산되어
  UI 프레임 드롭이 발생한다. 일정·프로젝트 데이터가 수십 건 이상이면 즉각 체감된다.

- 권고:
  ```js
  const monthGrid = useMemo(
    () => buildMonthGrid(calYear, calMonth),
    [calYear, calMonth]
  );

  // 셀별 데이터도 useMemo로 사전 인덱싱
  const schedulesByDate = useMemo(() => {
    const map = {};
    schedules.forEach((sc) => {
      const key = sc.date;
      if (!map[key]) map[key] = [];
      map[key].push(sc);
    });
    return map;
  }, [schedules]);
  ```

---

### [심각도: HIGH] ScheduleScreen: 마운트 시 load() 이중 실행

- 위치: `src/screens/ScheduleScreen.js:178, 196`
- 설명:
  컴포넌트 최초 마운트 + 포커스 시 `load()`가 두 번 동시 실행된다.

  ```js
  useEffect(() => { load(); }, []);         // 라인 178: 마운트 시
  useFocusEffect(useCallback(() => { load(); }, [])); // 라인 196: 포커스 시
  ```

  앱 시작 직후 일정 탭이 활성화될 때 두 `load()`가 거의 동시에 실행되며, 각각
  `getSchedules + getProjects + getClients + getMeetingRecords + getCurrentUser`
  5개의 AsyncStorage 작업을 포함하므로 총 10개 이상의 불필요한 읽기가 발생한다.

- 영향:
  초기 로딩 시 AsyncStorage 읽기가 2배 발생한다. 경쟁 조건(race condition)으로 두
  번째 load()가 첫 번째보다 나중에 완료되면 이미 최신화된 state를 덮어쓸 수 있다.

- 권고:
  `useEffect`의 초기 `load()` 호출을 제거하고 `useFocusEffect`만 유지한다.
  `useFocusEffect`는 최초 마운트 시에도 실행되므로 기능적으로 동일하다.

  ```js
  // useEffect(() => { load(); }, []); ← 이 줄 제거
  useFocusEffect(useCallback(() => { load(); }, []));
  ```

---

### [심각도: HIGH] ScheduleScreen: urgencyAnim Animated.loop 정리 누락

- 위치: `src/screens/ScheduleScreen.js:181-187`
- 설명:
  컴포넌트 마운트 시 `Animated.loop`를 시작하지만 `useEffect` cleanup에서 `.stop()`을 호출하지 않는다.

  ```js
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(urgencyAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(urgencyAnim, { toValue: 0.1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
    // return () => animation.stop(); ← 없음
  }, []);
  ```

- 영향:
  탭 전환 후 ScheduleScreen이 언마운트되어도 애니메이션 루프가 계속 실행된다.
  JavaScript 스레드에 지속적인 부담을 주며 배터리 소모를 증가시킨다.

- 권고:
  ```js
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(urgencyAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(urgencyAnim, { toValue: 0.1, duration: 600, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);
  ```

---

### [심각도: HIGH] ClientScreen: 클라이언트 목록 O(n×m) 렌더링

- 위치: `src/screens/ClientScreen.js:386-389`
- 설명:
  거래처 목록을 렌더링할 때 클라이언트마다 전체 histories 배열을 두 번 순회한다.

  ```js
  filteredClients.map((client) => {
    const lastH = histories.filter((h) => h.clientId === client.id).sort(...)[0]; // O(m)
    const hCount = histories.filter((h) => h.clientId === client.id).length;      // O(m)
  ```

  클라이언트 n명, 히스토리 m개 시 O(n×m) 연산이 매 렌더마다 실행된다.
  추가로 `filteredClients` 자체도 useMemo 없이 컴포넌트 렌더 시마다 정렬 포함 재계산된다.

- 영향:
  거래처 20명 × 히스토리 100건 = 4,000번의 비교가 상태 변경마다 반복된다.
  검색창 타이핑 시 매 키 입력마다 전체 목록이 재계산되어 입력 지연이 발생한다.

- 권고:
  ```js
  // 히스토리를 clientId 기준 Map으로 사전 인덱싱
  const historiesByClient = useMemo(() => {
    const map = new Map();
    histories.forEach((h) => {
      if (!map.has(h.clientId)) map.set(h.clientId, []);
      map.get(h.clientId).push(h);
    });
    return map;
  }, [histories]);

  // 렌더 내부에서
  const clientHistList = historiesByClient.get(client.id) || [];
  const hCount = clientHistList.length;
  const lastH = clientHistList[0]; // 이미 createdAt 내림차순 정렬 전제
  ```

---

### [심각도: HIGH] AI 채팅 history.indexOf() → O(n²) 패턴

- 위치: `src/screens/ScheduleScreen.js:313`, `src/screens/ClientScreen.js:269`
- 설명:
  두 화면의 `handleAIChat` 함수에서 동일한 O(n²) 패턴이 반복된다.

  ```js
  const apiMessages = history
    .filter((m) => m.role !== 'assistant' || history.indexOf(m) > 0)
  ```

  `history.indexOf(m)`은 매 요소마다 배열 전체를 선형 탐색한다(O(n)).
  메시지가 쌓일수록 O(n²) 연산이 된다.

- 영향:
  AI 채팅 세션이 길어질수록(20회+ 이상) 메시지 전처리 시간이 기하급수적으로 증가한다.
  현재 코드의 실제 의도는 "첫 assistant 메시지를 제외한 나머지 포함"이므로 슬라이싱으로 대체 가능하다.

- 권고:
  ```js
  // 첫 메시지(초기 안내)를 제외하는 의도 → slice로 해결
  const apiMessages = history
    .slice(1) // 첫 번째 assistant 초기 메시지 제외
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
  ```

---

### [심각도: MED] askClaude() 호출마다 getAiProvider() + getApiKey() 반복

- 위치: `src/services/claude.js:67-79`
- 설명:
  `askClaude()`는 매 호출마다 `getAiProvider()`, `getApiKey()` 또는 `getGrokApiKey()`를
  통해 AsyncStorage를 읽는다. AI 채팅에서 사용자가 메시지를 보낼 때마다 2회의
  불필요한 AsyncStorage 읽기가 발생한다.

  ```js
  export async function askClaude(messages, systemPrompt, { raw = false } = {}) {
    const provider = await getAiProvider();   // AsyncStorage 읽기
    const apiKey = await getApiKey();          // AsyncStorage 읽기
    // ...
  }
  ```

- 영향:
  채팅 응답 시작까지의 지연에 비교적 적은 영향이지만, 빠른 연속 호출
  (STT 후 자동 요약 등) 시에는 불필요한 직렬화 지연을 추가한다.

- 권고:
  앱 시작 시 provider와 API 키를 인메모리에 캐싱하고, 설정 저장 시에만 갱신한다.

---

### [심각도: MED] ClientScreen: AI 요약 캐시 없음 (클라이언트 열 때마다 API 호출)

- 위치: `src/screens/ClientScreen.js:311-315`
- 설명:
  거래처 카드를 탭할 때마다 무조건 AI API를 호출한다.

  ```js
  function openClient(client) {
    setSelectedClient(client);
    setClientSummary('');
    fetchClientSummary(client); // 매번 API 호출
  }
  ```

  같은 클라이언트를 반복해서 열면 동일한 데이터로 동일한 요약을 반복 생성한다.
  히스토리 변경 없이도 모달을 닫고 다시 열면 API가 재호출된다.

- 영향:
  불필요한 API 비용이 발생하며, 네트워크 지연으로 매 접근마다 로딩 인디케이터가 표시된다.

- 권고:
  ```js
  const clientSummaryCache = useRef({}); // { [clientId]: summary }

  function openClient(client) {
    setSelectedClient(client);
    const cached = clientSummaryCache.current[client.id];
    if (cached) {
      setClientSummary(cached);
    } else {
      setClientSummary('');
      fetchClientSummary(client);
    }
  }

  async function fetchClientSummary(client, histList) {
    // ...
    const reply = await askClaude(...);
    const normalized = normalizeAIDates(reply);
    clientSummaryCache.current[client.id] = normalized; // 캐시 저장
    setClientSummary(normalized);
    // ...
  }
  ```
  히스토리 추가/수정 시에는 `clientSummaryCache.current[client.id] = undefined`로 무효화한다.

---

### [심각도: MED] ClientScreen: fetchHistorySummary()가 이미 state에 있는 데이터를 재조회

- 위치: `src/screens/ClientScreen.js:320-321`
- 설명:
  ```js
  async function fetchHistorySummary() {
    const [clientList, histList] = await Promise.all([getClients(), getHistories()]);
  ```
  `clients`와 `histories`는 이미 컴포넌트 state에 로드되어 있음에도
  AsyncStorage를 다시 읽는다. 각 함수는 내부적으로 `getCurrentUser()`를 호출하므로
  총 4회의 불필요한 AsyncStorage 읽기가 추가 발생한다.

- 영향:
  "AI 거래처 히스토리" 모달을 열 때마다 불필요한 I/O 지연이 발생한다.

- 권고:
  ```js
  async function fetchHistorySummary() {
    // AsyncStorage 재조회 없이 state 직접 사용
    const systemPrompt = buildClientSystem(clients, histories);
    const reply = await askClaude([{ role: 'user', content: '...' }], systemPrompt);
    // ...
  }
  ```

---

### [심각도: MED] HomeScreen: 1초 인터벌로 전체 컴포넌트 재렌더링

- 위치: `src/screens/HomeScreen.js:13-20`
- 설명:
  `useNow()` 훅이 1초마다 `setNow(new Date())`를 호출한다. HomeScreen은 시계를
  표시하기 위해 이 훅을 사용하는데, 상태 업데이트로 컴포넌트 전체가 재렌더링된다.
  `STATS` 배열, `todaySchedules.slice(0, 4).map(...)`, `activeProjects.slice(0, 3).map(...)` 등이
  모두 useMemo 없이 매 초 재계산된다.

- 영향:
  홈 탭이 활성화된 동안 매 초 불필요한 리스트 재렌더링이 발생한다.
  시계 부분만 별도 컴포넌트로 분리하면 해결된다.

- 권고:
  ```js
  // 시계만 별도 컴포넌트로 분리
  function ClockDisplay() {
    const now = useNow();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return <Text style={s.dateText}>{/* 날짜+시간 */}</Text>;
  }
  // HomeScreen 본체에는 useMemo로 정적 데이터 보호
  const STATS = useMemo(() => [ ... ], [todaySchedules, activeProjectCount, clientCount, delayedProjectCount]);
  ```

---

### [심각도: MED] ScheduleScreen: daySchedules, dayProjects 메모이제이션 누락

- 위치: `src/screens/ScheduleScreen.js:201-223`
- 설명:
  ```js
  const daySchedules = selectedDate
    ? schedules.filter(...)
    : schedules.filter(...);

  const dayProjects = selectedDate
    ? projects.filter(...)
    : projects.filter(...);
  ```
  이 두 연산은 매 렌더마다 실행된다. ScheduleScreen의 TextInput 상태 변화
  (일정 제목 입력 등)가 발생할 때마다 불필요하게 재계산된다.

- 영향:
  일정 추가 모달에서 제목을 타이핑하는 동안 날짜별 일정 필터링이 매 키 입력마다 반복된다.

- 권고:
  ```js
  const daySchedules = useMemo(() =>
    selectedDate
      ? schedules.filter((s) => { ... }).sort(...)
      : schedules.filter((s) => { ... }).sort(...),
    [schedules, selectedDate, monthEnd, monthStart]
  );
  ```

---

### [심각도: LOW] 번들 최적화: 탭 스크린 eager import

- 위치: `App.js:6-16`
- 설명:
  7개 탭 스크린이 모두 App.js에서 정적으로 import된다. React Navigation의
  `lazy: true` 옵션을 사용하면 각 탭을 처음 방문할 때 코드를 평가하므로
  초기 번들 파싱 시간을 줄일 수 있다.

- 영향:
  현재 앱 규모에서는 미미하지만, MeetingScreen처럼 무거운 화면 로직이
  증가할 경우 초기 렌더링에 영향을 줄 수 있다.

- 권고:
  ```js
  // Tab.Navigator에 lazy 옵션 추가
  <Tab.Navigator screenOptions={{ lazy: true, ... }}>
  ```

---

### [심각도: LOW] groqStt.js: buildTranscript O(n×m) 중첩 루프

- 위치: `src/services/groqStt.js:187-201`
- 설명:
  Whisper 세그먼트마다 전체 Pyannote 세그먼트를 순회한다.

  ```js
  const labeled = whisperSegments.filter(isValidSegment).map((seg) => {
    for (const ps of pyannoteSegments) { // O(m) per segment
      const overlap = ...;
    }
  ```

  Whisper 세그먼트 n개 × Pyannote 세그먼트 m개 = O(n×m).
  1시간 회의에서 n≈500, m≈200이면 100,000회 연산이 발생한다.

- 영향:
  STT 처리 완료 후 화자 매핑 단계에서 UI가 잠깐 멈출 수 있다.
  작업이 메인 스레드에서 실행되므로 긴 회의록 처리 시 체감 가능한 freeze가 발생할 수 있다.

- 권고:
  Pyannote 세그먼트를 시작 시간 기준 정렬 후 이진 탐색으로 교차 구간을 찾으면
  O((n+m) log m)으로 개선 가능하다. 또는 `InteractionManager.runAfterInteractions()`로
  메인 스레드 블로킹을 방지한다.

---

## 종합 평가

### 성능 위험 영역 (우선순위 순)

1. **스토리지 레이어 구조적 과부하** (`storage.js`)
   모든 CRUD가 `getCurrentUser()` AsyncStorage 읽기를 유발하는 설계가 가장 광범위한 영향을 미친다. 이 하나를 인메모리 캐싱으로 해결하면 앱 전반의 I/O가 절반 이하로 감소한다.

2. **ScheduleScreen 렌더링 과부하**
   30개 이상 state + 달력 그리드 O(n×셀) 재계산 + 이중 load() 조합이 가장 복잡한 화면을 가장 비효율적으로 만든다. useMemo 3~4곳 적용 + load() 이중 호출 제거로 즉각 개선된다.

3. **메모리 누수** (`urgencyAnim` Animated.loop)
   수정 난이도가 낮고 배터리·메모리에 직접 영향을 주므로 즉시 수정이 권고된다.

### 최적화 우선순위

**즉시 수정 (1~2일)**
1. `storage.js` — `getCurrentUser()` 인메모리 캐싱
2. `ScheduleScreen.js:178` — 중복 `useEffect load()` 제거
3. `ScheduleScreen.js:181` — `Animated.loop` cleanup 추가
4. `ScheduleScreen.js:313`, `ClientScreen.js:269` — `history.indexOf()` → `slice(1)` 교체

**다음 스프린트 (Major 개선)**
5. `ScheduleScreen.js` — `buildMonthGrid`, `daySchedules`, `dayProjects` useMemo 적용
6. `ClientScreen.js` — `historiesByClient` Map 인덱싱 + 렌더 O(n×m) 제거
7. `ClientScreen.js` — 클라이언트 AI 요약 `useRef` 캐시 추가
8. `ClientScreen.js:320` — `fetchHistorySummary` state 재사용
9. `HomeScreen.js` — 시계 컴포넌트 분리 + STATS useMemo

**중기 개선**
10. `claude.js` — provider/apiKey 인메모리 캐싱
11. `App.js` — 탭 스크린 lazy 로딩
12. `groqStt.js` — buildTranscript 메인 스레드 블로킹 방지

### 성능 프로파일링 권장

- **React Native Profiler** (Flipper): ScheduleScreen 리렌더 횟수 측정 — 달력 날짜 클릭 시 렌더 횟수 확인
- **Flipper AsyncStorage plugin**: `getCurrentUser()` 호출 빈도 추적
- **Systrace/Perfetto**: `buildTranscript` UI 스레드 블로킹 시간 측정 (MeetingScreen에서 긴 녹음 처리 시)
