'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PipelineData {
  totalVolume: number;
  totalApplications: number;
  avgLTV: number | null;
  avgDSCR: number | null;
  byPurpose: { purpose: string; count: number; volume: number }[];
  byDecision: { result: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const fmt = (dollars: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars);

const purposeLabel = (p: string) =>
  ({ PURCHASE: 'Purchase', RATE_TERM_REFI: 'Rate/Term Refi', CASH_OUT_REFI: 'Cash-Out Refi' }[p] ?? p);

const decisionColor = (r: string) => {
  if (r === 'APPROVED') return 'bg-green-100 text-green-800';
  if (r === 'DENIED') return 'bg-red-100 text-red-800';
  return 'bg-yellow-100 text-yellow-800';
};

const decisionLabel = (r: string) =>
  ({ APPROVED: 'Approved', DENIED: 'Denied', MANUAL_REVIEW: 'Referred' }[r] ?? r);

export default function PipelineAnalyticsPage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/analytics/pipeline`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline Analytics</h2>
          <p className="text-muted-foreground">Pipeline volume and breakdown</p>
        </div>
        <div className="rounded-lg border p-12 text-center">
          <p className="text-muted-foreground">No pipeline data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pipeline Analytics</h2>
        <p className="text-muted-foreground">Pipeline volume and breakdown by category</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(data.totalVolume)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalApplications}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg LTV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgLTV != null ? `${data.avgLTV}%` : '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg DSCR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgDSCR != null ? `${data.avgDSCR.toFixed(2)}x` : '-'}</div>
          </CardContent>
        </Card>
      </div>

      {/* By Loan Purpose */}
      <Card>
        <CardHeader>
          <CardTitle>By Loan Purpose</CardTitle>
          <CardDescription>Application volume grouped by loan purpose</CardDescription>
        </CardHeader>
        <CardContent>
          {data.byPurpose.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <div className="space-y-4">
              {data.byPurpose.map((p) => {
                const pct = data.totalApplications > 0 ? (p.count / data.totalApplications) * 100 : 0;
                return (
                  <div key={p.purpose}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{purposeLabel(p.purpose)}</span>
                      <span className="text-sm text-muted-foreground">
                        {p.count} apps &middot; {fmt(p.volume)}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Decision Result */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Results</CardTitle>
          <CardDescription>Breakdown by decision engine outcome</CardDescription>
        </CardHeader>
        <CardContent>
          {data.byDecision.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.byDecision.map((d) => (
                <div
                  key={d.result}
                  className={`flex items-center gap-2 rounded-lg px-4 py-3 ${decisionColor(d.result)}`}
                >
                  <span className="text-2xl font-bold">{d.count}</span>
                  <span className="text-sm font-medium">{decisionLabel(d.result)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Application Status */}
      <Card>
        <CardHeader>
          <CardTitle>Application Status</CardTitle>
          <CardDescription>Current status of all applications</CardDescription>
        </CardHeader>
        <CardContent>
          {data.byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.byStatus.map((s) => (
                <Badge key={s.status} variant="secondary" className="text-sm px-3 py-1">
                  {s.status}: {s.count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
