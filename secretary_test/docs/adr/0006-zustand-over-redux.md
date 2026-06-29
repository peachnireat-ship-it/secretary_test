---
status: 승인됨
date: 2026-06-29
---

# ADR-0006: 전역 상태 관리 — Redux 대신 Zustand 도입

## 컨텍스트

현재 앱은 화면별로 `useState` + `AsyncStorage` 조합으로 상태를 관리한다. 화면 수가 늘면서 여러 화면이 공유해야 하는 상태(로그인 사용자, 회의록 목록, 거래처 선택 등)가 증가하고, Props Drilling이나 `useEffect` 연쇄가 복잡해지고 있다. 전역 상태 관리 라이브러리 도입이 필요하다.

## 결정

Redux/Redux Toolkit 대신 **Zustand**를 도입한다.

```js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useUserStore = create(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      clearUser: () => set({ currentUser: null }),
    }),
    { name: 'user-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

## 이유

**Zustand를 선택한 이유:**

- **보일러플레이트 최소화**: Redux는 action type, action creator, reducer, selector를 각각 작성해야 하지만, Zustand는 `create()` 하나로 상태와 setter를 함께 정의한다.
- **번들 크기**: Zustand ~1KB vs Redux Toolkit ~50KB. Expo 앱에서 번들 크기는 초기 로드에 직결된다.
- **Provider 불필요**: Redux는 `<Provider store={store}>`로 앱 전체를 감싸야 하지만, Zustand는 훅만 import해서 어느 컴포넌트에서든 바로 사용할 수 있다.
- **AsyncStorage 연동 용이**: `persist` 미들웨어에 `createJSONStorage(() => AsyncStorage)`를 넘기면 자동 직렬화/복원이 된다. 현재의 수동 AsyncStorage 코드를 대체할 수 있다.
- **React Native / Expo 호환**: Zustand는 React Native에서 완전히 동작하고, Expo managed workflow와 충돌하지 않는다.

**Redux를 선택하지 않은 이유:**

- 이 앱은 단일 개발자가 운영하는 소규모 앱으로, Redux가 제공하는 시간 여행 디버깅·미들웨어 생태계가 필요하지 않다.
- 서버 사이드 렌더링이 없어 Redux의 SSR 지원이 무의미하다.
- Redux DevTools의 이점보다 Zustand의 단순성이 개발 속도에 더 기여한다.

## 결과

- **긍정**: 코드량 감소, 화면 간 상태 공유 간소화, AsyncStorage 연동 코드 제거
- **부정**: Redux에 비해 커뮤니티 생태계와 DevTools가 작음
- **마이그레이션 전략**: 기존 `useState` + AsyncStorage 코드를 한 번에 교체하지 않고, 화면 단위로 점진적으로 Zustand store로 이전한다. 첫 대상은 `currentUser`(로그인 상태)로, 모든 화면이 참조하는 공통 상태다.
- **연관 ADR**: [ADR-0001](0001-asyncstorage-not-sqlite.md) — AsyncStorage를 Zustand persist 미들웨어 스토리지로 재활용함으로써 SQLite 미사용 결정을 유지한다.
