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
import { Progress } from '@/components/ui/progress';
import type { MarketingMetrics as MarketingMetricsType } from '@/types';

interface MarketingMetricsProps {
  data: MarketingMetricsType;
}

const COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(280, 65%, 60%)',
  'hsl(199, 89%, 48%)',
];

export function MarketingMetrics({ data }: MarketingMetricsProps) {
  const sourceData = data.bySource.map((source, index) => ({
    ...source,
    fill: COLORS[index % COLORS.length],
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Source Attribution */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Sources</CardTitle>
          <CardDescription>Leads and conversions by marketing source</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="source" width={60} />
                <Tooltip />
                <Bar dataKey="leads" fill="hsl(221, 83%, 53%)" name="Leads" radius={[0, 4, 4, 0]} />
                <Bar dataKey="conversions" fill="hsl(142, 71%, 45%)" name="Conversions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Source Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Source Distribution</CardTitle>
          <CardDescription>Lead volume by source</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  dataKey="leads"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) => name && percent ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                >
                  {sourceData.map((entry, index) => (
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

      {/* Email Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Email Performance</CardTitle>
          <CardDescription>Campaign email metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Open Rate</span>
              <span className="font-medium">{(data.emailMetrics.openRate * 100).toFixed(1)}%</span>
            </div>
            <Progress value={data.emailMetrics.openRate * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {data.emailMetrics.opened.toLocaleString()} opened of {data.emailMetrics.sent.toLocaleString()} sent
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Click-Through Rate</span>
              <span className="font-medium">{(data.emailMetrics.ctr * 100).toFixed(1)}%</span>
            </div>
            <Progress value={data.emailMetrics.ctr * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {data.emailMetrics.clicked.toLocaleString()} clicked of {data.emailMetrics.opened.toLocaleString()} opened
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Email to Conversion</span>
              <span className="font-medium">
                {((data.emailMetrics.converted / data.emailMetrics.sent) * 100).toFixed(2)}%
              </span>
            </div>
            <Progress value={(data.emailMetrics.converted / data.emailMetrics.sent) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {data.emailMetrics.converted.toLocaleString()} conversions
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Web Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Website Performance</CardTitle>
          <CardDescription>Website visitor to lead conversion</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{data.webMetrics.visitors.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Visitors</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{data.webMetrics.leadSubmissions.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Leads</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {(data.webMetrics.conversionRate * 100).toFixed(2)}%
              </p>
              <p className="text-sm text-muted-foreground">Conversion</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Visitor to Lead Rate</span>
              <span className="font-medium">{(data.webMetrics.conversionRate * 100).toFixed(2)}%</span>
            </div>
            <Progress value={data.webMetrics.conversionRate * 100} className="h-2" />
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              For every <span className="font-medium text-foreground">100</span> website visitors,
              approximately{' '}
              <span className="font-medium text-primary">
                {Math.round(data.webMetrics.conversionRate * 100)}
              </span>{' '}
              submit a lead form.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
