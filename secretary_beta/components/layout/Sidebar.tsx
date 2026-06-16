'use client';

import { useUIStore } from '../../store';

export function Sidebar() {
  const { sidebar, toggleSidebar } = useUIStore();

  return (
    <aside
      style={{
        width: sidebar.isCollapsed ? '60px' : '240px',
        transition: 'width 0.2s',
        borderRight: '1px solid #e5e7eb',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <button onClick={toggleSidebar} style={{ alignSelf: 'flex-end' }}>
        {sidebar.isCollapsed ? '▶' : '◀'}
      </button>
      {!sidebar.isCollapsed && (
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <a href="/">홈</a>
          <a href="/tasks">태스크</a>
        </nav>
      )}
    </aside>
  );
}
