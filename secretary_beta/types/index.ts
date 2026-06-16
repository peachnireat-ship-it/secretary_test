// ─── 공통 API 응답 래퍼 ─────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message: string;
  status: number;
}

// ─── UI 상태 타입 (Zustand 전용) ─────────────────────────
export interface ModalState {
  isOpen: boolean;
  modalType: string | null;
  payload?: unknown;
}

export interface SidebarState {
  isCollapsed: boolean;
}

// ─── 서버 데이터 타입 (TanStack Query 전용) ───────────────
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  userId: string;
}
