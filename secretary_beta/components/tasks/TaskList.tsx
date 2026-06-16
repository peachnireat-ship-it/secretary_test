'use client';

import { useTasks } from '../../hooks';
import { TaskItem } from './TaskItem';

export function TaskList() {
  const { data: tasks, isLoading, isError } = useTasks();

  if (isLoading) return <p>불러오는 중...</p>;
  if (isError) return <p>태스크를 불러오지 못했습니다.</p>;

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {tasks?.map((task) => <TaskItem key={task.id} task={task} />)}
      {tasks?.length === 0 && <p style={{ color: '#9ca3af' }}>태스크가 없습니다.</p>}
    </ul>
  );
}
