import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import type { Task, TaskStatus, PaginatedResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function fetchWithAuth<T>(endpoint: string, getToken: () => Promise<string | null>, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

interface UseTasksParams {
  page?: number;
  pageSize?: number;
  status?: string;
  assignedUserId?: string;
  assignedRole?: string;
  priority?: string;
}

export function useTasks(params?: UseTasksParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
  if (params?.status) searchParams.set('status', params.status);
  if (params?.assignedUserId) searchParams.set('assignedUserId', params.assignedUserId);
  if (params?.assignedRole) searchParams.set('assignedRole', params.assignedRole);
  if (params?.priority) searchParams.set('priority', params.priority);

  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => fetchWithAuth<PaginatedResponse<Task>>(`/tasks?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      fetchWithAuth<Task>(`/tasks/${id}/status`, getToken, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
