---
name: code-style-review
description: 코드 스타일과 가독성을 감사하는 스킬. 명명 규칙 검증, 순환 복잡도 측정, DRY 위반 탐지, 함수 길이 분석 요청 시 이 스킬을 참조한다. code-review-orchestrator가 style-auditor를 호출할 때 참조한다.
---

## 명명 규칙 평가 기준

### 좋은 이름 vs 나쁜 이름
```javascript
// 나쁜 이름 → 감점
let d;                    // d가 무엇인지 모름
function handleData() {}  // 무슨 데이터를?
let flag = true;          // 무슨 플래그?
const arr = [];           // 배열인 건 알겠는데...
let temp = getUser();     // 왜 temp?

// 좋은 이름
let daysSinceLastLogin;
function sendPasswordResetEmail(user) {}
let isEmailVerified = true;
const activeUsers = [];
let currentUser = getUser();
```

### 함수 명명 패턴
```
동사 + 명사: getUserById, sendWelcomeEmail, validatePaymentCard
불리언 반환: isAdmin, hasPermission, canEditPost
이벤트 핸들러: handleSubmit, onUserLogin, handleError
```

## 순환 복잡도 계산

각 if, else if, for, while, &&, ||, ?:, case가 +1

```javascript
function processOrder(order) {    // 시작: 1
  if (!order) return null;        // +1 = 2
  if (order.status === 'paid') {  // +1 = 3
    if (order.items.length > 0) { // +1 = 4
      for (const item of order.items) { // +1 = 5
        if (item.stock > 0) {    // +1 = 6
          // ...
        } else {                  // +1 = 7
          // ...
        }
      }
    }
  } else if (order.status === 'pending') { // +1 = 8
    // ...
  }
}
// 복잡도 8 → 🟡 Major (기준: 10 이하 권장)
```

## Early Return 패턴 (중첩 감소)

```javascript
// 나쁜 예 — 깊은 중첩
function processUser(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        // 실제 로직
      }
    }
  }
}

// 좋은 예 — Early Return
function processUser(user) {
  if (!user) return;
  if (!user.isActive) return;
  if (!user.hasPermission) return;
  // 실제 로직
}
```

## DRY 위반 탐지

3번 이상 반복되는 패턴을 함수로 추출한다:

```javascript
// 중복 발견 — 3곳에서 같은 패턴
const formattedDate1 = new Date(date1).toLocaleDateString('ko-KR');
const formattedDate2 = new Date(date2).toLocaleDateString('ko-KR');
const formattedDate3 = new Date(date3).toLocaleDateString('ko-KR');

// 해결 — 유틸 함수 추출
const formatDate = (date) => new Date(date).toLocaleDateString('ko-KR');
```

## 코드 메트릭 권장 기준

| 지표 | 경고 | 위험 |
|------|------|-----|
| 함수 길이 | 20줄+ | 50줄+ |
| 파일 길이 | 200줄+ | 500줄+ |
| 함수 매개변수 수 | 4개+ | 7개+ |
| 중첩 깊이 | 4단계+ | 6단계+ |
| 순환 복잡도 | 10+ | 20+ |
| 중복 코드 | 3회+ | 5회+ |

## 주석 품질 평가

```javascript
// 나쁜 주석 — 코드가 이미 말하는 것을 반복
let count = 0; // count를 0으로 초기화

// 좋은 주석 — WHY를 설명
// Stripe는 금액을 센트 단위로 받으므로 달러에서 변환
const amountInCents = Math.round(amount * 100);

// 나쁜 주석 — 주석 처리된 코드 방치
// const oldFunction = () => { ... }; // 나중에 쓸 수도 있어서...
```
