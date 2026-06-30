---
name: web-deployment
description: 풀스택 웹사이트 배포 설정을 구성하는 스킬. Docker, GitHub Actions CI/CD, Vercel/Railway 배포, 환경 변수 관리, 배포 가이드 작성 요청 시 이 스킬을 참조한다. web-dev-orchestrator가 devops-engineer를 호출할 때 참조한다.
---

## 목적

개발 완료된 Next.js + Express 앱을 컨테이너화하고 CI/CD 파이프라인으로 자동 배포한다.

## Dockerfile 패턴

### Frontend (Next.js — 멀티스테이지)

```dockerfile
# Dockerfile.frontend
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

### Backend (Express)

```dockerfile
# Dockerfile.backend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

## GitHub Actions CI 패턴

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  test-frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          NEXT_PUBLIC_API_URL: http://localhost:4000

  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: testpass, POSTGRES_DB: testdb }
        options: --health-cmd pg_isready
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/testdb
          JWT_SECRET: test-secret
```

## 배포 플랫폼 비교

| 플랫폼 | 프론트 | 백엔드 | 비용 | 복잡도 |
|--------|--------|--------|-----|-------|
| Vercel + Railway | ✅ 최적 | ✅ 간편 | 무료~$20 | 낮음 |
| Vercel + Render | ✅ 최적 | ✅ 간편 | 무료~$7 | 낮음 |
| AWS (ECS + ALB) | ✅ | ✅ | ~$50+ | 높음 |
| GCP (Cloud Run) | ✅ | ✅ | 사용량 기반 | 중간 |

**기본 권장:** Vercel (프론트) + Railway (백엔드) — 무료 티어, 자동 배포, 최소 설정.

## 환경 변수 관리 원칙

`.env.example`에 모든 변수를 설명과 함께 목록화:
```env
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4000    # 백엔드 API URL

# Backend
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=your-256-bit-secret              # openssl rand -base64 32
JWT_REFRESH_SECRET=another-secret
PORT=4000
CORS_ORIGIN=http://localhost:3000           # 허용 프론트엔드 URL
```

프로덕션 시크릿은 플랫폼 환경 변수 설정(Vercel Dashboard / Railway Variables)에서만 관리.
