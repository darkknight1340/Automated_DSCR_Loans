/**
 * Encompass Stub Client
 *
 * A mock implementation of the Encompass API client for development and testing.
 * Implements the same interface as the real client, storing data in-memory or database.
 *
 * To switch to production:
 * 1. Set ENCOMPASS_CLIENT_ID, ENCOMPASS_CLIENT_SECRET, ENCOMPASS_INSTANCE_ID
 * 2. The factory will automatically use the real client
 */

import { v4 as uuidv4 } from 'uuid';
import { applicationRepository, type EncompassLink } from '../../db/repositories/ApplicationRepository.js';

// =============================================================================
// Types (matching the real Encompass API)
// =============================================================================

export interface EncompassLoan {
  guid: string;
  loanNumber?: string;
  folder?: string;
  currentMilestone?: string;
  fields: Record<string, unknown>;
  milestoneHistory?: string[];
}

export interface EncompassCondition {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  priorTo: string;
  source?: string;
  createdAt: Date;
  clearedAt?: Date;
  clearedBy?: string;
}

export interface CreateLoanParams {
  loanTemplate?: string;
  fields: Record<string, unknown>;
}

export interface UpdateMilestoneParams {
  milestone: string;
  comments?: string;
  systemGenerated?: boolean;
}

export interface AddConditionParams {
  title: string;
  description?: string;
  category: string;
  source?: string;
  priorTo: string;
}

export interface ClearConditionParams {
  clearedBy: string;
  comments?: string;
}

export interface EncompassClient {
  createLoan(params: CreateLoanParams): Promise<EncompassLoan>;
  getLoan(guid: string): Promise<EncompassLoan | null>;
  updateLoan(guid: string, fields: Record<string, unknown>): Promise<void>;
  searchLoans(params: { filter: string }): Promise<EncompassLoan[]>;
  updateMilestone(guid: string, params: UpdateMilestoneParams): Promise<void>;
  addCondition(guid: string, params: AddConditionParams): Promise<EncompassCondition>;
  clearCondition(guid: string, conditionId: string, params: ClearConditionParams): Promise<void>;
  getConditions(guid: string): Promise<EncompassCondition[]>;
}

// =============================================================================
// Stub Implementation
// =============================================================================

// In-memory store for stub loans
const stubLoans = new Map<string, EncompassLoan>();
const stubConditions = new Map<string, EncompassCondition[]>();

// Default milestones for DSCR loans
const DSCR_MILESTONES = [
  'Started',
  'Application',
  'Processing',
  'Submitted',
  'Underwriting',
  'Approved',
  'Clear to Close',
  'Closing',
  'Funded',
  'Shipped',
];

export class EncompassStubClient implements EncompassClient {
  private generateLoanNumber(): string {
    const year = new Date().getFullYear();
    const seq = Math.floor(Math.random() * 9000) + 1000;
    return `DSCR-${year}-${seq}`;
  }

  async createLoan(params: CreateLoanParams): Promise<EncompassLoan> {
    const guid = `{${uuidv4().toUpperCase()}}`;
    const loan: EncompassLoan = {
      guid,
      loanNumber: this.generateLoanNumber(),
      folder: 'DSCR Pipeline',
      currentMilestone: 'Started',
      fields: { ...params.fields },
      milestoneHistory: ['Started'],
    };

    stubLoans.set(guid, loan);
    stubConditions.set(guid, []);

    console.log(`[EncompassStub] Created loan ${loan.loanNumber} (${guid})`);
    return loan;
  }

  async getLoan(guid: string): Promise<EncompassLoan | null> {
    return stubLoans.get(guid) || null;
  }

  async updateLoan(guid: string, fields: Record<string, unknown>): Promise<void> {
    const loan = stubLoans.get(guid);
    if (!loan) {
      throw new Error(`Loan not found: ${guid}`);
    }

    loan.fields = { ...loan.fields, ...fields };
    console.log(`[EncompassStub] Updated loan ${guid} with ${Object.keys(fields).length} fields`);
  }

  async searchLoans(params: { filter: string }): Promise<EncompassLoan[]> {
    // Simple filter parsing - supports basic equality checks
    // Example: "CX.PLATFORM_LOAN_ID eq 'abc123'"
    const match = params.filter.match(/(\w+(?:\.\w+)?)\s+eq\s+'([^']+)'/);
    if (!match) {
      return [];
    }

    const [, fieldPath, value] = match;
    const results: EncompassLoan[] = [];

    for (const loan of stubLoans.values()) {
      if (loan.fields[fieldPath] === value) {
        results.push(loan);
      }
    }

    return results;
  }

  async updateMilestone(guid: string, params: UpdateMilestoneParams): Promise<void> {
    const loan = stubLoans.get(guid);
    if (!loan) {
      throw new Error(`Loan not found: ${guid}`);
    }

    const previousMilestone = loan.currentMilestone;
    loan.currentMilestone = params.milestone;
    loan.milestoneHistory = loan.milestoneHistory || [];
    if (!loan.milestoneHistory.includes(params.milestone)) {
      loan.milestoneHistory.push(params.milestone);
    }

    console.log(
      `[EncompassStub] Milestone updated: ${previousMilestone} → ${params.milestone}` +
      (params.comments ? ` (${params.comments})` : '')
    );
  }

  async addCondition(guid: string, params: AddConditionParams): Promise<EncompassCondition> {
    const loan = stubLoans.get(guid);
    if (!loan) {
      throw new Error(`Loan not found: ${guid}`);
    }

    const condition: EncompassCondition = {
      id: uuidv4(),
      title: params.title,
      description: params.description,
      category: params.category,
      status: 'OPEN',
      priorTo: params.priorTo,
      source: params.source || 'SYSTEM',
      createdAt: new Date(),
    };

    const conditions = stubConditions.get(guid) || [];
    conditions.push(condition);
    stubConditions.set(guid, conditions);

    console.log(`[EncompassStub] Added condition "${params.title}" to loan ${guid}`);
    return condition;
  }

  async clearCondition(guid: string, conditionId: string, params: ClearConditionParams): Promise<void> {
    const conditions = stubConditions.get(guid);
    if (!conditions) {
      throw new Error(`Loan not found: ${guid}`);
    }

    const condition = conditions.find(c => c.id === conditionId);
    if (!condition) {
      throw new Error(`Condition not found: ${conditionId}`);
    }

    condition.status = 'CLEARED';
    condition.clearedAt = new Date();
    condition.clearedBy = params.clearedBy;

    console.log(`[EncompassStub] Cleared condition "${condition.title}" by ${params.clearedBy}`);
  }

  async getConditions(guid: string): Promise<EncompassCondition[]> {
    return stubConditions.get(guid) || [];
  }

  // Utility methods for testing/development
  getNextMilestone(currentMilestone: string): string | null {
    const idx = DSCR_MILESTONES.indexOf(currentMilestone);
    if (idx === -1 || idx === DSCR_MILESTONES.length - 1) {
      return null;
    }
    return DSCR_MILESTONES[idx + 1];
  }

  getAllMilestones(): string[] {
    return [...DSCR_MILESTONES];
  }

  // Simulate webhook events
  async simulateMilestoneWebhook(guid: string, newMilestone: string): Promise<{
    eventType: string;
    loanGuid: string;
    data: Record<string, unknown>;
  }> {
    const loan = stubLoans.get(guid);
    if (!loan) {
      throw new Error(`Loan not found: ${guid}`);
    }

    const previousMilestone = loan.currentMilestone;
    await this.updateMilestone(guid, { milestone: newMilestone, systemGenerated: false });

    return {
      eventType: 'loan.milestone.changed',
      loanGuid: guid,
      data: {
        previousMilestone,
        newMilestone,
        changedBy: 'Test User',
        changedAt: new Date().toISOString(),
      },
    };
  }
}

// =============================================================================
// Encompass Integration Service
// =============================================================================

export class EncompassIntegrationService {
  private client: EncompassClient;

  constructor(client?: EncompassClient) {
    // Use stub client by default, can inject real client
    this.client = client || new EncompassStubClient();
  }

  /**
   * Create a loan in Encompass from an application
   */
  async createLoanFromApplication(applicationId: string): Promise<EncompassLink> {
    // Check if link already exists
    const existingLink = await applicationRepository.getEncompassLink(applicationId);
    if (existingLink) {
      console.log(`[Encompass] Application ${applicationId} already linked to ${existingLink.encompassLoanGuid}`);
      return existingLink;
    }

    // Get application data
    const application = await applicationRepository.findById(applicationId);
    if (!application) {
      throw new Error(`Application not found: ${applicationId}`);
    }

    // Map application data to Encompass fields
    const fields: Record<string, unknown> = {
      // Standard Encompass fields
      '4000': application.borrower?.firstName || '',
      '4002': application.borrower?.lastName || '',
      '1240': application.borrower?.email || '',
      '11': application.property?.address || '',
      '12': application.property?.city || '',
      '14': application.property?.state || '',
      '15': application.property?.zip || '',
      '1109': application.loanAmount,
      '19': this.mapLoanPurpose(application.loanPurpose),
      '4': application.loanTermMonths || 360,
      '1821': application.estimatedValue,

      // Custom DSCR fields
      'CX.PLATFORM_LOAN_ID': applicationId,
      'CX.PLATFORM_CREATED_AT': new Date().toISOString(),
    };

    // Create loan in Encompass
    const loan = await this.client.createLoan({
      loanTemplate: 'DSCR_Refinance_v2',
      fields,
    });

    // Create link record
    const link = await applicationRepository.createEncompassLink({
      applicationId,
      encompassLoanGuid: loan.guid,
      encompassLoanNumber: loan.loanNumber,
      encompassFolder: loan.folder,
      currentMilestone: loan.currentMilestone,
      lastSyncToEncompass: new Date(),
      syncStatus: 'SYNCED',
      syncRetryCount: 0,
    });

    console.log(`[Encompass] Created loan ${loan.loanNumber} for application ${applicationId}`);
    return link;
  }

  /**
   * Sync application data to Encompass
   */
  async syncToEncompass(applicationId: string, data: Record<string, unknown>): Promise<void> {
    const link = await applicationRepository.getEncompassLink(applicationId);
    if (!link) {
      throw new Error(`No Encompass link found for application: ${applicationId}`);
    }

    try {
      await this.client.updateLoan(link.encompassLoanGuid, data);

      await applicationRepository.updateEncompassLink(applicationId, {
        lastSyncToEncompass: new Date(),
        syncStatus: 'SYNCED',
        syncRetryCount: 0,
        syncErrorMessage: undefined,
      });
    } catch (error) {
      await applicationRepository.updateEncompassLink(applicationId, {
        syncStatus: 'FAILED',
        syncRetryCount: (link.syncRetryCount || 0) + 1,
        syncErrorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Advance milestone
   */
  async advanceMilestone(applicationId: string, milestone: string, reason?: string): Promise<void> {
    const link = await applicationRepository.getEncompassLink(applicationId);
    if (!link) {
      throw new Error(`No Encompass link found for application: ${applicationId}`);
    }

    await this.client.updateMilestone(link.encompassLoanGuid, {
      milestone,
      comments: reason || 'Milestone advanced via platform',
      systemGenerated: true,
    });

    await applicationRepository.updateEncompassLink(applicationId, {
      currentMilestone: milestone,
    });
  }

  /**
   * Add condition to loan
   */
  async addCondition(applicationId: string, condition: AddConditionParams): Promise<EncompassCondition> {
    const link = await applicationRepository.getEncompassLink(applicationId);
    if (!link) {
      throw new Error(`No Encompass link found for application: ${applicationId}`);
    }

    return this.client.addCondition(link.encompassLoanGuid, condition);
  }

  /**
   * Get loan status from Encompass
   */
  async getLoanStatus(applicationId: string): Promise<{
    milestone: string;
    conditions: EncompassCondition[];
    lastSync: Date | undefined;
  } | null> {
    const link = await applicationRepository.getEncompassLink(applicationId);
    if (!link) {
      return null;
    }

    const loan = await this.client.getLoan(link.encompassLoanGuid);
    if (!loan) {
      return null;
    }

    const conditions = await this.client.getConditions(link.encompassLoanGuid);

    return {
      milestone: loan.currentMilestone || 'Unknown',
      conditions,
      lastSync: link.lastSyncToEncompass,
    };
  }

  private mapLoanPurpose(purpose: string): string {
    const map: Record<string, string> = {
      'PURCHASE': 'Purchase',
      'RATE_TERM_REFI': 'NoCash-Out Refinance',
      'CASH_OUT_REFI': 'Cash-Out Refinance',
    };
    return map[purpose] || purpose;
  }
}

// =============================================================================
// Factory function
// =============================================================================

let _serviceInstance: EncompassIntegrationService | null = null;

export function getEncompassService(): EncompassIntegrationService {
  if (!_serviceInstance) {
    // Check if real Encompass credentials are configured
    const clientId = process.env.ENCOMPASS_CLIENT_ID;
    const clientSecret = process.env.ENCOMPASS_CLIENT_SECRET;
    const instanceId = process.env.ENCOMPASS_INSTANCE_ID;

    if (clientId && clientSecret && instanceId) {
      // TODO: Use real Encompass client when credentials are provided
      // const realClient = new EncompassRealClient(clientId, clientSecret, instanceId);
      // _serviceInstance = new EncompassIntegrationService(realClient);
      console.log('[Encompass] Real credentials found, but using stub client (real client not implemented yet)');
    } else {
      console.log('[Encompass] Using stub client (no credentials configured)');
    }

    _serviceInstance = new EncompassIntegrationService(new EncompassStubClient());
  }

  return _serviceInstance;
}

// Export singleton
export const encompassService = getEncompassService();
