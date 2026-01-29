import type {
  Lead,
  Application,
  Task,
  FunnelMetrics,
  MarketingMetrics,
  PipelineMetrics,
  RiskDistribution,
  VelocityMetrics,
  PaginatedResponse,
  ApiError,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        code: 'UNKNOWN_ERROR',
        message: response.statusText,
      }));
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  // -------------------------------------------------------------------------
  // Lead endpoints
  // -------------------------------------------------------------------------

  async getLeads(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    assignedLOId?: string;
    search?: string;
  }): Promise<PaginatedResponse<Lead>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.assignedLOId) searchParams.set('assignedLOId', params.assignedLOId);
    if (params?.search) searchParams.set('search', params.search);

    return this.request<PaginatedResponse<Lead>>(`/leads?${searchParams}`);
  }

  async getLead(id: string): Promise<Lead> {
    return this.request<Lead>(`/leads/${id}`);
  }

  async updateLead(id: string, data: Partial<Lead>): Promise<Lead> {
    return this.request<Lead>(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateLeadStatus(id: string, status: string): Promise<Lead> {
    return this.request<Lead>(`/leads/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  // -------------------------------------------------------------------------
  // Application endpoints
  // -------------------------------------------------------------------------

  async getApplications(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    milestone?: string;
    assignedLOId?: string;
    search?: string;
  }): Promise<PaginatedResponse<Application>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.milestone) searchParams.set('milestone', params.milestone);
    if (params?.assignedLOId) searchParams.set('assignedLOId', params.assignedLOId);
    if (params?.search) searchParams.set('search', params.search);

    return this.request<PaginatedResponse<Application>>(`/applications?${searchParams}`);
  }

  async getApplication(id: string): Promise<Application> {
    return this.request<Application>(`/applications/${id}`);
  }

  // -------------------------------------------------------------------------
  // Task endpoints
  // -------------------------------------------------------------------------

  async getTasks(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    assignedUserId?: string;
    assignedRole?: string;
    priority?: string;
  }): Promise<PaginatedResponse<Task>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.assignedUserId) searchParams.set('assignedUserId', params.assignedUserId);
    if (params?.assignedRole) searchParams.set('assignedRole', params.assignedRole);
    if (params?.priority) searchParams.set('priority', params.priority);

    return this.request<PaginatedResponse<Task>>(`/tasks?${searchParams}`);
  }

  async updateTaskStatus(id: string, status: string): Promise<Task> {
    return this.request<Task>(`/tasks/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  // -------------------------------------------------------------------------
  // Analytics endpoints
  // -------------------------------------------------------------------------

  async getFunnelMetrics(params?: {
    from?: string;
    to?: string;
    groupBy?: string;
  }): Promise<FunnelMetrics> {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

    return this.request<FunnelMetrics>(`/analytics/funnel?${searchParams}`);
  }

  async getMarketingMetrics(params?: {
    from?: string;
    to?: string;
  }): Promise<MarketingMetrics> {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);

    return this.request<MarketingMetrics>(`/analytics/marketing?${searchParams}`);
  }

  async getPipelineMetrics(params?: {
    groupBy?: string;
  }): Promise<PipelineMetrics> {
    const searchParams = new URLSearchParams();
    if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

    return this.request<PipelineMetrics>(`/analytics/pipeline?${searchParams}`);
  }

  async getRiskDistribution(): Promise<RiskDistribution> {
    return this.request<RiskDistribution>('/analytics/risk-distribution');
  }

  async getVelocityMetrics(params?: {
    from?: string;
    to?: string;
    groupBy?: string;
  }): Promise<VelocityMetrics[]> {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

    return this.request<VelocityMetrics[]>(`/analytics/velocity?${searchParams}`);
  }

  // -------------------------------------------------------------------------
  // Event tracking
  // -------------------------------------------------------------------------

  async trackEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
    await this.request('/analytics/events', {
      method: 'POST',
      body: JSON.stringify({ event, properties, timestamp: new Date().toISOString() }),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
