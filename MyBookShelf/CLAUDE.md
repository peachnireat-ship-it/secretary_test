# MyBookShelf — Claude Code 가이드

## 프로젝트 개요

React Native(Expo) 기반 독서 관리 앱. 앱 이름은 **내 서재**.

- **플랫폼**: Android (expo-router, expo-sqlite)
- **메인 색상**: `#6750A4` (Material Design 3 Purple)
- **DB**: SQLite (`mybookshelf.db`) — expo-sqlite `openDatabaseSync` 사용

## 폴더 구조

```
MyBookShelf/
├── app/
│   ├── (tabs)/
│   │   ├── home.jsx        # 홈 — XP/레벨, 주간 미션, 책 목록, 이벤트 배너
│   │   ├── index.jsx       # 서재 — 상태별 탭 필터 + 책 카드 목록
│   │   ├── ranking.jsx     # 대항전 — 학교별 주간 점수 리더보드
│   │   └── statistics.jsx  # 통계 — 전체/완독/읽는중/읽고싶음 카운트
│   └── add-book.jsx        # 책 추가 화면
├── components/
│   ├── BookCard.jsx        # 책 카드 (진행률 바, 별점, 목표일 표시)
│   ├── StarRating.jsx      # 별점 컴포넌트
│   └── StatusBadge.jsx     # 읽는중/완독/읽고싶음 뱃지
├── database/
│   ├── database.js         # SQLite CRUD, XP/레벨, 주간 이벤트, 미션
│   └── badges.js           # 뱃지 정의(BADGE_DEFS), 장르 목록(GENRES)
└── constants/
    └── colors.js           # 앱 색상 상수
```

## DB 테이블 요약

| 테이블 | 주요 컬럼 |
|---|---|
| `books` | id, title, author, totalPages, currentPage, status, rating, review, startDate, endDate, goalDate, bookType, progressPct, genre, checkins, createdAt |
| `book_reviews` | id, bookId, sequence, content, type, createdAt |
| `user_stats` | id, xp, level, username, lastReadDay, todayPages, readStreak, todayPagesXpGiven, school, schoolLevel |
| `completed_missions` | id, missionId, weekKey, xp |
| `user_badges` | id, badgeId, unlockedAt |

## XP 보상 상수 (`database.js`)

```js
XP_REWARDS = {
  BOOK_COMPLETE: 100,
  DAILY_PAGES_100: 30,
  DAILY_STREAK: 10,
  CHALLENGE_SUCCESS: 150,
  MEMO_ADD: 10,
  BOOK_REVIEW: 50,
}
```

레벨업 공식: `레벨 N → N+1 필요 XP = 80 × N^1.5`

## 주요 패턴

- **주간 키**: `getWeekKey()` — ISO 주차 (`YYYY-Www`)
- **XP 2배 이벤트**: 주차 seed 기반 결정론적 랜덤 (`getWeeklyDoubleXpEvent`)
- **주간 미션**: MISSION_POOL에서 seed 기반으로 3개 선택 (`getWeeklyMissions`)
- **학교 대항전 점수**: 완독×100 + 메모×10 + 신규책×20 + 연속독서일×15 + 미션XP
- **학교 검색**: NEIS 오픈 API (`open.neis.go.kr/hub/schoolInfo`)

## 개발 시 유의사항

- **작업 경로**: 별도 명령이 있기 전까지 모든 작업은 `C:\Users\user\MyBookShelf` 경로 내에서만 수행할 것
- DB 컬럼 추가는 `ALTER TABLE … ADD COLUMN`을 `try/catch`로 감싸서 중복 실행 안전하게 처리
- `status` 값: `'want_to_read'` | `'reading'` | `'completed'`
- 날짜/시간은 Unix timestamp(ms) 정수로 저장
- `checkins` 컬럼은 JSON 문자열 배열(`'[]'`)로 저장
