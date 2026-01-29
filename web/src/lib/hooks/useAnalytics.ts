import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface UseFunnelParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export function useFunnelMetrics(params?: UseFunnelParams) {
  return useQuery({
    queryKey: ['analytics', 'funnel', params],
    queryFn: () => apiClient.getFunnelMetrics(params),
  });
}

interface UseContactMethodParams {
  from?: string;
  to?: string;
}

export function useContactMethodMetrics(params?: UseContactMethodParams) {
  return useQuery({
    queryKey: ['analytics', 'contact-methods', params],
    queryFn: () => apiClient.getContactMethodMetrics(params),
  });
}

interface UsePipelineParams {
  groupBy?: string;
}

export function usePipelineMetrics(params?: UsePipelineParams) {
  return useQuery({
    queryKey: ['analytics', 'pipeline', params],
    queryFn: () => apiClient.getPipelineMetrics(params),
  });
}

export function useRiskDistribution() {
  return useQuery({
    queryKey: ['analytics', 'risk-distribution'],
    queryFn: () => apiClient.getRiskDistribution(),
  });
}

interface UseVelocityParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export function useVelocityMetrics(params?: UseVelocityParams) {
  return useQuery({
    queryKey: ['analytics', 'velocity', params],
    queryFn: () => apiClient.getVelocityMetrics(params),
  });
}
