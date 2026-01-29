import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface UseApplicationsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  milestone?: string;
  assignedLOId?: string;
  search?: string;
}

export function useApplications(params?: UseApplicationsParams) {
  return useQuery({
    queryKey: ['applications', params],
    queryFn: () => apiClient.getApplications(params),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['applications', id],
    queryFn: () => apiClient.getApplication(id),
    enabled: !!id,
  });
}
