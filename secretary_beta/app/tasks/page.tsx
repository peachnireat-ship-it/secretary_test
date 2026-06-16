import { TaskForm, TaskList } from '../../components';

export default function TasksPage() {
  return (
    <main style={{ padding: '32px', maxWidth: '640px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>태스크</h1>
      <TaskForm />
      <TaskList />
    </main>
  );
}
