import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskService } from '../services';
import type { Task } from '../types';

// ─── TanStack Query: 서버 데이터 페칭·캐싱·동기화 담당 ────

const TASK_KEYS = {
  all: ['tasks'] as const,
  detail: (id: string) => ['tasks', id] as const,
};

export function useTasks() {
  return useQuery({
    queryKey: TASK_KEYS.all,
    queryFn: taskService.getAll,
    staleTime: 1000 * 60 * 5, // 5분 캐시 유지
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: TASK_KEYS.detail(id),
    queryFn: () => taskService.getById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taskService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Task> }) =>
      taskService.update(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(id) });
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taskService.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    },
  });
}
