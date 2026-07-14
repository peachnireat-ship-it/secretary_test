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

### ✅ 완료된 파일 (2차)
| 파일 | 인라인 제거 | 미사용 제거 | 추가 스타일 수 |
|------|------------|------------|--------------|
| `SettingsScreen.js` | 16개 | 0개 | 15개 |
| `MessageScreen.js` | 9개 | 0개 | 8개 |
| `MeetingScreen.js` | 18개 | 5개 (`extractTasksBtn`, `extractTasksBtnText`, `taskPriorityDot`, `taskAddBtn`, `personSection`) | 19개 |
| `ProjectScreen.js` | 28개 | 5개 (`detailTitle`, `detailBadgeRow`, `detailSection`, `detailSectionLabel`, `detailValue`) | 32개 |
| `ScheduleScreen.js` | 20개 | 3개 (`dotActive`, `scheduleTime`, `scheduleDateSmall`) | 17개 |

### ✅ 모든 파일 정리 완료

### ✅ 공통 스타일 분리 완료
7개 화면 파일(StyleSheet.create 내부)에서 이름·값이 동일하게 반복되던 스타일을 `src/styles/common.js`(`commonStyles`)로 분리. 값이 다른 동명 스타일(예: `inputLabel`, `modalTitle` 등 파일마다 값이 다른 것)과 동적 스타일(색상 함수, `insets`, `Animated.Value`)은 대상에서 제외.

**분리된 공통 스타일 (17개)**
| 스타일 키 | 값 |
|----------|-----|
| `flex1` | `{ flex: 1 }` |
| `opacity40` | `{ opacity: 0.4 }` |
| `borderBottom` | `{ borderBottomWidth: 1, borderBottomColor: C.border }` |
| `speakerLabel` | `{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 }` |
| `mb0` | `{ marginBottom: 0 }` |
| `mb8` | `{ marginBottom: 8 }` |
| `mt8` | `{ marginTop: 8 }` |
| `mt16` | `{ marginTop: 16 }` |
| `mt20` | `{ marginTop: 20 }` |
| `ml8` | `{ marginLeft: 8 }` |
| `ml12` | `{ marginLeft: 12 }` |
| `gap12` | `{ gap: 12 }` |
| `spacerH20` | `{ height: 20 }` |
| `h85pct` | `{ height: '85%' }` |
| `maxH80pct` | `{ maxHeight: '80%' }` |
| `maxH85pct` | `{ maxHeight: '85%' }` |
| `maxH90pct` | `{ maxHeight: '90%' }` |

**파일별 제거된 로컬 중복 정의 수**
| 파일 | 제거 개수 | 제거된 키 |
|------|----------|----------|
| `HomeScreen.js` | 1개 | `flex1` |
| `LoginScreen.js` | 0개 | (겹치는 공통 스타일 없음) |
| `ClientScreen.js` | 13개 | `flex1`, `spacerH20`, `h85pct`, `maxH85pct`, `maxH90pct`, `mb0`, `mt8`, `mt16`, `mt20`, `ml8`, `borderBottom`, `speakerLabel`, `opacity40` |
| `MeetingScreen.js` | 6개 | `opacity40`, `flex1`, `mt16`, `mb0`, `gap12`, `speakerLabel` |
| `MessageScreen.js` | 2개 | `maxH90pct`, `flex1` |
| `ProjectScreen.js` | 15개 | `flex1`, `mb8`, `maxH90pct`, `maxH85pct`, `maxH80pct`, `opacity40`, `mb0`, `ml8`, `mt8`, `gap12`, `speakerLabel`, `mt20`, `spacerH20`, `borderBottom`, `ml12` |
| `ScheduleScreen.js` | 8개 | `mb8`, `flex1`, `spacerH20`, `h85pct`, `maxH90pct`, `maxH80pct`, `opacity40`, `ml12` |

**분리 제외 항목** (이름은 후보였지만 실제로는 1개 파일에만 존재하거나 값이 달라서 제외)
- `scrollPB8`/`scrollPB24`, `inputLabelSpacing`, `h80pct`/`h90pct`, `mb12`/`mt24`(ClientScreen만 존재)
- `mb16`/`mt6`(MeetingScreen만 존재), `maxH70pct`/`spacerH16`/`spacerH40`(ScheduleScreen만 존재), `spacerH8`(ProjectScreen만 존재)
- 각 파일마다 값이 다른 동명 스타일(`inputLabel`, `modalTitle`, `modalBtns` 등)은 이름은 같아도 값이 달라 분리하지 않음