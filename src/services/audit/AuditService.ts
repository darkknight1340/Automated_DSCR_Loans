/**
 * Audit & Explainability Service
 *
 * Provides comprehensive audit logging and explainability for all
 * system decisions, ensuring regulatory compliance and investor
 * diligence requirements are met.
 *
 * Key Features:
 * - Immutable audit trail for all actions
 * - Decision explainability for automated decisions
 * - Data lineage tracking
 * - Regulatory exam support
 * - Real-time event streaming
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Audit Event Types
// ============================================================================

export type AuditEventCategory =
  | 'LEAD'
  | 'APPLICATION'
  | 'BORROWER'
  | 'PROPERTY'
  | 'CREDIT'
  | 'VALUATION'
  | 'ELIGIBILITY'
  | 'PRICING'
  | 'DECISION'
  | 'CONDITION'
  | 'DOCUMENT'
  | 'WORKFLOW'
  | 'CLOSING'
  | 'FUNDING'
  | 'ENCOMPASS_SYNC'
  | 'SECURITY'
  | 'SYSTEM';

export type AuditAction =
  // CRUD operations
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  // Workflow actions
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'SUSPEND'
  | 'REACTIVATE'
  // Decision actions
  | 'EVALUATE'
  | 'CALCULATE'
  | 'DECIDE'
  | 'OVERRIDE'
  // Integration actions
  | 'SYNC'
  | 'SEND'
  | 'RECEIVE'
  | 'WEBHOOK'
  // Security actions
  | 'LOGIN'
  | 'LOGOUT'
  | 'ACCESS_DENIED'
  | 'PERMISSION_CHANGE';

export interface AuditEvent {
  id: string;
  timestamp: Date;

  // Classification
  category: AuditEventCategory;
  action: AuditAction;
  eventType: string; // e.g., 'LEAD_CREATED', 'DSCR_CALCULATED'

  // Actor
  actor: AuditActor;

  // Target
  targetType: string; // e.g., 'Lead', 'Application', 'Decision'
  targetId: string;
  applicationId?: string; // For loan-level events

  // Changes
  changes?: FieldChange[];
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;

  // Context
  context: AuditContext;

  // Metadata
  metadata?: Record<string, unknown>;
  tags?: string[];

  // Correlation
  correlationId?: string; // Link related events
  causationId?: string; // What triggered this event
  parentEventId?: string;

  // IP/Location
  ipAddress?: string;
  userAgent?: string;
  geoLocation?: { city?: string; country?: string };
}

export interface AuditActor {
  type: 'USER' | 'SYSTEM' | 'SERVICE' | 'INTEGRATION';
  id: string;
  name?: string;
  role?: string;
  service?: string;
}

export interface FieldChange {
  field: string;
  previousValue: unknown;
  newValue: unknown;
  changedAt: Date;
}

export interface AuditContext {
  environment: 'DEV' | 'STAGING' | 'PRODUCTION';
  service: string;
  version: string;
  requestId?: string;
  sessionId?: string;
}

// ============================================================================
// Explainability Types
// ============================================================================

export interface DecisionExplanation {
  id: string;
  decisionId: string;
  decisionType: string;
  result: string;
  explainedAt: Date;

  // Summary
  summary: string;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';

  // Input factors
  inputFactors: ExplanationFactor[];

  // Rules applied
  rulesApplied: RuleApplication[];

  // Calculations
  calculations: CalculationStep[];

  // Data sources
  dataSources: DataSource[];

  // Recommendations
  recommendations?: string[];

  // Human-readable narrative
  narrative: string;

  // Version info
  modelVersion: string;
  rulesVersion: string;
}

export interface ExplanationFactor {
  name: string;
  value: unknown;
  weight: number;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  description: string;
  source: string;
  retrievedAt: Date;
}

export interface RuleApplication {
  ruleId: string;
  ruleName: string;
  ruleVersion: string;
  condition: string;
  result: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';
  explanation: string;
  inputValues: Record<string, unknown>;
}

export interface CalculationStep {
  name: string;
  formula: string;
  inputs: Record<string, number>;
  result: number;
  explanation: string;
}

export interface DataSource {
  name: string;
  type: 'DATABASE' | 'EXTERNAL_API' | 'DOCUMENT' | 'USER_INPUT';
  retrievedAt: Date;
  dataVersion?: string;
  reliability: 'VERIFIED' | 'UNVERIFIED' | 'ESTIMATED';
}

// ============================================================================
// Data Lineage Types
// ============================================================================

export interface DataLineage {
  id: string;
  applicationId: string;
  fieldPath: string; // e.g., 'dscr.ratio', 'credit.score'

  // Current value
  currentValue: unknown;
  valueType: string;
  lastUpdatedAt: Date;
  lastUpdatedBy: AuditActor;

  // History
  history: DataLineageEntry[];

  // Sources
  sources: DataLineageSource[];

  // Dependencies
  dependsOn: string[]; // Other fields this depends on
  usedBy: string[]; // Fields that depend on this
}

export interface DataLineageEntry {
  value: unknown;
  setAt: Date;
  setBy: AuditActor;
  source: string;
  reason?: string;
}

export interface DataLineageSource {
  sourceType: 'USER_INPUT' | 'CALCULATION' | 'EXTERNAL_API' | 'DOCUMENT' | 'SYSTEM';
  sourceName: string;
  sourceId?: string;
  confidence: number; // 0-100
  retrievedAt: Date;
}

// ============================================================================
// Regulatory Exam Support
// ============================================================================

export interface ExamPackage {
  id: string;
  generatedAt: Date;
  generatedBy: string;

  // Scope
  applicationIds: string[];
  dateRange: { from: Date; to: Date };
  categories: AuditEventCategory[];

  // Contents
  summary: ExamSummary;
  loanDetails: LoanExamDetail[];
  systemConfiguration: SystemConfiguration;
  auditTrail: AuditEvent[];

  // Export
  format: 'PDF' | 'XLSX' | 'JSON';
  url?: string;
}

export interface ExamSummary {
  totalLoans: number;
  totalDecisions: number;
  approvalRate: number;
  averageProcessingTime: number;
  exceptionRate: number;
  automationRate: number;
}

export interface LoanExamDetail {
  applicationId: string;
  loanNumber: string;

  // Timeline
  applicationDate: Date;
  decisionDate?: Date;
  closingDate?: Date;
  fundingDate?: Date;

  // Key metrics
  loanAmount: number;
  interestRate: number;
  dscrRatio: number;
  ltv: number;
  creditScore: number;

  // Decision
  decisionResult: string;
  decisionRationale: string;

  // Exceptions
  exceptions: string[];

  // Audit events count
  auditEventCount: number;
}

export interface SystemConfiguration {
  rulesVersion: string;
  pricingVersion: string;
  eligibilityRules: RuleSnapshot[];
  pricingCard: unknown;
  systemSettings: Record<string, unknown>;
}

export interface RuleSnapshot {
  id: string;
  name: string;
  version: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  condition: string;
}

// ============================================================================
// Audit Service
// ============================================================================

export interface IAuditRepository {
  createEvent(event: AuditEvent): Promise<AuditEvent>;
  findById(id: string): Promise<AuditEvent | null>;
  findByApplication(applicationId: string): Promise<AuditEvent[]>;
  findByTarget(targetType: string, targetId: string): Promise<AuditEvent[]>;
  findByCorrelation(correlationId: string): Promise<AuditEvent[]>;
  query(query: AuditQuery): Promise<AuditEvent[]>;
}

export interface AuditQuery {
  applicationId?: string;
  category?: AuditEventCategory[];
  action?: AuditAction[];
  actorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface IExplanationRepository {
  save(explanation: DecisionExplanation): Promise<void>;
  findByDecision(decisionId: string): Promise<DecisionExplanation | null>;
}

export interface IDataLineageRepository {
  save(lineage: DataLineage): Promise<void>;
  findByField(applicationId: string, fieldPath: string): Promise<DataLineage | null>;
  findByApplication(applicationId: string): Promise<DataLineage[]>;
}

export interface IEventPublisher {
  publish(event: AuditEvent): Promise<void>;
}

export class AuditService {
  private context: AuditContext;

  constructor(
    private readonly auditRepo: IAuditRepository,
    private readonly explanationRepo: IExplanationRepository,
    private readonly lineageRepo: IDataLineageRepository,
    private readonly eventPublisher: IEventPublisher,
    context: Partial<AuditContext>
  ) {
    this.context = {
      environment: context.environment ?? 'PRODUCTION',
      service: context.service ?? 'dscr-platform',
      version: context.version ?? '1.0.0'
    };
  }

  // -------------------------------------------------------------------------
  // Audit Events
  // -------------------------------------------------------------------------

  async logEvent(
    category: AuditEventCategory,
    action: AuditAction,
    eventType: string,
    actor: AuditActor,
    target: { type: string; id: string; applicationId?: string },
    options?: {
      changes?: FieldChange[];
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      tags?: string[];
      correlationId?: string;
      causationId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      category,
      action,
      eventType,
      actor,
      targetType: target.type,
      targetId: target.id,
      applicationId: target.applicationId,
      changes: options?.changes,
      previousState: options?.previousState,
      newState: options?.newState,
      context: this.context,
      metadata: options?.metadata,
      tags: options?.tags,
      correlationId: options?.correlationId,
      causationId: options?.causationId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent
    };

    // Persist
    const saved = await this.auditRepo.createEvent(event);

    // Publish to event stream
    await this.eventPublisher.publish(saved);

    return saved;
  }

  async getAuditTrail(applicationId: string): Promise<AuditEvent[]> {
    return this.auditRepo.findByApplication(applicationId);
  }

  async getTargetHistory(targetType: string, targetId: string): Promise<AuditEvent[]> {
    return this.auditRepo.findByTarget(targetType, targetId);
  }

  async searchEvents(query: AuditQuery): Promise<AuditEvent[]> {
    return this.auditRepo.query(query);
  }

  // -------------------------------------------------------------------------
  // Decision Explainability
  // -------------------------------------------------------------------------

  async explainDecision(
    decisionId: string,
    decisionType: string,
    result: string,
    inputs: {
      factors: ExplanationFactor[];
      rules: RuleApplication[];
      calculations: CalculationStep[];
      dataSources: DataSource[];
    },
    versions: { modelVersion: string; rulesVersion: string }
  ): Promise<DecisionExplanation> {
    // Generate narrative
    const narrative = this.generateNarrative(decisionType, result, inputs.factors, inputs.rules);

    // Calculate confidence
    const confidenceLevel = this.calculateConfidence(inputs.factors, inputs.dataSources);

    // Generate summary
    const summary = this.generateSummary(decisionType, result, inputs.factors);

    const explanation: DecisionExplanation = {
      id: uuidv4(),
      decisionId,
      decisionType,
      result,
      explainedAt: new Date(),
      summary,
      confidenceLevel,
      inputFactors: inputs.factors,
      rulesApplied: inputs.rules,
      calculations: inputs.calculations,
      dataSources: inputs.dataSources,
      narrative,
      modelVersion: versions.modelVersion,
      rulesVersion: versions.rulesVersion
    };

    await this.explanationRepo.save(explanation);

    return explanation;
  }

  async getDecisionExplanation(decisionId: string): Promise<DecisionExplanation | null> {
    return this.explanationRepo.findByDecision(decisionId);
  }

  private generateNarrative(
    decisionType: string,
    result: string,
    factors: ExplanationFactor[],
    rules: RuleApplication[]
  ): string {
    const posFactors = factors.filter(f => f.impact === 'POSITIVE');
    const negFactors = factors.filter(f => f.impact === 'NEGATIVE');
    const failedRules = rules.filter(r => r.result === 'FAIL');

    let narrative = `The ${decisionType} decision resulted in ${result}. `;

    if (posFactors.length > 0) {
      narrative += `Positive factors include: ${posFactors.map(f => f.name).join(', ')}. `;
    }

    if (negFactors.length > 0) {
      narrative += `Factors requiring attention: ${negFactors.map(f => f.name).join(', ')}. `;
    }

    if (failedRules.length > 0) {
      narrative += `The following rules did not pass: ${failedRules.map(r => r.ruleName).join(', ')}.`;
    }

    return narrative;
  }

  private calculateConfidence(
    factors: ExplanationFactor[],
    sources: DataSource[]
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    const verifiedSources = sources.filter(s => s.reliability === 'VERIFIED').length;
    const totalSources = sources.length;
    const sourceRatio = totalSources > 0 ? verifiedSources / totalSources : 0;

    if (sourceRatio >= 0.9) return 'HIGH';
    if (sourceRatio >= 0.7) return 'MEDIUM';
    return 'LOW';
  }

  private generateSummary(
    decisionType: string,
    result: string,
    factors: ExplanationFactor[]
  ): string {
    const topFactors = factors
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map(f => f.name);

    return `${decisionType}: ${result}. Key factors: ${topFactors.join(', ')}.`;
  }

  // -------------------------------------------------------------------------
  // Data Lineage
  // -------------------------------------------------------------------------

  async trackDataLineage(
    applicationId: string,
    fieldPath: string,
    value: unknown,
    source: DataLineageSource,
    actor: AuditActor
  ): Promise<DataLineage> {
    // Get existing lineage
    let lineage = await this.lineageRepo.findByField(applicationId, fieldPath);

    const entry: DataLineageEntry = {
      value,
      setAt: new Date(),
      setBy: actor,
      source: source.sourceName
    };

    if (lineage) {
      // Update existing
      lineage.currentValue = value;
      lineage.lastUpdatedAt = new Date();
      lineage.lastUpdatedBy = actor;
      lineage.history.push(entry);
      if (!lineage.sources.find(s => s.sourceName === source.sourceName)) {
        lineage.sources.push(source);
      }
    } else {
      // Create new
      lineage = {
        id: uuidv4(),
        applicationId,
        fieldPath,
        currentValue: value,
        valueType: typeof value,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: actor,
        history: [entry],
        sources: [source],
        dependsOn: [],
        usedBy: []
      };
    }

    await this.lineageRepo.save(lineage);

    return lineage;
  }

  async getDataLineage(applicationId: string, fieldPath: string): Promise<DataLineage | null> {
    return this.lineageRepo.findByField(applicationId, fieldPath);
  }

  async getApplicationLineage(applicationId: string): Promise<DataLineage[]> {
    return this.lineageRepo.findByApplication(applicationId);
  }

  // -------------------------------------------------------------------------
  // Exam Package Generation
  // -------------------------------------------------------------------------

  async generateExamPackage(
    applicationIds: string[],
    dateRange: { from: Date; to: Date },
    categories: AuditEventCategory[],
    generatedBy: string
  ): Promise<ExamPackage> {
    // Gather audit events
    const auditTrail: AuditEvent[] = [];
    const loanDetails: LoanExamDetail[] = [];

    for (const applicationId of applicationIds) {
      const events = await this.auditRepo.findByApplication(applicationId);
      auditTrail.push(...events.filter(e =>
        (!categories.length || categories.includes(e.category)) &&
        e.timestamp >= dateRange.from &&
        e.timestamp <= dateRange.to
      ));

      // Would gather loan details from application service
      // Simplified for this implementation
    }

    // Generate summary
    const summary: ExamSummary = {
      totalLoans: applicationIds.length,
      totalDecisions: auditTrail.filter(e => e.category === 'DECISION').length,
      approvalRate: 0, // Would calculate from decisions
      averageProcessingTime: 0, // Would calculate from timestamps
      exceptionRate: 0,
      automationRate: 0
    };

    const examPackage: ExamPackage = {
      id: uuidv4(),
      generatedAt: new Date(),
      generatedBy,
      applicationIds,
      dateRange,
      categories,
      summary,
      loanDetails,
      systemConfiguration: {
        rulesVersion: '2.1.0',
        pricingVersion: 'Q1_2024',
        eligibilityRules: [],
        pricingCard: {},
        systemSettings: {}
      },
      auditTrail,
      format: 'JSON'
    };

    return examPackage;
  }
}

// ============================================================================
// Convenience Functions for Common Audit Events
// ============================================================================

export function createAuditHelpers(auditService: AuditService) {
  return {
    logLeadCreated: (leadId: string, actor: AuditActor, data: Record<string, unknown>) =>
      auditService.logEvent('LEAD', 'CREATE', 'LEAD_CREATED', actor, {
        type: 'Lead',
        id: leadId
      }, { newState: data }),

    logApplicationCreated: (appId: string, actor: AuditActor, data: Record<string, unknown>) =>
      auditService.logEvent('APPLICATION', 'CREATE', 'APPLICATION_CREATED', actor, {
        type: 'Application',
        id: appId,
        applicationId: appId
      }, { newState: data }),

    logDSCRCalculated: (appId: string, calculationId: string, result: Record<string, unknown>) =>
      auditService.logEvent('ELIGIBILITY', 'CALCULATE', 'DSCR_CALCULATED', {
        type: 'SYSTEM',
        id: 'dscr-calculator',
        service: 'dscr-calculator'
      }, {
        type: 'DSCRCalculation',
        id: calculationId,
        applicationId: appId
      }, { newState: result }),

    logDecisionMade: (appId: string, decisionId: string, actor: AuditActor, result: Record<string, unknown>) =>
      auditService.logEvent('DECISION', 'DECIDE', 'DECISION_MADE', actor, {
        type: 'Decision',
        id: decisionId,
        applicationId: appId
      }, { newState: result }),

    logEncompassSync: (appId: string, syncType: string, fields: Record<string, unknown>) =>
      auditService.logEvent('ENCOMPASS_SYNC', 'SYNC', `ENCOMPASS_${syncType}_SYNCED`, {
        type: 'INTEGRATION',
        id: 'encompass-adapter',
        service: 'encompass'
      }, {
        type: 'EncompassSync',
        id: uuidv4(),
        applicationId: appId
      }, { newState: fields }),

    logConditionCleared: (appId: string, conditionId: string, actor: AuditActor, method: string) =>
      auditService.logEvent('CONDITION', 'UPDATE', 'CONDITION_CLEARED', actor, {
        type: 'Condition',
        id: conditionId,
        applicationId: appId
      }, { metadata: { clearanceMethod: method } }),

    logSecurityEvent: (action: AuditAction, actor: AuditActor, details: Record<string, unknown>, ipAddress?: string) =>
      auditService.logEvent('SECURITY', action, `SECURITY_${action}`, actor, {
        type: 'SecurityEvent',
        id: uuidv4()
      }, { metadata: details, ipAddress })
  };
}

// ============================================================================
// Audit Event Types for DSCR Platform
// ============================================================================

export const DSCR_AUDIT_EVENT_TYPES = {
  // Lead events
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_SCORED: 'LEAD_SCORED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_QUALIFIED: 'LEAD_QUALIFIED',
  LEAD_CONVERTED: 'LEAD_CONVERTED',

  // Application events
  APPLICATION_CREATED: 'APPLICATION_CREATED',
  APPLICATION_UPDATED: 'APPLICATION_UPDATED',
  APPLICATION_STATUS_CHANGED: 'APPLICATION_STATUS_CHANGED',

  // Credit events
  CREDIT_ORDERED: 'CREDIT_ORDERED',
  CREDIT_RECEIVED: 'CREDIT_RECEIVED',
  CREDIT_ANALYZED: 'CREDIT_ANALYZED',

  // Valuation events
  AVM_ORDERED: 'AVM_ORDERED',
  AVM_RECEIVED: 'AVM_RECEIVED',
  APPRAISAL_ORDERED: 'APPRAISAL_ORDERED',
  APPRAISAL_RECEIVED: 'APPRAISAL_RECEIVED',
  VALUATION_RECONCILED: 'VALUATION_RECONCILED',

  // Calculation events
  DSCR_CALCULATED: 'DSCR_CALCULATED',
  LTV_CALCULATED: 'LTV_CALCULATED',
  PRICING_CALCULATED: 'PRICING_CALCULATED',

  // Decision events
  ELIGIBILITY_EVALUATED: 'ELIGIBILITY_EVALUATED',
  PREAPPROVAL_GENERATED: 'PREAPPROVAL_GENERATED',
  FINAL_APPROVAL_ISSUED: 'FINAL_APPROVAL_ISSUED',
  DECISION_DECLINED: 'DECISION_DECLINED',
  DECISION_SUSPENDED: 'DECISION_SUSPENDED',

  // Condition events
  CONDITION_CREATED: 'CONDITION_CREATED',
  CONDITION_CLEARED: 'CONDITION_CLEARED',
  CONDITION_WAIVED: 'CONDITION_WAIVED',

  // Document events
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_CLASSIFIED: 'DOCUMENT_CLASSIFIED',
  DOCUMENT_ACCEPTED: 'DOCUMENT_ACCEPTED',
  DOCUMENT_REJECTED: 'DOCUMENT_REJECTED',

  // Workflow events
  MILESTONE_ADVANCED: 'MILESTONE_ADVANCED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED',

  // Closing events
  CLOSING_SCHEDULED: 'CLOSING_SCHEDULED',
  DOCS_ORDERED: 'DOCS_ORDERED',
  FUNDING_APPROVED: 'FUNDING_APPROVED',
  WIRE_SENT: 'WIRE_SENT',
  LOAN_FUNDED: 'LOAN_FUNDED',

  // Encompass events
  ENCOMPASS_LOAN_CREATED: 'ENCOMPASS_LOAN_CREATED',
  ENCOMPASS_FIELDS_SYNCED: 'ENCOMPASS_FIELDS_SYNCED',
  ENCOMPASS_MILESTONE_UPDATED: 'ENCOMPASS_MILESTONE_UPDATED',
  ENCOMPASS_WEBHOOK_RECEIVED: 'ENCOMPASS_WEBHOOK_RECEIVED'
};
