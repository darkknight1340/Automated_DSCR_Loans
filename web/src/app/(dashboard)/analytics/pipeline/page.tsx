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

// Mock data - will be replaced with API calls
const mockPipelineData: PipelineMetrics = {
  byMilestone: [
    { milestone: 'APPLICATION', count: 12, volumeCents: 420000000, avgDaysInStage: 0.8 },
    { milestone: 'PRE_APPROVED', count: 18, volumeCents: 630000000, avgDaysInStage: 1.5 },
    { milestone: 'PROCESSING', count: 25, volumeCents: 875000000, avgDaysInStage: 4.2 },
    { milestone: 'SUBMITTED', count: 8, volumeCents: 280000000, avgDaysInStage: 2.1 },
    { milestone: 'CONDITIONALLY_APPROVED', count: 15, volumeCents: 525000000, avgDaysInStage: 1.8 },
    { milestone: 'APPROVED', count: 6, volumeCents: 210000000, avgDaysInStage: 0.5 },
    { milestone: 'DOCS_OUT', count: 10, volumeCents: 350000000, avgDaysInStage: 1.2 },
    { milestone: 'DOCS_BACK', count: 5, volumeCents: 175000000, avgDaysInStage: 0.8 },
    { milestone: 'CLEAR_TO_CLOSE', count: 8, volumeCents: 280000000, avgDaysInStage: 0.6 },
    { milestone: 'CLOSING', count: 4, volumeCents: 140000000, avgDaysInStage: 2.5 },
  ],
  slaBreaches: [
    {
      applicationId: 'app-001',
      loanNumber: '2024-0123',
      milestone: 'PROCESSING',
      daysInStage: 6.2,
      slaHours: 120,
      breachedAt: '2024-01-15T10:30:00Z',
    },
    {
      applicationId: 'app-002',
      loanNumber: '2024-0098',
      milestone: 'CLOSING',
      daysInStage: 4.1,
      slaHours: 72,
      breachedAt: '2024-01-16T14:00:00Z',
    },
  ],
  totalVolumeCents: 3885000000,
  totalCount: 111,
};

const pipelineKPIs = [
  { label: 'Total Pipeline', value: '$38.9M', change: 12, changeLabel: 'vs last month' },
  { label: 'Active Loans', value: '111', change: 8, changeLabel: 'vs last month' },
  { label: 'Avg Days to Fund', value: '18.5', change: -2, changeLabel: 'vs last month' },
  { label: 'SLA Compliance', value: '94%', change: 3, changeLabel: 'vs last month' },
];

export default function PipelineAnalyticsPage() {
  const [groupBy, setGroupBy] = useState('milestone');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline Analytics</h2>
          <p className="text-muted-foreground">
            Real-time pipeline volume and aging analysis
          </p>
        </div>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="milestone">By Milestone</SelectItem>
            <SelectItem value="lo">By Loan Officer</SelectItem>
            <SelectItem value="processor">By Processor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pipeline KPIs */}
      <ConversionMetrics metrics={pipelineKPIs} />

      {/* Pipeline Aging Charts */}
      <PipelineAging data={mockPipelineData} />
    </div>
  );
}
