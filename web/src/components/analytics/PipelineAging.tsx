'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';
import type { PipelineMetrics } from '@/types';

interface PipelineAgingProps {
  data: PipelineMetrics;
}

const milestoneLabels: Record<string, string> = {
  STARTED: 'Started',
  APPLICATION: 'Application',
  PRE_APPROVED: 'Pre-Approved',
  PROCESSING: 'Processing',
  SUBMITTED: 'Submitted',
  CONDITIONALLY_APPROVED: 'Cond. Approved',
  APPROVED: 'Approved',
  DOCS_OUT: 'Docs Out',
  DOCS_BACK: 'Docs Back',
  CLEAR_TO_CLOSE: 'CTC',
  CLOSING: 'Closing',
  FUNDED: 'Funded',
};

const SLA_LIMITS: Record<string, number> = {
  APPLICATION: 1,
  PRE_APPROVED: 2,
  PROCESSING: 5,
  SUBMITTED: 3,
  CONDITIONALLY_APPROVED: 2,
  APPROVED: 1,
  DOCS_OUT: 2,
  DOCS_BACK: 1,
  CLEAR_TO_CLOSE: 1,
  CLOSING: 3,
};

export function PipelineAging({ data }: PipelineAgingProps) {
  const chartData = data.byMilestone.map((item) => {
    const slaLimit = SLA_LIMITS[item.milestone] || 5;
    const isOverSLA = item.avgDaysInStage > slaLimit;
    const isNearSLA = item.avgDaysInStage > slaLimit * 0.8;

    return {
      name: milestoneLabels[item.milestone] || item.milestone,
      avgDays: item.avgDaysInStage,
      count: item.count,
      volume: item.volumeCents / 100,
      slaLimit,
      fill: isOverSLA
        ? 'hsl(0, 84%, 60%)'
        : isNearSLA
          ? 'hsl(38, 92%, 50%)'
          : 'hsl(142, 71%, 45%)',
    };
  });

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
      {/* Pipeline Volume by Milestone */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline by Milestone</CardTitle>
          <CardDescription>Loan count and volume at each stage</CardDescription>
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
                  tick={{ fontSize: 12 }}
                />
                <YAxis yAxisId="left" orientation="left" stroke="hsl(221, 83%, 53%)" />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="hsl(142, 71%, 45%)"
                />
                <Tooltip />
                <Bar yAxisId="left" dataKey="count" fill="hsl(221, 83%, 53%)" name="count" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="volume" fill="hsl(142, 71%, 45%)" name="volume" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Average Days in Stage</CardTitle>
          <CardDescription>
            <span className="mr-2">Color indicates SLA status:</span>
            <Badge variant="outline" className="mr-1 bg-green-100 text-green-700">On Track</Badge>
            <Badge variant="outline" className="mr-1 bg-yellow-100 text-yellow-700">Near SLA</Badge>
            <Badge variant="outline" className="bg-red-100 text-red-700">Over SLA</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} unit=" days" />
                <YAxis type="category" dataKey="name" width={80} />
                <Tooltip />
                <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* SLA Breaches */}
      {data.slaBreaches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              SLA Breaches
            </CardTitle>
            <CardDescription>Loans that have exceeded their SLA limits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.slaBreaches.map((breach) => (
                <div
                  key={breach.applicationId}
                  className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3"
                >
                  <div>
                    <p className="font-medium">
                      Loan #{breach.loanNumber || breach.applicationId.slice(0, 8)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {milestoneLabels[breach.milestone] || breach.milestone}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-red-600">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">
                        {breach.daysInStage.toFixed(1)} days
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      SLA: {(breach.slaHours / 24).toFixed(0)} days
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
