'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LeadScoreIndicator } from '@/components/leads/LeadScoreIndicator';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building2,
  User,
  MessageSquare,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Lead } from '@/types';

// Mock data - will be replaced with API call
const mockLead: Lead = {
  id: '1',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@email.com',
  phone: '(555) 123-4567',
  status: 'QUALIFIED',
  source: 'PAID_AD',
  score: 85,
  propertyAddress: '123 Main Street, Austin, TX 78701',
  propertyState: 'TX',
  estimatedLoanAmount: 45000000,
  estimatedPropertyValue: 60000000,
  estimatedDSCR: 1.35,
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'dscr_loans_2024',
  notes: 'Interested in refinancing rental property portfolio. Has 3 properties total, starting with the Austin property.',
  lastContactedAt: '2024-01-15T14:30:00Z',
  createdAt: '2024-01-10T10:30:00Z',
  updatedAt: '2024-01-15T14:30:00Z',
};

const activityHistory = [
  {
    id: 1,
    type: 'status_change',
    description: 'Status changed to Qualified',
    user: 'Sarah Johnson',
    timestamp: '2024-01-15T14:30:00Z',
  },
  {
    id: 2,
    type: 'note',
    description: 'Called and discussed loan options. Interested in cash-out refinance for portfolio expansion.',
    user: 'Sarah Johnson',
    timestamp: '2024-01-15T14:00:00Z',
  },
  {
    id: 3,
    type: 'status_change',
    description: 'Status changed to Contacted',
    user: 'Sarah Johnson',
    timestamp: '2024-01-12T10:15:00Z',
  },
  {
    id: 4,
    type: 'email',
    description: 'Sent initial outreach email with DSCR loan information',
    user: 'System',
    timestamp: '2024-01-10T11:00:00Z',
  },
  {
    id: 5,
    type: 'lead_created',
    description: 'Lead created from Google Ads campaign',
    user: 'System',
    timestamp: '2024-01-10T10:30:00Z',
  },
];

const formatCurrency = (cents?: number) => {
  if (!cents) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export default function LeadDetailPage() {
  const router = useRouter();
  // TODO: Replace with API call using params.id
  const lead = mockLead;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">
              {lead.firstName} {lead.lastName}
            </h2>
            <StatusBadge status={lead.status} />
            <LeadScoreIndicator score={lead.score} showLabel />
          </div>
          <p className="text-muted-foreground">Lead ID: {lead.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <MessageSquare className="mr-2 h-4 w-4" />
            Add Note
          </Button>
          <Button>
            <FileText className="mr-2 h-4 w-4" />
            Start Application
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact & Property Info */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                    {lead.email}
                  </a>
                </div>
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                      {lead.phone}
                    </a>
                  </div>
                )}
                {lead.propertyAddress && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{lead.propertyAddress}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Loan Estimate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan Amount</span>
                  <span className="font-medium">{formatCurrency(lead.estimatedLoanAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property Value</span>
                  <span className="font-medium">{formatCurrency(lead.estimatedPropertyValue)}</span>
                </div>
                {lead.estimatedDSCR && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. DSCR</span>
                    <span className="font-medium">{lead.estimatedDSCR.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">State</span>
                  <span className="font-medium">{lead.propertyState || '-'}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="activity" className="space-y-4">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Timeline</CardTitle>
                  <CardDescription>History of interactions with this lead</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative space-y-4">
                    {activityHistory.map((activity, index) => (
                      <div key={activity.id} className="flex gap-4">
                        <div className="relative flex flex-col items-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            {activity.type === 'status_change' && <TrendingUp className="h-4 w-4 text-primary" />}
                            {activity.type === 'note' && <MessageSquare className="h-4 w-4 text-primary" />}
                            {activity.type === 'email' && <Mail className="h-4 w-4 text-primary" />}
                            {activity.type === 'lead_created' && <User className="h-4 w-4 text-primary" />}
                          </div>
                          {index < activityHistory.length - 1 && (
                            <div className="h-full w-px bg-border" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="text-sm">{activity.description}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{activity.user}</span>
                            <span>•</span>
                            <span>{format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {lead.notes ? (
                    <p className="text-sm">{lead.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="outline">
                <Phone className="mr-2 h-4 w-4" />
                Log Call
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Calendar className="mr-2 h-4 w-4" />
                Schedule Follow-up
              </Button>
            </CardContent>
          </Card>

          {/* Lead Source */}
          <Card>
            <CardHeader>
              <CardTitle>Lead Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="secondary">{lead.source.replace('_', ' ')}</Badge>
              </div>
              {lead.utmSource && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UTM Source</span>
                  <span className="text-sm">{lead.utmSource}</span>
                </div>
              )}
              {lead.utmMedium && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UTM Medium</span>
                  <span className="text-sm">{lead.utmMedium}</span>
                </div>
              )}
              {lead.utmCampaign && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Campaign</span>
                  <span className="text-sm">{lead.utmCampaign}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-sm">{format(new Date(lead.createdAt), 'MMM d, yyyy')}</span>
              </div>
              {lead.lastContactedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Contact</span>
                  <span className="text-sm">{format(new Date(lead.lastContactedAt), 'MMM d, yyyy')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="text-sm">{format(new Date(lead.updatedAt), 'MMM d, yyyy')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
