'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Home,
  DollarSign,
  Percent,
  Calendar,
  User,
  Mail,
  Phone,
  Building2,
  BedDouble,
  Bath,
  Ruler,
  CalendarDays,
  TrendingUp,
  PiggyBank,
  Receipt,
  Shield,
  Sparkles,
  Pencil,
  Lock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Mock offer data - in production this would be fetched using the token
const initialOffer = {
  id: 'offer-123',
  borrower: {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: '(555) 123-4567',
  },
  property: {
    address: '1847 Riverside Drive',
    unit: '',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    county: 'Travis',
    type: 'Single Family Residence',
    yearBuilt: 2018,
    squareFeet: 2450,
    bedrooms: 4,
    bathrooms: 2.5,
    lotSize: '0.25 acres',
    appraisedValue: 465000,
  },
  dscr: {
    monthlyRent: 3200,
    annualRent: 38400,
    propertyTaxes: 8750,
    insurance: 1800,
    hoa: 0,
    maintenance: 1920,
    vacancyReserve: 1920,
    netOperatingIncome: 24010,
    monthlyPITI: 2847,
    dscrRatio: 1.25,
  },
  loan: {
    amount: 348750,
    purchasePrice: 465000,
    downPayment: 116250,
    ltv: 75,
    rate: 7.25,
    apr: 7.42,
    term: 30,
    monthlyPI: 2379,
    monthlyTaxes: 729,
    monthlyInsurance: 150,
    monthlyPITI: 3258,
    prepaymentPenalty: '3-2-1',
    closingCosts: 12500,
    cashToClose: 128750,
  },
  approvedAt: '2024-01-28T14:32:00Z',
  expiresAt: '2024-02-15',
};

const propertyTypes = [
  'Single Family Residence',
  'Condo',
  'Townhouse',
  'Duplex',
  'Triplex',
  'Fourplex',
  'Multi-Family (5+)',
];

export default function OfferPage({ params }: { params: { token: string } }) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [borrowerData, setBorrowerData] = useState(initialOffer.borrower);
  const [propertyData, setPropertyData] = useState(initialOffer.property);
  const [dscrData, setDscrData] = useState(initialOffer.dscr);

  const [error, setError] = useState<string | null>(null);
  const [confirmationData, setConfirmationData] = useState<{
    applicationId?: string;
    encompassLoanNumber?: string;
  } | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/offer/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: params.token,
          borrower: borrowerData,
          property: propertyData,
          dscr: dscrData,
          loan: initialOffer.loan,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify offer');
      }

      setConfirmationData({
        applicationId: data.applicationId,
        encompassLoanNumber: data.encompassLoanNumber,
      });
      setIsConfirmed(true);
    } catch (err) {
      console.error('Verification error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recalculate DSCR when values change
  const updateDSCR = (field: string, value: number) => {
    const updated = { ...dscrData, [field]: value };

    // Recalculate annual rent
    if (field === 'monthlyRent') {
      updated.annualRent = value * 12;
      updated.maintenance = Math.round(value * 12 * 0.05);
      updated.vacancyReserve = Math.round(value * 12 * 0.05);
    }

    // Recalculate NOI
    const grossIncome = updated.annualRent;
    const expenses = updated.propertyTaxes + updated.insurance + updated.hoa + updated.maintenance + updated.vacancyReserve;
    updated.netOperatingIncome = grossIncome - expenses;

    // Recalculate DSCR ratio (NOI / Annual Debt Service)
    const annualDebtService = initialOffer.loan.monthlyPITI * 12;
    updated.dscrRatio = Math.round((updated.netOperatingIncome / annualDebtService) * 100) / 100;

    setDscrData(updated);
  };

  if (isConfirmed) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-14 w-14 text-green-600" />
        </div>
        <Badge className="mb-4 bg-green-100 text-green-700 hover:bg-green-100">
          Information Verified
        </Badge>
        <h1 className="mb-2 text-3xl font-bold text-green-700">
          Ready for Funding!
        </h1>
        <p className="mb-8 max-w-lg text-center text-muted-foreground">
          Your information has been verified. A loan officer will contact you within
          the next 24 hours with final documents and next steps to complete your funding.
        </p>

        <Card className="w-full max-w-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What happens next?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-medium text-white">
                1
              </div>
              <div>
                <p className="font-medium">Loan Officer Contact</p>
                <p className="text-muted-foreground">A dedicated loan officer will call you within 24 hours to review final details.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-medium text-white">
                2
              </div>
              <div>
                <p className="font-medium">Document Collection</p>
                <p className="text-muted-foreground">Upload required documents: bank statements, insurance, and entity docs (if applicable).</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-medium text-white">
                3
              </div>
              <div>
                <p className="font-medium">Clear to Close</p>
                <p className="text-muted-foreground">Once documents are verified, we'll schedule your closing date.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-medium text-white">
                4
              </div>
              <div>
                <p className="font-medium">Funding</p>
                <p className="text-muted-foreground">Sign final documents and receive your funds!</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 space-y-2 rounded-lg bg-slate-100 px-6 py-4 text-center">
          {confirmationData?.encompassLoanNumber && (
            <div>
              <p className="text-sm text-muted-foreground">Loan Number</p>
              <p className="font-mono text-lg font-semibold text-[#1e3a5f]">
                {confirmationData.encompassLoanNumber}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Reference ID</p>
            <p className="font-mono font-medium">{confirmationData?.applicationId || params.token.toUpperCase()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#2d5a87] p-6 text-white">
        <div className="flex items-center gap-2 text-blue-200">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium">AI-Powered Approval</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold">Your Loan Has Been Approved!</h1>
        <p className="mt-2 text-blue-100">
          Our AI agents have reviewed your application and approved your DSCR loan.
          Please verify your information below to proceed to funding.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <Badge variant="secondary" className="bg-green-500 text-white hover:bg-green-500">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </Badge>
          <span className="text-sm text-blue-200">
            Approved on {new Date(initialOffer.approvedAt).toLocaleDateString()} at{' '}
            {new Date(initialOffer.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Property Details - Editable */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5 text-[#1e3a5f]" />
                Property Details
              </CardTitle>
              <CardDescription>Subject property information</CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Pencil className="h-3 w-3" />
              Editable
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={propertyData.address}
                onChange={(e) => setPropertyData({ ...propertyData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit/Apt (optional)</Label>
              <Input
                id="unit"
                value={propertyData.unit}
                onChange={(e) => setPropertyData({ ...propertyData, unit: e.target.value })}
                placeholder="Unit #"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={propertyData.city}
                onChange={(e) => setPropertyData({ ...propertyData, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={propertyData.state}
                onChange={(e) => setPropertyData({ ...propertyData, state: e.target.value })}
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                value={propertyData.zip}
                onChange={(e) => setPropertyData({ ...propertyData, zip: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">County</Label>
              <Input
                id="county"
                value={propertyData.county}
                onChange={(e) => setPropertyData({ ...propertyData, county: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <Select
                value={propertyData.type}
                onValueChange={(value) => setPropertyData({ ...propertyData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="yearBuilt" className="flex items-center gap-1 text-xs">
                <CalendarDays className="h-3 w-3" />
                Year Built
              </Label>
              <Input
                id="yearBuilt"
                type="number"
                value={propertyData.yearBuilt}
                onChange={(e) => setPropertyData({ ...propertyData, yearBuilt: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="squareFeet" className="flex items-center gap-1 text-xs">
                <Ruler className="h-3 w-3" />
                Square Feet
              </Label>
              <Input
                id="squareFeet"
                type="number"
                value={propertyData.squareFeet}
                onChange={(e) => setPropertyData({ ...propertyData, squareFeet: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedrooms" className="flex items-center gap-1 text-xs">
                <BedDouble className="h-3 w-3" />
                Bedrooms
              </Label>
              <Input
                id="bedrooms"
                type="number"
                value={propertyData.bedrooms}
                onChange={(e) => setPropertyData({ ...propertyData, bedrooms: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms" className="flex items-center gap-1 text-xs">
                <Bath className="h-3 w-3" />
                Bathrooms
              </Label>
              <Input
                id="bathrooms"
                type="number"
                step="0.5"
                value={propertyData.bathrooms}
                onChange={(e) => setPropertyData({ ...propertyData, bathrooms: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lotSize" className="text-xs">Lot Size</Label>
              <Input
                id="lotSize"
                value={propertyData.lotSize}
                onChange={(e) => setPropertyData({ ...propertyData, lotSize: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="appraisedValue" className="flex items-center gap-1 text-xs">
                <DollarSign className="h-3 w-3" />
                Appraised Value
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="appraisedValue"
                  type="number"
                  className="pl-7"
                  value={propertyData.appraisedValue}
                  onChange={(e) => setPropertyData({ ...propertyData, appraisedValue: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* DSCR Details - Editable */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#1e3a5f]" />
                  DSCR Analysis
                </CardTitle>
                <CardDescription>Debt Service Coverage Ratio</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1">
                <Pencil className="h-3 w-3" />
                Editable
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-green-50 p-4">
              <div>
                <p className="text-sm text-muted-foreground">DSCR Ratio</p>
                <p className={`text-3xl font-bold ${dscrData.dscrRatio >= 1.0 ? 'text-green-600' : 'text-red-600'}`}>
                  {dscrData.dscrRatio}x
                </p>
              </div>
              <Badge className={dscrData.dscrRatio >= 1.0 ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-red-100 text-red-700 hover:bg-red-100'}>
                {dscrData.dscrRatio >= 1.0 ? 'Qualifies' : 'Below Minimum'}
              </Badge>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Income</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="monthlyRent" className="flex items-center gap-1 text-xs">
                    <PiggyBank className="h-3 w-3 text-green-600" />
                    Monthly Rent
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="monthlyRent"
                      type="number"
                      className="pl-7"
                      value={dscrData.monthlyRent}
                      onChange={(e) => updateDSCR('monthlyRent', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="flex justify-between rounded border bg-slate-50 p-2 text-sm">
                  <span>Annual Rental Income</span>
                  <span className="font-medium">${dscrData.annualRent.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Annual Expenses</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="propertyTaxes" className="flex items-center gap-1 text-xs">
                    <Receipt className="h-3 w-3 text-orange-500" />
                    Property Taxes (Annual)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="propertyTaxes"
                      type="number"
                      className="pl-7"
                      value={dscrData.propertyTaxes}
                      onChange={(e) => updateDSCR('propertyTaxes', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="insurance" className="flex items-center gap-1 text-xs">
                    <Shield className="h-3 w-3 text-blue-500" />
                    Insurance (Annual)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="insurance"
                      type="number"
                      className="pl-7"
                      value={dscrData.insurance}
                      onChange={(e) => updateDSCR('insurance', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hoa" className="text-xs">HOA (Annual)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="hoa"
                      type="number"
                      className="pl-7"
                      value={dscrData.hoa}
                      onChange={(e) => updateDSCR('hoa', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="flex justify-between rounded border bg-slate-50 p-2 text-sm">
                  <span>Vacancy Reserve (5%)</span>
                  <span className="font-medium">${dscrData.vacancyReserve.toLocaleString()}</span>
                </div>
                <div className="flex justify-between rounded border bg-slate-50 p-2 text-sm">
                  <span>Maintenance (5%)</span>
                  <span className="font-medium">${dscrData.maintenance.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex justify-between rounded-lg bg-slate-100 p-3">
              <span className="font-medium">Net Operating Income (NOI)</span>
              <span className="font-bold text-[#1e3a5f]">
                ${dscrData.netOperatingIncome.toLocaleString()}/yr
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Loan Details - Read Only */}
        <Card className="border-slate-300 bg-slate-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#1e3a5f]" />
                  Loan Details
                </CardTitle>
                <CardDescription>Your approved loan terms</CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-[#1e3a5f]/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Loan Amount</p>
              <p className="text-3xl font-bold text-[#1e3a5f]">
                ${initialOffer.loan.amount.toLocaleString()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Percent className="h-3.5 w-3.5" />
                  Interest Rate
                </div>
                <p className="mt-1 text-lg font-semibold">{initialOffer.loan.rate}%</p>
                <p className="text-xs text-muted-foreground">APR: {initialOffer.loan.apr}%</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Loan Term
                </div>
                <p className="mt-1 text-lg font-semibold">{initialOffer.loan.term} Years</p>
                <p className="text-xs text-muted-foreground">Fixed Rate</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-muted-foreground">LTV</div>
                <p className="mt-1 text-lg font-semibold">{initialOffer.loan.ltv}%</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-muted-foreground">Prepay Penalty</div>
                <p className="mt-1 text-lg font-semibold">{initialOffer.loan.prepaymentPenalty}</p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Monthly Payment Breakdown</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Principal & Interest</span>
                  <span className="font-medium">${initialOffer.loan.monthlyPI.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Property Taxes</span>
                  <span className="font-medium">${initialOffer.loan.monthlyTaxes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Insurance</span>
                  <span className="font-medium">${initialOffer.loan.monthlyInsurance.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Total Monthly (PITI)</span>
                  <span className="text-[#1e3a5f]">${initialOffer.loan.monthlyPITI.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Down Payment ({100 - initialOffer.loan.ltv}%)</span>
                <span className="font-medium">${initialOffer.loan.downPayment.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Closing Costs</span>
                <span className="font-medium">${initialOffer.loan.closingCosts.toLocaleString()}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-amber-100 p-2 text-base font-semibold">
                <span>Est. Cash to Close</span>
                <span className="text-amber-700">${initialOffer.loan.cashToClose.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirm Details Card */}
      <Card className="border-2 border-[#1e3a5f]">
        <CardHeader className="bg-[#1e3a5f]/5">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#1e3a5f]" />
            Verify Your Contact Information
          </CardTitle>
          <CardDescription>
            Please confirm your contact details are correct to proceed with funding
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={borrowerData.firstName}
                  onChange={(e) =>
                    setBorrowerData({ ...borrowerData, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={borrowerData.lastName}
                  onChange={(e) =>
                    setBorrowerData({ ...borrowerData, lastName: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={borrowerData.email}
                onChange={(e) =>
                  setBorrowerData({ ...borrowerData, email: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                value={borrowerData.phone}
                onChange={(e) =>
                  setBorrowerData({ ...borrowerData, phone: e.target.value })
                }
              />
            </div>

            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium">By clicking "Verify & Proceed to Funding":</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
                <li>I confirm the property and DSCR information above is accurate</li>
                <li>I authorize Alameda Mortgage to verify my information</li>
                <li>I agree to be contacted regarding this loan application</li>
              </ul>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                <p className="font-medium">Error</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#1e3a5f] hover:bg-[#2d5a87]"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Verify & Proceed to Funding
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Offer expires: {new Date(initialOffer.expiresAt).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
