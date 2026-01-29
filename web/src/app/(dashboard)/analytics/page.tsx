'use client';

import { useState } from 'react';
import { FunnelChart } from '@/components/analytics/FunnelChart';
import { ConversionMetrics } from '@/components/analytics/ConversionMetrics';
import { MarketingMetrics } from '@/components/analytics/MarketingMetrics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FunnelMetrics, MarketingMetrics as MarketingMetricsType } from '@/types';

// Mock data - will be replaced with API calls
const mockFunnelData: FunnelMetrics = {
  stages: [
    { stage: 'LEAD', count: 150, conversionRate: null },
    { stage: 'CONTACTED', count: 120, conversionRate: 0.80 },
    { stage: 'QUALIFIED', count: 90, conversionRate: 0.75 },
    { stage: 'APPLICATION', count: 75, conversionRate: 0.83 },
    { stage: 'PRE_APPROVED', count: 60, conversionRate: 0.80 },
    { stage: 'FUNDED', count: 45, conversionRate: 0.75 },
  ],
  overallConversion: 0.30,
  period: { from: '2024-01-01', to: '2024-01-31' },
};

const mockMarketingData: MarketingMetricsType = {
  bySource: [
    { source: 'Google Ads', leads: 50, conversions: 15, conversionRate: 0.30 },
    { source: 'Facebook', leads: 35, conversions: 10, conversionRate: 0.29 },
    { source: 'Referral', leads: 30, conversions: 12, conversionRate: 0.40 },
    { source: 'Organic', leads: 25, conversions: 6, conversionRate: 0.24 },
    { source: 'Partner', leads: 10, conversions: 2, conversionRate: 0.20 },
  ],
  emailMetrics: {
    sent: 2500,
    opened: 875,
    openRate: 0.35,
    clicked: 262,
    ctr: 0.30,
    converted: 45,
  },
  webMetrics: {
    visitors: 8500,
    leadSubmissions: 150,
    conversionRate: 0.018,
  },
  period: { from: '2024-01-01', to: '2024-01-31' },
};

const conversionMetrics = [
  { label: 'Lead to Contact', value: '80%', change: 5, changeLabel: 'vs last period' },
  { label: 'Contact to Qualified', value: '75%', change: -2, changeLabel: 'vs last period' },
  { label: 'Qualified to Application', value: '83%', change: 8, changeLabel: 'vs last period' },
  { label: 'Application to Funded', value: '60%', change: 3, changeLabel: 'vs last period' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Funnel Analytics</h2>
          <p className="text-muted-foreground">
            Track lead-to-funded conversion with marketing attribution
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conversion KPIs */}
      <ConversionMetrics metrics={conversionMetrics} />

      {/* Funnel Chart */}
      <FunnelChart
        stages={mockFunnelData.stages}
        title="Lead to Funded Conversion"
        description="Conversion rates through each stage of the funnel"
      />

      {/* Marketing Metrics */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">Marketing Performance</h3>
        <MarketingMetrics data={mockMarketingData} />
      </div>
    </div>
  );
}
