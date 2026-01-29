'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, TrendingUp, DollarSign, Clock, AlertTriangle } from 'lucide-react';

// Mock data - will be replaced with API calls
const stats = [
  {
    title: 'Active Leads',
    value: '127',
    change: '+12%',
    changeType: 'positive' as const,
    icon: Users,
  },
  {
    title: 'Pipeline Volume',
    value: '$42.5M',
    change: '+8%',
    changeType: 'positive' as const,
    icon: DollarSign,
  },
  {
    title: 'Applications',
    value: '45',
    change: '+5%',
    changeType: 'positive' as const,
    icon: FileText,
  },
  {
    title: 'Conversion Rate',
    value: '32%',
    change: '-2%',
    changeType: 'negative' as const,
    icon: TrendingUp,
  },
];

const recentActivity = [
  { id: 1, type: 'lead', message: 'New lead from Google Ads - $450K refinance', time: '5 min ago' },
  { id: 2, type: 'milestone', message: 'Loan #2024-0123 moved to Processing', time: '15 min ago' },
  { id: 3, type: 'document', message: 'Rent roll received for Loan #2024-0089', time: '1 hour ago' },
  { id: 4, type: 'approval', message: 'Loan #2024-0067 pre-approved - DSCR 1.35', time: '2 hours ago' },
  { id: 5, type: 'funding', message: 'Loan #2024-0045 funded - $385,000', time: '3 hours ago' },
];

const slaAlerts = [
  { id: 1, loanNumber: '2024-0123', milestone: 'Processing', daysInStage: 4, slaLimit: 5 },
  { id: 2, loanNumber: '2024-0098', milestone: 'Underwriting', daysInStage: 2.5, slaLimit: 3 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your pipeline.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs ${stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'}`}>
                {stat.change} from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates across your pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    {activity.type === 'lead' && <Users className="h-4 w-4 text-primary" />}
                    {activity.type === 'milestone' && <TrendingUp className="h-4 w-4 text-primary" />}
                    {activity.type === 'document' && <FileText className="h-4 w-4 text-primary" />}
                    {activity.type === 'approval' && <TrendingUp className="h-4 w-4 text-green-600" />}
                    {activity.type === 'funding' && <DollarSign className="h-4 w-4 text-green-600" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">{activity.message}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SLA Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              SLA Alerts
            </CardTitle>
            <CardDescription>Loans approaching or exceeding SLA limits</CardDescription>
          </CardHeader>
          <CardContent>
            {slaAlerts.length > 0 ? (
              <div className="space-y-4">
                {slaAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">Loan #{alert.loanNumber}</p>
                      <p className="text-sm text-muted-foreground">{alert.milestone}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-yellow-600">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium">{alert.daysInStage} / {alert.slaLimit} days</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {Math.round((alert.slaLimit - alert.daysInStage) * 24)} hours remaining
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">No SLA alerts</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
