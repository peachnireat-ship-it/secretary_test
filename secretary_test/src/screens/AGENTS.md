# screens/ 작업 가이드

이 디렉토리에는 각 탭의 UI 컴포넌트가 있습니다. 수정 전 반드시 이 파일을 읽으세요.

---

## 스크린 목록

| 파일 | 탭 | 주요 색상 |
|------|----|----------|
| `HomeScreen.js` | 홈 | `C.gold` |
| `ScheduleScreen.js` | 일정 | `C.accentBlue` |
| `ClientScreen.js` | 거래처 | `C.accentTeal` |
| `ProjectScreen.js` | 프로젝트 | `C.red` |
| `MessageScreen.js` | 메세지 | `C.accentPurple` |
| `MeetingScreen.js` | 회의록 | `C.accentTeal` |
| `SettingsScreen.js` | 설정 | `C.textSecondary` |
| `LoginScreen.js` | 로그인 | — |

---

## 스타일 규칙

- **인라인 스타일 금지** — 모든 스타일은 `StyleSheet.create()`로 집중 관리
- 테마 색상은 반드시 `src/theme.js`의 `C` 객체 사용 (`import C from '../theme'`)
- 런타임에 결정되는 값만 인라인 허용: `statusColor()`, `Animated.Value` 트랜스폼, `insets.top/bottom`, 알파 블렌딩(`color + '22'`)
- 상수 스타일을 동적으로 만들지 말 것 (조건 색상은 헬퍼 함수로 분리)

---

## 공통 UI 패턴

### Bottom Sheet Modal
```jsx
<Modal animationType="slide" transparent visible={modalVisible}>
  <View style={s.overlay}>
    <View style={s.sheet}>
      {/* 핸들 */}
      <View style={s.handle} {...swipeHandlers} />
      ...
    </View>
  </View>
</Modal>
```

### 드래그 닫기 (useSwipeClose)
```js
const { panHandlers: swipeHandlers } = useSwipeClose(() => setModalVisible(false));
// dy > 80 또는 vy > 0.8 이면 닫힘
```

### 달력 월 스와이프
```js
// PanResponder — dx < -60: 다음달, dx > 60: 이전달
```

### 긴급도 Animated 깜빡임
```js
// 마감 3일 이내: C.gold 테두리, 초과: C.red 테두리
// Animated.loop으로 opacity 0.3 ↔ 1 반복
```

### FAB (+) 버튼
- 각 탭 우하단 고정, 추가 진입점

---

## 데이터 로딩 패턴

```js
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);

useFocusEffect(useCallback(() => { load(); }, []));

async function load() {
  const user = await getCurrentUser();
  const items = await getItems(user.id);
  setData(items);
}
```

- `useFocusEffect` 사용 — 탭 전환 시 최신 데이터 재조회
- `getCurrentUser()` → `user.id` 로 사용자별 격리

---

## AI 호출 패턴

```js
import { askClaude, buildXxxSystem } from '../../services/claude';

const system = buildXxxSystem(contextData);
const res = await askClaude([{ role: 'user', content: input }], system);
```

- AI 응답 JSON 액션 감지 시 자동 파싱 후 데이터 처리 (claude.js 내부 처리)

---

## 주의사항

- 각 스크린은 자체 `useState`로 상태 관리 (전역 상태 라이브러리 없음)
- 스크린 간 데이터 공유: AsyncStorage 재조회 방식 사용
- 서버 없음 — 모든 CRUD는 `src/services/storage.js` 경유
