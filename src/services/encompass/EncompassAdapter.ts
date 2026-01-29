/**
 * Encompass Integration Adapter
 *
 * Handles all communication with ICE Encompass LOS:
 * - Loan creation and updates
 * - Field mapping (platform ↔ Encompass)
 * - Milestone management
 * - Condition management
 * - Service orchestration (credit, appraisal, etc.)
 * - Webhook handling
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Application,
  Borrower,
  Property,
  EncompassLink,
  SyncStatus,
  LoanStatus,
  BorrowerType,
  PropertyType,
  LoanPurpose,
  ConditionCategory,
  Condition,
  ConditionStatus,
} from '../../types';

// =====================================================
// TYPES
// =====================================================

export interface EncompassLoan {
  guid: string;
  loanNumber?: string;
  folder?: string;
  currentMilestone?: string;
  fields: Record<string, unknown>;
  milestoneHistory?: string[];
}

export interface EncompassFieldUpdate {
  fieldId: string;
  value: unknown;
}

export interface EncompassCondition {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  priorTo: string;
  source?: string;
}

export interface FieldMapping {
  platform: string;
  encompass: string;
  transform: TransformType;
  bidirectional: boolean;
  required: boolean;
}

type TransformType =
  | 'direct'
  | 'encrypt'
  | 'decrypt'
  | 'normalizeAddress'
  | 'normalizePhone'
  | 'mapEnum'
  | 'roundDecimal'
  | 'toDate'
  | 'toCents'
  | 'fromCents'
  | 'custom';

export interface MilestoneRule {
  targetMilestone: string;
  prerequisites: string[];
  conditions: MilestoneCondition[];
  autoAdvance: boolean;
  notifications: string[];
}

export interface MilestoneCondition {
  type: 'field_populated' | 'field_value' | 'conditions_cleared' | 'document_received';
  fields?: string[];
  field?: string;
  operator?: string;
  value?: unknown;
  category?: string;
  docTypes?: string[];
}

// =====================================================
// FIELD MAPPINGS
// =====================================================

export const STANDARD_FIELD_MAPPINGS: FieldMapping[] = [
  // Borrower fields
  { platform: 'borrower.individual.firstName', encompass: '4000', transform: 'direct', bidirectional: true, required: true },
  { platform: 'borrower.individual.lastName', encompass: '4002', transform: 'direct', bidirectional: true, required: true },
  { platform: 'borrower.individual.ssn', encompass: '65', transform: 'decrypt', bidirectional: false, required: true },
  { platform: 'borrower.contact.email', encompass: '1240', transform: 'direct', bidirectional: true, required: true },
  { platform: 'borrower.contact.phone', encompass: '1480', transform: 'normalizePhone', bidirectional: true, required: false },
  { platform: 'borrower.mailingAddress.street', encompass: 'URLA.X73', transform: 'direct', bidirectional: true, required: false },
  { platform: 'borrower.mailingAddress.city', encompass: 'URLA.X75', transform: 'direct', bidirectional: true, required: false },
  { platform: 'borrower.mailingAddress.state', encompass: 'URLA.X76', transform: 'direct', bidirectional: true, required: false },
  { platform: 'borrower.mailingAddress.zip', encompass: 'URLA.X77', transform: 'direct', bidirectional: true, required: false },

  // Property fields
  { platform: 'property.address.street', encompass: '11', transform: 'normalizeAddress', bidirectional: true, required: true },
  { platform: 'property.address.city', encompass: '12', transform: 'direct', bidirectional: true, required: true },
  { platform: 'property.address.state', encompass: '14', transform: 'direct', bidirectional: true, required: true },
  { platform: 'property.address.zip', encompass: '15', transform: 'direct', bidirectional: true, required: true },
  { platform: 'property.address.county', encompass: '13', transform: 'direct', bidirectional: true, required: false },
  { platform: 'property.characteristics.propertyType', encompass: '1041', transform: 'mapEnum', bidirectional: true, required: true },
  { platform: 'property.characteristics.units', encompass: '16', transform: 'direct', bidirectional: true, required: true },
  { platform: 'property.characteristics.yearBuilt', encompass: '18', transform: 'direct', bidirectional: true, required: false },

  // Loan fields
  { platform: 'application.loanTerms.amount', encompass: '1109', transform: 'fromCents', bidirectional: true, required: true },
  { platform: 'application.loanTerms.purpose', encompass: '19', transform: 'mapEnum', bidirectional: true, required: true },
  { platform: 'application.loanTerms.termMonths', encompass: '4', transform: 'direct', bidirectional: true, required: true },
  { platform: 'application.financials.purchasePrice', encompass: '136', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'application.financials.estimatedValue', encompass: '1821', transform: 'fromCents', bidirectional: true, required: true },
  { platform: 'application.ratios.ltv', encompass: '353', transform: 'roundDecimal', bidirectional: true, required: false },
];

export const CUSTOM_FIELD_MAPPINGS: FieldMapping[] = [
  // DSCR fields
  { platform: 'dscr.income.grossMonthlyRent', encompass: 'CX.DSCR_GROSS_RENT', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.income.vacancyRate', encompass: 'CX.DSCR_VACANCY_RATE', transform: 'direct', bidirectional: true, required: false },
  { platform: 'dscr.income.effectiveGrossRent', encompass: 'CX.DSCR_EFFECTIVE_RENT', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.expenses.propertyTaxMonthly', encompass: 'CX.DSCR_PROPERTY_TAX_MO', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.expenses.insuranceMonthly', encompass: 'CX.DSCR_INSURANCE_MO', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.expenses.hoaMonthly', encompass: 'CX.DSCR_HOA_MO', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.expenses.managementFeeMonthly', encompass: 'CX.DSCR_MGMT_FEE_MO', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.noi.monthly', encompass: 'CX.DSCR_NOI_MONTHLY', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.debtService.totalPITIA', encompass: 'CX.DSCR_PITIA', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'dscr.dscrRatio', encompass: 'CX.DSCR_RATIO', transform: 'roundDecimal', bidirectional: true, required: false },
  { platform: 'dscr.calculatedAt', encompass: 'CX.DSCR_CALC_DATE', transform: 'toDate', bidirectional: true, required: false },
  { platform: 'dscr.calculatorVersion', encompass: 'CX.DSCR_CALC_VERSION', transform: 'direct', bidirectional: true, required: false },

  // AVM fields
  { platform: 'avm.valuation.estimated', encompass: 'CX.AVM_VALUE', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'avm.valuation.confidenceLevel', encompass: 'CX.AVM_CONFIDENCE', transform: 'direct', bidirectional: true, required: false },
  { platform: 'avm.valuation.confidenceScore', encompass: 'CX.AVM_CONFIDENCE_SCORE', transform: 'direct', bidirectional: true, required: false },
  { platform: 'avm.valuation.fsd', encompass: 'CX.AVM_FSD', transform: 'direct', bidirectional: true, required: false },
  { platform: 'avm.vendor', encompass: 'CX.AVM_PROVIDER', transform: 'direct', bidirectional: true, required: false },
  { platform: 'avm.orderId', encompass: 'CX.AVM_REPORT_ID', transform: 'direct', bidirectional: true, required: false },
  { platform: 'avm.receivedAt', encompass: 'CX.AVM_DATE', transform: 'toDate', bidirectional: true, required: false },
  { platform: 'avm.valuation.low', encompass: 'CX.AVM_LOW', transform: 'fromCents', bidirectional: true, required: false },
  { platform: 'avm.valuation.high', encompass: 'CX.AVM_HIGH', transform: 'fromCents', bidirectional: true, required: false },

  // Eligibility fields
  { platform: 'eligibility.result', encompass: 'CX.ELIG_RESULT', transform: 'direct', bidirectional: true, required: false },
  { platform: 'eligibility.ruleVersion', encompass: 'CX.ELIG_RULES_VERSION', transform: 'direct', bidirectional: true, required: false },
  { platform: 'eligibility.evaluatedAt', encompass: 'CX.ELIG_EVAL_DATE', transform: 'toDate', bidirectional: true, required: false },
  { platform: 'eligibility.failReasons', encompass: 'CX.ELIG_FAIL_REASONS', transform: 'direct', bidirectional: true, required: false },
  { platform: 'eligibility.warnings', encompass: 'CX.ELIG_WARNINGS', transform: 'direct', bidirectional: true, required: false },
  { platform: 'eligibility.exceptions', encompass: 'CX.ELIG_EXCEPTIONS', transform: 'direct', bidirectional: true, required: false },
  { platform: 'eligibility.score', encompass: 'CX.ELIG_SCORE', transform: 'direct', bidirectional: true, required: false },

  // Pricing fields
  { platform: 'pricing.baseRate', encompass: 'CX.PRICE_BASE_RATE', transform: 'direct', bidirectional: true, required: false },
  { platform: 'pricing.totalAdders', encompass: 'CX.PRICE_ADDERS_TOTAL', transform: 'direct', bidirectional: true, required: false },
  { platform: 'pricing.finalRate', encompass: 'CX.PRICE_FINAL_RATE', transform: 'direct', bidirectional: true, required: false },
  { platform: 'pricing.cardId', encompass: 'CX.PRICE_CARD_ID', transform: 'direct', bidirectional: true, required: false },
  { platform: 'pricing.cardDate', encompass: 'CX.PRICE_CARD_DATE', transform: 'toDate', bidirectional: true, required: false },
  { platform: 'pricing.lockDate', encompass: 'CX.PRICE_LOCK_DATE', transform: 'toDate', bidirectional: true, required: false },
  { platform: 'pricing.lockExpiry', encompass: 'CX.PRICE_LOCK_EXPIRY', transform: 'toDate', bidirectional: true, required: false },
  { platform: 'pricing.lockDays', encompass: 'CX.PRICE_LOCK_DAYS', transform: 'direct', bidirectional: true, required: false },

  // Platform tracking fields
  { platform: 'encompassLink.applicationId', encompass: 'CX.PLATFORM_LOAN_ID', transform: 'direct', bidirectional: false, required: true },
  { platform: 'lead.id', encompass: 'CX.PLATFORM_LEAD_ID', transform: 'direct', bidirectional: false, required: false },
  { platform: 'encompassLink.createdAt', encompass: 'CX.PLATFORM_CREATED_AT', transform: 'toDate', bidirectional: false, required: false },
  { platform: 'encompassLink.lastSyncToEncompass', encompass: 'CX.PLATFORM_LAST_SYNC', transform: 'toDate', bidirectional: false, required: false },
];

// =====================================================
// MILESTONE RULES
// =====================================================

export const MILESTONE_RULES: MilestoneRule[] = [
  {
    targetMilestone: 'Application',
    prerequisites: ['Started'],
    conditions: [
      { type: 'field_populated', fields: ['4000', '4002', '65', '11', '12', '14', '15'] },
      { type: 'field_value', field: 'CX.PLATFORM_LOAN_ID', operator: 'not_empty' },
    ],
    autoAdvance: true,
    notifications: [],
  },
  {
    targetMilestone: 'Pre-Approved',
    prerequisites: ['Application'],
    conditions: [
      { type: 'field_value', field: 'CX.ELIG_RESULT', operator: 'eq', value: 'APPROVED' },
      { type: 'field_value', field: 'CX.DSCR_RATIO', operator: 'gte', value: 1.0 },
      { type: 'field_value', field: 'CX.AVM_VALUE', operator: 'gt', value: 0 },
    ],
    autoAdvance: true,
    notifications: ['assigned_lo'],
  },
  {
    targetMilestone: 'Submitted',
    prerequisites: ['Processing'],
    conditions: [
      { type: 'conditions_cleared', category: 'PTD' },
      { type: 'document_received', docTypes: ['APPLICATION', 'ID', 'RENT_ROLL'] },
    ],
    autoAdvance: true,
    notifications: ['assigned_uw'],
  },
  {
    targetMilestone: 'Clear to Close',
    prerequisites: ['Approved'],
    conditions: [
      { type: 'conditions_cleared', category: 'PTC' },
      { type: 'field_value', field: 'CX.CLOSING_SCHEDULED', operator: 'not_empty' },
    ],
    autoAdvance: true,
    notifications: ['assigned_closer', 'borrower'],
  },
];

// =====================================================
// ENCOMPASS ADAPTER
// =====================================================

export class EncompassAdapter {
  private readonly allMappings: FieldMapping[];

  constructor(
    private readonly encompassClient: EncompassClient,
    private readonly db: EncompassLinkRepository,
    private readonly eventBus: EventBus,
    private readonly auditLog: AuditLogger,
  ) {
    this.allMappings = [...STANDARD_FIELD_MAPPINGS, ...CUSTOM_FIELD_MAPPINGS];
  }

  // =====================================================
  // LOAN OPERATIONS
  // =====================================================

  /**
   * Create or get existing loan in Encompass (idempotent)
   */
  async createOrGetLoan(
    application: Application,
    borrower: Borrower,
    property: Property
  ): Promise<EncompassLink> {
    // Check if loan already exists
    const existingLink = await this.db.findByApplicationId(application.id);
    if (existingLink) {
      return existingLink;
    }

    // Check by custom field (in case of orphaned link)
    const existingByCustom = await this.encompassClient.searchLoans({
      filter: `CX.PLATFORM_LOAN_ID eq '${application.id}'`,
    });

    if (existingByCustom.length > 0) {
      // Found existing loan, create link
      const loan = existingByCustom[0];
      const link: EncompassLink = {
        applicationId: application.id,
        encompassLoanGuid: loan.guid,
        encompassLoanNumber: loan.loanNumber,
        encompassFolder: loan.folder,
        syncStatus: SyncStatus.SYNCED,
        syncRetryCount: 0,
        currentMilestone: loan.currentMilestone,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.db.createLink(link);
      return link;
    }

    // Create new loan
    const fieldUpdates = this.mapToEncompassFields(application, borrower, property);

    const loan = await this.encompassClient.createLoan({
      loanTemplate: 'DSCR_Refinance_v2',
      fields: Object.fromEntries(fieldUpdates.map((f) => [f.fieldId, f.value])),
    });

    // Set our tracking field
    await this.encompassClient.updateLoan(loan.guid, {
      'CX.PLATFORM_LOAN_ID': application.id,
      'CX.PLATFORM_CREATED_AT': new Date().toISOString(),
    });

    // Create link record
    const link: EncompassLink = {
      applicationId: application.id,
      encompassLoanGuid: loan.guid,
      encompassLoanNumber: loan.loanNumber,
      encompassFolder: loan.folder,
      syncStatus: SyncStatus.SYNCED,
      syncRetryCount: 0,
      lastSyncToEncompass: new Date(),
      currentMilestone: 'Started',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.createLink(link);

    // Emit event
    await this.eventBus.emit({
      eventType: 'ENCOMPASS_LOAN_CREATED',
      aggregateType: 'application',
      aggregateId: application.id,
      encompassLoanGuid: loan.guid,
      payload: { loanGuid: loan.guid, loanNumber: loan.loanNumber },
    });

    // Audit
    await this.auditLog.log({
      eventType: 'ENCOMPASS_LOAN_CREATED',
      resourceType: 'encompass_loan',
      resourceId: loan.guid,
      action: 'CREATE',
      newState: { applicationId: application.id, loanGuid: loan.guid },
    });

    return link;
  }

  /**
   * Sync platform data to Encompass
   */
  async syncToEncompass(
    applicationId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const link = await this.db.findByApplicationId(applicationId);
    if (!link) {
      throw new Error(`No Encompass link found for application: ${applicationId}`);
    }

    try {
      const fieldUpdates = this.mapPlatformToEncompass(data);

      if (fieldUpdates.length === 0) {
        return;
      }

      await this.encompassClient.updateLoan(
        link.encompassLoanGuid,
        Object.fromEntries(fieldUpdates.map((f) => [f.fieldId, f.value]))
      );

      // Update link
      await this.db.updateLink(link.applicationId, {
        lastSyncToEncompass: new Date(),
        syncStatus: SyncStatus.SYNCED,
        syncRetryCount: 0,
        syncErrorMessage: undefined,
        updatedAt: new Date(),
      });

      // Audit
      await this.auditLog.log({
        eventType: 'ENCOMPASS_SYNC_SUCCESS',
        resourceType: 'encompass_loan',
        resourceId: link.encompassLoanGuid,
        action: 'SYNC',
        newState: {
          applicationId,
          fieldsUpdated: fieldUpdates.map((f) => f.fieldId),
        },
      });
    } catch (error) {
      // Update link with error
      await this.db.updateLink(link.applicationId, {
        syncStatus: SyncStatus.FAILED,
        syncRetryCount: (link.syncRetryCount || 0) + 1,
        syncErrorMessage: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      });

      await this.eventBus.emit({
        eventType: 'ENCOMPASS_SYNC_FAILED',
        aggregateType: 'application',
        aggregateId: applicationId,
        encompassLoanGuid: link.encompassLoanGuid,
        payload: { error: error instanceof Error ? error.message : 'Unknown error' },
      });

      throw error;
    }
  }

  /**
   * Sync Encompass data to platform
   */
  async syncFromEncompass(encompassLoanGuid: string): Promise<Record<string, unknown>> {
    const loan = await this.encompassClient.getLoan(encompassLoanGuid);
    if (!loan) {
      throw new Error(`Loan not found in Encompass: ${encompassLoanGuid}`);
    }

    const platformData = this.mapEncompassToPlatform(loan.fields);

    const link = await this.db.findByEncompassGuid(encompassLoanGuid);
    if (link) {
      await this.db.updateLink(link.applicationId, {
        lastSyncFromEncompass: new Date(),
        currentMilestone: loan.currentMilestone,
        updatedAt: new Date(),
      });
    }

    return platformData;
  }

  // =====================================================
  // MILESTONE OPERATIONS
  // =====================================================

  /**
   * Evaluate if loan should advance to next milestone
   */
  async evaluateMilestoneAdvancement(applicationId: string): Promise<{
    shouldAdvance: boolean;
    targetMilestone?: string;
    reason?: string;
  }> {
    const link = await this.db.findByApplicationId(applicationId);
    if (!link) {
      return { shouldAdvance: false, reason: 'No Encompass link' };
    }

    const loan = await this.encompassClient.getLoan(link.encompassLoanGuid);
    if (!loan) {
      return { shouldAdvance: false, reason: 'Loan not found' };
    }

    const currentMilestone = loan.currentMilestone || 'Started';

    for (const rule of MILESTONE_RULES) {
      // Check prerequisites
      if (!rule.prerequisites.includes(currentMilestone)) {
        continue;
      }

      // Check if already passed this milestone
      if (loan.milestoneHistory?.includes(rule.targetMilestone)) {
        continue;
      }

      // Evaluate conditions
      const conditionsMet = await this.evaluateMilestoneConditions(loan, rule.conditions);

      if (conditionsMet && rule.autoAdvance) {
        return {
          shouldAdvance: true,
          targetMilestone: rule.targetMilestone,
          reason: `All conditions met for ${rule.targetMilestone}`,
        };
      }
    }

    return { shouldAdvance: false };
  }

  /**
   * Advance milestone
   */
  async advanceMilestone(
    applicationId: string,
    milestone: string,
    reason: string
  ): Promise<void> {
    const link = await this.db.findByApplicationId(applicationId);
    if (!link) {
      throw new Error(`No Encompass link for application: ${applicationId}`);
    }

    await this.encompassClient.updateMilestone(link.encompassLoanGuid, {
      milestone,
      comments: `Auto-advanced: ${reason}`,
      systemGenerated: true,
    });

    await this.db.updateLink(applicationId, {
      currentMilestone: milestone,
      milestoneUpdatedAt: new Date(),
      updatedAt: new Date(),
    });

    await this.eventBus.emit({
      eventType: 'MILESTONE_ADVANCED',
      aggregateType: 'application',
      aggregateId: applicationId,
      encompassLoanGuid: link.encompassLoanGuid,
      payload: { milestone, reason, automated: true },
    });

    await this.auditLog.log({
      eventType: 'MILESTONE_ADVANCED',
      resourceType: 'encompass_loan',
      resourceId: link.encompassLoanGuid,
      action: 'ADVANCE',
      newState: { milestone, reason, automated: true },
    });
  }

  private async evaluateMilestoneConditions(
    loan: EncompassLoan,
    conditions: MilestoneCondition[]
  ): Promise<boolean> {
    for (const condition of conditions) {
      switch (condition.type) {
        case 'field_populated':
          if (condition.fields) {
            for (const field of condition.fields) {
              const value = loan.fields[field];
              if (value === undefined || value === null || value === '') {
                return false;
              }
            }
          }
          break;

        case 'field_value':
          if (condition.field && condition.operator) {
            const value = loan.fields[condition.field];
            if (!this.evaluateOperator(value, condition.operator, condition.value)) {
              return false;
            }
          }
          break;

        case 'conditions_cleared':
          // Would check Encompass conditions API
          // Simplified for now
          break;

        case 'document_received':
          // Would check Encompass documents API
          // Simplified for now
          break;
      }
    }

    return true;
  }

  private evaluateOperator(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'gt': return (actual as number) > (expected as number);
      case 'gte': return (actual as number) >= (expected as number);
      case 'lt': return (actual as number) < (expected as number);
      case 'lte': return (actual as number) <= (expected as number);
      case 'not_empty': return actual !== undefined && actual !== null && actual !== '';
      default: return false;
    }
  }

  // =====================================================
  // CONDITION OPERATIONS
  // =====================================================

  /**
   * Add condition to Encompass loan
   */
  async addCondition(
    applicationId: string,
    condition: Omit<Condition, 'id' | 'createdAt' | 'updatedAt' | 'encompassConditionId' | 'syncedToEncompass'>
  ): Promise<EncompassCondition> {
    const link = await this.db.findByApplicationId(applicationId);
    if (!link) {
      throw new Error(`No Encompass link for application: ${applicationId}`);
    }

    const encompassCondition = await this.encompassClient.addCondition(
      link.encompassLoanGuid,
      {
        title: condition.title,
        description: condition.description,
        category: condition.category,
        source: condition.source,
        priorTo: this.mapCategoryToPriorTo(condition.category),
      }
    );

    return encompassCondition;
  }

  /**
   * Clear condition in Encompass
   */
  async clearCondition(
    applicationId: string,
    encompassConditionId: string,
    notes: string,
    clearedBy: string
  ): Promise<void> {
    const link = await this.db.findByApplicationId(applicationId);
    if (!link) {
      throw new Error(`No Encompass link for application: ${applicationId}`);
    }

    await this.encompassClient.clearCondition(link.encompassLoanGuid, encompassConditionId, {
      clearedBy,
      comments: notes,
    });
  }

  private mapCategoryToPriorTo(category: ConditionCategory): string {
    switch (category) {
      case ConditionCategory.PTD: return 'Prior to Documents';
      case ConditionCategory.PTC: return 'Prior to Closing';
      case ConditionCategory.PTF: return 'Prior to Funding';
      case ConditionCategory.POC: return 'Post-Closing';
      default: return 'Prior to Documents';
    }
  }

  // =====================================================
  // FIELD MAPPING
  // =====================================================

  private mapToEncompassFields(
    application: Application,
    borrower: Borrower,
    property: Property
  ): EncompassFieldUpdate[] {
    const data = {
      application,
      borrower,
      property,
    };

    return this.mapPlatformToEncompass(data);
  }

  private mapPlatformToEncompass(data: Record<string, unknown>): EncompassFieldUpdate[] {
    const updates: EncompassFieldUpdate[] = [];

    for (const mapping of this.allMappings) {
      const value = this.getNestedValue(data, mapping.platform);

      if (value !== undefined) {
        const transformedValue = this.applyTransform(value, mapping.transform, 'toEncompass');
        updates.push({
          fieldId: mapping.encompass,
          value: transformedValue,
        });
      }
    }

    return updates;
  }

  private mapEncompassToPlatform(fields: Record<string, unknown>): Record<string, unknown> {
    const platformData: Record<string, unknown> = {};

    for (const mapping of this.allMappings) {
      if (!mapping.bidirectional) continue;

      const value = fields[mapping.encompass];
      if (value !== undefined) {
        const transformedValue = this.applyTransform(value, mapping.transform, 'toPlatform');
        this.setNestedValue(platformData, mapping.platform, transformedValue);
      }
    }

    return platformData;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  private applyTransform(
    value: unknown,
    transform: TransformType,
    direction: 'toEncompass' | 'toPlatform'
  ): unknown {
    switch (transform) {
      case 'direct':
        return value;

      case 'fromCents':
        if (direction === 'toEncompass') {
          return typeof value === 'object' && value !== null && 'amount' in value
            ? (value as { amount: number }).amount / 100
            : value;
        }
        return value;

      case 'toCents':
        if (direction === 'toPlatform') {
          return typeof value === 'number'
            ? { amount: Math.round(value * 100), currency: 'USD' }
            : value;
        }
        return value;

      case 'roundDecimal':
        if (typeof value === 'number') {
          return Math.round(value * 10000) / 10000;
        }
        return value;

      case 'toDate':
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (typeof value === 'string') {
          return new Date(value);
        }
        return value;

      case 'normalizePhone':
        if (typeof value === 'string') {
          const digits = value.replace(/\D/g, '');
          if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
          }
        }
        return value;

      case 'normalizeAddress':
        return value; // Would apply address standardization

      case 'mapEnum':
        return value; // Would map between enum values

      case 'encrypt':
      case 'decrypt':
        return value; // Would handle encryption

      default:
        return value;
    }
  }
}

// =====================================================
// WEBHOOK HANDLER
// =====================================================

export class EncompassWebhookHandler {
  constructor(
    private readonly adapter: EncompassAdapter,
    private readonly eventBus: EventBus,
    private readonly db: EncompassLinkRepository,
  ) {}

  async handleWebhook(payload: {
    eventType: string;
    loanGuid: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    switch (payload.eventType) {
      case 'loan.milestone.changed':
        await this.handleMilestoneChange(payload);
        break;

      case 'loan.field.changed':
        await this.handleFieldChange(payload);
        break;

      case 'loan.condition.changed':
        await this.handleConditionChange(payload);
        break;

      default:
        // Log unknown event type
        break;
    }
  }

  private async handleMilestoneChange(payload: {
    loanGuid: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    const link = await this.db.findByEncompassGuid(payload.loanGuid);
    if (!link) return;

    const { previousMilestone, newMilestone, changedBy } = payload.data as {
      previousMilestone: string;
      newMilestone: string;
      changedBy: string;
    };

    await this.db.updateLink(link.applicationId, {
      currentMilestone: newMilestone,
      milestoneUpdatedAt: new Date(),
      updatedAt: new Date(),
    });

    await this.eventBus.emit({
      eventType: 'MILESTONE_CHANGED',
      aggregateType: 'application',
      aggregateId: link.applicationId,
      encompassLoanGuid: payload.loanGuid,
      payload: {
        previousMilestone,
        newMilestone,
        changedBy,
        source: 'ENCOMPASS_WEBHOOK',
      },
    });
  }

  private async handleFieldChange(payload: {
    loanGuid: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    // Sync changed fields back to platform if needed
    const link = await this.db.findByEncompassGuid(payload.loanGuid);
    if (!link) return;

    // Would sync specific fields back to platform
  }

  private async handleConditionChange(payload: {
    loanGuid: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    const link = await this.db.findByEncompassGuid(payload.loanGuid);
    if (!link) return;

    await this.eventBus.emit({
      eventType: 'CONDITION_CHANGED',
      aggregateType: 'application',
      aggregateId: link.applicationId,
      encompassLoanGuid: payload.loanGuid,
      payload: payload.data,
    });
  }
}

// =====================================================
// INTERFACES FOR DI
// =====================================================

export interface EncompassClient {
  createLoan(params: {
    loanTemplate?: string;
    fields: Record<string, unknown>;
  }): Promise<EncompassLoan>;

  getLoan(guid: string): Promise<EncompassLoan | null>;

  updateLoan(guid: string, fields: Record<string, unknown>): Promise<void>;

  searchLoans(params: { filter: string }): Promise<EncompassLoan[]>;

  updateMilestone(
    guid: string,
    params: { milestone: string; comments?: string; systemGenerated?: boolean }
  ): Promise<void>;

  addCondition(
    guid: string,
    params: {
      title: string;
      description?: string;
      category: string;
      source?: string;
      priorTo: string;
    }
  ): Promise<EncompassCondition>;

  clearCondition(
    guid: string,
    conditionId: string,
    params: { clearedBy: string; comments?: string }
  ): Promise<void>;
}

export interface EncompassLinkRepository {
  createLink(link: EncompassLink): Promise<void>;
  findByApplicationId(applicationId: string): Promise<EncompassLink | null>;
  findByEncompassGuid(guid: string): Promise<EncompassLink | null>;
  updateLink(applicationId: string, updates: Partial<EncompassLink>): Promise<void>;
}

export interface EventBus {
  emit(event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    encompassLoanGuid?: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
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
