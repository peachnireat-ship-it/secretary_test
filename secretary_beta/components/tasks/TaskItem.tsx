'use client';

import type { Task } from '../../types';
import { useUpdateTask, useDeleteTask } from '../../hooks';
import { Button } from '../ui/Button';

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 0',
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => updateTask.mutate({ id: task.id, payload: { completed: !task.completed } })}
      />
      <span style={{ flex: 1, textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? '#9ca3af' : '#111827' }}>
        {task.title}
      </span>
      <Button
        variant="danger"
        onClick={() => deleteTask.mutate(task.id)}
        style={{ padding: '4px 10px', fontSize: '12px' }}
      >
        삭제
      </Button>
    </li>
  );
}
