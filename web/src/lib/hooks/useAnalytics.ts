import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface UseFunnelParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export function useFunnelMetrics(params?: UseFunnelParams) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'funnel', params],
    queryFn: () => apiClient.getFunnelMetrics(params),
    enabled: !loading && !!user,
  });
}

interface UseContactMethodParams {
  from?: string;
  to?: string;
}

export function useContactMethodMetrics(params?: UseContactMethodParams) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'contact-methods', params],
    queryFn: () => apiClient.getContactMethodMetrics(params),
    enabled: !loading && !!user,
  });
}

interface UsePipelineParams {
  groupBy?: string;
}

export function usePipelineMetrics(params?: UsePipelineParams) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'pipeline', params],
    queryFn: () => apiClient.getPipelineMetrics(params),
    enabled: !loading && !!user,
  });
}

export function useRiskDistribution() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'risk-distribution'],
    queryFn: () => apiClient.getRiskDistribution(),
    enabled: !loading && !!user,
  });
}

interface UseVelocityParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export function useVelocityMetrics(params?: UseVelocityParams) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'velocity', params],
    queryFn: () => apiClient.getVelocityMetrics(params),
    enabled: !loading && !!user,
  });
}
