'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink, Home } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

interface LookupResult {
  lead_id: string;
  status: string;
  decision: string | null;
  dscr_ratio: number | null;
  avm_value: number | null;
  loan_amount: number | null;
  loan_purpose: string | null;
  property_value: number | null;
  monthly_rent: number | null;
  rejection_reasons: string[] | null;
  offer_token: string | null;
  offer_url: string | null;
  lead_url: string;
  loan_url: string;
  error: string | null;
}

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : '-';

export default function ProcessPage() {
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('CA');
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/ingest/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          city,
          state,
          zip_code: zipCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(err.detail || 'Pipeline failed');
      }

      const data: LookupResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const decisionIcon = (decision: string | null) => {
    if (decision === 'APPROVED') return <CheckCircle className="h-6 w-6 text-green-500" />;
    if (decision === 'DENIED') return <XCircle className="h-6 w-6 text-red-500" />;
    if (decision === 'REFERRED') return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
    return null;
  };

  const decisionBadge = (decision: string | null) => {
    if (decision === 'APPROVED') return <Badge className="bg-green-100 text-green-800">APPROVED</Badge>;
    if (decision === 'DENIED') return <Badge variant="destructive">DENIED</Badge>;
    if (decision === 'REFERRED') return <Badge className="bg-yellow-100 text-yellow-800">REFERRED</Badge>;
    return <Badge variant="secondary">{decision || 'UNKNOWN'}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Property Lookup</h2>
        <p className="text-muted-foreground">
          Enter a property address to run the full DSCR pipeline
        </p>
      </div>

      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Property Address
          </CardTitle>
          <CardDescription>
            The pipeline will fetch property data, calculate DSCR, run decisioning, and create an offer if approved
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                placeholder="123 Main St"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="Los Angeles"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  placeholder="90210"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                'Run Pipeline'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Result Display */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {decisionIcon(result.decision)}
              Pipeline Result
              {decisionBadge(result.decision)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rejection Reasons */}
            {result.rejection_reasons && result.rejection_reasons.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="font-medium text-red-800 mb-1">Rejection Reasons:</p>
                {result.rejection_reasons.map((r, i) => (
                  <p key={i} className="text-sm text-red-700">{r}</p>
                ))}
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">DSCR Ratio</p>
                <p className={`text-2xl font-bold ${
                  result.dscr_ratio && result.dscr_ratio >= 1.0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {result.dscr_ratio ? `${result.dscr_ratio.toFixed(2)}x` : '-'}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">AVM Value</p>
                <p className="text-2xl font-bold">{fmt(result.avm_value)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Monthly Rent</p>
                <p className="text-2xl font-bold">{fmt(result.monthly_rent)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-2xl font-bold">{result.status}</p>
              </div>
            </div>

            {/* Action Links */}
            <div className="flex flex-wrap gap-3">
              <Link href={result.lead_url}>
                <Button variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Lead Detail
                </Button>
              </Link>
              <Link href={result.loan_url}>
                <Button variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Loan Analysis
                </Button>
              </Link>
              {result.offer_url && (
                <Link href={result.offer_url}>
                  <Button>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Offer
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
