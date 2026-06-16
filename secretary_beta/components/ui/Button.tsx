'use client';

import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ variant = 'primary', style, ...props }: ButtonProps) {
  const colors: Record<string, string> = {
    primary: '#2563eb',
    secondary: '#6b7280',
    danger: '#dc2626',
  };

  return (
    <button
      {...props}
      style={{
        background: colors[variant],
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 16px',
        cursor: 'pointer',
        fontSize: '14px',
        ...style,
      }}
    />
  );
}
