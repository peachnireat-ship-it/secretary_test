---
name: web-qa-testing
description: 풀스택 웹사이트 QA 테스트를 수행하는 스킬. E2E 테스트(Playwright), API 테스트(Jest/Supertest), 경계면 교차 검증, QA 리포트 작성 요청 시 이 스킬을 참조한다. web-dev-orchestrator가 qa-engineer를 호출할 때 참조한다.
---

## 목적

프론트엔드·백엔드 경계면을 교차 검증하고 실행 가능한 테스트 코드를 작성한다.

## 테스트 계층

```
E2E (Playwright)      — 사용자 시나리오 전체 흐름
통합 테스트 (Supertest) — API 엔드포인트 + DB 연동
단위 테스트 (Jest)     — 비즈니스 로직 함수
```

## Playwright E2E 패턴

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
});

// e2e/auth.spec.ts
test.describe('인증 플로우', () => {
  test('로그인 성공 → 대시보드 이동', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('이메일').fill('test@test.com');
    await page.getByLabel('비밀번호').fill('password123');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('환영합니다')).toBeVisible();
  });

  test('잘못된 비밀번호 → 에러 메시지 표시', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('이메일').fill('test@test.com');
    await page.getByLabel('비밀번호').fill('wrong');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호');
  });
});
```

## Supertest API 테스트 패턴

```typescript
// api/auth.test.ts
import request from 'supertest';
import app from '../../src/app';

describe('POST /api/v1/auth/login', () => {
  it('200 — 유효한 자격증명', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT 형식
  });

  it('401 — 잘못된 비밀번호', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('400 — 이메일 형식 오류', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-email', password: 'pw' });
    expect(res.status).toBe(400);
  });
});
```

## 경계면 교차 검증 체크리스트

API contract(`03_api_contract.md`)를 기준으로 프론트(`04_frontend/src/types/api.ts`)와 백엔드(`05_backend/src/routes/`)를 동시에 비교:

```
□ 엔드포인트 URL이 contract·frontend·backend 세 곳에서 동일한가?
□ 응답 필드명이 contract = backend controller 반환값 = frontend 타입 정의와 일치하는가?
□ HTTP 상태 코드가 contract와 실제 구현에서 일치하는가?
□ 인증 헤더 형식이 일치하는가? (Bearer vs 다른 형식)
□ 에러 응답 형식이 contract와 일치하는가?
```

## QA 리포트 형식

```markdown
# QA 리포트
완성도: {N}/100  날짜: {날짜}

## 경계면 검증 결과
| 번호 | 경계면 | 발견 | 심각도 | 수정 방법 |
|------|--------|-----|-------|---------|

## 테스트 결과 요약
| 테스트 유형 | 전체 | 통과 | 실패 |
|-----------|-----|-----|-----|
| E2E | N | N | N |
| API | N | N | N |

## 판정
{배포 진행 / 수정 후 배포 / 재작업 권고}
```
