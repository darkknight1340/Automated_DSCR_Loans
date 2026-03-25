import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import type { FunnelMetrics, PipelineMetrics, RiskDistribution, ContactMethodMetrics, VelocityMetrics } from '@/types';

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

interface UseFunnelParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export function useFunnelMetrics(params?: UseFunnelParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

  return useQuery({
    queryKey: ['analytics', 'funnel', params],
    queryFn: () => fetchWithAuth<FunnelMetrics>(`/analytics/funnel?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}

interface UseContactMethodParams {
  from?: string;
  to?: string;
}

export function useContactMethodMetrics(params?: UseContactMethodParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);

  return useQuery({
    queryKey: ['analytics', 'contact-methods', params],
    queryFn: () => fetchWithAuth<ContactMethodMetrics[]>(`/analytics/contact-methods?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}

interface UsePipelineParams {
  groupBy?: string;
}

export function usePipelineMetrics(params?: UsePipelineParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

  return useQuery({
    queryKey: ['analytics', 'pipeline', params],
    queryFn: () => fetchWithAuth<PipelineMetrics>(`/analytics/pipeline?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}

export function useRiskDistribution() {
  const { user, loading, getToken } = useAuth();

  return useQuery({
    queryKey: ['analytics', 'risk-distribution'],
    queryFn: () => fetchWithAuth<RiskDistribution>('/analytics/risk-distribution', getToken),
    enabled: !loading && !!user,
  });
}

interface UseVelocityParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export function useVelocityMetrics(params?: UseVelocityParams) {
  const { user, loading, getToken } = useAuth();

  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

  return useQuery({
    queryKey: ['analytics', 'velocity', params],
    queryFn: () => fetchWithAuth<VelocityMetrics[]>(`/analytics/velocity?${searchParams}`, getToken),
    enabled: !loading && !!user,
  });
}
