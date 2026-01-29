// ============================================================================
// Analytics Service - Funnel, Pipeline, and Risk Metrics
// Provides aggregated analytics for the DSCR loan platform dashboard
// ============================================================================

import { Milestone } from '../workflow/WorkflowEngine';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type FunnelStage =
  | 'LEAD'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'APPLICATION'
  | 'PRE_APPROVED'
  | 'FUNDED';

export interface FunnelStageMetrics {
  stage: FunnelStage;
  count: number;
  conversionRate: number | null; // null for first stage
  previousStage?: FunnelStage;
}

export interface FunnelMetrics {
  stages: FunnelStageMetrics[];
  overallConversion: number;
  period: {
    from: Date;
    to: Date;
  };
}

export interface MarketingSourceMetrics {
  source: string;
  leads: number;
  conversions: number;
  conversionRate: number;
  revenueCents?: number;
}

export interface EmailMetrics {
  sent: number;
  opened: number;
  openRate: number;
  clicked: number;
  ctr: number; // Click-through rate (clicks / opens)
  converted: number;
}

export interface WebMetrics {
  visitors: number;
  leadSubmissions: number;
  conversionRate: number;
}

export interface MarketingMetrics {
  bySource: MarketingSourceMetrics[];
  emailMetrics: EmailMetrics;
  webMetrics: WebMetrics;
  period: {
    from: Date;
    to: Date;
  };
}

export interface PipelineMilestoneMetrics {
  milestone: Milestone;
  count: number;
  volumeCents: number;
  avgDaysInStage: number;
}

export interface SLABreach {
  applicationId: string;
  loanNumber?: string;
  milestone: Milestone;
  daysInStage: number;
  slaHours: number;
  breachedAt: Date;
}

export interface PipelineMetrics {
  byMilestone: PipelineMilestoneMetrics[];
  slaBreaches: SLABreach[];
  totalVolumeCents: number;
  totalCount: number;
}

export interface RiskBucket {
  range: string;
  count: number;
  min: number;
  max: number;
}

export interface StateDistribution {
  state: string;
  count: number;
  volumeCents: number;
}

export interface RiskDistribution {
  dscr: { buckets: RiskBucket[] };
  ltv: { buckets: RiskBucket[] };
  creditScore: { buckets: RiskBucket[] };
  byState: StateDistribution[];
}

export interface VelocityMetrics {
  period: string; // e.g., "2024-01" for monthly
  avgDaysLeadToFund: number;
  count: number;
}

export interface AnalyticsEvent {
  id: string;
  event: string;
  properties?: Record<string, unknown>;
  timestamp: Date;
  sessionId?: string;
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AnalyticsQuery {
  from?: Date;
  to?: Date;
  groupBy?: 'day' | 'week' | 'month';
  source?: string;
  loanOfficerId?: string;
}

// -----------------------------------------------------------------------------
// SLA Configuration
// -----------------------------------------------------------------------------

export const MILESTONE_SLA_HOURS: Record<Milestone, number> = {
  STARTED: 24,
  APPLICATION: 24,
  PRE_APPROVED: 48,
  PROCESSING: 120, // 5 days
  SUBMITTED: 72,   // 3 days
  CONDITIONALLY_APPROVED: 48,
  APPROVED: 24,
  DOCS_OUT: 48,
  DOCS_BACK: 24,
  CLEAR_TO_CLOSE: 24,
  CLOSING: 72,
  FUNDED: 24,
  COMPLETION: 168, // 7 days for post-close
  DENIED: 0,
  WITHDRAWN: 0,
};

// -----------------------------------------------------------------------------
// Analytics Service
// -----------------------------------------------------------------------------

export class AnalyticsService {
  private db: any; // Database connection - would be injected in real implementation
  private cache: Map<string, { data: any; expiry: Date }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(db: any) {
    this.db = db;
  }

  // ---------------------------------------------------------------------------
  // Funnel Analytics
  // ---------------------------------------------------------------------------

  async getFunnelMetrics(query: AnalyticsQuery = {}): Promise<FunnelMetrics> {
    const cacheKey = `funnel:${JSON.stringify(query)}`;
    const cached = this.getFromCache<FunnelMetrics>(cacheKey);
    if (cached) return cached;

    const from = query.from || this.getDefaultFromDate();
    const to = query.to || new Date();

    // In a real implementation, these would be database queries
    const leadCount = await this.countLeadsByStage('NEW', from, to, query);
    const contactedCount = await this.countLeadsByStage('CONTACTED', from, to, query);
    const qualifiedCount = await this.countLeadsByStage('QUALIFIED', from, to, query);
    const applicationCount = await this.countApplicationsByMilestone('APPLICATION', from, to, query);
    const preApprovedCount = await this.countApplicationsByMilestone('PRE_APPROVED', from, to, query);
    const fundedCount = await this.countApplicationsByMilestone('FUNDED', from, to, query);

    const stages: FunnelStageMetrics[] = [
      {
        stage: 'LEAD',
        count: leadCount,
        conversionRate: null,
      },
      {
        stage: 'CONTACTED',
        count: contactedCount,
        conversionRate: leadCount > 0 ? contactedCount / leadCount : 0,
        previousStage: 'LEAD',
      },
      {
        stage: 'QUALIFIED',
        count: qualifiedCount,
        conversionRate: contactedCount > 0 ? qualifiedCount / contactedCount : 0,
        previousStage: 'CONTACTED',
      },
      {
        stage: 'APPLICATION',
        count: applicationCount,
        conversionRate: qualifiedCount > 0 ? applicationCount / qualifiedCount : 0,
        previousStage: 'QUALIFIED',
      },
      {
        stage: 'PRE_APPROVED',
        count: preApprovedCount,
        conversionRate: applicationCount > 0 ? preApprovedCount / applicationCount : 0,
        previousStage: 'APPLICATION',
      },
      {
        stage: 'FUNDED',
        count: fundedCount,
        conversionRate: preApprovedCount > 0 ? fundedCount / preApprovedCount : 0,
        previousStage: 'PRE_APPROVED',
      },
    ];

    const result: FunnelMetrics = {
      stages,
      overallConversion: leadCount > 0 ? fundedCount / leadCount : 0,
      period: { from, to },
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Marketing Analytics
  // ---------------------------------------------------------------------------

  async getMarketingMetrics(query: AnalyticsQuery = {}): Promise<MarketingMetrics> {
    const cacheKey = `marketing:${JSON.stringify(query)}`;
    const cached = this.getFromCache<MarketingMetrics>(cacheKey);
    if (cached) return cached;

    const from = query.from || this.getDefaultFromDate();
    const to = query.to || new Date();

    // Aggregate leads by source
    const bySource = await this.aggregateLeadsBySource(from, to);

    // Get email campaign metrics
    const emailMetrics = await this.getEmailCampaignMetrics(from, to);

    // Get web analytics
    const webMetrics = await this.getWebAnalytics(from, to);

    const result: MarketingMetrics = {
      bySource,
      emailMetrics,
      webMetrics,
      period: { from, to },
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Pipeline Analytics
  // ---------------------------------------------------------------------------

  async getPipelineMetrics(query: AnalyticsQuery = {}): Promise<PipelineMetrics> {
    const cacheKey = `pipeline:${JSON.stringify(query)}`;
    const cached = this.getFromCache<PipelineMetrics>(cacheKey);
    if (cached) return cached;

    // Get active applications grouped by milestone
    const byMilestone = await this.aggregateByMilestone(query);

    // Find SLA breaches
    const slaBreaches = await this.findSLABreaches();

    // Calculate totals
    const totalVolumeCents = byMilestone.reduce((sum, m) => sum + m.volumeCents, 0);
    const totalCount = byMilestone.reduce((sum, m) => sum + m.count, 0);

    const result: PipelineMetrics = {
      byMilestone,
      slaBreaches,
      totalVolumeCents,
      totalCount,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Risk Distribution
  // ---------------------------------------------------------------------------

  async getRiskDistribution(): Promise<RiskDistribution> {
    const cacheKey = 'risk-distribution';
    const cached = this.getFromCache<RiskDistribution>(cacheKey);
    if (cached) return cached;

    const dscrBuckets = await this.aggregateDSCRDistribution();
    const ltvBuckets = await this.aggregateLTVDistribution();
    const creditBuckets = await this.aggregateCreditScoreDistribution();
    const stateDistribution = await this.aggregateByState();

    const result: RiskDistribution = {
      dscr: { buckets: dscrBuckets },
      ltv: { buckets: ltvBuckets },
      creditScore: { buckets: creditBuckets },
      byState: stateDistribution,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Velocity Metrics
  // ---------------------------------------------------------------------------

  async getVelocityMetrics(query: AnalyticsQuery = {}): Promise<VelocityMetrics[]> {
    const cacheKey = `velocity:${JSON.stringify(query)}`;
    const cached = this.getFromCache<VelocityMetrics[]>(cacheKey);
    if (cached) return cached;

    const from = query.from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year
    const to = query.to || new Date();
    const groupBy = query.groupBy || 'month';

    const result = await this.calculateVelocityByPeriod(from, to, groupBy);

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Event Tracking
  // ---------------------------------------------------------------------------

  async trackEvent(event: AnalyticsEvent): Promise<void> {
    // Validate event
    if (!event.event) {
      throw new Error('Event name is required');
    }

    // Add timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // In a real implementation, this would:
    // 1. Write to a time-series database or event store
    // 2. Possibly publish to a message queue for real-time processing
    // 3. Batch writes for efficiency

    await this.persistEvent(event);

    // Invalidate relevant caches
    this.invalidateCachesForEvent(event);
  }

  async trackPageView(
    page: string,
    sessionId?: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.trackEvent({
      id: this.generateEventId(),
      event: 'page_view',
      properties: { page, ...metadata },
      timestamp: new Date(),
      sessionId,
      userId,
    });
  }

  async trackLeadFormStarted(sessionId?: string, source?: string): Promise<void> {
    await this.trackEvent({
      id: this.generateEventId(),
      event: 'lead_form_started',
      properties: { source },
      timestamp: new Date(),
      sessionId,
    });
  }

  async trackLeadFormSubmitted(
    sessionId?: string,
    source?: string,
    utmParams?: Record<string, string>
  ): Promise<void> {
    await this.trackEvent({
      id: this.generateEventId(),
      event: 'lead_form_submitted',
      properties: { source, ...utmParams },
      timestamp: new Date(),
      sessionId,
    });
  }

  // ---------------------------------------------------------------------------
  // Private Helper Methods
  // ---------------------------------------------------------------------------

  private getDefaultFromDate(): Date {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > new Date()) {
      return entry.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expiry: new Date(Date.now() + this.CACHE_TTL_MS),
    });
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private invalidateCachesForEvent(event: AnalyticsEvent): void {
    // Invalidate caches that might be affected by this event
    if (event.event.includes('lead')) {
      this.cache.delete('funnel:{}');
      // Also invalidate with common query variations
    }
    if (event.event.includes('page_view')) {
      this.cache.delete('marketing:{}');
    }
  }

  // ---------------------------------------------------------------------------
  // Database Query Methods (Stubs - would be implemented with actual DB)
  // ---------------------------------------------------------------------------

  private async countLeadsByStage(
    stage: string,
    from: Date,
    to: Date,
    query: AnalyticsQuery
  ): Promise<number> {
    // SELECT COUNT(*) FROM leads
    // WHERE status >= stage AND created_at BETWEEN from AND to
    // AND (loan_officer_id = query.loanOfficerId OR query.loanOfficerId IS NULL)
    return 0; // Stub
  }

  private async countApplicationsByMilestone(
    milestone: string,
    from: Date,
    to: Date,
    query: AnalyticsQuery
  ): Promise<number> {
    // SELECT COUNT(*) FROM applications
    // WHERE milestone >= milestone AND created_at BETWEEN from AND to
    return 0; // Stub
  }

  private async aggregateLeadsBySource(
    from: Date,
    to: Date
  ): Promise<MarketingSourceMetrics[]> {
    // SELECT source, COUNT(*) as leads,
    //   SUM(CASE WHEN converted = true THEN 1 ELSE 0 END) as conversions
    // FROM leads
    // WHERE created_at BETWEEN from AND to
    // GROUP BY source
    return []; // Stub
  }

  private async getEmailCampaignMetrics(from: Date, to: Date): Promise<EmailMetrics> {
    // Aggregate from email service provider or marketing automation platform
    return {
      sent: 0,
      opened: 0,
      openRate: 0,
      clicked: 0,
      ctr: 0,
      converted: 0,
    }; // Stub
  }

  private async getWebAnalytics(from: Date, to: Date): Promise<WebMetrics> {
    // Aggregate from analytics events or third-party analytics
    return {
      visitors: 0,
      leadSubmissions: 0,
      conversionRate: 0,
    }; // Stub
  }

  private async aggregateByMilestone(
    query: AnalyticsQuery
  ): Promise<PipelineMilestoneMetrics[]> {
    // SELECT milestone, COUNT(*) as count, SUM(loan_amount_cents) as volume,
    //   AVG(EXTRACT(EPOCH FROM (NOW() - milestone_updated_at)) / 86400) as avg_days
    // FROM applications
    // WHERE status = 'ACTIVE'
    // GROUP BY milestone
    return []; // Stub
  }

  private async findSLABreaches(): Promise<SLABreach[]> {
    // Find applications where time in current milestone exceeds SLA
    // SELECT a.id, a.loan_number, a.milestone,
    //   EXTRACT(EPOCH FROM (NOW() - a.milestone_updated_at)) / 86400 as days_in_stage
    // FROM applications a
    // WHERE a.status = 'ACTIVE'
    //   AND EXTRACT(EPOCH FROM (NOW() - a.milestone_updated_at)) / 3600 > SLA_HOURS[a.milestone]
    return []; // Stub
  }

  private async aggregateDSCRDistribution(): Promise<RiskBucket[]> {
    // SELECT
    //   CASE
    //     WHEN dscr < 1.0 THEN '<1.0'
    //     WHEN dscr < 1.1 THEN '1.0-1.1'
    //     WHEN dscr < 1.2 THEN '1.1-1.2'
    //     WHEN dscr < 1.3 THEN '1.2-1.3'
    //     ELSE '1.3+'
    //   END as range,
    //   COUNT(*) as count
    // FROM applications
    // WHERE status = 'ACTIVE' AND dscr IS NOT NULL
    // GROUP BY range
    return [
      { range: '<1.0', count: 0, min: 0, max: 0.99 },
      { range: '1.0-1.1', count: 0, min: 1.0, max: 1.09 },
      { range: '1.1-1.2', count: 0, min: 1.1, max: 1.19 },
      { range: '1.2-1.3', count: 0, min: 1.2, max: 1.29 },
      { range: '1.3+', count: 0, min: 1.3, max: 999 },
    ]; // Stub
  }

  private async aggregateLTVDistribution(): Promise<RiskBucket[]> {
    return [
      { range: '50-60%', count: 0, min: 50, max: 59.99 },
      { range: '60-65%', count: 0, min: 60, max: 64.99 },
      { range: '65-70%', count: 0, min: 65, max: 69.99 },
      { range: '70-75%', count: 0, min: 70, max: 74.99 },
      { range: '75-80%', count: 0, min: 75, max: 80 },
    ]; // Stub
  }

  private async aggregateCreditScoreDistribution(): Promise<RiskBucket[]> {
    return [
      { range: '660-700', count: 0, min: 660, max: 699 },
      { range: '700-740', count: 0, min: 700, max: 739 },
      { range: '740-780', count: 0, min: 740, max: 779 },
      { range: '780+', count: 0, min: 780, max: 850 },
    ]; // Stub
  }

  private async aggregateByState(): Promise<StateDistribution[]> {
    // SELECT property_state as state, COUNT(*) as count,
    //   SUM(loan_amount_cents) as volume
    // FROM applications
    // WHERE status = 'ACTIVE'
    // GROUP BY property_state
    // ORDER BY count DESC
    return []; // Stub
  }

  private async calculateVelocityByPeriod(
    from: Date,
    to: Date,
    groupBy: 'day' | 'week' | 'month'
  ): Promise<VelocityMetrics[]> {
    // SELECT DATE_TRUNC(groupBy, funded_at) as period,
    //   AVG(EXTRACT(EPOCH FROM (funded_at - created_at)) / 86400) as avg_days,
    //   COUNT(*) as count
    // FROM applications
    // WHERE milestone = 'FUNDED' AND funded_at BETWEEN from AND to
    // GROUP BY period
    // ORDER BY period
    return []; // Stub
  }

  private async persistEvent(event: AnalyticsEvent): Promise<void> {
    // INSERT INTO analytics_events (id, event, properties, timestamp, session_id, user_id)
    // VALUES (event.id, event.event, event.properties, event.timestamp, event.sessionId, event.userId)
    // Stub - would write to database
  }
}

// -----------------------------------------------------------------------------
// Factory function
// -----------------------------------------------------------------------------

export function createAnalyticsService(db: any): AnalyticsService {
  return new AnalyticsService(db);
}
