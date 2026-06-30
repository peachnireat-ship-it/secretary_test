---
name: architecture-review
description: 코드베이스 아키텍처를 감사하는 스킬. 설계 패턴 분석, 계층 분리 검증, 의존성 맵 작성, 결합도/응집도 측정 요청 시 이 스킬을 참조한다. code-review-orchestrator가 architecture-auditor를 호출할 때 참조한다.
---

## 아키텍처 패턴별 감사 기준

### MVC / 레이어드 아키텍처
```
기대 의존 방향: Controller → Service → Repository → DB
위반 패턴:
- Controller에서 직접 DB 접근 → 🔴
- Service가 HTTP request 객체를 직접 사용 → 🟡
- Repository에 비즈니스 로직 → 🟡
```

### 프론트엔드 (React/Next.js)
```
기대 구조: Page → Component → Hook → API Client
위반 패턴:
- Page 컴포넌트에 비즈니스 로직 직접 작성 → 🟡
- 컴포넌트에서 fetch 직접 호출 → 🟡
- 전역 상태에 모든 데이터 저장 → 🟡
```

## 의존성 맵 작성 방법

```
1. 진입점 파일 읽기 (index.ts, App.jsx, main.py 등)
2. import 구문 추출
3. 각 모듈의 import를 재귀적으로 추적 (3~4 depth까지)
4. 순환 탐지: A가 B를 import하고 B가 A를 import하면 순환

표현 형식:
app.ts → [routes/, middleware/]
routes/user.ts → [controllers/user.ts]
controllers/user.ts → [services/user.ts]
services/user.ts → [models/user.ts, lib/email.ts]
```

## SOLID 원칙 체크

| 원칙 | 위반 신호 |
|------|---------|
| SRP (단일 책임) | 한 클래스/함수가 로그·검증·DB·HTTP를 모두 처리 |
| OCP (개방-폐쇄) | 새 케이스 추가 시 기존 switch/if 수정 필요 |
| DIP (의존 역전) | 구체 클래스를 직접 new로 생성 (인터페이스 없음) |

## 프로젝트 유형별 권장 구조

```
# Node.js API
src/
├── routes/     (HTTP 레이어만)
├── controllers/(요청/응답 변환)
├── services/   (비즈니스 로직)
├── repositories/(DB 접근)
└── models/     (데이터 스키마)

# Next.js 앱
src/
├── app/        (라우팅만)
├── components/ (UI만)
├── hooks/      (React 상태/effects)
├── lib/        (API 클라이언트)
└── types/      (타입 정의)
```
