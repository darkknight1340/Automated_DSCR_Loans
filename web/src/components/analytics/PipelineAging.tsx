'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PipelineMetrics } from '@/types';

interface PipelineAgingProps {
  data: PipelineMetrics;
}

const milestoneLabels: Record<string, string> = {
  LEADS: 'Leads',
  LEADS_VERIFIED: 'Verified/Qualified',
  CONTACTED: 'Contacted',
  REACHED_LANDING: 'Reached Landing',
  VERIFIED_INFO: 'Verified Info',
  FUNDED: 'Funded',
};

const COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(217, 91%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(172, 66%, 50%)',
  'hsl(142, 71%, 45%)',
  'hsl(84, 81%, 44%)',
];

export function PipelineAging({ data }: PipelineAgingProps) {
  const chartData = data.byMilestone.map((item, index) => ({
    name: milestoneLabels[item.milestone] || item.milestone,
    count: item.count,
    volume: item.volumeCents / 100,
    avgDays: item.avgDaysInStage,
    fill: COLORS[index % COLORS.length],
  }));

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Volume by Stage */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline by Stage</CardTitle>
          <CardDescription>Lead count and volume at each conversion stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  tick={{ fontSize: 11 }}
                />
                <YAxis yAxisId="left" orientation="left" stroke="hsl(221, 83%, 53%)" />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="hsl(142, 71%, 45%)"
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'volume') return [formatCurrency(Number(value)), 'Volume'];
                    return [value, 'Count'];
                  }}
                />
                <Bar yAxisId="left" dataKey="count" fill="hsl(221, 83%, 53%)" name="count" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="volume" fill="hsl(142, 71%, 45%)" name="volume" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: 'hsl(221, 83%, 53%)' }} />
              <span className="text-muted-foreground">Count</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: 'hsl(142, 71%, 45%)' }} />
              <span className="text-muted-foreground">Volume</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Average Days in Stage */}
      <Card>
        <CardHeader>
          <CardTitle>Average Days in Stage</CardTitle>
          <CardDescription>Time spent at each stage of the conversion funnel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} unit=" days" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} days`, 'Avg Time']} />
                <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <rect key={`cell-${index}`} fill={entry.fill} />
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
