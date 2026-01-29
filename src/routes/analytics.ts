/**
 * Analytics Routes
 *
 * Endpoints for funnel analytics, pipeline metrics, and marketing attribution
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface AnalyticsQuery {
  from?: string;
  to?: string;
  groupBy?: string;
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  /**
   * GET /analytics/funnel
   * Get funnel conversion metrics
   */
  fastify.get('/funnel', async (
    request: FastifyRequest<{ Querystring: AnalyticsQuery }>,
    reply: FastifyReply
  ) => {
    // Sample funnel data - replace with database queries
    return {
      stages: [
        { stage: 'LEAD', count: 150, conversionRate: null },
        { stage: 'CONTACTED', count: 120, conversionRate: 0.80 },
        { stage: 'QUALIFIED', count: 90, conversionRate: 0.75 },
        { stage: 'APPLICATION', count: 75, conversionRate: 0.83 },
        { stage: 'PRE_APPROVED', count: 60, conversionRate: 0.80 },
        { stage: 'FUNDED', count: 45, conversionRate: 0.75 },
      ],
      overallConversion: 0.30,
      period: {
        from: request.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: request.query.to || new Date().toISOString(),
      },
    };
  });

  /**
   * GET /analytics/marketing
   * Get marketing attribution metrics
   */
  fastify.get('/marketing', async (
    request: FastifyRequest<{ Querystring: AnalyticsQuery }>,
    reply: FastifyReply
  ) => {
    return {
      bySource: [
        { source: 'google', leads: 50, conversions: 15, conversionRate: 0.30, spend: 5000, cpl: 100 },
        { source: 'facebook', leads: 30, conversions: 8, conversionRate: 0.27, spend: 2500, cpl: 83 },
        { source: 'referral', leads: 25, conversions: 10, conversionRate: 0.40, spend: 0, cpl: 0 },
        { source: 'direct', leads: 20, conversions: 7, conversionRate: 0.35, spend: 0, cpl: 0 },
        { source: 'email', leads: 15, conversions: 5, conversionRate: 0.33, spend: 500, cpl: 33 },
      ],
      emailMetrics: {
        sent: 5000,
        opened: 1750,
        openRate: 0.35,
        clicked: 600,
        ctr: 0.12,
        converted: 25,
        conversionRate: 0.042,
      },
      webMetrics: {
        visitors: 10000,
        uniqueVisitors: 7500,
        pageViews: 35000,
        avgSessionDuration: 180,
        bounceRate: 0.45,
        leadSubmissions: 150,
        conversionRate: 0.02,
      },
      period: {
        from: request.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: request.query.to || new Date().toISOString(),
      },
    };
  });

  /**
   * GET /analytics/pipeline
   * Get pipeline volume and aging metrics
   */
  fastify.get('/pipeline', async (
    request: FastifyRequest<{ Querystring: AnalyticsQuery }>,
    reply: FastifyReply
  ) => {
    return {
      byMilestone: [
        { milestone: 'APPLICATION', count: 12, volume: 4200000, avgDays: 1.5 },
        { milestone: 'PRE_APPROVED', count: 18, volume: 6500000, avgDays: 2.3 },
        { milestone: 'PROCESSING', count: 25, volume: 8500000, avgDays: 5.1 },
        { milestone: 'SUBMITTED_TO_UW', count: 15, volume: 5200000, avgDays: 3.2 },
        { milestone: 'APPROVED', count: 8, volume: 2800000, avgDays: 1.8 },
        { milestone: 'CLEAR_TO_CLOSE', count: 10, volume: 3500000, avgDays: 2.5 },
        { milestone: 'DOCS_OUT', count: 6, volume: 2100000, avgDays: 1.2 },
        { milestone: 'FUNDED', count: 4, volume: 1400000, avgDays: 0.5 },
      ],
      totalPipeline: {
        count: 98,
        volume: 34200000,
        avgDaysToFund: 21.5,
      },
      slaBreaches: [
        { applicationId: 'app-001', milestone: 'PROCESSING', daysInStage: 8, slaHours: 120 },
        { applicationId: 'app-002', milestone: 'SUBMITTED_TO_UW', daysInStage: 5, slaHours: 72 },
      ],
      velocity: {
        last30Days: { avgDaysToFund: 21.5, fundedCount: 45, fundedVolume: 15750000 },
        last90Days: { avgDaysToFund: 23.2, fundedCount: 125, fundedVolume: 43750000 },
      },
    };
  });

  /**
   * GET /analytics/risk-distribution
   * Get DSCR, LTV, and credit score distribution
   */
  fastify.get('/risk-distribution', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    return {
      dscr: {
        buckets: [
          { range: '< 1.0', count: 3, percent: 3 },
          { range: '1.0 - 1.1', count: 8, percent: 8 },
          { range: '1.1 - 1.2', count: 15, percent: 15 },
          { range: '1.2 - 1.3', count: 28, percent: 29 },
          { range: '1.3 - 1.5', count: 32, percent: 33 },
          { range: '> 1.5', count: 12, percent: 12 },
        ],
        stats: { avg: 1.28, median: 1.25, min: 0.92, max: 1.85 },
      },
      ltv: {
        buckets: [
          { range: '< 60%', count: 12, percent: 12 },
          { range: '60-65%', count: 18, percent: 18 },
          { range: '65-70%', count: 25, percent: 26 },
          { range: '70-75%', count: 28, percent: 29 },
          { range: '75-80%', count: 15, percent: 15 },
        ],
        stats: { avg: 68.5, median: 70, min: 45, max: 80 },
      },
      creditScore: {
        buckets: [
          { range: '660-679', count: 8, percent: 8 },
          { range: '680-699', count: 15, percent: 15 },
          { range: '700-719', count: 22, percent: 23 },
          { range: '720-739', count: 28, percent: 29 },
          { range: '740-759', count: 18, percent: 18 },
          { range: '760+', count: 7, percent: 7 },
        ],
        stats: { avg: 718, median: 720, min: 662, max: 785 },
      },
      byState: [
        { state: 'TX', count: 35, volume: 12250000 },
        { state: 'FL', count: 22, volume: 7700000 },
        { state: 'CA', count: 18, volume: 8100000 },
        { state: 'AZ', count: 12, volume: 4200000 },
        { state: 'GA', count: 8, volume: 2800000 },
        { state: 'Other', count: 3, volume: 1150000 },
      ],
    };
  });

  /**
   * GET /analytics/velocity
   * Get time-to-fund velocity metrics
   */
  fastify.get('/velocity', async (
    request: FastifyRequest<{ Querystring: AnalyticsQuery }>,
    reply: FastifyReply
  ) => {
    return [
      { period: '2024-01', avgDaysToFund: 24.5, fundedCount: 38, fundedVolume: 13300000 },
      { period: '2024-02', avgDaysToFund: 23.2, fundedCount: 42, fundedVolume: 14700000 },
      { period: '2024-03', avgDaysToFund: 22.1, fundedCount: 45, fundedVolume: 15750000 },
      { period: '2024-04', avgDaysToFund: 21.5, fundedCount: 48, fundedVolume: 16800000 },
    ];
  });

  /**
   * POST /analytics/events
   * Track analytics event
   */
  fastify.post('/events', async (
    request: FastifyRequest<{
      Body: {
        event: string;
        properties?: Record<string, unknown>;
        timestamp?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { event, properties, timestamp } = request.body;

    // Log the event (in production, send to analytics service)
    console.log('Analytics event:', {
      event,
      properties,
      timestamp: timestamp || new Date().toISOString(),
    });

    return { success: true };
  });
}
