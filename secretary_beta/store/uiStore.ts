import { create } from 'zustand';
import type { ModalState, SidebarState } from '../types';

// ─── Zustand: 서버 통신 없는 순수 UI 상태만 관리 ───────────

interface UIStore {
  modal: ModalState;
  sidebar: SidebarState;
  openModal: (modalType: string, payload?: unknown) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  modal: {
    isOpen: false,
    modalType: null,
    payload: undefined,
  },
  sidebar: {
    isCollapsed: false,
  },

  openModal: (modalType, payload) =>
    set({ modal: { isOpen: true, modalType, payload } }),

  closeModal: () =>
    set({ modal: { isOpen: false, modalType: null, payload: undefined } }),

  toggleSidebar: () =>
    set((state) => ({
      sidebar: { isCollapsed: !state.sidebar.isCollapsed },
    })),
}));
