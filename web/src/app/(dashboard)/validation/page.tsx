'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Search, Building2, DollarSign, TrendingUp, User, Home, ExternalLink, FileText } from 'lucide-react';

interface ValidationResult {
  status: 'match' | 'mismatch';
  lead_id: string;
  lead_url: string;
  loan_url: string;
  offer_url: string | null;
  encompass: {
    loan_id: string;
    loan_guid: string;
    borrower_name: string;
    borrower_email: string;
    property_address: string;
    property_city: string;
    property_state: string;
    property_zip: string;
    loan_amount: number;
    interest_rate: number;
    appraised_value: number;
    purchase_price: number;
    ltv: number;
    monthly_pi: number;
    monthly_taxes: number;
    monthly_insurance: number;
    total_pitia: number;
    dscr: number;
    milestone: string;
  };
  pipeline: {
    property_type: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
    year_built: string | null;
    assessed_value: number | null;
    owner_name: string | null;
    owner_mailing: { state?: string } | null;
    rent_estimate: number;
    rent_low: number;
    rent_high: number;
    comp_count: number;
    calculated_dscr: number;
    simple_dscr_enc_pitia: number;
  };
  comparison: {
    dscr_diff: number;
    dscr_diff_pct: number;
    dscr_match: boolean;
    implied_rent: number;
    rent_diff: number;
  };
}

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function ValidationPage() {
  const [loanGuid, setLoanGuid] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!loanGuid.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`http://localhost:8000/api/v1/validate/${loanGuid}`);
      if (!response.ok) {
        throw new Error('Failed to validate loan');
      }
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Pipeline Validation</h2>
        <p className="text-muted-foreground">
          Compare Encompass loan data with our DSCR pipeline estimates
        </p>
      </div>

      {/* Search Input */}
      <Card>
        <CardHeader>
          <CardTitle>Validate Encompass Loan</CardTitle>
          <CardDescription>Enter an Encompass loan GUID to compare against our pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Enter Encompass Loan GUID (e.g., 6c2ce013-55b5-4225-a5f7-eba070db2b0b)"
              value={loanGuid}
              onChange={(e) => setLoanGuid(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
              className="flex-1"
            />
            <Button onClick={handleValidate} disabled={loading || !loanGuid.trim()}>
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Validate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          {/* DSCR Comparison Hero */}
          <Card className={result.status === 'match' ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {result.status === 'match' ? (
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  ) : (
                    <XCircle className="h-12 w-12 text-yellow-600" />
                  )}
                  <div>
                    <h3 className="text-2xl font-bold">
                      {result.status === 'match' ? 'DSCR Match' : 'DSCR Mismatch'}
                    </h3>
                    <p className="text-muted-foreground">
                      Loan {result.encompass.loan_id} • {result.encompass.property_address}, {result.encompass.property_city}, {result.encompass.property_state}
                    </p>
                  </div>
                </div>
                <Badge variant={result.encompass.milestone === 'Shipping' ? 'default' : 'secondary'}>
                  {result.encompass.milestone}
                </Badge>
              </div>

              {/* DSCR Values */}
              <div className="mt-6 grid grid-cols-3 gap-6 text-center">
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-sm text-muted-foreground">Encompass DSCR</p>
                  <p className="text-4xl font-bold">{result.encompass.dscr.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-sm text-muted-foreground">Pipeline DSCR</p>
                  <p className="text-4xl font-bold text-primary">{result.pipeline.simple_dscr_enc_pitia.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-sm text-muted-foreground">Difference</p>
                  <p className={`text-4xl font-bold ${result.comparison.dscr_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {result.comparison.dscr_diff >= 0 ? '+' : ''}{result.comparison.dscr_diff.toFixed(3)}
                  </p>
                  <p className="text-sm text-muted-foreground">({result.comparison.dscr_diff_pct.toFixed(1)}%)</p>
                </div>
              </div>

              {/* Rent Insight */}
              <div className="mt-4 rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  <strong>Rent Insight:</strong> Our estimate ({formatCurrency(result.pipeline.rent_estimate)}/mo) vs
                  Encompass implied rent ({formatCurrency(result.comparison.implied_rent)}/mo) =
                  <span className={result.comparison.rent_diff >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {' '}{result.comparison.rent_diff >= 0 ? '+' : ''}{formatCurrency(result.comparison.rent_diff)}
                  </span>
                </p>
              </div>

              {/* Actions */}
              {result.lead_id && (
                <div className="mt-4 flex gap-3">
                  <Link href={`/leads/${result.lead_id}/loan`}>
                    <Button>
                      <FileText className="mr-2 h-4 w-4" />
                      View Full Loan Analysis
                    </Button>
                  </Link>
                  <Link href={`/leads/${result.lead_id}`}>
                    <Button variant="outline">
                      <User className="mr-2 h-4 w-4" />
                      View Lead Details
                    </Button>
                  </Link>
                  {result.offer_url && (
                    <Link href={result.offer_url}>
                      <Button variant="outline">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Offer
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Loan Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Loan Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Borrower</span>
                  <span className="font-medium">{result.encompass.borrower_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan Amount</span>
                  <span className="font-medium">{formatCurrency(result.encompass.loan_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate</span>
                  <span className="font-medium">{result.encompass.interest_rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Appraised Value</span>
                  <span className="font-medium">{formatCurrency(result.encompass.appraised_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LTV</span>
                  <span className="font-medium">{result.encompass.ltv.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Property Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  Property Details (DataTree)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{result.pipeline.property_type || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Beds / Baths</span>
                  <span className="font-medium">{result.pipeline.bedrooms || '-'} / {result.pipeline.bathrooms || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sq Ft</span>
                  <span className="font-medium">{result.pipeline.sqft?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Year Built</span>
                  <span className="font-medium">{result.pipeline.year_built || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-medium">{result.pipeline.owner_name || 'N/A'}</span>
                </div>
                {result.pipeline.owner_mailing?.state && result.pipeline.owner_mailing.state !== result.encompass.property_state && (
                  <Badge className="bg-green-100 text-green-800">
                    Investment Property (owner in {result.pipeline.owner_mailing.state})
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* PITIA Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Monthly Payment (PITIA)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-sm text-muted-foreground"></th>
                      <th className="pb-2 text-right text-sm text-muted-foreground">Encompass</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-2">
                    <tr>
                      <td className="py-1">P&I</td>
                      <td className="py-1 text-right font-mono">{formatCurrency(result.encompass.monthly_pi)}</td>
                    </tr>
                    <tr>
                      <td className="py-1">Taxes</td>
                      <td className="py-1 text-right font-mono">{formatCurrency(result.encompass.monthly_taxes)}</td>
                    </tr>
                    <tr>
                      <td className="py-1">Insurance</td>
                      <td className="py-1 text-right font-mono">{formatCurrency(result.encompass.monthly_insurance)}</td>
                    </tr>
                    <tr className="border-t font-bold">
                      <td className="pt-2">Total PITIA</td>
                      <td className="pt-2 text-right font-mono">{formatCurrency(result.encompass.total_pitia)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Rent Estimate */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Rent Estimate (RentCast)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly Rent</span>
                  <span className="text-2xl font-bold">{formatCurrency(result.pipeline.rent_estimate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rent Range</span>
                  <span className="font-medium">
                    {formatCurrency(result.pipeline.rent_low)} - {formatCurrency(result.pipeline.rent_high)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comparables</span>
                  <span className="font-medium">{result.pipeline.comp_count} properties</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-muted-foreground">Encompass Implied Rent</span>
                  <span className="font-medium">{formatCurrency(result.comparison.implied_rent)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
