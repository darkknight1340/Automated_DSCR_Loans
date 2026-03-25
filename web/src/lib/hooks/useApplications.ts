import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import type { Application, PaginatedResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function fetchWithAuth<T>(endpoint: string, getToken: () => Promise<string | null>): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

interface UseApplicationsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  milestone?: string;
  assignedLOId?: string;
  search?: string;
}

export function useApplications(params?: UseApplicationsParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
  if (params?.status) searchParams.set('status', params.status);
  if (params?.milestone) searchParams.set('milestone', params.milestone);
  if (params?.assignedLOId) searchParams.set('assignedLOId', params.assignedLOId);
  if (params?.search) searchParams.set('search', params.search);

  return useQuery({
    queryKey: ['applications', params],
    queryFn: () => fetchWithAuth<PaginatedResponse<Application>>(`/applications?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}

export function useApplication(id: string) {
  const { user, loading, getToken } = useAuth();
  return useQuery({
    queryKey: ['applications', id],
    queryFn: () => fetchWithAuth<Application>(`/applications/${id}`, getToken),
    enabled: !loading && !!user && !!id,
  });
}
