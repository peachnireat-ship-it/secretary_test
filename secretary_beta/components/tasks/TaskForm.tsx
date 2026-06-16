'use client';

import { useState } from 'react';
import { useCreateTask } from '../../hooks';
import { Button } from '../ui/Button';

export function TaskForm() {
  const [title, setTitle] = useState('');
  const createTask = useCreateTask();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createTask.mutate({ title, completed: false, userId: '' } as any, {
      onSuccess: () => setTitle(''),
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="새 태스크 입력..."
        style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
      />
      <Button type="submit" disabled={createTask.isPending}>
        {createTask.isPending ? '추가 중...' : '추가'}
      </Button>
    </form>
  );
}
