import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import type { Lead, LeadStatus, PaginatedResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function fetchWithAuth<T>(endpoint: string, getToken: () => Promise<string | null>, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  console.log('[useLeads] Token retrieved:', token ? 'yes' : 'no');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('[useLeads] Authorization header added');
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

interface UseLeadsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  assignedLOId?: string;
  search?: string;
}

export function useLeads(params?: UseLeadsParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize) searchParams.set('page_size', params.pageSize.toString());
  if (params?.status) searchParams.set('status', params.status);
  if (params?.assignedLOId) searchParams.set('assignedLOId', params.assignedLOId);
  if (params?.search) searchParams.set('search', params.search);

  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => fetchWithAuth<PaginatedResponse<Lead>>(`/leads?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}

export function useLead(id: string) {
  const { user, loading, getToken } = useAuth();
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => fetchWithAuth<Lead>(`/leads/${id}`, getToken),
    enabled: !loading && !!user && !!id,
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) =>
      fetchWithAuth<Lead>(`/leads/${id}`, getToken, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.setQueryData(['leads', data.id], data);
    },
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      fetchWithAuth<Lead>(`/leads/${id}/status`, getToken, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.setQueryData(['leads', data.id], data);
    },
  });
}
