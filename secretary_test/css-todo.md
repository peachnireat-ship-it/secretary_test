## 🔄 CSS 정리 진행 상황

### ✅ 완료된 파일
| 파일 | 인라인 제거 | 미사용 제거 | 추가 스타일 수 |
|------|------------|------------|--------------|
| `LoginScreen.js` | 1개 | 0개 | 1개 (`loginBtnDisabled`) |
| `HomeScreen.js` | 6개 | 1개 (`clockText`) | 3개 (`flex1`, `sectionLast`, `aiRowBordered`) |
| `ClientScreen.js` | 36개 | 3개 (`chevron`, `detailContact`, `contactLink`) | 28개 |

### 🗒️ 발견된 공통 스타일 (추후 분리 예정)
다음 스타일이 여러 파일에 반복될 가능성이 높음:
- `flex1: { flex: 1 }`
- `scrollPB8/scrollPB24: { paddingBottom: N }` 계열
- `mb0 / mt8 / mt16 / mt20 / mt24 / ml8` 등 간격 모디파이어
- `modalSheet + 높이 변형 (h80pct ~ maxH90pct)` 패턴
- `inputLabelSpacing: { marginTop: 16, marginBottom: 8 }`
- `borderBottom: { borderBottomWidth: 1, borderBottomColor: C.border }`

### ⏳ 다음 정리할 파일
- `MeetingScreen.js`
- `MessageScreen.js`
- `ProjectScreen.js`
- `ScheduleScreen.js`
- `SettingsScreen.js`