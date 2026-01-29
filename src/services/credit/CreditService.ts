/**
 * Credit Service
 *
 * Handles credit report ordering, parsing, analysis, and compliance
 * for DSCR loans. Integrates with credit bureaus through vendors like
 * MeridianLink, CoreLogic Credco, or Factual Data.
 *
 * DSCR-Specific Credit Considerations:
 * - Representative credit score selection
 * - Housing/rental payment history analysis
 * - Mortgage history for refinance seasoning
 * - BK/FC seasoning calculations
 * - No DTI requirement (unlike QM loans)
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type CreditBureau = 'EQUIFAX' | 'EXPERIAN' | 'TRANSUNION';
export type CreditPullType = 'SOFT' | 'HARD';
export type CreditOrderStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface CreditScore {
  bureau: CreditBureau;
  score: number | null;
  scoreModel: string; // e.g., 'FICO_8', 'FICO_5', 'VANTAGE_3'
  factors?: CreditFactor[];
}

export interface CreditFactor {
  code: string;
  description: string;
  impact: 'POSITIVE' | 'NEGATIVE';
}

export interface Tradeline {
  id: string;
  creditorName: string;
  accountNumber: string; // Masked
  accountType: TradelineAccountType;
  ownershipType: 'INDIVIDUAL' | 'JOINT' | 'AUTHORIZED_USER';

  // Account status
  status: 'OPEN' | 'CLOSED' | 'PAID' | 'COLLECTION';
  dateOpened: Date;
  dateClosed?: Date;
  dateReported: Date;

  // Balances
  highCredit: number; // In cents
  creditLimit?: number;
  currentBalance: number;
  monthlyPayment?: number;

  // Payment history
  paymentPattern: string; // e.g., '111111111111' for 12 months current
  times30DaysLate: number;
  times60DaysLate: number;
  times90DaysLate: number;
  times120PlusDaysLate: number;

  // Mortgage-specific
  mortgageType?: 'CONVENTIONAL' | 'FHA' | 'VA' | 'USDA' | 'OTHER';
  propertyAddress?: string;
}

export type TradelineAccountType =
  | 'MORTGAGE'
  | 'HELOC'
  | 'AUTO'
  | 'CREDIT_CARD'
  | 'STUDENT_LOAN'
  | 'PERSONAL_LOAN'
  | 'INSTALLMENT'
  | 'REVOLVING'
  | 'COLLECTION'
  | 'OTHER';

export interface PublicRecord {
  type: 'BANKRUPTCY' | 'TAX_LIEN' | 'JUDGMENT' | 'FORECLOSURE';
  filingDate: Date;
  dischargeDate?: Date;
  amount?: number;
  status: 'FILED' | 'DISCHARGED' | 'DISMISSED' | 'SATISFIED';
  courtName?: string;
  caseNumber?: string;

  // For bankruptcy
  bankruptcyType?: 'CHAPTER_7' | 'CHAPTER_11' | 'CHAPTER_13';
}

export interface Inquiry {
  creditorName: string;
  inquiryDate: Date;
  inquiryType: 'HARD' | 'SOFT';
}

export interface CreditReport {
  id: string;
  applicationId: string;
  borrowerId: string;
  orderStatus: CreditOrderStatus;

  // Vendor info
  vendorName: string;
  vendorOrderId: string;
  vendorReportId?: string;

  // Pull details
  pullType: CreditPullType;
  pullDate: Date;
  expirationDate: Date;

  // Scores
  scores: CreditScore[];
  representativeScore?: number;
  representativeBureau?: CreditBureau;

  // Credit data
  tradelines: Tradeline[];
  publicRecords: PublicRecord[];
  inquiries: Inquiry[];

  // Analysis
  analysis?: CreditAnalysis;

  // Raw data (encrypted)
  rawXml?: string;
  rawJson?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreditAnalysis {
  // Score metrics
  representativeScore: number;
  representativeBureau: CreditBureau;
  lowestScore: number;
  highestScore: number;

  // Housing history
  mortgageTradelineCount: number;
  currentMortgageBalance: number;
  mortgageLates12Months: number;
  mortgageLates24Months: number;
  hasRentalHistory: boolean;

  // Derogatory events
  hasBankruptcy: boolean;
  bankruptcyType?: string;
  bankruptcyDischargeDate?: Date;
  bankruptcySeasoningMonths?: number;

  hasForeclosure: boolean;
  foreclosureDate?: Date;
  foreclosureSeasoningMonths?: number;

  hasShortSale: boolean;
  shortSaleDate?: Date;
  shortSaleSeasoningMonths?: number;

  hasDeedInLieu: boolean;

  // Collections & liens
  openCollectionsCount: number;
  openCollectionsBalance: number;
  taxLienCount: number;
  judgmentCount: number;

  // Utilization
  totalRevolvingLimit: number;
  totalRevolvingBalance: number;
  utilizationRatio: number;

  // Inquiries
  hardInquiries12Months: number;

  // Overall assessment
  creditTier: CreditTier;
  riskFlags: CreditRiskFlag[];
}

export type CreditTier = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'SUBPRIME' | 'DEEP_SUBPRIME';

export interface CreditRiskFlag {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  details?: string;
}

export interface CreditOrderRequest {
  applicationId: string;
  borrowerId: string;
  ssn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  pullType: CreditPullType;
  bureaus?: CreditBureau[];
}

export interface CreditOrderResponse {
  success: boolean;
  orderId: string;
  report?: CreditReport;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Credit Vendor Interface
// ============================================================================

export interface ICreditVendor {
  name: string;
  orderCredit(request: CreditOrderRequest): Promise<CreditOrderResponse>;
  getReportStatus(orderId: string): Promise<CreditOrderStatus>;
  getReport(orderId: string): Promise<CreditReport | null>;
  parseReport(rawData: string): CreditReport;
}

// ============================================================================
// Credit Analysis Engine
// ============================================================================

export class CreditAnalyzer {
  /**
   * Calculate representative credit score per DSCR guidelines.
   * Typically: middle score of 3, or lower of 2, or single score if only 1.
   */
  calculateRepresentativeScore(scores: CreditScore[]): {
    score: number;
    bureau: CreditBureau;
    method: string;
  } {
    const validScores = scores
      .filter(s => s.score !== null)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

    if (validScores.length === 0) {
      throw new Error('No valid credit scores available');
    }

    if (validScores.length === 1) {
      return {
        score: validScores[0].score!,
        bureau: validScores[0].bureau,
        method: 'SINGLE_SCORE'
      };
    }

    if (validScores.length === 2) {
      return {
        score: validScores[0].score!, // Lower of two
        bureau: validScores[0].bureau,
        method: 'LOWER_OF_TWO'
      };
    }

    // Three scores - use middle
    const middleIndex = 1;
    return {
      score: validScores[middleIndex].score!,
      bureau: validScores[middleIndex].bureau,
      method: 'MIDDLE_OF_THREE'
    };
  }

  /**
   * Analyze mortgage payment history from tradelines.
   */
  analyzeMortgageHistory(tradelines: Tradeline[]): {
    count: number;
    currentBalance: number;
    lates12Months: number;
    lates24Months: number;
    hasCurrentMortgage: boolean;
    longestTenure: number;
  } {
    const mortgages = tradelines.filter(t =>
      t.accountType === 'MORTGAGE' || t.accountType === 'HELOC'
    );

    const now = new Date();
    let lates12 = 0;
    let lates24 = 0;
    let longestTenure = 0;

    for (const mortgage of mortgages) {
      // Count recent lates
      const pattern = mortgage.paymentPattern || '';

      // Pattern is typically most recent month first
      for (let i = 0; i < Math.min(12, pattern.length); i++) {
        if (pattern[i] !== '1' && pattern[i] !== 'C' && pattern[i] !== '-') {
          lates12++;
        }
      }
      for (let i = 0; i < Math.min(24, pattern.length); i++) {
        if (pattern[i] !== '1' && pattern[i] !== 'C' && pattern[i] !== '-') {
          lates24++;
        }
      }

      // Calculate tenure in months
      const tenure = Math.floor(
        (now.getTime() - mortgage.dateOpened.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      longestTenure = Math.max(longestTenure, tenure);
    }

    return {
      count: mortgages.length,
      currentBalance: mortgages
        .filter(m => m.status === 'OPEN')
        .reduce((sum, m) => sum + m.currentBalance, 0),
      lates12Months: lates12,
      lates24Months: lates24,
      hasCurrentMortgage: mortgages.some(m => m.status === 'OPEN'),
      longestTenure
    };
  }

  /**
   * Analyze derogatory events and calculate seasoning.
   */
  analyzeDerogatory(publicRecords: PublicRecord[]): {
    hasBankruptcy: boolean;
    bankruptcyType?: string;
    bankruptcyDischargeDate?: Date;
    bankruptcySeasoningMonths?: number;
    hasForeclosure: boolean;
    foreclosureDate?: Date;
    foreclosureSeasoningMonths?: number;
    taxLienCount: number;
    judgmentCount: number;
  } {
    const now = new Date();

    // Find most recent bankruptcy
    const bankruptcies = publicRecords
      .filter(r => r.type === 'BANKRUPTCY')
      .sort((a, b) => (b.filingDate?.getTime() ?? 0) - (a.filingDate?.getTime() ?? 0));

    const mostRecentBK = bankruptcies[0];

    // Find most recent foreclosure
    const foreclosures = publicRecords
      .filter(r => r.type === 'FORECLOSURE')
      .sort((a, b) => (b.filingDate?.getTime() ?? 0) - (a.filingDate?.getTime() ?? 0));

    const mostRecentFC = foreclosures[0];

    const calculateSeasoningMonths = (date: Date | undefined): number | undefined => {
      if (!date) return undefined;
      return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30));
    };

    return {
      hasBankruptcy: bankruptcies.length > 0,
      bankruptcyType: mostRecentBK?.bankruptcyType,
      bankruptcyDischargeDate: mostRecentBK?.dischargeDate,
      bankruptcySeasoningMonths: calculateSeasoningMonths(
        mostRecentBK?.dischargeDate || mostRecentBK?.filingDate
      ),
      hasForeclosure: foreclosures.length > 0,
      foreclosureDate: mostRecentFC?.filingDate,
      foreclosureSeasoningMonths: calculateSeasoningMonths(mostRecentFC?.filingDate),
      taxLienCount: publicRecords.filter(r => r.type === 'TAX_LIEN').length,
      judgmentCount: publicRecords.filter(r => r.type === 'JUDGMENT').length
    };
  }

  /**
   * Calculate credit tier for pricing/eligibility.
   */
  calculateCreditTier(score: number): CreditTier {
    if (score >= 760) return 'EXCELLENT';
    if (score >= 720) return 'GOOD';
    if (score >= 680) return 'FAIR';
    if (score >= 620) return 'SUBPRIME';
    return 'DEEP_SUBPRIME';
  }

  /**
   * Identify risk flags for underwriting review.
   */
  identifyRiskFlags(
    analysis: Partial<CreditAnalysis>,
    tradelines: Tradeline[],
    inquiries: Inquiry[]
  ): CreditRiskFlag[] {
    const flags: CreditRiskFlag[] = [];

    // Credit score warnings
    if ((analysis.representativeScore ?? 0) < 660) {
      flags.push({
        code: 'LOW_CREDIT_SCORE',
        severity: 'CRITICAL',
        description: `Credit score ${analysis.representativeScore} below minimum threshold of 660`
      });
    } else if ((analysis.representativeScore ?? 0) < 700) {
      flags.push({
        code: 'MARGINAL_CREDIT_SCORE',
        severity: 'WARNING',
        description: `Credit score ${analysis.representativeScore} is below preferred threshold`
      });
    }

    // Mortgage history
    if ((analysis.mortgageLates12Months ?? 0) > 0) {
      flags.push({
        code: 'RECENT_MORTGAGE_LATE',
        severity: 'WARNING',
        description: `${analysis.mortgageLates12Months} mortgage late payment(s) in last 12 months`,
        details: 'Requires LOE (Letter of Explanation)'
      });
    }

    // Bankruptcy seasoning
    if (analysis.hasBankruptcy) {
      const months = analysis.bankruptcySeasoningMonths ?? 0;
      if (months < 48) {
        flags.push({
          code: 'INSUFFICIENT_BK_SEASONING',
          severity: 'CRITICAL',
          description: `Bankruptcy discharged ${months} months ago (48 months required)`,
          details: `Type: ${analysis.bankruptcyType}`
        });
      } else if (months < 84) {
        flags.push({
          code: 'RECENT_BANKRUPTCY',
          severity: 'WARNING',
          description: `Bankruptcy discharged ${months} months ago`,
          details: 'Some programs may require additional seasoning'
        });
      }
    }

    // Foreclosure seasoning
    if (analysis.hasForeclosure) {
      const months = analysis.foreclosureSeasoningMonths ?? 0;
      if (months < 36) {
        flags.push({
          code: 'INSUFFICIENT_FC_SEASONING',
          severity: 'CRITICAL',
          description: `Foreclosure ${months} months ago (36 months required)`
        });
      } else if (months < 84) {
        flags.push({
          code: 'RECENT_FORECLOSURE',
          severity: 'WARNING',
          description: `Foreclosure ${months} months ago`
        });
      }
    }

    // Collections
    if ((analysis.openCollectionsCount ?? 0) > 0) {
      flags.push({
        code: 'OPEN_COLLECTIONS',
        severity: 'WARNING',
        description: `${analysis.openCollectionsCount} open collection account(s)`,
        details: `Total balance: $${((analysis.openCollectionsBalance ?? 0) / 100).toFixed(2)}`
      });
    }

    // High utilization
    if ((analysis.utilizationRatio ?? 0) > 0.5) {
      flags.push({
        code: 'HIGH_UTILIZATION',
        severity: 'WARNING',
        description: `Credit utilization at ${Math.round((analysis.utilizationRatio ?? 0) * 100)}%`,
        details: 'May impact score or indicate credit stress'
      });
    }

    // Recent inquiries
    const recentHardInquiries = inquiries.filter(inq => {
      const monthsAgo = Math.floor(
        (Date.now() - inq.inquiryDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      return inq.inquiryType === 'HARD' && monthsAgo <= 12;
    });

    if (recentHardInquiries.length >= 6) {
      flags.push({
        code: 'EXCESSIVE_INQUIRIES',
        severity: 'WARNING',
        description: `${recentHardInquiries.length} hard inquiries in last 12 months`,
        details: 'May indicate credit seeking behavior'
      });
    }

    // Fraud indicators
    const hasNewTrades = tradelines.some(t => {
      const monthsOld = Math.floor(
        (Date.now() - t.dateOpened.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      return monthsOld < 3 && t.accountType !== 'CREDIT_CARD';
    });

    if (hasNewTrades && recentHardInquiries.length > 3) {
      flags.push({
        code: 'POTENTIAL_FRAUD_PATTERN',
        severity: 'WARNING',
        description: 'Multiple recent accounts with high inquiry activity',
        details: 'Review for synthetic identity or bust-out patterns'
      });
    }

    return flags;
  }

  /**
   * Perform comprehensive credit analysis.
   */
  analyze(report: CreditReport): CreditAnalysis {
    const repScore = this.calculateRepresentativeScore(report.scores);
    const mortgageHistory = this.analyzeMortgageHistory(report.tradelines);
    const derogatory = this.analyzeDerogatory(report.publicRecords);

    // Calculate collections
    const collections = report.tradelines.filter(
      t => t.accountType === 'COLLECTION' && t.status === 'OPEN'
    );

    // Calculate utilization
    const revolving = report.tradelines.filter(
      t => t.accountType === 'CREDIT_CARD' || t.accountType === 'REVOLVING'
    );
    const totalLimit = revolving.reduce((sum, t) => sum + (t.creditLimit ?? 0), 0);
    const totalBalance = revolving.reduce((sum, t) => sum + t.currentBalance, 0);
    const utilizationRatio = totalLimit > 0 ? totalBalance / totalLimit : 0;

    const partialAnalysis: Partial<CreditAnalysis> = {
      representativeScore: repScore.score,
      representativeBureau: repScore.bureau,
      lowestScore: Math.min(...report.scores.filter(s => s.score).map(s => s.score!)),
      highestScore: Math.max(...report.scores.filter(s => s.score).map(s => s.score!)),
      mortgageTradelineCount: mortgageHistory.count,
      currentMortgageBalance: mortgageHistory.currentBalance,
      mortgageLates12Months: mortgageHistory.lates12Months,
      mortgageLates24Months: mortgageHistory.lates24Months,
      hasRentalHistory: false, // Would need rental tradelines
      ...derogatory,
      hasShortSale: false, // Would need to detect from mortgage payoff type
      hasDeedInLieu: false,
      openCollectionsCount: collections.length,
      openCollectionsBalance: collections.reduce((sum, c) => sum + c.currentBalance, 0),
      totalRevolvingLimit: totalLimit,
      totalRevolvingBalance: totalBalance,
      utilizationRatio,
      hardInquiries12Months: report.inquiries.filter(
        i => i.inquiryType === 'HARD' &&
          (Date.now() - i.inquiryDate.getTime()) < 365 * 24 * 60 * 60 * 1000
      ).length,
      creditTier: this.calculateCreditTier(repScore.score)
    };

    const riskFlags = this.identifyRiskFlags(
      partialAnalysis,
      report.tradelines,
      report.inquiries
    );

    return {
      ...partialAnalysis,
      riskFlags
    } as CreditAnalysis;
  }
}

// ============================================================================
// Credit Service
// ============================================================================

export interface ICreditRepository {
  findById(id: string): Promise<CreditReport | null>;
  findByApplicationId(applicationId: string): Promise<CreditReport[]>;
  create(report: CreditReport): Promise<CreditReport>;
  update(id: string, updates: Partial<CreditReport>): Promise<CreditReport>;
}

export interface IEncompassSync {
  syncCreditData(applicationId: string, analysis: CreditAnalysis, reportId: string): Promise<void>;
}

export class CreditService {
  private readonly analyzer = new CreditAnalyzer();

  constructor(
    private readonly repository: ICreditRepository,
    private readonly vendor: ICreditVendor,
    private readonly encompassSync: IEncompassSync
  ) {}

  /**
   * Order a new credit report.
   */
  async orderCredit(request: CreditOrderRequest): Promise<CreditReport> {
    // Check for recent valid report (reuse within 120 days for DSCR)
    const existingReports = await this.repository.findByApplicationId(request.applicationId);
    const validReport = existingReports.find(r =>
      r.orderStatus === 'COMPLETED' &&
      r.pullType === request.pullType &&
      new Date(r.expirationDate) > new Date()
    );

    if (validReport) {
      return validReport;
    }

    // Order from vendor
    const response = await this.vendor.orderCredit(request);

    if (!response.success) {
      throw new Error(`Credit order failed: ${response.error?.message}`);
    }

    // Create report record
    const report: CreditReport = {
      id: uuidv4(),
      applicationId: request.applicationId,
      borrowerId: request.borrowerId,
      orderStatus: 'PENDING',
      vendorName: this.vendor.name,
      vendorOrderId: response.orderId,
      pullType: request.pullType,
      pullDate: new Date(),
      expirationDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days
      scores: [],
      tradelines: [],
      publicRecords: [],
      inquiries: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.create(report);
  }

  /**
   * Process webhook callback from credit vendor.
   */
  async processVendorCallback(
    vendorOrderId: string,
    rawData: string
  ): Promise<CreditReport> {
    // Parse the raw report
    const parsedReport = this.vendor.parseReport(rawData);

    // Find existing order
    const existingReports = await this.repository.findByApplicationId(parsedReport.applicationId);
    const existing = existingReports.find(r => r.vendorOrderId === vendorOrderId);

    if (!existing) {
      throw new Error(`No credit order found for vendor order: ${vendorOrderId}`);
    }

    // Analyze the report
    const analysis = this.analyzer.analyze(parsedReport);

    // Update the report
    const updated = await this.repository.update(existing.id, {
      orderStatus: 'COMPLETED',
      scores: parsedReport.scores,
      tradelines: parsedReport.tradelines,
      publicRecords: parsedReport.publicRecords,
      inquiries: parsedReport.inquiries,
      representativeScore: analysis.representativeScore,
      representativeBureau: analysis.representativeBureau,
      analysis,
      rawXml: rawData,
      updatedAt: new Date()
    });

    // Sync to Encompass
    await this.encompassSync.syncCreditData(
      updated.applicationId,
      analysis,
      updated.id
    );

    return updated;
  }

  /**
   * Get credit report by ID.
   */
  async getReport(reportId: string): Promise<CreditReport | null> {
    return this.repository.findById(reportId);
  }

  /**
   * Get all credit reports for an application.
   */
  async getReportsForApplication(applicationId: string): Promise<CreditReport[]> {
    return this.repository.findByApplicationId(applicationId);
  }

  /**
   * Get the most recent valid credit report for an application.
   */
  async getCurrentReport(applicationId: string): Promise<CreditReport | null> {
    const reports = await this.repository.findByApplicationId(applicationId);

    const validReports = reports
      .filter(r =>
        r.orderStatus === 'COMPLETED' &&
        new Date(r.expirationDate) > new Date()
      )
      .sort((a, b) => b.pullDate.getTime() - a.pullDate.getTime());

    return validReports[0] || null;
  }

  /**
   * Check if credit is expired and needs refresh.
   */
  async checkCreditFreshness(applicationId: string): Promise<{
    hasValidCredit: boolean;
    daysUntilExpiration?: number;
    needsRefresh: boolean;
    lastPullDate?: Date;
  }> {
    const current = await this.getCurrentReport(applicationId);

    if (!current) {
      return {
        hasValidCredit: false,
        needsRefresh: true
      };
    }

    const now = new Date();
    const expiration = new Date(current.expirationDate);
    const daysUntilExpiration = Math.floor(
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      hasValidCredit: true,
      daysUntilExpiration,
      needsRefresh: daysUntilExpiration <= 30, // Refresh if expiring within 30 days
      lastPullDate: current.pullDate
    };
  }

  /**
   * Evaluate credit for DSCR eligibility.
   */
  evaluateEligibility(analysis: CreditAnalysis): {
    eligible: boolean;
    reason?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check minimum score
    if (analysis.representativeScore < 660) {
      return {
        eligible: false,
        reason: `Credit score ${analysis.representativeScore} below minimum 660`,
        warnings
      };
    }

    // Check bankruptcy seasoning
    if (analysis.hasBankruptcy && (analysis.bankruptcySeasoningMonths ?? 0) < 48) {
      return {
        eligible: false,
        reason: `Bankruptcy seasoning ${analysis.bankruptcySeasoningMonths} months (48 required)`,
        warnings
      };
    }

    // Check foreclosure seasoning
    if (analysis.hasForeclosure && (analysis.foreclosureSeasoningMonths ?? 0) < 36) {
      return {
        eligible: false,
        reason: `Foreclosure seasoning ${analysis.foreclosureSeasoningMonths} months (36 required)`,
        warnings
      };
    }

    // Collect warnings
    if (analysis.mortgageLates12Months > 0) {
      warnings.push(`${analysis.mortgageLates12Months} mortgage late(s) in 12 months - LOE required`);
    }

    if (analysis.openCollectionsCount > 0) {
      warnings.push(`${analysis.openCollectionsCount} open collections - may need payoff`);
    }

    if (analysis.creditTier === 'SUBPRIME' || analysis.creditTier === 'DEEP_SUBPRIME') {
      warnings.push('Subprime credit tier - rate adjustments will apply');
    }

    return {
      eligible: true,
      warnings
    };
  }
}

// ============================================================================
// Encompass Field Mapping for Credit
// ============================================================================

export const CREDIT_ENCOMPASS_FIELD_MAPPING = {
  // Standard Encompass credit fields
  standard: {
    borrowerSSN: '65',
    creditRefNumber: '300',
    creditReportDate: '3142'
  },

  // Custom fields for DSCR credit analysis
  custom: {
    representativeScore: 'CX.CREDIT_SCORE_USED',
    representativeBureau: 'CX.CREDIT_SCORE_BUREAU',
    scoreMethod: 'CX.CREDIT_SCORE_METHOD',
    pullType: 'CX.CREDIT_PULL_TYPE',
    pullDate: 'CX.CREDIT_PULL_DATE',
    expirationDate: 'CX.CREDIT_EXPIRATION_DATE',

    // Derogatory
    hasBankruptcy: 'CX.CREDIT_HAS_BK',
    bankruptcyType: 'CX.CREDIT_BK_TYPE',
    bankruptcyDischargeDate: 'CX.CREDIT_BK_DISCHARGE_DATE',
    bankruptcySeasoningMonths: 'CX.CREDIT_BK_SEASONING_MO',
    hasForeclosure: 'CX.CREDIT_HAS_FC',
    foreclosureSeasoningMonths: 'CX.CREDIT_FC_SEASONING_MO',

    // Mortgage history
    mortgageLates12Mo: 'CX.CREDIT_MTG_LATES_12MO',
    mortgageLates24Mo: 'CX.CREDIT_MTG_LATES_24MO',
    currentMortgageBalance: 'CX.CREDIT_CURRENT_MTG_BAL',

    // Collections/liens
    openCollections: 'CX.CREDIT_OPEN_COLLECTIONS',
    collectionsBalance: 'CX.CREDIT_COLLECTIONS_BAL',

    // Risk assessment
    creditTier: 'CX.CREDIT_TIER',
    riskFlagCount: 'CX.CREDIT_RISK_FLAGS'
  }
};
