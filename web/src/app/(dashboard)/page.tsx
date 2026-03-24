'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, TrendingUp, DollarSign, CheckCircle, XCircle } from 'lucide-react';
import apiClient from '@/lib/api-client';
import type { LeadStats } from '@/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getLeadStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: 'Total Leads',
      value: stats?.totalLeads ?? 0,
      icon: Users,
    },
    {
      title: 'Applications',
      value: stats?.applications ?? 0,
      icon: FileText,
    },
    {
      title: 'Offers Made',
      value: stats?.offers ?? 0,
      icon: DollarSign,
    },
    {
      title: 'Approvals',
      value: stats?.approvals ?? 0,
      icon: CheckCircle,
    },
    {
      title: 'Rejections',
      value: stats?.rejections ?? 0,
      icon: XCircle,
    },
    {
      title: 'Conversion',
      value: stats && stats.totalLeads > 0
        ? `${Math.round((stats.offers / stats.totalLeads) * 100)}%`
        : '0%',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your pipeline.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              ) : (
                <div className="text-2xl font-bold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
