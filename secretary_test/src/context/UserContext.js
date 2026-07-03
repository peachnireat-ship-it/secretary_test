import { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../services/storage';

const UserContext = createContext(undefined);

// user: undefined = 로딩 중, null = 로그아웃 상태, object = 로그인된 사용자
export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    getCurrentUser().then((u) => setUser(u || null));
  }, []);

  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (ctx === undefined) throw new Error('useUser()는 UserProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
