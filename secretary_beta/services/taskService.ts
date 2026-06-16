import { apiClient } from './apiClient';
import type { Task, ApiResponse } from '../types';

// ─── TanStack Query의 queryFn / mutationFn에서 호출하는 순수 함수 ───

export const taskService = {
  getAll: async (): Promise<Task[]> => {
    const { data } = await apiClient.get<ApiResponse<Task[]>>('/tasks');
    return data.data;
  },

  getById: async (id: string): Promise<Task> => {
    const { data } = await apiClient.get<ApiResponse<Task>>(`/tasks/${id}`);
    return data.data;
  },

  create: async (payload: Pick<Task, 'title' | 'userId'>): Promise<Task> => {
    const { data } = await apiClient.post<ApiResponse<Task>>('/tasks', payload);
    return data.data;
  },

  update: async (id: string, payload: Partial<Task>): Promise<Task> => {
    const { data } = await apiClient.patch<ApiResponse<Task>>(`/tasks/${id}`, payload);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/tasks/${id}`);
  },
};
