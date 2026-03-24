'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DSCRGauge } from '@/components/applications/DSCRGauge';
import {
  ArrowLeft,
  Building2,
  User,
  DollarSign,
  TrendingUp,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  CheckCircle,
  XCircle,
  Home,
  Landmark,
  GitCompareArrows,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import type { LeadDetail, ExistingLoan, OwnerContact, VerificationResult } from '@/types';

const fmt = (dollars?: number | null) => {
  if (dollars == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars);
};

const pct = (rate?: number | null) => {
  if (rate == null) return '-';
  return `${(rate * 100).toFixed(2)}%`;
};

export default function LoanDetailPage() {
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
      .catch((err) => setError(err.message || 'Failed to load'))
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

  const a = lead.analysisData;
  const isRejected = lead.decision?.result === 'DENIED';
  const isApproved = lead.decision?.result === 'APPROVED';

  // Prefer analysisData for display (always populated), fall back to join data
  const existingLoans: ExistingLoan[] =
    a?.existingLoans ?? lead.property?.existingLoans ?? [];
  const ownerInfo: OwnerContact[] =
    a?.ownerInfo ?? lead.property?.ownerInfo ?? [];
  const totalLoanBalance = existingLoans.reduce(
    (sum, ln) => sum + (ln.estimatedBalance ?? 0),
    0
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">
            Loan Analysis &mdash; {lead.firstName} {lead.lastName}
          </h2>
          <p className="text-muted-foreground">
            {a?.property?.address}, {a?.property?.city}, {a?.property?.state} {a?.property?.zip}
          </p>
        </div>
        {lead.offer && (
          <Link href={lead.offer.url}>
            <Button>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Offer
            </Button>
          </Link>
        )}
      </div>

      {/* Decision Banner */}
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
      {isApproved && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Application Approved</p>
              <p className="mt-1 text-sm text-green-700">{lead.decision?.summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* ============ Property Data ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Property Data
            {a?.dataSources?.property && (
              <Badge variant="outline" className="text-xs ml-2">{a.dataSources.property}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-3">
            <Item label="Address" value={`${a?.property?.address ?? '-'}`} />
            <Item label="City / State" value={`${a?.property?.city ?? ''}, ${a?.property?.state ?? ''} ${a?.property?.zip ?? ''}`} />
            <Item label="Type" value={a?.property?.type ?? '-'} source={a?.dataSources?.property} />
            <Item label="Year Built" value={a?.property?.yearBuilt?.toString() ?? '-'} source={a?.dataSources?.property} />
            <Item label="Sq. Ft." value={a?.property?.squareFeet?.toLocaleString() ?? '-'} source={a?.dataSources?.property} />
            <Item label="Beds / Baths" value={`${a?.property?.bedrooms ?? '-'} / ${a?.property?.bathrooms ?? '-'}`} source={a?.dataSources?.property} />
            <Item label="Units" value={a?.property?.units?.toString() ?? '1'} />
            <Item label="Pool" value={a?.property?.pool ? 'Yes' : 'No'} />
            <Item label="Garage" value={a?.property?.garageSpaces?.toString() ?? '-'} />
            <Item label="Estimated Value" value={fmt(a?.property?.estimatedValue)} source={a?.dataSources?.avm} />
            <Item label="Assessed Value" value={fmt(a?.property?.assessedValue)} source={a?.dataSources?.property} />
            <Item label="Annual Taxes" value={fmt(a?.property?.annualTaxes)} source={a?.dataSources?.taxes} />
          </div>
        </CardContent>
      </Card>

      {/* ============ Owner Info ============ */}
      {ownerInfo.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Owner Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ownerInfo.map((owner, i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                    <Item label="Name" value={owner.name} />
                    <Item label="Type" value={owner.ownerType ?? '-'} />
                    {owner.phones?.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          {owner.phones.map((p, j) => (
                            <span key={j} className="block text-sm">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {owner.emails?.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          {owner.emails.map((e, j) => (
                            <span key={j} className="block text-sm">{e}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {owner.ownerOccupied != null && (
                      <Item label="Owner Occupied" value={owner.ownerOccupied ? 'Yes' : 'No'} />
                    )}
                    {owner.ownershipMonths != null && owner.ownershipMonths > 0 && (
                      <Item label="Ownership" value={`${Math.round(owner.ownershipMonths / 12)} years`} />
                    )}
                    {owner.mailingAddress && Object.keys(owner.mailingAddress).length > 0 && (
                      <div className="md:col-span-2">
                        <span className="text-sm text-muted-foreground">Mailing Address: </span>
                        <span className="text-sm">
                          {owner.mailingAddress.address ?? owner.mailingAddress.streetAddress}, {owner.mailingAddress.city}, {owner.mailingAddress.state} {owner.mailingAddress.zip}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ Existing Loans ============ */}
      {existingLoans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Existing Loans
              <Badge variant="secondary" className="ml-2">
                Total Balance: {fmt(totalLoanBalance)}
              </Badge>
              {existingLoans[0]?.source && (
                <Badge variant="outline" className="ml-2 text-xs">
                  via {existingLoans[0].source}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Pos</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Lender</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Type</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Rate</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Balance</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Payment</th>
                    <th className="py-2 font-medium text-muted-foreground text-right">Term</th>
                  </tr>
                </thead>
                <tbody>
                  {existingLoans.map((loan, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{loan.position}</td>
                      <td className="py-2 pr-4">{loan.lenderName ?? '-'}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">
                          {loan.loanType ?? '-'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {loan.interestRate != null ? `${(loan.interestRate * 100).toFixed(2)}%` : '-'}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">{fmt(loan.estimatedBalance)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(loan.estimatedPayment)}</td>
                      <td className="py-2 text-right">
                        {loan.termMonths ? `${Math.round(loan.termMonths / 12)}yr` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ AVM Valuation ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            AVM Valuation
            {a?.avm?.source && (
              <SourceBadge source={a.avm.source} verified={a.avm.verifiedBy} />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Estimated Value</p>
              <p className="font-medium">
                {fmt(a?.avm?.value ?? lead.avm?.value)}
                {(a?.avm?.source ?? a?.dataSources?.avm) && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">({a?.avm?.source ?? a?.dataSources?.avm})</span>
                )}
              </p>
              {a?.avm?.verification && (
                <VerificationBadge verification={a.avm.verification} />
              )}
            </div>
            <Item label="Confidence" value={a?.avm?.confidence ?? lead.avm?.confidence ?? '-'} source={a?.avm?.source ?? a?.dataSources?.avm} />
            <Item label="Primary Source" value={a?.avm?.source ?? a?.dataSources?.avm ?? '-'} />
            <Item label="Assessed Value" value={fmt(a?.property?.assessedValue)} source={a?.dataSources?.property} />
          </div>

          {/* Premium AVM (Clear Capital) - shown when DSCR > 0.75 */}
          {a?.avm?.premiumAvm && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default" className="bg-blue-600">Premium Verification</Badge>
                <span className="text-sm text-blue-700">{a.avm.premiumAvm.source}</span>
              </div>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-blue-600">Premium AVM Value</p>
                  <p className="font-medium text-blue-900">{fmt(a.avm.premiumAvm.value)}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-600">Confidence</p>
                  <p className="font-medium text-blue-900">{a.avm.premiumAvm.confidence ?? '-'}</p>
                </div>
                {a.avm.premiumAvm.usedForDecision && (
                  <div>
                    <p className="text-xs text-blue-600">Status</p>
                    <Badge variant="outline" className="text-blue-700 border-blue-300">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Used for Decision
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sales Comparables from Clear Capital */}
          {a?.salesComps && a.salesComps.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Sales Comparables
                <span className="text-xs font-normal ml-2">(Clear Capital)</span>
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium text-muted-foreground">Address</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Sale Price</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Sale Date</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Beds/Baths</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Sq.Ft.</th>
                      <th className="py-2 font-medium text-muted-foreground text-right">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.salesComps.map((comp: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4">{comp.address}</td>
                        <td className="py-2 pr-4 text-right font-medium">{fmt(comp.salePrice)}</td>
                        <td className="py-2 pr-4 text-right">{comp.saleDate ?? '-'}</td>
                        <td className="py-2 pr-4 text-right">{comp.bedrooms ?? '-'}/{comp.bathrooms ?? '-'}</td>
                        <td className="py-2 pr-4 text-right">{comp.squareFeet?.toLocaleString() ?? '-'}</td>
                        <td className="py-2 text-right">{comp.distance != null ? `${comp.distance} mi` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data Sources Summary */}
          {a?.dataSources && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Data Sources</p>
              <div className="flex flex-wrap gap-2">
                {a.dataSources.property && (
                  <Badge variant="outline" className="text-xs">Property: {a.dataSources.property}</Badge>
                )}
                {a.dataSources.avm && (
                  <Badge variant="outline" className="text-xs">AVM: {a.dataSources.avm}</Badge>
                )}
                {a.dataSources.premiumAvm && (
                  <Badge variant="outline" className="text-xs bg-blue-50">Premium: {a.dataSources.premiumAvm}</Badge>
                )}
                {a.dataSources.rent && (
                  <Badge variant="outline" className="text-xs">Rent: {a.dataSources.rent}</Badge>
                )}
                {a.dataSources.taxes && (
                  <Badge variant="outline" className="text-xs">Taxes: {a.dataSources.taxes}</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ Encompass Validation ============ */}
      {a?.encompassValidation && (
        <Card className={a.encompassValidation.summary?.allMatch ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5" />
              Encompass Validation
              <Badge variant={a.encompassValidation.summary?.allMatch ? 'default' : 'secondary'} className="ml-2">
                {a.encompassValidation.summary?.matchCount ?? 0}/{a.encompassValidation.summary?.totalChecks ?? 6} Checks Pass
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Badges */}
            <div className="flex flex-wrap gap-2">
              <MatchBadge label="DSCR" match={a.encompassValidation.dscrMatch} />
              <MatchBadge label="Owner" match={a.encompassValidation.summary?.ownerMatch} />
              <MatchBadge label="AVM" match={a.encompassValidation.summary?.avmMatch} />
              <MatchBadge label="Rent" match={a.encompassValidation.summary?.rentMatch} />
              <MatchBadge label="Property" match={a.encompassValidation.summary?.propertyMatch} />
              <MatchBadge label="Liens" match={a.encompassValidation.summary?.lienMatch} />
            </div>

            {/* DSCR Comparison */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium flex items-center gap-2">
                  DSCR Comparison
                  <MatchBadge label="" match={a.encompassValidation.dscrMatch} />
                </h4>
              </div>
              <div className="grid gap-4 md:grid-cols-3 text-center">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-muted-foreground">Encompass <span className="text-xs">(Encompass)</span></p>
                  <p className="text-2xl font-bold">{a.encompassValidation.encompassDSCR?.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-muted-foreground">Pipeline <span className="text-xs">(Calculated)</span></p>
                  <p className="text-2xl font-bold text-primary">{a.encompassValidation.pipelineDSCR?.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-muted-foreground">Diff</p>
                  <p className={`text-2xl font-bold ${a.encompassValidation.dscrDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {a.encompassValidation.dscrDiff >= 0 ? '+' : ''}{a.encompassValidation.dscrDiff?.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>

            {/* Owner Comparison */}
            {a.encompassValidation.ownerComparison && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    Owner Information
                    <MatchBadge label="" match={a.encompassValidation.ownerComparison.match} />
                  </h4>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Encompass (Vesting) <span className="text-xs">(Encompass)</span></p>
                    <p className="font-medium">{a.encompassValidation.ownerComparison.encompassOwner || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline Owner <span className="text-xs">({a?.dataSources?.property ?? 'DataTree'})</span></p>
                    <p className="font-medium">{a.encompassValidation.ownerComparison.pipelineOwner || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* AVM Comparison */}
            {a.encompassValidation.avmComparison && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    AVM / Valuation
                    <MatchBadge label="" match={a.encompassValidation.avmComparison.match} />
                  </h4>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Encompass Appraised <span className="text-xs">(Encompass)</span></p>
                    <p className="font-medium">{fmt(a.encompassValidation.avmComparison.encompassValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline AVM <span className="text-xs">({a?.dataSources?.avm ?? 'RentCast'})</span></p>
                    <p className="font-medium">{fmt(a.encompassValidation.avmComparison.pipelineValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difference</p>
                    <p className={`font-medium ${a.encompassValidation.avmComparison.diffPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(a.encompassValidation.avmComparison.diff)} ({a.encompassValidation.avmComparison.diffPct >= 0 ? '+' : ''}{a.encompassValidation.avmComparison.diffPct?.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Rent Comparison */}
            {a.encompassValidation.rentComparison && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    Rent Estimate
                    <MatchBadge label="" match={a.encompassValidation.rentComparison.match} />
                  </h4>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Encompass Implied <span className="text-xs">(Encompass)</span></p>
                    <p className="font-medium">{fmt(a.encompassValidation.rentComparison.encompassImpliedRent)}/mo</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline Rent <span className="text-xs">({a?.dataSources?.rent ?? 'RentCast'})</span></p>
                    <p className="font-medium">{fmt(a.encompassValidation.rentComparison.pipelineRent)}/mo</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difference</p>
                    <p className={`font-medium ${a.encompassValidation.rentComparison.diffPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(a.encompassValidation.rentComparison.diff)} ({a.encompassValidation.rentComparison.diffPct >= 0 ? '+' : ''}{a.encompassValidation.rentComparison.diffPct?.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Property Characteristics Comparison */}
            {a.encompassValidation.propertyComparison && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    Property Characteristics
                    <MatchBadge label="" match={a.encompassValidation.propertyComparison.match} />
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left font-medium text-muted-foreground">Field</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">Encompass <span className="font-normal">(Encompass)</span></th>
                        <th className="py-2 text-right font-medium text-muted-foreground">Pipeline <span className="font-normal">({a?.dataSources?.property ?? 'DataTree'})</span></th>
                        <th className="py-2 text-center font-medium text-muted-foreground">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">Sq. Ft.</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.encompass?.sqft?.toLocaleString() || '-'}</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.pipeline?.sqft?.toLocaleString() || '-'}</td>
                        <td className="py-2 text-center">{a.encompassValidation.propertyComparison.sqftMatch ? '✓' : '✗'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">Bedrooms</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.encompass?.bedrooms || '-'}</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.pipeline?.bedrooms || '-'}</td>
                        <td className="py-2 text-center">{a.encompassValidation.propertyComparison.bedsMatch ? '✓' : '✗'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">Bathrooms</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.encompass?.bathrooms || '-'}</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.pipeline?.bathrooms || '-'}</td>
                        <td className="py-2 text-center">{a.encompassValidation.propertyComparison.bathsMatch ? '✓' : '✗'}</td>
                      </tr>
                      <tr>
                        <td className="py-2">Year Built</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.encompass?.yearBuilt || '-'}</td>
                        <td className="py-2 text-right">{a.encompassValidation.propertyComparison.pipeline?.yearBuilt || '-'}</td>
                        <td className="py-2 text-center">{a.encompassValidation.propertyComparison.yearMatch ? '✓' : '✗'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lien/Loan Comparison */}
            {a.encompassValidation.lienComparison && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    Existing Liens/Loans
                    <MatchBadge label="" match={a.encompassValidation.lienComparison.match} />
                  </h4>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Encompass Total Balance <span className="text-xs">(Encompass)</span></p>
                    <p className="font-medium">{fmt(a.encompassValidation.lienComparison.encompassTotalBalance)}</p>
                    {(a.encompassValidation.lienComparison.encompassFirstLien ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">1st: {fmt(a.encompassValidation.lienComparison.encompassFirstLien)}</p>
                    )}
                    {(a.encompassValidation.lienComparison.encompassSecondLien ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">2nd: {fmt(a.encompassValidation.lienComparison.encompassSecondLien)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline Total Balance <span className="text-xs">({a?.dataSources?.property ?? 'DataTree'})</span></p>
                    <p className="font-medium">{fmt(a.encompassValidation.lienComparison.pipelineTotalBalance)}</p>
                    <p className="text-xs text-muted-foreground">{a.encompassValidation.lienComparison.pipelineLoans} loan(s) found</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difference</p>
                    <p className={`font-medium ${a.encompassValidation.lienComparison.diffPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(a.encompassValidation.lienComparison.diff)} ({a.encompassValidation.lienComparison.diffPct >= 0 ? '+' : ''}{a.encompassValidation.lienComparison.diffPct?.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Loan Details */}
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-3">Encompass Loan Details <span className="text-xs font-normal text-muted-foreground">(Encompass)</span></h4>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-4">
                <Item label="Loan ID" value={a.encompassValidation.loanId ?? '-'} source="Encompass" />
                <Item label="Milestone" value={a.encompassValidation.milestone ?? '-'} source="Encompass" />
                <Item label="Loan Amount" value={fmt(a.encompassValidation.loanAmount)} source="Encompass" />
                <Item label="Interest Rate" value={`${a.encompassValidation.interestRate}%`} source="Encompass" />
                <Item label="LTV" value={`${a.encompassValidation.ltv?.toFixed(1)}%`} source="Encompass" />
                <Item label="Monthly P&I" value={fmt(a.encompassValidation.monthlyPI)} source="Encompass" />
                <Item label="Monthly Taxes" value={fmt(a.encompassValidation.monthlyTaxes)} source="Encompass" />
                <Item label="Total PITIA" value={fmt(a.encompassValidation.totalPITIA)} source="Encompass" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ DSCR Breakdown ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            DSCR Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-muted-foreground">DSCR Ratio</p>
              <p className="text-sm text-muted-foreground mt-1">
                Monthly Rent / Monthly PITIA
              </p>
            </div>
            {(a?.dscr?.simpleDscr ?? a?.dscr?.ratio) != null ? (
              <DSCRGauge dscr={a!.dscr.simpleDscr ?? a!.dscr.ratio!} size="lg" showLabel />
            ) : (
              <span className="text-2xl font-bold text-muted-foreground">-</span>
            )}
          </div>
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Monthly Rent</p>
              <p className="font-medium">
                {fmt(a?.dscr?.monthlyRent)}
                {(a?.rent?.source ?? a?.dataSources?.rent) && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">({a?.rent?.source ?? a?.dataSources?.rent})</span>
                )}
              </p>
              {a?.rent?.verification && (
                <VerificationBadge verification={a.rent.verification} />
              )}
            </div>
            <Item label="Monthly PITIA" value={fmt(a?.dscr?.monthlyPITIA)} source="Calculated" />
            <Item label="Loan Amount" value={fmt(a?.loanAmount)} source="Encompass" />
            <Item label="Loan Purpose" value={a?.loanPurpose?.replace(/_/g, ' ') ?? '-'} />
            {a?.rentEstimate && (
              <div>
                <p className="text-xs text-muted-foreground">Rent Estimate</p>
                <p className="font-medium">
                  ${a.rentEstimate.toLocaleString()}/mo
                  {a?.dataSources?.rent && (
                    <span className="text-xs font-normal text-muted-foreground ml-1">({a.dataSources.rent})</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* PITIA Breakdown */}
          {a?.dscr?.monthlyPITIA && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">PITIA Breakdown (Monthly)</h4>
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Principal & Interest</p>
                  <p className="font-medium">
                    {fmt((a.dscr as any)?.pitiBreakdown?.principalInterest)}
                    <span className="text-xs font-normal text-muted-foreground ml-1">(Calculated)</span>
                  </p>
                  {(a.dscr as any)?.pitiBreakdown?.principalInterestCalc && (
                    <p className="text-xs text-muted-foreground mt-1">{(a.dscr as any).pitiBreakdown.principalInterestCalc}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Taxes</p>
                  <p className="font-medium">
                    {fmt((a.dscr as any)?.pitiBreakdown?.taxes)}
                    {a?.dataSources?.taxes && (
                      <span className="text-xs font-normal text-muted-foreground ml-1">({a.dataSources.taxes})</span>
                    )}
                  </p>
                  {(a.dscr as any)?.pitiBreakdown?.taxesCalc && (
                    <p className="text-xs text-muted-foreground mt-1">{(a.dscr as any).pitiBreakdown.taxesCalc}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Insurance (est)</p>
                  <p className="font-medium">
                    {fmt((a.dscr as any)?.pitiBreakdown?.insurance)}
                    <span className="text-xs font-normal text-muted-foreground ml-1">(Estimated)</span>
                  </p>
                  {(a.dscr as any)?.pitiBreakdown?.insuranceCalc && (
                    <p className="text-xs text-muted-foreground mt-1">{(a.dscr as any).pitiBreakdown.insuranceCalc}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Total PITIA</p>
                  <p className="font-medium">{fmt(a.dscr.monthlyPITIA)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Rental Comps */}
          {a?.rentalComps && a.rentalComps.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Rental Comparables
                {a?.dataSources?.rent && (
                  <span className="text-xs font-normal ml-2">({a.dataSources.rent})</span>
                )}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium text-muted-foreground">Address</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Rent</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Beds/Baths</th>
                      <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Sq.Ft.</th>
                      <th className="py-2 font-medium text-muted-foreground text-right">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.rentalComps.map((comp, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4">{comp.address}</td>
                        <td className="py-2 pr-4 text-right font-medium">${comp.rent.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{comp.bedrooms ?? '-'}/{comp.bathrooms ?? '-'}</td>
                        <td className="py-2 pr-4 text-right">{comp.squareFeet?.toLocaleString() ?? '-'}</td>
                        <td className="py-2 text-right">{comp.distance != null ? `${comp.distance} mi` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ Decision ============ */}
      {(a?.decision || lead.decision) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Decision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-x-8 gap-y-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Result</p>
                <Badge variant={isApproved ? 'default' : isRejected ? 'destructive' : 'secondary'} className="mt-1">
                  {a?.decision?.result ?? lead.decision?.result ?? '-'}
                </Badge>
              </div>
              {a?.decision?.finalRate && (
                <Item label="Final Rate" value={`${a.decision.finalRate}%`} />
              )}
              {a?.decision?.conditions != null && a.decision.conditions > 0 && (
                <Item label="Conditions" value={a.decision.conditions.toString()} />
              )}
            </div>
            {a?.decision?.rejectionReasons && a.decision.rejectionReasons.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="font-medium text-red-800 text-sm mb-1">Rejection Reasons:</p>
                {a.decision.rejectionReasons.map((r, i) => (
                  <p key={i} className="text-sm text-red-700">{r}</p>
                ))}
              </div>
            )}
            {lead.offer && (
              <div className="mt-4">
                <Link href={lead.offer.url}>
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Offer Page
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Item({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">
        {value}
        {source && <span className="text-xs font-normal text-muted-foreground ml-1">({source})</span>}
      </p>
    </div>
  );
}

function MatchBadge({ label, match }: { label: string; match?: boolean }) {
  if (match === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      match ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {match ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label && <span>{label}</span>}
    </span>
  );
}

function SourceBadge({ source, verified }: { source: string; verified?: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Badge variant="outline" className="text-xs">{source}</Badge>
      {verified?.map(v => (
        <Badge key={v} variant="secondary" className="text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          {v}
        </Badge>
      ))}
    </div>
  );
}

function VerificationBadge({ verification }: { verification?: Record<string, VerificationResult> }) {
  if (!verification) return null;
  const entries = Object.entries(verification);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {entries.map(([source, result]) => (
        <div key={source} className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
            result.match ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {result.match ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {source}
          </span>
          {result.value != null && (
            <span className="text-muted-foreground">
              {fmt(result.value)} ({result.diffPct != null ? `${result.diffPct >= 0 ? '+' : ''}${result.diffPct.toFixed(1)}%` : '-'})
            </span>
          )}
          {result.error && (
            <span className="text-red-500">{result.error}</span>
          )}
        </div>
      ))}
    </div>
  );
}
