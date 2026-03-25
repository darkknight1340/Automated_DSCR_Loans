import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { Lead, LeadStatus } from '@/types';

interface UseLeadsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  assignedLOId?: string;
  search?: string;
}

export function useLeads(params?: UseLeadsParams) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => apiClient.getLeads(params),
    enabled: !loading && !!user,
  });
}

export function useLead(id: string) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => apiClient.getLead(id),
    enabled: !loading && !!user && !!id,
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) =>
      apiClient.updateLead(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.setQueryData(['leads', data.id], data);
    },
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      apiClient.updateLeadStatus(id, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.setQueryData(['leads', data.id], data);
    },
  });
}
