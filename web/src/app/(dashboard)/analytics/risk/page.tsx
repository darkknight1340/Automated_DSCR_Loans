'use client';

import { DSCRDistribution } from '@/components/analytics/DSCRDistribution';
import { ConversionMetrics } from '@/components/analytics/ConversionMetrics';
import type { RiskDistribution } from '@/types';

// Mock data - will be replaced with API calls
const mockRiskData: RiskDistribution = {
  dscr: {
    buckets: [
      { range: '<1.0', count: 3, min: 0, max: 0.99 },
      { range: '1.0-1.1', count: 8, min: 1.0, max: 1.09 },
      { range: '1.1-1.2', count: 22, min: 1.1, max: 1.19 },
      { range: '1.2-1.3', count: 35, min: 1.2, max: 1.29 },
      { range: '1.3+', count: 43, min: 1.3, max: 999 },
    ],
  },
  ltv: {
    buckets: [
      { range: '50-60%', count: 12, min: 50, max: 59.99 },
      { range: '60-65%', count: 25, min: 60, max: 64.99 },
      { range: '65-70%', count: 38, min: 65, max: 69.99 },
      { range: '70-75%', count: 28, min: 70, max: 74.99 },
      { range: '75-80%', count: 8, min: 75, max: 80 },
    ],
  },
  creditScore: {
    buckets: [
      { range: '660-700', count: 15, min: 660, max: 699 },
      { range: '700-740', count: 35, min: 700, max: 739 },
      { range: '740-780', count: 42, min: 740, max: 779 },
      { range: '780+', count: 19, min: 780, max: 850 },
    ],
  },
  byState: [
    { state: 'TX', count: 28, volumeCents: 980000000 },
    { state: 'FL', count: 22, volumeCents: 770000000 },
    { state: 'CA', count: 18, volumeCents: 810000000 },
    { state: 'AZ', count: 12, volumeCents: 420000000 },
    { state: 'GA', count: 10, volumeCents: 350000000 },
    { state: 'NC', count: 8, volumeCents: 280000000 },
    { state: 'TN', count: 7, volumeCents: 245000000 },
    { state: 'CO', count: 6, volumeCents: 210000000 },
  ],
};

const riskKPIs = [
  { label: 'Avg DSCR', value: '1.28', change: 2, changeLabel: 'vs last month' },
  { label: 'Avg LTV', value: '67.5%', change: -1, changeLabel: 'vs last month' },
  { label: 'Avg Credit Score', value: '738', change: 5, changeLabel: 'vs last month' },
  { label: 'State Concentration', value: '45%', change: -3, changeLabel: 'Top 3 states' },
];

export default function RiskAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Risk Distribution</h2>
        <p className="text-muted-foreground">
          Portfolio risk metrics and geographic concentration
        </p>
      </div>

      {/* Risk KPIs */}
      <ConversionMetrics metrics={riskKPIs} />

      {/* Risk Distribution Charts */}
      <DSCRDistribution data={mockRiskData} />
    </div>
  );
}
