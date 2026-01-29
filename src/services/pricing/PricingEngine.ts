/**
 * Pricing Engine
 *
 * Calculates interest rates for DSCR loans based on rate cards,
 * loan characteristics, and adder rules.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Money,
  PricingCard,
  PricingAdder,
  PricingCalculation,
  AppliedAdder,
  PropertyType,
  LoanPurpose,
} from '../../types';

// =====================================================
// TYPES
// =====================================================

export interface PricingInput {
  applicationId: string;

  // Loan characteristics
  loanAmount: Money;
  ltvRatio: number; // As decimal (0.75 = 75%)
  dscrRatio: number;
  creditScore: number;
  propertyType: PropertyType;
  loanPurpose: LoanPurpose;
  termMonths: number;
  lockPeriodDays: number;

  // Optional modifiers
  prepayPenaltyYears?: number; // 0, 1, 2, 3, 5
  interestOnlyMonths?: number;
  isFirstTimeInvestor?: boolean;
  propertyState?: string;
  units?: number;
}

export interface PricingResult extends PricingCalculation {
  explanation: PricingExplanation;
  alternatives: AlternativeScenario[];
}

export interface PricingExplanation {
  summary: string;
  factors: PricingFactor[];
  totalAdjustment: number;
}

export interface PricingFactor {
  name: string;
  description: string;
  adjustment: number;
  inputValue: unknown;
  range?: string;
}

export interface AlternativeScenario {
  name: string;
  change: string;
  newRate: number;
  savings?: number;
}

export interface RateLockRequest {
  applicationId: string;
  pricingCalculationId: string;
  lockPeriodDays: number;
  requestedBy: string;
}

export interface RateLockResult {
  lockId: string;
  lockedRate: number;
  lockedAt: Date;
  expiresAt: Date;
  lockPeriodDays: number;
}

// =====================================================
// DEFAULT PRICING CARD
// =====================================================

export const DEFAULT_DSCR_PRICING_CARD: PricingCard = {
  id: 'DSCR_30YR_FIXED_2024_01',
  cardName: 'DSCR 30-Year Fixed',
  productType: 'DSCR_30YR_FIXED',

  effectiveDate: new Date('2024-01-01'),
  expirationDate: undefined,

  // Base rates by LTV (in whole percent)
  baseRates: {
    55: 7.000,
    60: 7.125,
    65: 7.250,
    70: 7.375,
    75: 7.500,
    80: 7.750,
  },

  // Lock period adders
  lockPeriods: {
    30: 0.000,
    45: 0.125,
    60: 0.250,
    90: 0.375,
  },

  adders: [
    // Credit score adders
    {
      id: 'CREDIT_ADDER',
      name: 'Credit Score Adjustment',
      category: 'CREDIT',
      condition: {
        field: 'creditScore',
        ranges: [
          { min: 780, max: 850, adjustment: -0.250 },
          { min: 760, max: 779, adjustment: -0.125 },
          { min: 740, max: 759, adjustment: 0.000 },
          { min: 720, max: 739, adjustment: 0.125 },
          { min: 700, max: 719, adjustment: 0.250 },
          { min: 680, max: 699, adjustment: 0.375 },
          { min: 660, max: 679, adjustment: 0.500 },
        ],
      },
      adjustmentType: 'RATE',
    },

    // DSCR adders
    {
      id: 'DSCR_ADDER',
      name: 'DSCR Adjustment',
      category: 'DSCR',
      condition: {
        field: 'dscrRatio',
        ranges: [
          { min: 1.50, max: 999, adjustment: -0.125 },
          { min: 1.25, max: 1.49, adjustment: 0.000 },
          { min: 1.10, max: 1.24, adjustment: 0.250 },
          { min: 1.00, max: 1.09, adjustment: 0.500 },
        ],
      },
      adjustmentType: 'RATE',
    },

    // Loan amount adders
    {
      id: 'LOAN_AMOUNT_ADDER',
      name: 'Loan Amount Adjustment',
      category: 'LOAN_AMOUNT',
      condition: {
        field: 'loanAmount',
        ranges: [
          { min: 0, max: 150000, adjustment: 0.500 },
          { min: 150001, max: 250000, adjustment: 0.250 },
          { min: 250001, max: 500000, adjustment: 0.000 },
          { min: 500001, max: 1000000, adjustment: -0.125 },
          { min: 1000001, max: 2000000, adjustment: -0.250 },
          { min: 2000001, max: 3000000, adjustment: -0.125 },
        ],
      },
      adjustmentType: 'RATE',
    },

    // Property type adders
    {
      id: 'PROPERTY_TYPE_ADDER',
      name: 'Property Type Adjustment',
      category: 'PROPERTY_TYPE',
      condition: {
        field: 'propertyType',
        ranges: [
          { min: 0, max: 0, adjustment: 0.000 }, // SFR - base
          { min: 1, max: 1, adjustment: 0.125 }, // CONDO
          { min: 2, max: 2, adjustment: 0.000 }, // TOWNHOUSE
          { min: 3, max: 3, adjustment: 0.250 }, // 2-4 UNIT
          { min: 4, max: 4, adjustment: 0.375 }, // MULTIFAMILY
          { min: 5, max: 5, adjustment: 0.500 }, // MIXED_USE
        ],
      },
      adjustmentType: 'RATE',
    },

    // Cash-out adder
    {
      id: 'CASH_OUT_ADDER',
      name: 'Cash-Out Refinance Adjustment',
      category: 'CASH_OUT',
      condition: {
        field: 'isCashOut',
        ranges: [
          { min: 0, max: 0, adjustment: 0.000 }, // Not cash-out
          { min: 1, max: 1, adjustment: 0.250 }, // Cash-out
        ],
      },
      adjustmentType: 'RATE',
    },

    // Prepay penalty credit
    {
      id: 'PREPAY_CREDIT',
      name: 'Prepayment Penalty Credit',
      category: 'PREPAY',
      condition: {
        field: 'prepayYears',
        ranges: [
          { min: 0, max: 0, adjustment: 0.000 },
          { min: 1, max: 1, adjustment: -0.250 },
          { min: 2, max: 2, adjustment: -0.375 },
          { min: 3, max: 3, adjustment: -0.500 },
          { min: 5, max: 5, adjustment: -0.750 },
        ],
      },
      adjustmentType: 'RATE',
    },
  ],

  isActive: true,
  createdBy: 'SYSTEM',
  approvedBy: 'SYSTEM',
  createdAt: new Date('2024-01-01'),
};

// =====================================================
// PRICING ENGINE
// =====================================================

export class PricingEngine {
  constructor(
    private readonly pricingRepository: PricingRepository,
    private readonly auditLog: AuditLogger,
  ) {}

  /**
   * Calculate pricing for a loan application
   */
  async calculatePricing(input: PricingInput): Promise<PricingResult> {
    // Get active pricing card
    const pricingCard = await this.pricingRepository.getActivePricingCard(
      this.getProductType(input)
    );

    if (!pricingCard) {
      throw new Error(`No active pricing card found for product`);
    }

    // Calculate base rate
    const baseRate = this.getBaseRate(pricingCard, input.ltvRatio);

    // Calculate all adders
    const appliedAdders: AppliedAdder[] = [];
    const factors: PricingFactor[] = [];

    // LTV adder (implicit in base rate)
    factors.push({
      name: 'LTV',
      description: `LTV of ${(input.ltvRatio * 100).toFixed(1)}%`,
      adjustment: 0, // Included in base
      inputValue: input.ltvRatio,
      range: this.getLtvRange(input.ltvRatio),
    });

    // Process each adder
    for (const adder of pricingCard.adders) {
      const result = this.applyAdder(adder, input);
      if (result) {
        appliedAdders.push(result.appliedAdder);
        factors.push(result.factor);
      }
    }

    // Lock period adder
    const lockAdder = this.getLockAdder(pricingCard, input.lockPeriodDays);
    if (lockAdder !== 0) {
      appliedAdders.push({
        adderId: 'LOCK_PERIOD',
        name: 'Lock Period Adjustment',
        category: 'LOCK_PERIOD',
        inputValue: input.lockPeriodDays,
        adjustment: lockAdder,
        reason: `${input.lockPeriodDays}-day lock period`,
      });
      factors.push({
        name: 'Lock Period',
        description: `${input.lockPeriodDays}-day rate lock`,
        adjustment: lockAdder,
        inputValue: input.lockPeriodDays,
      });
    }

    // Calculate totals
    const totalAdders = appliedAdders.reduce((sum, a) => sum + a.adjustment, 0);
    const finalRate = baseRate + totalAdders;

    // Generate alternatives
    const alternatives = this.generateAlternatives(input, pricingCard, finalRate);

    // Build result
    const calculation: PricingCalculation = {
      id: uuidv4(),
      applicationId: input.applicationId,
      pricingCardId: pricingCard.id,
      inputs: {
        ltvRatio: input.ltvRatio,
        creditScore: input.creditScore,
        dscrRatio: input.dscrRatio,
        loanAmount: input.loanAmount,
        lockPeriodDays: input.lockPeriodDays,
        propertyType: input.propertyType,
        loanPurpose: input.loanPurpose,
        prepayPenalty: input.prepayPenaltyYears?.toString(),
      },
      baseRate,
      adders: appliedAdders,
      totalAdders,
      finalRate,
      calculatedAt: new Date(),
      syncedToEncompass: false,
    };

    // Save calculation
    await this.pricingRepository.savePricingCalculation(calculation);

    // Audit
    await this.auditLog.log({
      eventType: 'PRICING_CALCULATED',
      resourceType: 'application',
      resourceId: input.applicationId,
      action: 'CALCULATE',
      newState: {
        calculationId: calculation.id,
        baseRate,
        totalAdders,
        finalRate,
      },
    });

    return {
      ...calculation,
      explanation: {
        summary: `Final rate of ${finalRate.toFixed(3)}% (base ${baseRate.toFixed(3)}% + ${totalAdders >= 0 ? '+' : ''}${totalAdders.toFixed(3)}% adjustments)`,
        factors,
        totalAdjustment: totalAdders,
      },
      alternatives,
    };
  }

  /**
   * Lock a rate for an application
   */
  async lockRate(request: RateLockRequest): Promise<RateLockResult> {
    const calculation = await this.pricingRepository.getPricingCalculation(
      request.pricingCalculationId
    );

    if (!calculation) {
      throw new Error(`Pricing calculation not found: ${request.pricingCalculationId}`);
    }

    if (calculation.lock?.isLocked) {
      throw new Error('Rate is already locked');
    }

    const lockedAt = new Date();
    const expiresAt = new Date(
      lockedAt.getTime() + request.lockPeriodDays * 24 * 60 * 60 * 1000
    );

    // Update calculation with lock
    await this.pricingRepository.updatePricingCalculation(calculation.id, {
      lock: {
        isLocked: true,
        lockedAt,
        expiresAt,
      },
    });

    // Audit
    await this.auditLog.log({
      eventType: 'RATE_LOCKED',
      resourceType: 'pricing_calculation',
      resourceId: calculation.id,
      action: 'LOCK',
      newState: {
        rate: calculation.finalRate,
        lockedAt,
        expiresAt,
        lockPeriodDays: request.lockPeriodDays,
        requestedBy: request.requestedBy,
      },
    });

    return {
      lockId: calculation.id,
      lockedRate: calculation.finalRate,
      lockedAt,
      expiresAt,
      lockPeriodDays: request.lockPeriodDays,
    };
  }

  /**
   * Check if a rate lock is still valid
   */
  async validateLock(calculationId: string): Promise<{
    valid: boolean;
    reason?: string;
    daysRemaining?: number;
  }> {
    const calculation = await this.pricingRepository.getPricingCalculation(calculationId);

    if (!calculation) {
      return { valid: false, reason: 'Calculation not found' };
    }

    if (!calculation.lock?.isLocked) {
      return { valid: false, reason: 'Rate is not locked' };
    }

    const now = new Date();
    if (calculation.lock.expiresAt && calculation.lock.expiresAt < now) {
      return { valid: false, reason: 'Lock has expired' };
    }

    const daysRemaining = calculation.lock.expiresAt
      ? Math.ceil(
          (calculation.lock.expiresAt.getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : undefined;

    return { valid: true, daysRemaining };
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  private getProductType(input: PricingInput): string {
    // For now, only 30-year fixed
    return 'DSCR_30YR_FIXED';
  }

  private getBaseRate(card: PricingCard, ltvRatio: number): number {
    const ltvPercent = Math.ceil(ltvRatio * 100);

    // Find the applicable LTV tier
    const tiers = Object.keys(card.baseRates)
      .map(Number)
      .sort((a, b) => a - b);

    let applicableTier = tiers[tiers.length - 1]; // Default to highest

    for (const tier of tiers) {
      if (ltvPercent <= tier) {
        applicableTier = tier;
        break;
      }
    }

    return card.baseRates[applicableTier];
  }

  private getLtvRange(ltvRatio: number): string {
    const ltvPercent = Math.ceil(ltvRatio * 100);

    if (ltvPercent <= 55) return '≤55%';
    if (ltvPercent <= 60) return '55.01-60%';
    if (ltvPercent <= 65) return '60.01-65%';
    if (ltvPercent <= 70) return '65.01-70%';
    if (ltvPercent <= 75) return '70.01-75%';
    return '75.01-80%';
  }

  private getLockAdder(card: PricingCard, days: number): number {
    const lockDays = Object.keys(card.lockPeriods)
      .map(Number)
      .sort((a, b) => a - b);

    let applicablePeriod = lockDays[0];

    for (const period of lockDays) {
      if (days <= period) {
        applicablePeriod = period;
        break;
      }
      applicablePeriod = period;
    }

    return card.lockPeriods[applicablePeriod];
  }

  private applyAdder(
    adder: PricingAdder,
    input: PricingInput
  ): { appliedAdder: AppliedAdder; factor: PricingFactor } | null {
    const fieldValue = this.getAdderInputValue(adder, input);

    if (fieldValue === undefined) {
      return null;
    }

    // Find applicable range
    const range = adder.condition.ranges.find((r) => {
      if (typeof fieldValue === 'number') {
        return fieldValue >= r.min && fieldValue <= r.max;
      }
      // For enum-like values, use the numeric mapping
      return fieldValue === r.min;
    });

    if (!range) {
      return null;
    }

    const appliedAdder: AppliedAdder = {
      adderId: adder.id,
      name: adder.name,
      category: adder.category,
      inputValue: fieldValue,
      adjustment: range.adjustment,
      reason: this.getAdderReason(adder, fieldValue, range.adjustment),
    };

    const factor: PricingFactor = {
      name: adder.name,
      description: this.getAdderDescription(adder, fieldValue),
      adjustment: range.adjustment,
      inputValue: fieldValue,
      range: `${range.min} - ${range.max}`,
    };

    return { appliedAdder, factor };
  }

  private getAdderInputValue(adder: PricingAdder, input: PricingInput): unknown {
    switch (adder.condition.field) {
      case 'creditScore':
        return input.creditScore;
      case 'dscrRatio':
        return input.dscrRatio;
      case 'loanAmount':
        return input.loanAmount.amount / 100; // Convert to dollars
      case 'propertyType':
        return this.propertyTypeToNumber(input.propertyType);
      case 'isCashOut':
        return input.loanPurpose === LoanPurpose.CASH_OUT_REFI ? 1 : 0;
      case 'prepayYears':
        return input.prepayPenaltyYears ?? 0;
      default:
        return undefined;
    }
  }

  private propertyTypeToNumber(type: PropertyType): number {
    switch (type) {
      case PropertyType.SFR: return 0;
      case PropertyType.CONDO: return 1;
      case PropertyType.TOWNHOUSE: return 2;
      case PropertyType.TWO_TO_FOUR_UNIT: return 3;
      case PropertyType.MULTIFAMILY: return 4;
      case PropertyType.MIXED_USE: return 5;
      default: return 0;
    }
  }

  private getAdderReason(
    adder: PricingAdder,
    value: unknown,
    adjustment: number
  ): string {
    const direction = adjustment >= 0 ? 'adder' : 'credit';
    const amount = Math.abs(adjustment);

    switch (adder.category) {
      case 'CREDIT':
        return `Credit score of ${value}: ${amount}% ${direction}`;
      case 'DSCR':
        return `DSCR of ${typeof value === 'number' ? value.toFixed(2) : value}: ${amount}% ${direction}`;
      case 'LOAN_AMOUNT':
        return `Loan amount $${(value as number).toLocaleString()}: ${amount}% ${direction}`;
      case 'PROPERTY_TYPE':
        return `Property type adjustment: ${amount}% ${direction}`;
      case 'CASH_OUT':
        return value === 1 ? `Cash-out refinance: ${amount}% ${direction}` : '';
      case 'PREPAY':
        return value === 0 ? '' : `${value}-year prepay: ${amount}% credit`;
      default:
        return `${adder.name}: ${adjustment}%`;
    }
  }

  private getAdderDescription(adder: PricingAdder, value: unknown): string {
    switch (adder.category) {
      case 'CREDIT':
        return `Credit score: ${value}`;
      case 'DSCR':
        return `DSCR: ${typeof value === 'number' ? value.toFixed(2) : value}`;
      case 'LOAN_AMOUNT':
        return `Loan amount: $${(value as number).toLocaleString()}`;
      case 'PROPERTY_TYPE':
        return `Property type adjustment`;
      case 'CASH_OUT':
        return value === 1 ? 'Cash-out refinance' : 'Purchase/Rate-term';
      case 'PREPAY':
        return value === 0 ? 'No prepay penalty' : `${value}-year prepay penalty`;
      default:
        return adder.name;
    }
  }

  private generateAlternatives(
    input: PricingInput,
    card: PricingCard,
    currentRate: number
  ): AlternativeScenario[] {
    const alternatives: AlternativeScenario[] = [];

    // Lower LTV scenario
    if (input.ltvRatio > 0.65) {
      const lowerLtv = Math.max(0.60, input.ltvRatio - 0.05);
      const lowerLtvRate = this.calculateQuickRate(
        { ...input, ltvRatio: lowerLtv },
        card
      );

      if (lowerLtvRate < currentRate) {
        alternatives.push({
          name: 'Lower LTV',
          change: `Reduce LTV to ${(lowerLtv * 100).toFixed(0)}%`,
          newRate: lowerLtvRate,
          savings: currentRate - lowerLtvRate,
        });
      }
    }

    // Prepay penalty scenario (if not already using max)
    if (!input.prepayPenaltyYears || input.prepayPenaltyYears < 3) {
      const withPrepay = this.calculateQuickRate(
        { ...input, prepayPenaltyYears: 3 },
        card
      );

      if (withPrepay < currentRate) {
        alternatives.push({
          name: 'Add Prepay Penalty',
          change: 'Add 3-year prepayment penalty',
          newRate: withPrepay,
          savings: currentRate - withPrepay,
        });
      }
    }

    // Shorter lock period
    if (input.lockPeriodDays > 30) {
      const shorterLock = this.calculateQuickRate(
        { ...input, lockPeriodDays: 30 },
        card
      );

      if (shorterLock < currentRate) {
        alternatives.push({
          name: 'Shorter Lock',
          change: 'Use 30-day lock period',
          newRate: shorterLock,
          savings: currentRate - shorterLock,
        });
      }
    }

    return alternatives.sort((a, b) => (b.savings ?? 0) - (a.savings ?? 0));
  }

  private calculateQuickRate(input: PricingInput, card: PricingCard): number {
    const baseRate = this.getBaseRate(card, input.ltvRatio);
    let totalAdders = 0;

    for (const adder of card.adders) {
      const result = this.applyAdder(adder, input);
      if (result) {
        totalAdders += result.appliedAdder.adjustment;
      }
    }

    totalAdders += this.getLockAdder(card, input.lockPeriodDays);

    return baseRate + totalAdders;
  }
}

// =====================================================
// INTERFACES FOR DI
// =====================================================

export interface PricingRepository {
  getActivePricingCard(productType: string): Promise<PricingCard | null>;
  savePricingCalculation(calculation: PricingCalculation): Promise<void>;
  getPricingCalculation(id: string): Promise<PricingCalculation | null>;
  updatePricingCalculation(
    id: string,
    updates: Partial<PricingCalculation>
  ): Promise<void>;
}

export interface AuditLogger {
  log(event: {
    eventType: string;
    resourceType: string;
    resourceId: string;
    action: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
  }): Promise<void>;
}
