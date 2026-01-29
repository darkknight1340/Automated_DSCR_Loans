'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Metric {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
}

interface ConversionMetricsProps {
  metrics: Metric[];
}

export function ConversionMetrics({ metrics }: ConversionMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <Card key={index}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {metric.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            {metric.change !== undefined && (
              <div
                className={cn(
                  'flex items-center gap-1 text-sm',
                  metric.change > 0 ? 'text-green-600' : metric.change < 0 ? 'text-red-600' : 'text-muted-foreground'
                )}
              >
                {metric.change > 0 ? (
                  <ArrowUp className="h-4 w-4" />
                ) : metric.change < 0 ? (
                  <ArrowDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                <span>
                  {metric.change > 0 ? '+' : ''}
                  {metric.change}%
                </span>
                {metric.changeLabel && (
                  <span className="text-muted-foreground">{metric.changeLabel}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
