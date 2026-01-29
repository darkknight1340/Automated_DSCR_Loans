'use client';

import { cn } from '@/lib/utils';

interface DSCRGaugeProps {
  dscr: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function getDSCRColor(dscr: number): string {
  if (dscr >= 1.30) return 'text-green-600';
  if (dscr >= 1.20) return 'text-emerald-500';
  if (dscr >= 1.10) return 'text-yellow-500';
  if (dscr >= 1.00) return 'text-orange-500';
  return 'text-red-500';
}

function getDSCRBackground(dscr: number): string {
  if (dscr >= 1.30) return 'bg-green-100';
  if (dscr >= 1.20) return 'bg-emerald-100';
  if (dscr >= 1.10) return 'bg-yellow-100';
  if (dscr >= 1.00) return 'bg-orange-100';
  return 'bg-red-100';
}

function getDSCRTier(dscr: number): string {
  if (dscr >= 1.30) return 'Excellent';
  if (dscr >= 1.20) return 'Good';
  if (dscr >= 1.10) return 'Acceptable';
  if (dscr >= 1.00) return 'Marginal';
  return 'Below Min';
}

export function DSCRGauge({ dscr, size = 'md', showLabel = false }: DSCRGaugeProps) {
  const sizeClasses = {
    sm: 'h-8 w-14 text-sm',
    md: 'h-10 w-16 text-base',
    lg: 'h-12 w-20 text-lg',
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex items-center justify-center rounded-lg font-semibold',
          getDSCRBackground(dscr),
          getDSCRColor(dscr),
          sizeClasses[size]
        )}
        title={`DSCR: ${dscr.toFixed(2)} - ${getDSCRTier(dscr)}`}
      >
        {dscr.toFixed(2)}
      </div>
      {showLabel && (
        <span className={cn('text-sm', getDSCRColor(dscr))}>
          {getDSCRTier(dscr)}
        </span>
      )}
    </div>
  );
}

interface DSCRBreakdownProps {
  grossRentalIncome: number;
  vacancyRate: number;
  annualTaxes: number;
  annualInsurance: number;
  annualHOA: number;
  monthlyPITIA: number;
  dscr: number;
}

export function DSCRBreakdown({
  grossRentalIncome,
  vacancyRate,
  annualTaxes,
  annualInsurance,
  annualHOA,
  monthlyPITIA,
  dscr,
}: DSCRBreakdownProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const effectiveGrossIncome = grossRentalIncome * (1 - vacancyRate);
  const monthlyNOI = effectiveGrossIncome / 12;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">DSCR Calculation</span>
        <DSCRGauge dscr={dscr} size="lg" showLabel />
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h4 className="font-medium text-muted-foreground">Income</h4>
        <div className="flex justify-between">
          <span>Gross Rental Income (Annual)</span>
          <span className="font-medium">{formatCurrency(grossRentalIncome)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Less: Vacancy ({(vacancyRate * 100).toFixed(0)}%)</span>
          <span className="text-red-500">-{formatCurrency(grossRentalIncome * vacancyRate)}</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="font-medium">Effective Gross Income</span>
          <span className="font-medium">{formatCurrency(effectiveGrossIncome)}</span>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h4 className="font-medium text-muted-foreground">Monthly PITIA</h4>
        <div className="flex justify-between">
          <span>Principal & Interest</span>
          <span className="font-medium">
            {formatCurrency(monthlyPITIA - (annualTaxes + annualInsurance + annualHOA) / 12)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Property Taxes (Monthly)</span>
          <span className="font-medium">{formatCurrency(annualTaxes / 12)}</span>
        </div>
        <div className="flex justify-between">
          <span>Insurance (Monthly)</span>
          <span className="font-medium">{formatCurrency(annualInsurance / 12)}</span>
        </div>
        {annualHOA > 0 && (
          <div className="flex justify-between">
            <span>HOA (Monthly)</span>
            <span className="font-medium">{formatCurrency(annualHOA / 12)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2">
          <span className="font-medium">Total PITIA</span>
          <span className="font-medium">{formatCurrency(monthlyPITIA)}</span>
        </div>
      </div>

      <div className="rounded-lg bg-muted p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">DSCR Formula</p>
            <p className="font-medium">Monthly NOI / Monthly PITIA</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {formatCurrency(monthlyNOI)} / {formatCurrency(monthlyPITIA)}
            </p>
            <p className={cn('text-2xl font-bold', getDSCRColor(dscr))}>
              = {dscr.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
