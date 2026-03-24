'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FunnelChart } from '@/components/analytics/FunnelChart';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface FunnelData {
  stages: { stage: string; count: number; conversionRate: number | null }[];
  overallConversion: number | null;
  decisionBreakdown: { approved: number; referred: number; denied: number };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function AnalyticsPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/analytics/funnel`)
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

  if (!data || data.stages.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline Analytics</h2>
          <p className="text-muted-foreground">Track lead-to-offer conversion rates</p>
        </div>
        <div className="rounded-lg border p-12 text-center">
          <p className="text-muted-foreground">No pipeline data yet. Process some leads to see analytics.</p>
        </div>
      </div>
    );
  }

  const { decisionBreakdown: db } = data;
  const totalDecisions = db.approved + db.referred + db.denied;
  const leadsCount = data.stages[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pipeline Analytics</h2>
        <p className="text-muted-foreground">Track lead-to-offer conversion rates</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leadsCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Decisions Made</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDecisions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {leadsCount > 0 ? `${Math.round((totalDecisions / leadsCount) * 100)}% of leads` : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalDecisions > 0 ? `${Math.round((db.approved / totalDecisions) * 100)}%` : '0%'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.overallConversion != null ? `${(data.overallConversion * 100).toFixed(1)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Lead to offer</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Chart */}
      <FunnelChart
        stages={data.stages}
        title="Pipeline Funnel"
        description="Conversion through each stage of the automated pipeline"
      />

      {/* Decision Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Breakdown</CardTitle>
          <CardDescription>Results from the automated decisioning engine</CardDescription>
        </CardHeader>
        <CardContent>
          {totalDecisions === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{db.approved}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
                <Badge variant="default" className="ml-auto">
                  {Math.round((db.approved / totalDecisions) * 100)}%
                </Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{db.referred}</p>
                  <p className="text-sm text-muted-foreground">Referred</p>
                </div>
                <Badge variant="outline" className="ml-auto">
                  {Math.round((db.referred / totalDecisions) * 100)}%
                </Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <XCircle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{db.denied}</p>
                  <p className="text-sm text-muted-foreground">Denied</p>
                </div>
                <Badge variant="destructive" className="ml-auto">
                  {Math.round((db.denied / totalDecisions) * 100)}%
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
