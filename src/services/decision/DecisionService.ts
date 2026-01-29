/**
 * Decision Service
 *
 * Orchestrates the pre-approval and final approval decision process
 * for DSCR loans. Combines eligibility rules, pricing, credit analysis,
 * and valuation into actionable decisions.
 *
 * Decision Types:
 * - PRE_APPROVAL: Automated decision based on AVM, credit, eligibility
 * - CONDITIONAL_APPROVAL: UW review with conditions
 * - FINAL_APPROVAL: All conditions cleared, ready for closing
 * - DECLINE: Does not meet program requirements
 * - SUSPEND: Missing critical data, cannot decide
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type DecisionType =
  | 'PRE_APPROVAL'
  | 'CONDITIONAL_APPROVAL'
  | 'FINAL_APPROVAL'
  | 'COUNTER_OFFER'
  | 'DECLINE'
  | 'SUSPEND';

export type DecisionResult = 'APPROVED' | 'DECLINED' | 'SUSPENDED' | 'COUNTER';

export interface Decision {
  id: string;
  applicationId: string;
  decisionType: DecisionType;
  result: DecisionResult;

  // Decision metadata
  version: number;
  isLatest: boolean;
  supersededBy?: string;

  // Input summary
  inputSnapshot: DecisionInputSnapshot;

  // Eligibility
  eligibilityResult: EligibilityResult;

  // Pricing
  pricingResult?: PricingResult;

  // Counter offer (if applicable)
  counterOffer?: CounterOffer;

  // Conditions
  conditions: Condition[];
  conditionsSummary: ConditionsSummary;

  // Decision rationale
  rationale: DecisionRationale;

  // Expiration
  expirationDate: Date;
  isExpired: boolean;

  // Audit
  decidedAt: Date;
  decidedBy: DecisionActor;
  reviewedAt?: Date;
  reviewedBy?: DecisionActor;

  createdAt: Date;
  updatedAt: Date;
}

export interface DecisionInputSnapshot {
  // Loan details
  loanAmount: number;
  loanPurpose: string;
  loanTerm: number;

  // Property
  propertyValue: number;
  propertyValueSource: string;
  propertyType: string;
  propertyState: string;

  // Borrower
  borrowerType: string;
  creditScore: number;
  creditScoreSource: string;

  // DSCR
  dscrRatio: number;
  grossRent: number;
  noiMonthly: number;
  pitiaMonthly: number;

  // LTV
  ltvRatio: number;
  ltvTier: string;

  // Reserves
  reservesMonths: number;

  // Timestamps
  creditPullDate: Date;
  avmDate?: Date;
  appraisalDate?: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  score: number; // 0-100
  rulesVersion: string;
  rulesEvaluated: number;
  rulesPassed: number;
  rulesFailed: number;
  rulesWarning: number;
  blockingFailures: RuleResult[];
  warnings: RuleResult[];
  allResults: RuleResult[];
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  category: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  message: string;
  actualValue?: string;
  expectedValue?: string;
  generatedCondition?: string;
}

export interface PricingResult {
  baseRate: number;
  adjustments: PricingAdjustment[];
  totalAdjustment: number;
  finalRate: number;
  apr: number;

  // Fees
  originationFee: number;
  processingFee: number;
  underwritingFee: number;
  totalFees: number;

  // Monthly payment
  monthlyPI: number;
  monthlyPITIA: number;

  // Lock
  lockPeriod: number;
  lockExpiration?: Date;
  isLocked: boolean;

  // Pricing card info
  pricingCardId: string;
  pricingCardDate: Date;
}

export interface PricingAdjustment {
  id: string;
  name: string;
  category: string;
  value: string;
  adjustment: number;
  reason: string;
}

export interface CounterOffer {
  originalLoanAmount: number;
  counterLoanAmount: number;
  reason: string;

  originalRate?: number;
  counterRate?: number;

  additionalConditions?: string[];
  expiresAt: Date;
}

export interface Condition {
  id: string;
  code: string;
  category: 'PTD' | 'PTC' | 'PTF' | 'POST_CLOSE';
  title: string;
  description: string;
  source: 'RULE' | 'MANUAL' | 'SYSTEM';
  sourceRuleId?: string;

  status: 'OPEN' | 'WAIVED' | 'CLEARED' | 'NOT_APPLICABLE';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  documentRequired?: string;
  clearedBy?: string;
  clearedAt?: Date;
  clearanceNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface ConditionsSummary {
  total: number;
  open: number;
  cleared: number;
  waived: number;
  byCategory: {
    PTD: number;
    PTC: number;
    PTF: number;
    POST_CLOSE: number;
  };
  blocking: number;
}

export interface DecisionRationale {
  summary: string;
  keyFactors: KeyFactor[];
  strengths: string[];
  weaknesses: string[];
  riskAssessment: RiskAssessment;
  recommendations?: string[];
}

export interface KeyFactor {
  factor: string;
  value: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight: number;
  explanation: string;
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  riskScore: number; // 0-100
  factors: {
    creditRisk: 'LOW' | 'MODERATE' | 'HIGH';
    propertyRisk: 'LOW' | 'MODERATE' | 'HIGH';
    marketRisk: 'LOW' | 'MODERATE' | 'HIGH';
    dscrRisk: 'LOW' | 'MODERATE' | 'HIGH';
  };
}

export interface DecisionActor {
  type: 'SYSTEM' | 'USER';
  userId?: string;
  userName?: string;
  role?: string;
}

// ============================================================================
// Pre-Approval Packet
// ============================================================================

export interface PreApprovalPacket {
  id: string;
  decisionId: string;
  applicationId: string;

  // Letter content
  letterDate: Date;
  expirationDate: Date;
  borrowerName: string;
  propertyAddress: string;

  // Approval details
  approvedLoanAmount: number;
  maxLoanAmount: number;
  interestRate: number;
  loanTerm: number;
  loanType: string;

  // Terms
  estimatedMonthlyPayment: number;
  estimatedClosingCosts: number;
  prepaymentPenalty?: string;

  // Conditions
  conditions: string[];

  // Documents
  pdfUrl?: string;
  htmlContent?: string;

  createdAt: Date;
}

// ============================================================================
// Decision Builder
// ============================================================================

export class DecisionBuilder {
  private applicationId: string;
  private decisionType: DecisionType;
  private inputSnapshot: DecisionInputSnapshot;
  private eligibilityResult?: EligibilityResult;
  private pricingResult?: PricingResult;
  private conditions: Condition[] = [];

  constructor(applicationId: string, decisionType: DecisionType) {
    this.applicationId = applicationId;
    this.decisionType = decisionType;
    this.inputSnapshot = {} as DecisionInputSnapshot;
  }

  withInputSnapshot(snapshot: DecisionInputSnapshot): DecisionBuilder {
    this.inputSnapshot = snapshot;
    return this;
  }

  withEligibility(result: EligibilityResult): DecisionBuilder {
    this.eligibilityResult = result;
    return this;
  }

  withPricing(result: PricingResult): DecisionBuilder {
    this.pricingResult = result;
    return this;
  }

  withConditions(conditions: Condition[]): DecisionBuilder {
    this.conditions = conditions;
    return this;
  }

  build(): Decision {
    if (!this.eligibilityResult) {
      throw new Error('Eligibility result required for decision');
    }

    // Determine result
    const result = this.determineResult();

    // Generate rationale
    const rationale = this.generateRationale();

    // Calculate conditions summary
    const conditionsSummary = this.calculateConditionsSummary();

    // Calculate expiration (30 days for pre-approval)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);

    return {
      id: uuidv4(),
      applicationId: this.applicationId,
      decisionType: this.decisionType,
      result,
      version: 1,
      isLatest: true,
      inputSnapshot: this.inputSnapshot,
      eligibilityResult: this.eligibilityResult,
      pricingResult: this.pricingResult,
      conditions: this.conditions,
      conditionsSummary,
      rationale,
      expirationDate,
      isExpired: false,
      decidedAt: new Date(),
      decidedBy: { type: 'SYSTEM' },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private determineResult(): DecisionResult {
    if (!this.eligibilityResult!.eligible) {
      // Check if blocking failures are waivable
      const blockingCount = this.eligibilityResult!.blockingFailures.length;
      if (blockingCount > 0) {
        return 'DECLINED';
      }
    }

    // Check for missing critical data
    if (!this.inputSnapshot.creditScore || !this.inputSnapshot.propertyValue) {
      return 'SUSPENDED';
    }

    // Has warnings but eligible
    if (this.eligibilityResult!.warnings.length > 0) {
      return 'APPROVED'; // With conditions
    }

    return 'APPROVED';
  }

  private generateRationale(): DecisionRationale {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const keyFactors: KeyFactor[] = [];

    // Analyze DSCR
    const dscr = this.inputSnapshot.dscrRatio;
    keyFactors.push({
      factor: 'DSCR',
      value: dscr.toFixed(2),
      impact: dscr >= 1.25 ? 'POSITIVE' : dscr >= 1.0 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 25,
      explanation: dscr >= 1.25
        ? `Strong cash flow coverage at ${dscr.toFixed(2)}x`
        : dscr >= 1.0
          ? `Adequate cash flow coverage at ${dscr.toFixed(2)}x`
          : `Below breakeven DSCR at ${dscr.toFixed(2)}x`
    });

    if (dscr >= 1.25) strengths.push(`Strong DSCR of ${dscr.toFixed(2)}`);
    if (dscr < 1.1) weaknesses.push(`Low DSCR of ${dscr.toFixed(2)}`);

    // Analyze LTV
    const ltv = this.inputSnapshot.ltvRatio * 100;
    keyFactors.push({
      factor: 'LTV',
      value: `${ltv.toFixed(1)}%`,
      impact: ltv <= 70 ? 'POSITIVE' : ltv <= 75 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 20,
      explanation: ltv <= 70
        ? `Conservative leverage at ${ltv.toFixed(1)}% LTV`
        : ltv <= 75
          ? `Standard leverage at ${ltv.toFixed(1)}% LTV`
          : `Higher leverage at ${ltv.toFixed(1)}% LTV`
    });

    if (ltv <= 65) strengths.push(`Low LTV of ${ltv.toFixed(1)}%`);
    if (ltv > 75) weaknesses.push(`Higher LTV of ${ltv.toFixed(1)}%`);

    // Analyze credit
    const credit = this.inputSnapshot.creditScore;
    keyFactors.push({
      factor: 'Credit Score',
      value: credit.toString(),
      impact: credit >= 740 ? 'POSITIVE' : credit >= 700 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 25,
      explanation: credit >= 740
        ? `Excellent credit profile at ${credit}`
        : credit >= 700
          ? `Good credit profile at ${credit}`
          : `Credit score of ${credit} may affect pricing`
    });

    if (credit >= 760) strengths.push(`Excellent credit score of ${credit}`);
    if (credit < 680) weaknesses.push(`Lower credit score of ${credit}`);

    // Analyze reserves
    const reserves = this.inputSnapshot.reservesMonths;
    keyFactors.push({
      factor: 'Reserves',
      value: `${reserves} months`,
      impact: reserves >= 12 ? 'POSITIVE' : reserves >= 6 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 15,
      explanation: reserves >= 12
        ? `Strong reserves at ${reserves} months PITIA`
        : reserves >= 6
          ? `Adequate reserves at ${reserves} months PITIA`
          : `Limited reserves at ${reserves} months PITIA`
    });

    if (reserves >= 12) strengths.push(`Strong reserves of ${reserves} months`);
    if (reserves < 6) weaknesses.push(`Limited reserves of ${reserves} months`);

    // Calculate risk assessment
    const riskAssessment = this.calculateRiskAssessment();

    // Generate summary
    const summary = this.generateSummary(strengths, weaknesses);

    return {
      summary,
      keyFactors,
      strengths,
      weaknesses,
      riskAssessment
    };
  }

  private calculateRiskAssessment(): RiskAssessment {
    const creditRisk = this.inputSnapshot.creditScore >= 720 ? 'LOW'
      : this.inputSnapshot.creditScore >= 680 ? 'MODERATE' : 'HIGH';

    const propertyRisk = this.inputSnapshot.ltvRatio <= 0.70 ? 'LOW'
      : this.inputSnapshot.ltvRatio <= 0.75 ? 'MODERATE' : 'HIGH';

    const dscrRisk = this.inputSnapshot.dscrRatio >= 1.25 ? 'LOW'
      : this.inputSnapshot.dscrRatio >= 1.10 ? 'MODERATE' : 'HIGH';

    // Simple risk scoring
    const riskMap = { LOW: 20, MODERATE: 50, HIGH: 80 };
    const riskScore = (
      riskMap[creditRisk] * 0.3 +
      riskMap[propertyRisk] * 0.25 +
      riskMap[dscrRisk] * 0.35 +
      20 * 0.10 // Market risk baseline
    );

    const overallRisk = riskScore <= 30 ? 'LOW'
      : riskScore <= 50 ? 'MODERATE'
        : riskScore <= 70 ? 'HIGH' : 'VERY_HIGH';

    return {
      overallRisk,
      riskScore: Math.round(riskScore),
      factors: {
        creditRisk,
        propertyRisk,
        marketRisk: 'LOW', // Simplified
        dscrRisk
      }
    };
  }

  private generateSummary(strengths: string[], weaknesses: string[]): string {
    const result = this.determineResult();

    if (result === 'APPROVED') {
      if (weaknesses.length === 0) {
        return 'Application meets all DSCR program requirements with strong compensating factors.';
      }
      return `Application approved with ${this.conditions.length} condition(s). ` +
        `Key strengths: ${strengths.slice(0, 2).join(', ')}.`;
    }

    if (result === 'DECLINED') {
      const blocking = this.eligibilityResult!.blockingFailures;
      return `Application does not meet program requirements: ${blocking[0]?.message}`;
    }

    return 'Application requires additional information to complete evaluation.';
  }

  private calculateConditionsSummary(): ConditionsSummary {
    const byCategory = { PTD: 0, PTC: 0, PTF: 0, POST_CLOSE: 0 };

    for (const condition of this.conditions) {
      byCategory[condition.category]++;
    }

    return {
      total: this.conditions.length,
      open: this.conditions.filter(c => c.status === 'OPEN').length,
      cleared: this.conditions.filter(c => c.status === 'CLEARED').length,
      waived: this.conditions.filter(c => c.status === 'WAIVED').length,
      byCategory,
      blocking: this.conditions.filter(c => c.priority === 'HIGH' && c.status === 'OPEN').length
    };
  }
}

// ============================================================================
// Decision Service
// ============================================================================

export interface IDecisionRepository {
  findById(id: string): Promise<Decision | null>;
  findByApplicationId(applicationId: string): Promise<Decision[]>;
  findLatestByApplication(applicationId: string): Promise<Decision | null>;
  create(decision: Decision): Promise<Decision>;
  update(id: string, updates: Partial<Decision>): Promise<Decision>;
  createPacket(packet: PreApprovalPacket): Promise<PreApprovalPacket>;
}

export interface IEligibilityService {
  evaluate(applicationId: string): Promise<EligibilityResult>;
}

export interface IPricingService {
  calculate(applicationId: string, lockPeriod?: number): Promise<PricingResult>;
}

export interface IConditionService {
  generateFromRules(eligibilityResult: EligibilityResult): Condition[];
  getOpenConditions(applicationId: string): Promise<Condition[]>;
}

export interface IEncompassSync {
  syncDecision(applicationId: string, decision: Decision): Promise<void>;
  advanceMilestone(applicationId: string, milestone: string): Promise<void>;
}

export interface INotificationService {
  sendPreApprovalNotification(
    applicationId: string,
    decision: Decision,
    packet: PreApprovalPacket
  ): Promise<void>;
  sendDeclineNotification(applicationId: string, decision: Decision): Promise<void>;
}

export class DecisionService {
  constructor(
    private readonly repository: IDecisionRepository,
    private readonly eligibilityService: IEligibilityService,
    private readonly pricingService: IPricingService,
    private readonly conditionService: IConditionService,
    private readonly encompassSync: IEncompassSync,
    private readonly notifications: INotificationService
  ) {}

  /**
   * Generate pre-approval decision.
   * Called after enrichment (credit, AVM) is complete.
   */
  async generatePreApproval(
    applicationId: string,
    inputSnapshot: DecisionInputSnapshot
  ): Promise<Decision> {
    // Check for existing valid pre-approval
    const existing = await this.repository.findLatestByApplication(applicationId);
    if (existing && existing.decisionType === 'PRE_APPROVAL' && !existing.isExpired) {
      return existing;
    }

    // Evaluate eligibility
    const eligibilityResult = await this.eligibilityService.evaluate(applicationId);

    // Calculate pricing if eligible
    let pricingResult: PricingResult | undefined;
    if (eligibilityResult.eligible) {
      pricingResult = await this.pricingService.calculate(applicationId);
    }

    // Generate conditions from rule warnings/failures
    const conditions = this.conditionService.generateFromRules(eligibilityResult);

    // Build decision
    const decision = new DecisionBuilder(applicationId, 'PRE_APPROVAL')
      .withInputSnapshot(inputSnapshot)
      .withEligibility(eligibilityResult)
      .withPricing(pricingResult!)
      .withConditions(conditions)
      .build();

    // Supersede previous decision if exists
    if (existing) {
      await this.repository.update(existing.id, {
        isLatest: false,
        supersededBy: decision.id,
        updatedAt: new Date()
      });
      decision.version = existing.version + 1;
    }

    // Save decision
    const saved = await this.repository.create(decision);

    // Sync to Encompass
    await this.encompassSync.syncDecision(applicationId, saved);

    // Advance milestone based on result
    if (saved.result === 'APPROVED') {
      await this.encompassSync.advanceMilestone(applicationId, 'Pre-Approved');

      // Generate and send pre-approval packet
      const packet = await this.generatePreApprovalPacket(saved, inputSnapshot);
      await this.notifications.sendPreApprovalNotification(applicationId, saved, packet);
    } else if (saved.result === 'DECLINED') {
      await this.notifications.sendDeclineNotification(applicationId, saved);
    }

    return saved;
  }

  /**
   * Generate final approval decision.
   * Called after UW review and all PTD conditions cleared.
   */
  async generateFinalApproval(
    applicationId: string,
    inputSnapshot: DecisionInputSnapshot,
    underwriterId: string
  ): Promise<Decision> {
    // Re-evaluate eligibility with updated data
    const eligibilityResult = await this.eligibilityService.evaluate(applicationId);

    // Get pricing (may be locked)
    const pricingResult = await this.pricingService.calculate(applicationId);

    // Get current conditions
    const conditions = await this.conditionService.getOpenConditions(applicationId);

    // Check all PTD conditions are cleared
    const openPTD = conditions.filter(c => c.category === 'PTD' && c.status === 'OPEN');
    if (openPTD.length > 0) {
      throw new Error(`Cannot issue final approval: ${openPTD.length} PTD conditions still open`);
    }

    // Build decision
    const decision = new DecisionBuilder(applicationId, 'FINAL_APPROVAL')
      .withInputSnapshot(inputSnapshot)
      .withEligibility(eligibilityResult)
      .withPricing(pricingResult)
      .withConditions(conditions)
      .build();

    decision.decidedBy = {
      type: 'USER',
      userId: underwriterId,
      role: 'UNDERWRITER'
    };

    // Mark previous decision as superseded
    const previous = await this.repository.findLatestByApplication(applicationId);
    if (previous) {
      await this.repository.update(previous.id, {
        isLatest: false,
        supersededBy: decision.id,
        updatedAt: new Date()
      });
      decision.version = previous.version + 1;
    }

    // Save
    const saved = await this.repository.create(decision);

    // Sync to Encompass and advance milestone
    await this.encompassSync.syncDecision(applicationId, saved);
    await this.encompassSync.advanceMilestone(applicationId, 'Approved');

    return saved;
  }

  /**
   * Record UW review of a decision.
   */
  async recordReview(
    decisionId: string,
    reviewerId: string,
    approved: boolean,
    notes?: string
  ): Promise<Decision> {
    const decision = await this.repository.findById(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    return this.repository.update(decisionId, {
      reviewedAt: new Date(),
      reviewedBy: {
        type: 'USER',
        userId: reviewerId,
        role: 'UNDERWRITER'
      },
      updatedAt: new Date()
    });
  }

  /**
   * Get decision history for application.
   */
  async getDecisionHistory(applicationId: string): Promise<Decision[]> {
    return this.repository.findByApplicationId(applicationId);
  }

  /**
   * Get current (latest) decision.
   */
  async getCurrentDecision(applicationId: string): Promise<Decision | null> {
    return this.repository.findLatestByApplication(applicationId);
  }

  /**
   * Check if decision is expired and needs refresh.
   */
  async checkExpiration(decisionId: string): Promise<{
    isExpired: boolean;
    daysRemaining: number;
    needsRefresh: boolean;
  }> {
    const decision = await this.repository.findById(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    const now = new Date();
    const expiration = new Date(decision.expirationDate);
    const daysRemaining = Math.floor(
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      isExpired: daysRemaining < 0,
      daysRemaining: Math.max(0, daysRemaining),
      needsRefresh: daysRemaining <= 7
    };
  }

  /**
   * Generate pre-approval packet/letter.
   */
  private async generatePreApprovalPacket(
    decision: Decision,
    input: DecisionInputSnapshot
  ): Promise<PreApprovalPacket> {
    const packet: PreApprovalPacket = {
      id: uuidv4(),
      decisionId: decision.id,
      applicationId: decision.applicationId,
      letterDate: new Date(),
      expirationDate: decision.expirationDate,
      borrowerName: '', // Would come from borrower data
      propertyAddress: '', // Would come from property data
      approvedLoanAmount: input.loanAmount,
      maxLoanAmount: input.loanAmount,
      interestRate: decision.pricingResult?.finalRate ?? 0,
      loanTerm: input.loanTerm,
      loanType: 'DSCR 30-Year Fixed',
      estimatedMonthlyPayment: decision.pricingResult?.monthlyPITIA ?? 0,
      estimatedClosingCosts: decision.pricingResult?.totalFees ?? 0,
      conditions: decision.conditions
        .filter(c => c.category === 'PTD')
        .map(c => c.title),
      createdAt: new Date()
    };

    return this.repository.createPacket(packet);
  }
}

// ============================================================================
// Encompass Field Mapping for Decisions
// ============================================================================

export const DECISION_ENCOMPASS_FIELD_MAPPING = {
  // Decision result
  decision: {
    decisionType: 'CX.DECISION_TYPE',
    decisionResult: 'CX.DECISION_RESULT',
    decisionDate: 'CX.DECISION_DATE',
    decisionVersion: 'CX.DECISION_VERSION',
    expirationDate: 'CX.DECISION_EXPIRY'
  },

  // Eligibility
  eligibility: {
    eligible: 'CX.ELIG_RESULT',
    score: 'CX.ELIG_SCORE',
    rulesVersion: 'CX.ELIG_RULES_VERSION',
    evalDate: 'CX.ELIG_EVAL_DATE'
  },

  // Risk assessment
  risk: {
    overallRisk: 'CX.RISK_OVERALL',
    riskScore: 'CX.RISK_SCORE',
    creditRisk: 'CX.RISK_CREDIT',
    propertyRisk: 'CX.RISK_PROPERTY',
    dscrRisk: 'CX.RISK_DSCR'
  },

  // Conditions summary
  conditions: {
    totalConditions: 'CX.COND_TOTAL',
    openConditions: 'CX.COND_OPEN',
    ptdCount: 'CX.COND_PTD_COUNT',
    ptcCount: 'CX.COND_PTC_COUNT'
  },

  // Pre-approval
  preApproval: {
    approvedAmount: 'CX.PREAPPR_AMOUNT',
    approvedRate: 'CX.PREAPPR_RATE',
    letterDate: 'CX.PREAPPR_LETTER_DATE'
  }
};
