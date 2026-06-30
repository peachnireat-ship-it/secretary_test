---
name: requirements-analysis
description: 웹사이트 개발 요구사항을 분석하여 기능 명세, 기술 스택, 와이어프레임을 작성하는 스킬. 웹 프로젝트 기획, 요구사항 정리, 와이어프레임 작성, 기술 스택 선택, 프로젝트 범위 정의 요청 시 이 스킬을 참조한다. web-dev-orchestrator가 requirements-analyst를 호출할 때 참조한다.
---

## 목적

사용자의 아이디어나 비즈니스 요구사항을 개발팀이 바로 실행 가능한 명세서로 변환한다.

## 요구사항 수집 체크리스트

최소 다음 5가지가 확인되어야 구현을 시작할 수 있다:

1. **목적**: 이 웹사이트가 해결하는 문제는 무엇인가?
2. **타깃 사용자**: 누가 쓰는가? 기술 숙련도는?
3. **핵심 기능**: 없으면 의미 없는 기능 3개는?
4. **기술 선호**: 특정 언어/프레임워크 요구사항이 있는가?
5. **배포 환경**: 클라우드 선호, 예산 제약이 있는가?

## 기술 스택 선택 가이드

| 사용 사례 | 권장 스택 | 이유 |
|---------|---------|-----|
| 정적 콘텐츠 중심 | Next.js SSG + Supabase | 빠른 로딩, 저비용 |
| 실시간 기능 필요 | Next.js + Socket.io + Redis | 실시간 통신 지원 |
| 복잡한 상태 관리 | Next.js + Zustand + Express | 클라이언트 상태 제어 |
| 단순 CRUD | Next.js + Prisma + PostgreSQL | 빠른 개발 속도 |

**기본값:** Next.js 14 App Router + Express + PostgreSQL + Prisma

## 와이어프레임 작성 원칙

텍스트 와이어프레임은 `[]`로 요소를 표현:
```
[헤더: 로고 | 네비게이션 메뉴 | CTA버튼]
[히어로: 배경이미지 | H1 제목 | 부제목 | 버튼 2개]
[섹션: 카드 3열 그리드]
[푸터: 링크 모음 | 카피라이트]
```

모바일 와이어프레임도 함께 작성 (stack 레이아웃).

## API 엔드포인트 초안 형식

```
## CRUD 기본 패턴
GET    /api/v1/{resources}        목록 조회 (페이지네이션)
GET    /api/v1/{resources}/:id    단건 조회
POST   /api/v1/{resources}        생성
PUT    /api/v1/{resources}/:id    전체 수정
PATCH  /api/v1/{resources}/:id    부분 수정
DELETE /api/v1/{resources}/:id    삭제

## 인증
POST   /api/v1/auth/login         로그인
POST   /api/v1/auth/logout        로그아웃
POST   /api/v1/auth/refresh       토큰 갱신
```
