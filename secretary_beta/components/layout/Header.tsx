'use client';

export function Header() {
  return (
    <header
      style={{
        height: '56px',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: '18px' }}>Secretary</span>
    </header>
  );
}
