/**
 * End-to-End Happy Path Integration Tests
 *
 * These tests verify the complete DSCR loan lifecycle from lead intake
 * through funding, including Encompass integration points.
 *
 * Test Scenario: Standard SFR refinance
 * - Property: 123 Main Street, Austin, TX
 * - Loan Amount: $324,000
 * - Property Value: $450,000
 * - Monthly Rent: $4,200
 * - Credit Score: 742
 * - Expected DSCR: ~1.27
 * - Expected LTV: 72%
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_CONFIG = {
  baseUrl: process.env.TEST_API_URL ?? 'http://localhost:3000/api/v1',
  encompassGuid: 'test-loan-guid-123',
  timeoutMs: 30000
};

const TEST_DATA = {
  lead: {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: '512-555-1234',
    propertyAddress: {
      street: '123 Main Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701'
    },
    loanAmount: 32400000, // $324,000 in cents
    propertyValue: 45000000, // $450,000 in cents
    monthlyRent: 420000, // $4,200 in cents
    creditScoreRange: '740-759',
    source: 'WEBSITE',
    tcpaConsent: true
  },

  borrower: {
    firstName: 'John',
    lastName: 'Smith',
    ssn: '123-45-6789',
    dateOfBirth: '1985-05-15',
    email: 'john.smith@example.com',
    phone: '512-555-1234',
    citizenship: 'US_CITIZEN',
    investmentPropertyCount: 3,
    yearsOfExperience: 5
  },

  property: {
    address: {
      street: '123 Main Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      county: 'Travis'
    },
    propertyType: 'SFR',
    occupancy: 'INVESTMENT',
    yearBuilt: 2005,
    squareFeet: 2200,
    bedrooms: 4,
    bathrooms: 2.5
  },

  rentRoll: [
    {
      unitNumber: '1',
      monthlyRent: 420000, // $4,200 in cents
      isVacant: false,
      leaseStartDate: '2024-01-01',
      leaseEndDate: '2025-01-01'
    }
  ],

  dscrInput: {
    grossMonthlyRent: 420000,
    vacancyRate: 0.05,
    managementFeeRate: 0.08,
    propertyTaxMonthly: 50000, // $500/mo
    insuranceMonthly: 20000, // $200/mo
    hoaMonthly: 0,
    loanAmount: 32400000,
    interestRate: 7.25,
    loanTermMonths: 360,
    isInterestOnly: false
  },

  credit: {
    pullType: 'HARD',
    bureaus: ['EQUIFAX', 'EXPERIAN', 'TRANSUNION']
  },

  expectedOutcomes: {
    leadScore: { min: 70, max: 90 },
    dscrRatio: { min: 1.20, max: 1.35 },
    ltv: { min: 0.70, max: 0.75 },
    creditScore: 742,
    finalRate: { min: 7.0, max: 7.5 },
    preApprovalResult: 'APPROVED'
  }
};

// ============================================================================
// Mock API Client
// ============================================================================

class DSCRPlatformClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async authenticate(credentials: { username: string; password: string }): Promise<void> {
    // In real implementation, would call auth endpoint
    this.authToken = 'test-token';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    // Mock implementation for testing
    // In real tests, would use fetch or axios
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  // Lead operations
  async createLead(data: typeof TEST_DATA.lead) {
    return this.request<{ id: string; status: string; score: number }>('POST', '/leads', data);
  }

  async getLead(id: string) {
    return this.request<any>('GET', `/leads/${id}`);
  }

  async qualifyLead(id: string) {
    return this.request<{ application: { id: string }; encompassLoanGuid: string }>(
      'POST',
      `/leads/${id}/qualify`
    );
  }

  // Application operations
  async getApplication(id: string) {
    return this.request<any>('GET', `/applications/${id}`);
  }

  async getApplicationSummary(id: string) {
    return this.request<any>('GET', `/applications/${id}/summary`);
  }

  // Credit operations
  async orderCredit(applicationId: string, data: typeof TEST_DATA.credit) {
    return this.request<any>('POST', `/applications/${applicationId}/credit`, data);
  }

  async getCreditReports(applicationId: string) {
    return this.request<any[]>('GET', `/applications/${applicationId}/credit`);
  }

  // Valuation operations
  async orderAVM(applicationId: string) {
    return this.request<any>('POST', `/applications/${applicationId}/avm`);
  }

  async getAVMReports(applicationId: string) {
    return this.request<any[]>('GET', `/applications/${applicationId}/avm`);
  }

  // DSCR operations
  async calculateDSCR(applicationId: string, data: typeof TEST_DATA.dscrInput) {
    return this.request<any>('POST', `/applications/${applicationId}/dscr`, data);
  }

  // Eligibility operations
  async evaluateEligibility(applicationId: string) {
    return this.request<any>('POST', `/applications/${applicationId}/eligibility`);
  }

  // Pricing operations
  async calculatePricing(applicationId: string, lockPeriod?: number) {
    return this.request<any>('POST', `/applications/${applicationId}/pricing`, { lockPeriod });
  }

  async lockRate(applicationId: string, lockPeriod: number) {
    return this.request<any>('POST', `/applications/${applicationId}/pricing/lock`, { lockPeriod });
  }

  // Decision operations
  async generatePreApproval(applicationId: string) {
    return this.request<any>('POST', `/applications/${applicationId}/decisions/pre-approval`);
  }

  async getDecisions(applicationId: string) {
    return this.request<any[]>('GET', `/applications/${applicationId}/decisions`);
  }

  async getDecisionExplanation(decisionId: string) {
    return this.request<any>('GET', `/decisions/${decisionId}/explanation`);
  }

  // Condition operations
  async getConditions(applicationId: string) {
    return this.request<any[]>('GET', `/applications/${applicationId}/conditions`);
  }

  // Workflow operations
  async getWorkflowState(applicationId: string) {
    return this.request<any>('GET', `/applications/${applicationId}/workflow`);
  }

  // Audit operations
  async getAuditTrail(applicationId: string) {
    return this.request<any[]>('GET', `/applications/${applicationId}/audit-trail`);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DSCR Loan Happy Path', () => {
  let client: DSCRPlatformClient;
  let leadId: string;
  let applicationId: string;
  let encompassLoanGuid: string;
  let decisionId: string;

  beforeAll(async () => {
    client = new DSCRPlatformClient(TEST_CONFIG.baseUrl);
    await client.authenticate({ username: 'test', password: 'test' });
  });

  // ==========================================================================
  // Phase 1: Lead Intake & Conversion
  // ==========================================================================

  describe('Phase 1: Lead Intake & Conversion', () => {
    it('should create lead with valid data', async () => {
      const result = await client.createLead(TEST_DATA.lead);

      expect(result.id).toBeDefined();
      expect(result.status).toBe('NEW');

      leadId = result.id;
    });

    it('should score lead within expected range', async () => {
      const lead = await client.getLead(leadId);

      expect(lead.score).toBeGreaterThanOrEqual(TEST_DATA.expectedOutcomes.leadScore.min);
      expect(lead.score).toBeLessThanOrEqual(TEST_DATA.expectedOutcomes.leadScore.max);
    });

    it('should auto-assign lead to LO', async () => {
      const lead = await client.getLead(leadId);

      expect(lead.assignedLoId).toBeDefined();
    });

    it('should qualify lead and create application', async () => {
      const result = await client.qualifyLead(leadId);

      expect(result.application.id).toBeDefined();
      expect(result.encompassLoanGuid).toBeDefined();

      applicationId = result.application.id;
      encompassLoanGuid = result.encompassLoanGuid;
    });

    it('should update lead status to CONVERTED', async () => {
      const lead = await client.getLead(leadId);

      expect(lead.status).toBe('CONVERTED');
    });
  });

  // ==========================================================================
  // Phase 2: Enrichment (Credit, AVM)
  // ==========================================================================

  describe('Phase 2: Data Enrichment', () => {
    it('should order and receive credit report', async () => {
      const orderResult = await client.orderCredit(applicationId, TEST_DATA.credit);

      expect(orderResult.orderId).toBeDefined();
      expect(orderResult.status).toBe('PENDING');

      // Wait for credit (simulated webhook in test)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const reports = await client.getCreditReports(applicationId);
      const latestReport = reports[0];

      expect(latestReport.representativeScore).toBe(TEST_DATA.expectedOutcomes.creditScore);
    });

    it('should order and receive AVM', async () => {
      const avmResult = await client.orderAVM(applicationId);

      expect(avmResult.id).toBeDefined();

      // Wait for AVM (simulated callback in test)
      await new Promise(resolve => setTimeout(resolve, 500));

      const avmReports = await client.getAVMReports(applicationId);
      const latestAVM = avmReports[0];

      expect(latestAVM.estimatedValue).toBe(TEST_DATA.lead.propertyValue);
      expect(latestAVM.confidenceLevel).toBe('HIGH');
    });
  });

  // ==========================================================================
  // Phase 3: DSCR Calculation
  // ==========================================================================

  describe('Phase 3: DSCR Calculation', () => {
    it('should calculate DSCR correctly', async () => {
      const result = await client.calculateDSCR(applicationId, TEST_DATA.dscrInput);

      expect(result.dscrRatio).toBeGreaterThanOrEqual(TEST_DATA.expectedOutcomes.dscrRatio.min);
      expect(result.dscrRatio).toBeLessThanOrEqual(TEST_DATA.expectedOutcomes.dscrRatio.max);
      expect(result.meetsMinimum).toBe(true);
    });

    it('should calculate LTV correctly', async () => {
      const summary = await client.getApplicationSummary(applicationId);

      expect(summary.valuation.ltv).toBeGreaterThanOrEqual(TEST_DATA.expectedOutcomes.ltv.min);
      expect(summary.valuation.ltv).toBeLessThanOrEqual(TEST_DATA.expectedOutcomes.ltv.max);
    });
  });

  // ==========================================================================
  // Phase 4: Eligibility Evaluation
  // ==========================================================================

  describe('Phase 4: Eligibility Evaluation', () => {
    it('should evaluate all eligibility rules', async () => {
      const result = await client.evaluateEligibility(applicationId);

      expect(result.rulesVersion).toBeDefined();
      expect(result.passedRules).toBeGreaterThan(0);
    });

    it('should pass all blocking rules', async () => {
      const result = await client.evaluateEligibility(applicationId);

      expect(result.blockingFailures).toHaveLength(0);
    });

    it('should determine loan is eligible', async () => {
      const result = await client.evaluateEligibility(applicationId);

      expect(result.eligible).toBe(true);
      expect(result.score).toBeGreaterThan(80);
    });
  });

  // ==========================================================================
  // Phase 5: Pricing Calculation
  // ==========================================================================

  describe('Phase 5: Pricing Calculation', () => {
    it('should calculate pricing with correct base rate', async () => {
      const result = await client.calculatePricing(applicationId, 45);

      expect(result.baseRate).toBeDefined();
      expect(result.finalRate).toBeGreaterThanOrEqual(TEST_DATA.expectedOutcomes.finalRate.min);
      expect(result.finalRate).toBeLessThanOrEqual(TEST_DATA.expectedOutcomes.finalRate.max);
    });

    it('should apply correct pricing adjustments', async () => {
      const result = await client.calculatePricing(applicationId, 45);

      // Should have adjustments for cash-out, prepay, lock period
      expect(result.adjustments.length).toBeGreaterThan(0);
    });

    it('should calculate monthly payment', async () => {
      const result = await client.calculatePricing(applicationId, 45);

      expect(result.monthlyPayment).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Phase 6: Pre-Approval Decision
  // ==========================================================================

  describe('Phase 6: Pre-Approval Decision', () => {
    it('should generate pre-approval decision', async () => {
      const decision = await client.generatePreApproval(applicationId);

      expect(decision.id).toBeDefined();
      expect(decision.decisionType).toBe('PRE_APPROVAL');
      expect(decision.result).toBe(TEST_DATA.expectedOutcomes.preApprovalResult);

      decisionId = decision.id;
    });

    it('should include decision rationale', async () => {
      const decisions = await client.getDecisions(applicationId);
      const preApproval = decisions.find(d => d.id === decisionId);

      expect(preApproval.rationale).toBeDefined();
      expect(preApproval.rationale.summary).toBeDefined();
      expect(preApproval.rationale.keyFactors.length).toBeGreaterThan(0);
    });

    it('should generate conditions', async () => {
      const conditions = await client.getConditions(applicationId);

      expect(conditions.length).toBeGreaterThan(0);
      expect(conditions.some(c => c.category === 'PTD')).toBe(true);
    });

    it('should provide decision explanation', async () => {
      const explanation = await client.getDecisionExplanation(decisionId);

      expect(explanation.summary).toBeDefined();
      expect(explanation.narrative).toBeDefined();
      expect(explanation.rulesApplied.length).toBeGreaterThan(0);
    });

    it('should set expiration date', async () => {
      const decisions = await client.getDecisions(applicationId);
      const preApproval = decisions.find(d => d.id === decisionId);

      expect(preApproval.expirationDate).toBeDefined();
      const expiration = new Date(preApproval.expirationDate);
      const now = new Date();
      const daysDiff = Math.floor((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBeGreaterThanOrEqual(25);
      expect(daysDiff).toBeLessThanOrEqual(35);
    });
  });

  // ==========================================================================
  // Phase 7: Workflow State
  // ==========================================================================

  describe('Phase 7: Workflow Validation', () => {
    it('should advance milestone to Pre-Approved', async () => {
      const workflow = await client.getWorkflowState(applicationId);

      expect(workflow.currentMilestone).toBe('PRE_APPROVED');
    });

    it('should generate processing tasks', async () => {
      const workflow = await client.getWorkflowState(applicationId);

      expect(workflow.activeTasks.length).toBeGreaterThan(0);
    });

    it('should track SLA status', async () => {
      const workflow = await client.getWorkflowState(applicationId);

      expect(['ON_TRACK', 'AT_RISK', 'BREACHED']).toContain(workflow.slaStatus);
    });
  });

  // ==========================================================================
  // Phase 8: Audit Trail
  // ==========================================================================

  describe('Phase 8: Audit Trail', () => {
    it('should record all key events', async () => {
      const auditTrail = await client.getAuditTrail(applicationId);

      // Verify key events are recorded
      const eventTypes = auditTrail.map(e => e.eventType);

      expect(eventTypes).toContain('LEAD_CREATED');
      expect(eventTypes).toContain('LEAD_CONVERTED');
      expect(eventTypes).toContain('APPLICATION_CREATED');
      expect(eventTypes).toContain('CREDIT_RECEIVED');
      expect(eventTypes).toContain('AVM_RECEIVED');
      expect(eventTypes).toContain('DSCR_CALCULATED');
      expect(eventTypes).toContain('ELIGIBILITY_EVALUATED');
      expect(eventTypes).toContain('PRICING_CALCULATED');
      expect(eventTypes).toContain('PREAPPROVAL_GENERATED');
    });

    it('should include actor information', async () => {
      const auditTrail = await client.getAuditTrail(applicationId);

      auditTrail.forEach(event => {
        expect(event.actor).toBeDefined();
        expect(event.actor.type).toBeDefined();
      });
    });

    it('should maintain chronological order', async () => {
      const auditTrail = await client.getAuditTrail(applicationId);

      for (let i = 1; i < auditTrail.length; i++) {
        const prev = new Date(auditTrail[i - 1].timestamp);
        const curr = new Date(auditTrail[i].timestamp);
        expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }
    });
  });

  // ==========================================================================
  // Phase 9: Encompass Integration
  // ==========================================================================

  describe('Phase 9: Encompass Integration', () => {
    it('should sync data to Encompass', async () => {
      const summary = await client.getApplicationSummary(applicationId);

      expect(summary.application.encompassLoanGuid).toBe(encompassLoanGuid);
    });

    it('should update Encompass milestone', async () => {
      const auditTrail = await client.getAuditTrail(applicationId);
      const milestoneEvents = auditTrail.filter(
        e => e.eventType === 'ENCOMPASS_MILESTONE_UPDATED'
      );

      expect(milestoneEvents.length).toBeGreaterThan(0);
    });

    it('should record Encompass sync events', async () => {
      const auditTrail = await client.getAuditTrail(applicationId);
      const syncEvents = auditTrail.filter(
        e => e.category === 'ENCOMPASS_SYNC'
      );

      expect(syncEvents.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Negative Test Cases
// ============================================================================

describe('DSCR Loan Edge Cases', () => {
  let client: DSCRPlatformClient;

  beforeAll(async () => {
    client = new DSCRPlatformClient(TEST_CONFIG.baseUrl);
    await client.authenticate({ username: 'test', password: 'test' });
  });

  describe('Low DSCR Scenario', () => {
    it('should fail eligibility when DSCR < 1.0', async () => {
      // Create lead with low rent that would produce DSCR < 1.0
      const lowRentLead = {
        ...TEST_DATA.lead,
        monthlyRent: 250000, // $2,500/mo - too low
        email: 'lowdscr@example.com'
      };

      const lead = await client.createLead(lowRentLead);
      const conversion = await client.qualifyLead(lead.id);

      const eligibility = await client.evaluateEligibility(conversion.application.id);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.blockingFailures.some(
        (f: any) => f.ruleId === 'DSCR_MIN'
      )).toBe(true);
    });
  });

  describe('High LTV Scenario', () => {
    it('should fail eligibility when LTV > 80%', async () => {
      // Create lead with high loan amount relative to value
      const highLtvLead = {
        ...TEST_DATA.lead,
        loanAmount: 40000000, // $400,000 on $450,000 = 88.9% LTV
        email: 'highltv@example.com'
      };

      const lead = await client.createLead(highLtvLead);
      const conversion = await client.qualifyLead(lead.id);

      const eligibility = await client.evaluateEligibility(conversion.application.id);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.blockingFailures.some(
        (f: any) => f.ruleId === 'LTV_MAX'
      )).toBe(true);
    });
  });

  describe('Ineligible State Scenario', () => {
    it('should fail eligibility for ineligible state', async () => {
      const nyLead = {
        ...TEST_DATA.lead,
        propertyAddress: {
          street: '123 Broadway',
          city: 'New York',
          state: 'NY',
          zipCode: '10001'
        },
        email: 'ny@example.com'
      };

      const lead = await client.createLead(nyLead);
      const conversion = await client.qualifyLead(lead.id);

      const eligibility = await client.evaluateEligibility(conversion.application.id);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.blockingFailures.some(
        (f: any) => f.ruleId === 'STATE_ELIGIBLE'
      )).toBe(true);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('DSCR Platform Performance', () => {
  let client: DSCRPlatformClient;

  beforeAll(async () => {
    client = new DSCRPlatformClient(TEST_CONFIG.baseUrl);
    await client.authenticate({ username: 'test', password: 'test' });
  });

  it('should complete pre-approval within SLA (< 5 seconds)', async () => {
    const startTime = Date.now();

    const lead = await client.createLead({
      ...TEST_DATA.lead,
      email: `perf-${Date.now()}@example.com`
    });

    await client.qualifyLead(lead.id);

    // Simulate enrichment (normally async)
    // In production, these would be triggered by events

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Should complete core operations in under 5 seconds
    expect(durationMs).toBeLessThan(5000);
  });

  it('should handle concurrent lead submissions', async () => {
    const concurrentLeads = 10;
    const leadPromises = [];

    for (let i = 0; i < concurrentLeads; i++) {
      leadPromises.push(
        client.createLead({
          ...TEST_DATA.lead,
          email: `concurrent-${i}-${Date.now()}@example.com`
        })
      );
    }

    const results = await Promise.all(leadPromises);

    expect(results.every(r => r.id)).toBe(true);
    expect(new Set(results.map(r => r.id)).size).toBe(concurrentLeads);
  });
});
