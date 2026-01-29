'use client';

import { useState } from 'react';
import { PipelineAging } from '@/components/analytics/PipelineAging';
import { ConversionMetrics } from '@/components/analytics/ConversionMetrics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PipelineMetrics } from '@/types';

// Mock data - matches funnel stages
const mockPipelineData: PipelineMetrics = {
  byMilestone: [
    { milestone: 'LEADS', count: 500, volumeCents: 1750000000, avgDaysInStage: 0 },
    { milestone: 'LEADS_VERIFIED', count: 320, volumeCents: 1120000000, avgDaysInStage: 1.2 },
    { milestone: 'CONTACTED', count: 240, volumeCents: 840000000, avgDaysInStage: 2.5 },
    { milestone: 'REACHED_LANDING', count: 180, volumeCents: 630000000, avgDaysInStage: 1.8 },
    { milestone: 'VERIFIED_INFO', count: 95, volumeCents: 332500000, avgDaysInStage: 3.2 },
    { milestone: 'FUNDED', count: 45, volumeCents: 157500000, avgDaysInStage: 5.5 },
  ],
  slaBreaches: [],
  totalVolumeCents: 4830000000,
  totalCount: 1380,
};

const pipelineKPIs = [
  { label: 'Total Pipeline', value: '$48.3M', change: 12, changeLabel: 'vs last month' },
  { label: 'Active Leads', value: '1,380', change: 8, changeLabel: 'vs last month' },
  { label: 'Avg Days to Fund', value: '14.2', change: -2, changeLabel: 'vs last month' },
  { label: 'Conversion Rate', value: '9%', change: 1, changeLabel: 'vs last month' },
];

export default function PipelineAnalyticsPage() {
  const [period, setPeriod] = useState('30d');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline Analytics</h2>
          <p className="text-muted-foreground">
            Pipeline volume and conversion by stage
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

      {/* Pipeline KPIs */}
      <ConversionMetrics metrics={pipelineKPIs} />

      {/* Pipeline Charts */}
      <PipelineAging data={mockPipelineData} />
    </div>
  );
}
