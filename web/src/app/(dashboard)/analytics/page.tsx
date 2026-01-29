'use client';

import { useState } from 'react';
import { FunnelChart } from '@/components/analytics/FunnelChart';
import { ConversionMetrics } from '@/components/analytics/ConversionMetrics';
import { ContactMethodMetrics, type ContactMethodData } from '@/components/analytics/ContactMethodMetrics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FunnelMetrics } from '@/types';

// Mock data - will be replaced with API calls
const mockFunnelData: FunnelMetrics = {
  stages: [
    { stage: 'Leads', count: 500, conversionRate: null },
    { stage: 'Leads Verified/Qualified', count: 320, conversionRate: 0.64 },
    { stage: 'Contacted', count: 240, conversionRate: 0.75 },
    { stage: 'Reached Landing Page', count: 180, conversionRate: 0.75 },
    { stage: 'Verified Information', count: 95, conversionRate: 0.53 },
    { stage: 'Funded', count: 45, conversionRate: 0.47 },
  ],
  overallConversion: 0.09,
  period: { from: '2024-01-01', to: '2024-01-31' },
};

const mockContactMethodData: ContactMethodData[] = [
  { method: 'voice_call', label: 'Voice Call', contacted: 85, converted: 38, conversionRate: 44.7 },
  { method: 'email', label: 'Email', contacted: 120, converted: 42, conversionRate: 35.0 },
  { method: 'text', label: 'Text Message', contacted: 65, converted: 20, conversionRate: 30.8 },
  { method: 'physical_mail', label: 'Physical Mail', contacted: 30, converted: 5, conversionRate: 16.7 },
];

const conversionMetrics = [
  { label: 'Lead to Verified', value: '64%', change: 5, changeLabel: 'vs last period' },
  { label: 'Verified to Contacted', value: '75%', change: -2, changeLabel: 'vs last period' },
  { label: 'Contacted to Landing Page', value: '75%', change: 8, changeLabel: 'vs last period' },
  { label: 'Verified Info to Funded', value: '47%', change: 3, changeLabel: 'vs last period' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Funnel Analytics</h2>
          <p className="text-muted-foreground">
            Track lead-to-funded conversion rates
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

      {/* Conversion by Contact Method */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">Conversion by Contact Method</h3>
        <ContactMethodMetrics data={mockContactMethodData} />
      </div>
    </div>
  );
}
