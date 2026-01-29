/**
 * Valuation Service
 *
 * Handles property valuations through AVMs (Automated Valuation Models)
 * and traditional appraisals for DSCR loans.
 *
 * DSCR Valuation Strategy:
 * - AVM for pre-approval decisioning (fast, low cost)
 * - Full appraisal for final underwriting (required for most loans)
 * - AVM cascade: Primary → Secondary → Tertiary vendors
 * - Reconciliation between AVM and appraisal values
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type ValuationType = 'AVM' | 'DESKTOP_APPRAISAL' | 'DRIVE_BY' | 'FULL_INTERIOR' | 'HYBRID';
export type AVMConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_VALUE';
export type ValuationStatus = 'PENDING' | 'ORDERED' | 'SCHEDULED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface Address {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  county?: string;
}

export interface PropertyCharacteristics {
  propertyType: 'SFR' | 'CONDO' | 'TOWNHOUSE' | '2_4_UNIT' | 'MULTIFAMILY';
  yearBuilt?: number;
  squareFeet?: number;
  lotSize?: number;
  bedrooms?: number;
  bathrooms?: number;
  stories?: number;
  garage?: number;
  pool?: boolean;
  hoa?: boolean;
}

// ============================================================================
// AVM Types
// ============================================================================

export interface AVMReport {
  id: string;
  applicationId: string;
  propertyId: string;
  address: Address;

  // Vendor info
  vendorName: string;
  vendorOrderId: string;
  vendorProductCode: string;

  // Order details
  orderDate: Date;
  completedDate?: Date;
  status: ValuationStatus;

  // Valuation
  estimatedValue?: number; // In cents
  confidenceScore?: number; // 0-100
  confidenceLevel?: AVMConfidence;
  valueLow?: number;
  valueHigh?: number;
  valueRange?: number; // valueHigh - valueLow

  // Property data returned
  propertyCharacteristics?: PropertyCharacteristics;
  lastSaleDate?: Date;
  lastSalePrice?: number;
  assessedValue?: number;
  taxYear?: number;

  // Comparable sales
  comparables?: AVMComparable[];

  // Cascade info
  cascadePosition: number; // 1 = primary, 2 = secondary, etc.
  isCascadeFallback: boolean;

  // Error info
  errorCode?: string;
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface AVMComparable {
  address: string;
  distance: number; // Miles
  saleDate: Date;
  salePrice: number;
  squareFeet?: number;
  pricePerSqFt?: number;
  bedrooms?: number;
  bathrooms?: number;
  similarity: number; // 0-100
}

// ============================================================================
// Appraisal Types
// ============================================================================

export interface Appraisal {
  id: string;
  applicationId: string;
  propertyId: string;
  address: Address;

  // Order details
  appraisalType: ValuationType;
  status: ValuationStatus;

  // Vendor/AMC info
  amcName: string;
  amcOrderId: string;
  appraiserName?: string;
  appraiserLicense?: string;
  appraiserLicenseState?: string;

  // Timeline
  orderDate: Date;
  scheduledDate?: Date;
  inspectionDate?: Date;
  completedDate?: Date;
  expirationDate?: Date; // Usually 120 days

  // Valuation
  appraisedValue?: number;
  asIsValue?: number;
  asRepairedValue?: number;

  // Property details
  propertyCharacteristics?: PropertyCharacteristics;
  condition?: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
  quality?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6';
  view?: string;
  location?: string;

  // Comparables
  comparables?: AppraisalComparable[];

  // Rent schedule (critical for DSCR)
  rentSchedule?: RentScheduleEntry[];
  monthlyMarketRent?: number;

  // Reconciliation with AVM
  avmValue?: number;
  avmVariance?: number; // Percentage difference
  avmReconciliationNotes?: string;

  // Issues
  issues?: AppraisalIssue[];

  // Documents
  pdfUrl?: string;
  xmlUrl?: string;
  ucdpDocFileId?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface AppraisalComparable {
  compNumber: number;
  address: string;
  proximity: number;
  salePrice: number;
  saleDate: Date;
  squareFeet: number;
  pricePerSqFt: number;
  bedrooms: number;
  bathrooms: number;
  grossLivingArea: number;
  yearBuilt: number;
  condition: string;
  adjustedPrice: number;
  grossAdjustment: number;
  netAdjustment: number;
}

export interface RentScheduleEntry {
  unitNumber?: string;
  unitType: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  monthlyRent: number;
  isVacant: boolean;
  leaseExpiration?: Date;
}

export interface AppraisalIssue {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  requiresResolution: boolean;
  resolved: boolean;
  resolutionNotes?: string;
}

// ============================================================================
// Valuation Decision
// ============================================================================

export interface ValuationDecision {
  applicationId: string;
  propertyId: string;

  // Selected value for underwriting
  selectedValue: number;
  selectedValueSource: 'AVM' | 'APPRAISAL' | 'RECONCILED';
  valueDate: Date;

  // AVM info
  avmValue?: number;
  avmConfidence?: AVMConfidence;
  avmVendor?: string;

  // Appraisal info
  appraisalValue?: number;
  appraisalType?: ValuationType;
  appraiserName?: string;

  // Variance analysis
  avmToAppraisalVariance?: number;
  varianceAcceptable: boolean;
  varianceThreshold: number; // e.g., 10%

  // Calculated metrics
  ltv?: number; // Based on selected value
  ltvTier?: string;

  // Market rent (for DSCR)
  marketRent?: number;
  marketRentSource: 'AVM' | 'APPRAISAL' | 'RENT_ROLL';

  // Flags
  valueAtRisk: boolean;
  valueAtRiskReasons: string[];

  decidedAt: Date;
  decidedBy: 'SYSTEM' | 'UNDERWRITER';
}

// ============================================================================
// AVM Vendor Interface
// ============================================================================

export interface IAVMVendor {
  name: string;
  productCode: string;
  priority: number;

  orderAVM(address: Address): Promise<{
    success: boolean;
    orderId: string;
    report?: AVMReport;
    error?: { code: string; message: string };
  }>;

  getReport(orderId: string): Promise<AVMReport | null>;
}

// ============================================================================
// Appraisal Vendor Interface
// ============================================================================

export interface IAppraisalVendor {
  name: string;

  orderAppraisal(request: AppraisalOrderRequest): Promise<{
    success: boolean;
    orderId: string;
    error?: { code: string; message: string };
  }>;

  getAppraisal(orderId: string): Promise<Appraisal | null>;
  cancelAppraisal(orderId: string, reason: string): Promise<boolean>;
}

export interface AppraisalOrderRequest {
  applicationId: string;
  propertyId: string;
  address: Address;
  appraisalType: ValuationType;
  loanAmount: number;
  loanPurpose: string;
  borrowerName: string;
  borrowerPhone: string;
  borrowerEmail: string;
  accessInstructions?: string;
  rushRequired?: boolean;
  specialInstructions?: string;
}

// ============================================================================
// AVM Cascade Engine
// ============================================================================

export class AVMCascadeEngine {
  constructor(
    private readonly vendors: IAVMVendor[],
    private readonly minConfidenceScore: number = 70
  ) {
    // Sort vendors by priority
    this.vendors.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute AVM cascade - try vendors in order until acceptable result.
   */
  async execute(
    applicationId: string,
    propertyId: string,
    address: Address
  ): Promise<{
    success: boolean;
    report?: AVMReport;
    attempts: AVMCascadeAttempt[];
  }> {
    const attempts: AVMCascadeAttempt[] = [];

    for (let i = 0; i < this.vendors.length; i++) {
      const vendor = this.vendors[i];
      const attempt: AVMCascadeAttempt = {
        vendorName: vendor.name,
        position: i + 1,
        startTime: new Date()
      };

      try {
        const result = await vendor.orderAVM(address);

        attempt.endTime = new Date();
        attempt.success = result.success;

        if (result.success && result.report) {
          attempt.value = result.report.estimatedValue;
          attempt.confidenceScore = result.report.confidenceScore;
          attempt.confidenceLevel = result.report.confidenceLevel;

          // Check if result is acceptable
          if (this.isAcceptable(result.report)) {
            const report: AVMReport = {
              ...result.report,
              id: uuidv4(),
              applicationId,
              propertyId,
              cascadePosition: i + 1,
              isCascadeFallback: i > 0
            };

            attempts.push(attempt);
            return { success: true, report, attempts };
          }

          attempt.rejectionReason = `Confidence ${result.report.confidenceScore} below threshold ${this.minConfidenceScore}`;
        } else {
          attempt.errorCode = result.error?.code;
          attempt.errorMessage = result.error?.message;
        }
      } catch (error) {
        attempt.endTime = new Date();
        attempt.success = false;
        attempt.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }

      attempts.push(attempt);
    }

    // All vendors exhausted
    return { success: false, attempts };
  }

  private isAcceptable(report: AVMReport): boolean {
    // Must have a value
    if (!report.estimatedValue || report.estimatedValue <= 0) {
      return false;
    }

    // Check confidence
    if (report.confidenceScore && report.confidenceScore < this.minConfidenceScore) {
      return false;
    }

    if (report.confidenceLevel === 'LOW' || report.confidenceLevel === 'NO_VALUE') {
      return false;
    }

    return true;
  }
}

export interface AVMCascadeAttempt {
  vendorName: string;
  position: number;
  startTime: Date;
  endTime?: Date;
  success?: boolean;
  value?: number;
  confidenceScore?: number;
  confidenceLevel?: AVMConfidence;
  rejectionReason?: string;
  errorCode?: string;
  errorMessage?: string;
}

// ============================================================================
// Valuation Reconciler
// ============================================================================

export class ValuationReconciler {
  constructor(
    private readonly varianceThreshold: number = 0.10 // 10%
  ) {}

  /**
   * Reconcile AVM and appraisal values.
   */
  reconcile(
    avmValue: number | undefined,
    appraisalValue: number | undefined,
    avmConfidence?: AVMConfidence
  ): {
    selectedValue: number;
    source: 'AVM' | 'APPRAISAL' | 'RECONCILED';
    variance?: number;
    varianceAcceptable: boolean;
    notes: string;
  } {
    // If only AVM available
    if (avmValue && !appraisalValue) {
      return {
        selectedValue: avmValue,
        source: 'AVM',
        varianceAcceptable: true,
        notes: 'Using AVM value - no appraisal available'
      };
    }

    // If only appraisal available
    if (appraisalValue && !avmValue) {
      return {
        selectedValue: appraisalValue,
        source: 'APPRAISAL',
        varianceAcceptable: true,
        notes: 'Using appraisal value - no AVM available'
      };
    }

    // Both available - calculate variance
    if (avmValue && appraisalValue) {
      const variance = Math.abs(avmValue - appraisalValue) / appraisalValue;
      const varianceAcceptable = variance <= this.varianceThreshold;

      // Appraisal value typically takes precedence
      let selectedValue = appraisalValue;
      let source: 'AVM' | 'APPRAISAL' | 'RECONCILED' = 'APPRAISAL';
      let notes = '';

      if (varianceAcceptable) {
        // Values are close enough - use appraisal
        notes = `Appraisal value used. AVM variance ${(variance * 100).toFixed(1)}% within threshold.`;
      } else {
        // Significant variance - flag for review
        if (avmValue < appraisalValue) {
          // AVM lower - may indicate appraisal issue
          notes = `WARNING: AVM ${(variance * 100).toFixed(1)}% lower than appraisal. Review required.`;
        } else {
          // AVM higher - use conservative appraisal
          notes = `AVM ${(variance * 100).toFixed(1)}% higher than appraisal. Using conservative appraisal value.`;
        }
      }

      return {
        selectedValue,
        source,
        variance,
        varianceAcceptable,
        notes
      };
    }

    throw new Error('No valuation available');
  }

  /**
   * Check for value-at-risk indicators.
   */
  checkValueAtRisk(
    avm: AVMReport | undefined,
    appraisal: Appraisal | undefined
  ): { atRisk: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Low AVM confidence
    if (avm?.confidenceLevel === 'LOW') {
      reasons.push('AVM confidence is LOW');
    }

    // Wide AVM value range
    if (avm?.valueRange && avm.estimatedValue) {
      const rangePercent = avm.valueRange / avm.estimatedValue;
      if (rangePercent > 0.20) {
        reasons.push(`AVM value range ${(rangePercent * 100).toFixed(0)}% indicates uncertainty`);
      }
    }

    // Few AVM comparables
    if (avm?.comparables && avm.comparables.length < 3) {
      reasons.push('Fewer than 3 AVM comparables found');
    }

    // Appraisal condition issues
    if (appraisal?.condition && ['C4', 'C5', 'C6'].includes(appraisal.condition)) {
      reasons.push(`Property condition ${appraisal.condition} indicates deferred maintenance`);
    }

    // High appraisal adjustments
    if (appraisal?.comparables) {
      const highAdjustments = appraisal.comparables.filter(
        c => Math.abs(c.grossAdjustment) > 25
      );
      if (highAdjustments.length > 1) {
        reasons.push('Multiple comparables with >25% gross adjustments');
      }
    }

    // Declining market
    if (avm?.comparables) {
      const recentSales = avm.comparables
        .filter(c => {
          const monthsAgo = (Date.now() - c.saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          return monthsAgo <= 6;
        })
        .sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime());

      if (recentSales.length >= 2) {
        const first = recentSales[0];
        const last = recentSales[recentSales.length - 1];
        if (first.pricePerSqFt && last.pricePerSqFt) {
          const trend = (last.pricePerSqFt - first.pricePerSqFt) / first.pricePerSqFt;
          if (trend < -0.05) {
            reasons.push(`Declining market trend: ${(trend * 100).toFixed(1)}%`);
          }
        }
      }
    }

    return {
      atRisk: reasons.length > 0,
      reasons
    };
  }
}

// ============================================================================
// Valuation Service
// ============================================================================

export interface IValuationRepository {
  findAVMById(id: string): Promise<AVMReport | null>;
  findAVMsByApplication(applicationId: string): Promise<AVMReport[]>;
  findAppraisalById(id: string): Promise<Appraisal | null>;
  findAppraisalsByApplication(applicationId: string): Promise<Appraisal[]>;
  findDecisionByApplication(applicationId: string): Promise<ValuationDecision | null>;

  createAVM(report: AVMReport): Promise<AVMReport>;
  updateAVM(id: string, updates: Partial<AVMReport>): Promise<AVMReport>;
  createAppraisal(appraisal: Appraisal): Promise<Appraisal>;
  updateAppraisal(id: string, updates: Partial<Appraisal>): Promise<Appraisal>;
  saveDecision(decision: ValuationDecision): Promise<ValuationDecision>;
}

export interface IEncompassSync {
  syncValuationData(
    applicationId: string,
    decision: ValuationDecision
  ): Promise<void>;
}

export class ValuationService {
  private readonly cascade: AVMCascadeEngine;
  private readonly reconciler: ValuationReconciler;

  constructor(
    private readonly repository: IValuationRepository,
    private readonly avmVendors: IAVMVendor[],
    private readonly appraisalVendor: IAppraisalVendor,
    private readonly encompassSync: IEncompassSync,
    cascadeMinConfidence: number = 70,
    reconcileVarianceThreshold: number = 0.10
  ) {
    this.cascade = new AVMCascadeEngine(avmVendors, cascadeMinConfidence);
    this.reconciler = new ValuationReconciler(reconcileVarianceThreshold);
  }

  // -------------------------------------------------------------------------
  // AVM Operations
  // -------------------------------------------------------------------------

  /**
   * Order AVM through cascade.
   */
  async orderAVM(
    applicationId: string,
    propertyId: string,
    address: Address
  ): Promise<AVMReport | null> {
    // Check for existing valid AVM
    const existing = await this.repository.findAVMsByApplication(applicationId);
    const validAVM = existing.find(a =>
      a.status === 'COMPLETED' &&
      a.confidenceLevel !== 'NO_VALUE' &&
      a.confidenceLevel !== 'LOW'
    );

    if (validAVM) {
      return validAVM;
    }

    // Execute cascade
    const result = await this.cascade.execute(applicationId, propertyId, address);

    if (result.success && result.report) {
      return this.repository.createAVM(result.report);
    }

    // Create failed AVM record for audit
    const failedReport: AVMReport = {
      id: uuidv4(),
      applicationId,
      propertyId,
      address,
      vendorName: 'CASCADE',
      vendorOrderId: uuidv4(),
      vendorProductCode: 'CASCADE_ALL',
      orderDate: new Date(),
      status: 'FAILED',
      cascadePosition: 0,
      isCascadeFallback: false,
      errorCode: 'CASCADE_EXHAUSTED',
      errorMessage: `All ${result.attempts.length} vendors failed or returned low confidence`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.repository.createAVM(failedReport);
    return null;
  }

  /**
   * Get current AVM for application.
   */
  async getCurrentAVM(applicationId: string): Promise<AVMReport | null> {
    const avms = await this.repository.findAVMsByApplication(applicationId);
    return avms
      .filter(a => a.status === 'COMPLETED')
      .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime())[0] || null;
  }

  // -------------------------------------------------------------------------
  // Appraisal Operations
  // -------------------------------------------------------------------------

  /**
   * Order appraisal from AMC.
   */
  async orderAppraisal(request: AppraisalOrderRequest): Promise<Appraisal> {
    const result = await this.appraisalVendor.orderAppraisal(request);

    if (!result.success) {
      throw new Error(`Appraisal order failed: ${result.error?.message}`);
    }

    const appraisal: Appraisal = {
      id: uuidv4(),
      applicationId: request.applicationId,
      propertyId: request.propertyId,
      address: request.address,
      appraisalType: request.appraisalType,
      status: 'ORDERED',
      amcName: this.appraisalVendor.name,
      amcOrderId: result.orderId,
      orderDate: new Date(),
      expirationDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.createAppraisal(appraisal);
  }

  /**
   * Process appraisal vendor callback/webhook.
   */
  async processAppraisalCallback(
    amcOrderId: string,
    appraisalData: Partial<Appraisal>
  ): Promise<Appraisal> {
    const appraisals = await this.repository.findAppraisalsByApplication(
      appraisalData.applicationId!
    );
    const appraisal = appraisals.find(a => a.amcOrderId === amcOrderId);

    if (!appraisal) {
      throw new Error(`No appraisal found for AMC order: ${amcOrderId}`);
    }

    // Update with received data
    const updated = await this.repository.updateAppraisal(appraisal.id, {
      ...appraisalData,
      status: 'COMPLETED',
      completedDate: new Date(),
      updatedAt: new Date()
    });

    // Trigger valuation decision
    await this.makeValuationDecision(updated.applicationId);

    return updated;
  }

  /**
   * Get current appraisal for application.
   */
  async getCurrentAppraisal(applicationId: string): Promise<Appraisal | null> {
    const appraisals = await this.repository.findAppraisalsByApplication(applicationId);
    return appraisals
      .filter(a => a.status === 'COMPLETED')
      .sort((a, b) => (b.completedDate?.getTime() ?? 0) - (a.completedDate?.getTime() ?? 0))[0] || null;
  }

  // -------------------------------------------------------------------------
  // Valuation Decision
  // -------------------------------------------------------------------------

  /**
   * Make valuation decision based on available data.
   */
  async makeValuationDecision(applicationId: string): Promise<ValuationDecision> {
    const avm = await this.getCurrentAVM(applicationId);
    const appraisal = await this.getCurrentAppraisal(applicationId);

    if (!avm && !appraisal) {
      throw new Error('No valuation data available for decision');
    }

    // Reconcile values
    const reconciliation = this.reconciler.reconcile(
      avm?.estimatedValue,
      appraisal?.appraisedValue,
      avm?.confidenceLevel
    );

    // Check value-at-risk
    const riskCheck = this.reconciler.checkValueAtRisk(avm ?? undefined, appraisal ?? undefined);

    // Determine market rent
    let marketRent: number | undefined;
    let marketRentSource: 'AVM' | 'APPRAISAL' | 'RENT_ROLL' = 'APPRAISAL';

    if (appraisal?.monthlyMarketRent) {
      marketRent = appraisal.monthlyMarketRent;
      marketRentSource = 'APPRAISAL';
    } else if (appraisal?.rentSchedule) {
      marketRent = appraisal.rentSchedule.reduce((sum, r) => sum + r.monthlyRent, 0);
      marketRentSource = 'RENT_ROLL';
    }

    const decision: ValuationDecision = {
      applicationId,
      propertyId: avm?.propertyId ?? appraisal?.propertyId ?? '',
      selectedValue: reconciliation.selectedValue,
      selectedValueSource: reconciliation.source,
      valueDate: new Date(),
      avmValue: avm?.estimatedValue,
      avmConfidence: avm?.confidenceLevel,
      avmVendor: avm?.vendorName,
      appraisalValue: appraisal?.appraisedValue,
      appraisalType: appraisal?.appraisalType,
      appraiserName: appraisal?.appraiserName,
      avmToAppraisalVariance: reconciliation.variance,
      varianceAcceptable: reconciliation.varianceAcceptable,
      varianceThreshold: this.reconciler['varianceThreshold'],
      marketRent,
      marketRentSource,
      valueAtRisk: riskCheck.atRisk,
      valueAtRiskReasons: riskCheck.reasons,
      decidedAt: new Date(),
      decidedBy: 'SYSTEM'
    };

    // Save decision
    const saved = await this.repository.saveDecision(decision);

    // Sync to Encompass
    await this.encompassSync.syncValuationData(applicationId, saved);

    return saved;
  }

  /**
   * Get current valuation decision for application.
   */
  async getCurrentDecision(applicationId: string): Promise<ValuationDecision | null> {
    return this.repository.findDecisionByApplication(applicationId);
  }

  // -------------------------------------------------------------------------
  // LTV Calculation
  // -------------------------------------------------------------------------

  /**
   * Calculate LTV based on valuation decision.
   */
  async calculateLTV(
    applicationId: string,
    loanAmount: number
  ): Promise<{
    ltv: number;
    value: number;
    valueSource: string;
    ltvTier: string;
  }> {
    const decision = await this.getCurrentDecision(applicationId);

    if (!decision) {
      throw new Error('No valuation decision available');
    }

    const ltv = loanAmount / decision.selectedValue;

    // Determine LTV tier (ceiling-based)
    let ltvTier: string;
    if (ltv <= 0.55) ltvTier = '55';
    else if (ltv <= 0.60) ltvTier = '60';
    else if (ltv <= 0.65) ltvTier = '65';
    else if (ltv <= 0.70) ltvTier = '70';
    else if (ltv <= 0.75) ltvTier = '75';
    else if (ltv <= 0.80) ltvTier = '80';
    else ltvTier = 'OVER_80';

    return {
      ltv,
      value: decision.selectedValue,
      valueSource: decision.selectedValueSource,
      ltvTier
    };
  }
}

// ============================================================================
// Encompass Field Mapping for Valuation
// ============================================================================

export const VALUATION_ENCOMPASS_FIELD_MAPPING = {
  // Standard Encompass appraisal fields
  standard: {
    appraisedValue: '356',
    appraisalDate: '3',
    appraiserName: '977',
    appraiserLicense: 'VEND.X12'
  },

  // AVM custom fields
  avm: {
    avmValue: 'CX.AVM_VALUE',
    avmConfidence: 'CX.AVM_CONFIDENCE',
    avmConfidenceScore: 'CX.AVM_CONFIDENCE_SCORE',
    avmProvider: 'CX.AVM_PROVIDER',
    avmDate: 'CX.AVM_DATE',
    avmValueLow: 'CX.AVM_VALUE_LOW',
    avmValueHigh: 'CX.AVM_VALUE_HIGH'
  },

  // Valuation decision fields
  decision: {
    selectedValue: 'CX.VAL_SELECTED_VALUE',
    selectedSource: 'CX.VAL_SELECTED_SOURCE',
    avmToAppraisalVariance: 'CX.VAL_AVM_APPR_VARIANCE',
    varianceAcceptable: 'CX.VAL_VARIANCE_OK',
    valueAtRisk: 'CX.VAL_AT_RISK',
    valueAtRiskReasons: 'CX.VAL_RISK_REASONS'
  },

  // Market rent (for DSCR)
  rent: {
    marketRent: 'CX.VAL_MARKET_RENT',
    marketRentSource: 'CX.VAL_RENT_SOURCE'
  },

  // LTV
  ltv: {
    ltvRatio: '353',
    ltvTier: 'CX.LTV_TIER'
  }
};
