---
name: backend-development
description: Node.js/Express REST API 백엔드를 구현하는 스킬. API 엔드포인트 설계, Prisma 데이터 모델, JWT 인증, 미들웨어 구현 요청 시 이 스킬을 참조한다. web-dev-orchestrator가 backend-developer를 호출할 때 참조한다.
---

## 목적

API contract를 기반으로 Express + Prisma 백엔드를 구현한다. 보안과 에러 처리가 기본 내장되어야 한다.

## 프로젝트 구조

```
src/
├── app.ts              # Express 앱 설정
├── server.ts           # 서버 시작점
├── routes/             # 라우터 (URL → controller 연결)
├── controllers/        # 비즈니스 로직
├── middleware/
│   ├── auth.ts         # JWT 검증
│   ├── validate.ts     # Zod 입력 검증
│   └── errorHandler.ts # 중앙 에러 처리
├── models/             # Prisma schema
└── types/              # TypeScript 타입
```

## 핵심 패턴

### 에러 응답 일관성

```typescript
// middleware/errorHandler.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 400
  ) { super(message); }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
    });
  }
  console.error(err);
  res.status(500).json({ error: '서버 오류', code: 'INTERNAL_ERROR', statusCode: 500 });
};
```

### JWT 인증 미들웨어

```typescript
// middleware/auth.ts
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new AppError('인증이 필요합니다', 'UNAUTHORIZED', 401);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError('유효하지 않은 토큰', 'INVALID_TOKEN', 401);
  }
};
```

### Zod 입력 검증

```typescript
// controllers/{resource}.controller.ts
const createSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1),
});

export const create = async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body); // 실패 시 400 자동
  const item = await prisma.{resource}.create({ data: body });
  res.status(201).json(item);
};
```

### Prisma 스키마 패턴

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // 관계
  posts     Post[]
}
```

## 보안 체크리스트

- [ ] parameterized query 사용 (Prisma가 자동 처리)
- [ ] bcrypt 해시 (패스워드)
- [ ] rate limiting (express-rate-limit)
- [ ] CORS origin 화이트리스트
- [ ] helmet (HTTP 헤더 보안)
- [ ] 환경 변수 검증 (시작 시 필수값 존재 확인)

## 헬스체크 엔드포인트 (필수)

```typescript
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```
