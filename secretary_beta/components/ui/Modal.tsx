'use client';

import { useUIStore } from '../../store';

export function Modal({ children }: { children: React.ReactNode }) {
  const { modal, closeModal } = useUIStore();

  if (!modal.isOpen) return null;

  return (
    <div
      onClick={closeModal}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '8px', padding: '24px', minWidth: '320px' }}>
        {children}
        <button onClick={closeModal} style={{ marginTop: '16px' }}>닫기</button>
      </div>
    </div>
  );
}
