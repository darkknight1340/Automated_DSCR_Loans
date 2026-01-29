'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FunnelStage } from '@/types';

interface FunnelChartProps {
  stages: FunnelStage[];
  title?: string;
  description?: string;
}

const COLORS = [
  'hsl(221, 83%, 53%)', // Blue
  'hsl(217, 91%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(172, 66%, 50%)',
  'hsl(142, 71%, 45%)',
  'hsl(84, 81%, 44%)',  // Green
];

const stageLabels: Record<string, string> = {
  LEAD: 'Lead',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  APPLICATION: 'Application',
  PRE_APPROVED: 'Pre-Approved',
  FUNDED: 'Funded',
};

export function FunnelChart({ stages, title = 'Conversion Funnel', description }: FunnelChartProps) {
  const chartData = useMemo(() => {
    return stages.map((stage, index) => ({
      name: stageLabels[stage.stage] || stage.stage,
      count: stage.count,
      conversionRate: stage.conversionRate,
      fill: COLORS[index % COLORS.length],
    }));
  }, [stages]);

  const overallConversion = useMemo(() => {
    if (stages.length < 2) return null;
    const first = stages[0]?.count || 0;
    const last = stages[stages.length - 1]?.count || 0;
    return first > 0 ? ((last / first) * 100).toFixed(1) : '0';
  }, [stages]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {overallConversion && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Overall Conversion</p>
              <p className="text-2xl font-bold text-primary">{overallConversion}%</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <LabelList dataKey="count" position="right" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage-to-stage conversion rates */}
        <div className="mt-4 flex flex-wrap gap-2">
          {stages.slice(1).map((stage, index) => {
            const fromStage = stageLabels[stages[index].stage] || stages[index].stage;
            const toStage = stageLabels[stage.stage] || stage.stage;
            return (
              <div
                key={stage.stage}
                className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">
                  {fromStage} &rarr; {toStage}
                </span>
                <span className="font-medium" style={{ color: COLORS[index + 1] }}>
                  {stage.conversionRate !== null
                    ? `${(stage.conversionRate * 100).toFixed(0)}%`
                    : '-'}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
