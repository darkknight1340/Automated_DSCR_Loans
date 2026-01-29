'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RiskDistribution } from '@/types';

interface DSCRDistributionProps {
  data: RiskDistribution;
}

const DSCR_COLORS = [
  'hsl(0, 84%, 60%)',    // Red - Below 1.0
  'hsl(38, 92%, 50%)',   // Yellow - 1.0-1.1
  'hsl(172, 66%, 50%)',  // Teal - 1.1-1.2
  'hsl(142, 71%, 45%)',  // Green - 1.2-1.3
  'hsl(142, 76%, 36%)',  // Dark Green - 1.3+
];

const LTV_COLORS = [
  'hsl(142, 76%, 36%)',  // Dark Green - Low LTV
  'hsl(142, 71%, 45%)',  // Green
  'hsl(172, 66%, 50%)',  // Teal
  'hsl(38, 92%, 50%)',   // Yellow
  'hsl(0, 84%, 60%)',    // Red - High LTV
];

const CREDIT_COLORS = [
  'hsl(0, 84%, 60%)',    // Red - Low
  'hsl(38, 92%, 50%)',   // Yellow
  'hsl(142, 71%, 45%)',  // Green
  'hsl(142, 76%, 36%)',  // Dark Green - High
];

const STATE_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(199, 89%, 48%)',
  'hsl(172, 66%, 50%)',
  'hsl(142, 71%, 45%)',
  'hsl(84, 81%, 44%)',
  'hsl(38, 92%, 50%)',
  'hsl(280, 65%, 60%)',
  'hsl(0, 84%, 60%)',
];

export function DSCRDistribution({ data }: DSCRDistributionProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value / 100);
  };

  const dscrData = data.dscr.buckets.map((bucket, index) => ({
    ...bucket,
    fill: DSCR_COLORS[Math.min(index, DSCR_COLORS.length - 1)],
  }));

  const ltvData = data.ltv.buckets.map((bucket, index) => ({
    ...bucket,
    fill: LTV_COLORS[Math.min(index, LTV_COLORS.length - 1)],
  }));

  const creditData = data.creditScore.buckets.map((bucket, index) => ({
    ...bucket,
    fill: CREDIT_COLORS[Math.min(index, CREDIT_COLORS.length - 1)],
  }));

  const stateData = data.byState.slice(0, 8).map((state, index) => ({
    ...state,
    volumeFormatted: formatCurrency(state.volumeCents),
    fill: STATE_COLORS[index % STATE_COLORS.length],
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* DSCR Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>DSCR Distribution</CardTitle>
          <CardDescription>Debt Service Coverage Ratio across pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dscrData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" name="Loans" radius={[4, 4, 0, 0]}>
                  {dscrData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full" style={{ background: DSCR_COLORS[0] }} />
              <span>Below Min</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full" style={{ background: DSCR_COLORS[1] }} />
              <span>Marginal</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full" style={{ background: DSCR_COLORS[3] }} />
              <span>Good</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full" style={{ background: DSCR_COLORS[4] }} />
              <span>Excellent</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LTV Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>LTV Distribution</CardTitle>
          <CardDescription>Loan-to-Value ratio across pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ltvData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" name="Loans" radius={[4, 4, 0, 0]}>
                  {ltvData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Credit Score Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Score Tiers</CardTitle>
          <CardDescription>Borrower credit score distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={creditData}
                  dataKey="count"
                  nameKey="range"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) => name && percent ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                >
                  {creditData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Geographic Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Geographic Concentration</CardTitle>
          <CardDescription>Top 8 states by loan volume</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stateData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="state" width={40} />
                <Tooltip />
                <Bar dataKey="count" name="count" radius={[0, 4, 4, 0]}>
                  {stateData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
