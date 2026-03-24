'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building2,
  User,
  FileText,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import apiClient from '@/lib/api-client';
import type { LeadDetail } from '@/types';

const formatCurrency = (dollars?: number | null) => {
  if (!dollars) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars);
};

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    apiClient.getLeadDetail(leadId)
      .then(setLead)
      .catch((err) => setError(err.message || 'Failed to load lead'))
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-lg border border-destructive p-8 text-center">
          <p className="text-destructive">{error || 'Lead not found'}</p>
        </div>
      </div>
    );
  }

  const isRejected = lead.decision?.result === 'DENIED';
  const isApproved = lead.decision?.result === 'APPROVED';

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
            {isApproved && <Badge className="bg-green-100 text-green-800">Approved</Badge>}
            {isRejected && <Badge variant="destructive">Rejected</Badge>}
          </div>
          <p className="text-muted-foreground">Lead ID: {lead.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/leads/${lead.id}/loan`}>
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              View Loan Analysis
            </Button>
          </Link>
          {lead.offer && (
            <Link href={lead.offer.url}>
              <Button>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Offer
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Rejection Banner */}
      {isRejected && lead.decision?.denialReasons && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Application Denied</p>
              {lead.decision.denialReasons.reasons?.map((reason, i) => (
                <p key={i} className="mt-1 text-sm text-red-700">{reason}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Approval Banner */}
      {isApproved && lead.offer && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Application Approved</p>
              <p className="mt-1 text-sm text-green-700">
                {lead.decision?.summary} &mdash;{' '}
                <Link href={lead.offer.url} className="underline">
                  View offer page
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact & Loan Info */}
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
                    <span>{lead.phone}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Loan Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lead.application && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Loan Amount</span>
                      <span className="font-medium">{formatCurrency(lead.application.loanAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">LTV</span>
                      <span className="font-medium">
                        {lead.application.ltvRatio
                          ? `${(lead.application.ltvRatio * 100).toFixed(1)}%`
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Purpose</span>
                      <Badge variant="secondary">
                        {lead.application.loanPurpose?.replace(/_/g, ' ') || '-'}
                      </Badge>
                    </div>
                  </>
                )}
                {lead.avm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AVM Value</span>
                    <span className="font-medium">{formatCurrency(lead.avm.value)}</span>
                  </div>
                )}
                {(lead.analysisData?.dscr?.simpleDscr ?? lead.analysisData?.dscr?.ratio) != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">DSCR</span>
                    <span className={`font-medium ${(lead.analysisData!.dscr.simpleDscr ?? lead.analysisData!.dscr.ratio)! >= 1.0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(lead.analysisData!.dscr.simpleDscr ?? lead.analysisData!.dscr.ratio)!.toFixed(4)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Property Info */}
          {lead.property && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Property Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address</span>
                    <span className="text-right font-medium">
                      {lead.property.address}, {lead.property.city}, {lead.property.state} {lead.property.zip}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{lead.property.propertyType || '-'}</span>
                  </div>
                  {lead.property.yearBuilt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Year Built</span>
                      <span className="font-medium">{lead.property.yearBuilt}</span>
                    </div>
                  )}
                  {lead.property.squareFeet && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Square Feet</span>
                      <span className="font-medium">{lead.property.squareFeet.toLocaleString()}</span>
                    </div>
                  )}
                  {lead.property.bedrooms != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Beds / Baths</span>
                      <span className="font-medium">
                        {lead.property.bedrooms} / {lead.property.bathrooms ?? '-'}
                      </span>
                    </div>
                  )}
                  {lead.property.estimatedValue && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estimated Value</span>
                      <span className="font-medium">{formatCurrency(lead.property.estimatedValue)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Decision Card */}
          {lead.decision && (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Result</span>
                  <Badge variant={isApproved ? 'default' : 'destructive'}>
                    {lead.decision.result}
                  </Badge>
                </div>
                {lead.decision.summary && (
                  <p className="text-sm text-muted-foreground">{lead.decision.summary}</p>
                )}
                {lead.decision.decidedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-sm">
                      {format(new Date(lead.decision.decidedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Offer Card */}
          {lead.offer && (
            <Card>
              <CardHeader>
                <CardTitle>Offer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary">{lead.offer.status}</Badge>
                </div>
                <Link href={lead.offer.url}>
                  <Button className="w-full" variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Offer Page
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Timeline Card */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-sm">
                  {lead.createdAt ? format(new Date(lead.createdAt), 'MMM d, yyyy') : '-'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
