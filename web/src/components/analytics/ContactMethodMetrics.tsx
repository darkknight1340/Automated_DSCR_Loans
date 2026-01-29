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
import { Mail, Phone, MessageSquare, FileText } from 'lucide-react';

export interface ContactMethodData {
  method: 'email' | 'physical_mail' | 'voice_call' | 'text';
  label: string;
  contacted: number;
  converted: number;
  conversionRate: number;
}

interface ContactMethodMetricsProps {
  data: ContactMethodData[];
}

const COLORS: Record<string, string> = {
  email: 'hsl(221, 83%, 53%)',
  physical_mail: 'hsl(38, 92%, 50%)',
  voice_call: 'hsl(142, 71%, 45%)',
  text: 'hsl(280, 65%, 60%)',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  physical_mail: FileText,
  voice_call: Phone,
  text: MessageSquare,
};

export function ContactMethodMetrics({ data }: ContactMethodMetricsProps) {
  const chartData = data.map((item) => ({
    ...item,
    fill: COLORS[item.method],
  }));

  const totalContacted = data.reduce((sum, d) => sum + d.contacted, 0);
  const totalConverted = data.reduce((sum, d) => sum + d.converted, 0);
  const overallConversion = totalContacted > 0 ? totalConverted / totalContacted : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion by Contact Method</CardTitle>
          <CardDescription>Compare conversion rates across different outreach channels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="label" width={80} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Conversion Rate']}
                />
                <Bar dataKey="conversionRate" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Method Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Method Breakdown</CardTitle>
          <CardDescription>
            Overall conversion: {(overallConversion * 100).toFixed(1)}% ({totalConverted} of {totalContacted})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.map((item) => {
              const Icon = ICONS[item.method];
              const color = COLORS[item.method];
              return (
                <div
                  key={item.method}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <span style={{ color }}>
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.converted} converted of {item.contacted} contacted
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold" style={{ color }}>
                      {(item.conversionRate).toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
