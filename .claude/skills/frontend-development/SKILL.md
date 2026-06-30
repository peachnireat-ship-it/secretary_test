---
name: frontend-development
description: Next.js/React 프론트엔드 코드를 구현하는 스킬. React 컴포넌트 작성, Next.js 페이지 구현, API 연동, 상태 관리, Tailwind 스타일링 요청 시 이 스킬을 참조한다. web-dev-orchestrator가 frontend-developer를 호출할 때 참조한다.
---

## 목적

디자인 명세와 API contract를 바탕으로 Next.js 14 App Router 기반 프론트엔드를 구현한다.

## 컴포넌트 작성 원칙

### Server Component vs Client Component

```typescript
// Server Component (기본값 — 인터랙션 없음)
// src/app/posts/page.tsx
export default async function PostsPage() {
  const posts = await fetch('/api/posts').then(r => r.json()); // 서버에서 직접 fetch
  return <PostList posts={posts} />;
}

// Client Component (인터랙션 필요 시)
// src/components/ui/Button.tsx
'use client';
import { useState } from 'react';
```

### API 클라이언트 패턴

```typescript
// src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json();
    throw new ApiError(error.message, error.code, res.status);
  }
  return res.json();
}

export const api = {
  get: <T>(url: string) => apiClient<T>(url),
  post: <T>(url: string, body: unknown) => apiClient<T>(url, { method: 'POST', body: JSON.stringify(body) }),
};
```

### 에러 처리 패턴

```typescript
// Error Boundary (페이지 레벨)
// src/app/{route}/error.tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <h2>오류가 발생했습니다</h2>
      <button onClick={reset}>다시 시도</button>
    </div>
  );
}
```

### 인증 상태 관리 (Zustand)

```typescript
// src/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthStore {
  token: string | null;
  user: User | null;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token) => set({ token }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'auth-storage' }
  )
);
```

## 파일 명명 규칙

- 컴포넌트: PascalCase (`UserCard.tsx`)
- 유틸 함수: camelCase (`formatDate.ts`)
- 페이지: `page.tsx` (Next.js 컨벤션)
- 타입: `types/api.ts`, `types/models.ts`

## Mock API 패턴 (API 완성 전 개발)

```typescript
// src/lib/mock-api.ts
export const mockUsers: User[] = [
  { id: '1', name: '테스트 사용자', email: 'test@test.com' },
];

// api.ts에서 env 변수로 전환
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
```
