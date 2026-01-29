/**
 * Rules Engine Tests
 *
 * TDD-style tests for the eligibility rules engine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RulesEngine,
  RuleEvaluator,
  DEFAULT_DSCR_ELIGIBILITY_RULES,
  RuleRepository,
  ConditionService,
  AuditLogger,
} from '../../../src/services/rules/RulesEngine';
import {
  RuleVersion,
  RuleEvaluation,
  DecisionResult,
  RuleResult,
  ConditionCategory,
  Condition,
  ConditionStatus,
} from '../../../src/types';

// =====================================================
// RULE EVALUATOR TESTS
// =====================================================

describe('RuleEvaluator', () => {
  let evaluator: RuleEvaluator;

  beforeEach(() => {
    evaluator = new RuleEvaluator();
  });

  describe('Simple Conditions', () => {
    it('should evaluate "eq" operator correctly', () => {
      const condition = {
        type: 'SIMPLE' as const,
        field: 'property.type',
        operator: 'eq',
        value: 'SFR',
      };

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { property: { type: 'SFR' } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { property: { type: 'CONDO' } },
      })).toBe(false);
    });

    it('should evaluate "gte" operator correctly', () => {
      const condition = {
        type: 'SIMPLE' as const,
        field: 'dscr.ratio',
        operator: 'gte',
        value: 1.0,
      };

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { dscr: { ratio: 1.25 } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { dscr: { ratio: 1.0 } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { dscr: { ratio: 0.95 } },
      })).toBe(false);
    });

    it('should evaluate "lte" operator correctly', () => {
      const condition = {
        type: 'SIMPLE' as const,
        field: 'ltv.ratio',
        operator: 'lte',
        value: 0.80,
      };

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { ltv: { ratio: 0.75 } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { ltv: { ratio: 0.85 } },
      })).toBe(false);
    });

    it('should evaluate "in" operator correctly', () => {
      const condition = {
        type: 'SIMPLE' as const,
        field: 'property.type',
        operator: 'in',
        value: ['SFR', 'CONDO', 'TOWNHOUSE'],
      };

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { property: { type: 'SFR' } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { property: { type: 'MIXED_USE' } },
      })).toBe(false);
    });

    it('should evaluate "between" operator correctly', () => {
      const condition = {
        type: 'SIMPLE' as const,
        field: 'credit.score',
        operator: 'between',
        value: [700, 800],
      };

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { credit: { score: 750 } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { credit: { score: 650 } },
      })).toBe(false);
    });

    it('should evaluate "exists" operator correctly', () => {
      const condition = {
        type: 'SIMPLE' as const,
        field: 'borrower.email',
        operator: 'exists',
      };

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { borrower: { email: 'test@example.com' } },
      })).toBe(true);

      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { borrower: {} },
      })).toBe(false);
    });
  });

  describe('Compound Conditions', () => {
    it('should evaluate AND logic correctly', () => {
      const condition = {
        type: 'COMPOUND' as const,
        logic: 'AND' as const,
        conditions: [
          { type: 'SIMPLE' as const, field: 'dscr.ratio', operator: 'gte', value: 1.0 },
          { type: 'SIMPLE' as const, field: 'ltv.ratio', operator: 'lte', value: 0.80 },
        ],
      };

      // Both pass
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { dscr: { ratio: 1.25 }, ltv: { ratio: 0.75 } },
      })).toBe(true);

      // First fails
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { dscr: { ratio: 0.90 }, ltv: { ratio: 0.75 } },
      })).toBe(false);

      // Second fails
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { dscr: { ratio: 1.25 }, ltv: { ratio: 0.85 } },
      })).toBe(false);
    });

    it('should evaluate OR logic correctly', () => {
      const condition = {
        type: 'COMPOUND' as const,
        logic: 'OR' as const,
        conditions: [
          { type: 'SIMPLE' as const, field: 'borrower.type', operator: 'eq', value: 'INDIVIDUAL' },
          { type: 'SIMPLE' as const, field: 'borrower.entityDocsReceived', operator: 'eq', value: true },
        ],
      };

      // First passes
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { borrower: { type: 'INDIVIDUAL' } },
      })).toBe(true);

      // Second passes
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { borrower: { type: 'ENTITY', entityDocsReceived: true } },
      })).toBe(true);

      // Neither passes
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { borrower: { type: 'ENTITY', entityDocsReceived: false } },
      })).toBe(false);
    });

    it('should handle nested compound conditions', () => {
      const condition = {
        type: 'COMPOUND' as const,
        logic: 'OR' as const,
        conditions: [
          { type: 'SIMPLE' as const, field: 'loan.purpose', operator: 'ne', value: 'CASH_OUT_REFI' },
          {
            type: 'COMPOUND' as const,
            logic: 'AND' as const,
            conditions: [
              { type: 'SIMPLE' as const, field: 'loan.cashOutAmount', operator: 'lte', value: 500000 },
              { type: 'SIMPLE' as const, field: 'ltv.ratio', operator: 'lte', value: 0.75 },
            ],
          },
        ],
      };

      // Not cash-out - passes first branch
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: { loan: { purpose: 'RATE_TERM_REFI' } },
      })).toBe(true);

      // Cash-out within limits - passes second branch
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: {
          loan: { purpose: 'CASH_OUT_REFI', cashOutAmount: 400000 },
          ltv: { ratio: 0.70 },
        },
      })).toBe(true);

      // Cash-out exceeds limits - fails both branches
      expect(evaluator.evaluateCondition(condition, {
        applicationId: 'test',
        data: {
          loan: { purpose: 'CASH_OUT_REFI', cashOutAmount: 600000 },
          ltv: { ratio: 0.80 },
        },
      })).toBe(false);
    });
  });
});

// =====================================================
// RULES ENGINE TESTS
// =====================================================

describe('RulesEngine', () => {
  let engine: RulesEngine;
  let mockRuleRepository: RuleRepository;
  let mockConditionService: ConditionService;
  let mockAuditLog: AuditLogger;

  beforeEach(() => {
    mockRuleRepository = {
      getActiveRuleVersion: vi.fn(),
      saveEvaluation: vi.fn(),
    };

    mockConditionService = {
      createCondition: vi.fn().mockResolvedValue({
        id: 'cond-001',
        conditionCode: 'TEST-001',
        status: ConditionStatus.OPEN,
      } as Condition),
    };

    mockAuditLog = {
      log: vi.fn(),
    };

    engine = new RulesEngine(mockRuleRepository, mockConditionService, mockAuditLog);
  });

  describe('Contract: Eligibility Evaluation', () => {
    it('should return APPROVED when all rules pass', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: DEFAULT_DSCR_ELIGIBILITY_RULES.slice(0, 3), // First 3 rules
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 1.30 },
          ltv: { ratio: 0.70 },
          credit: { score: 740 },
          property: { type: 'SFR', occupancy: 'INVESTMENT' },
          loan: { amount: 400000, purpose: 'RATE_TERM_REFI' },
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(result.overallResult).toBe(DecisionResult.APPROVED);
      expect(result.metrics.rulesFailed).toBe(0);
    });

    it('should return DENIED when blocking rule fails', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: [DEFAULT_DSCR_ELIGIBILITY_RULES[0]], // DSCR_MIN rule
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 0.85 }, // Below 1.0 minimum
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(result.overallResult).toBe(DecisionResult.DENIED);
      expect(result.metrics.rulesFailed).toBeGreaterThan(0);
    });

    it('should return EXCEPTION when non-blocking rule fails', async () => {
      const warningRule = {
        ...DEFAULT_DSCR_ELIGIBILITY_RULES.find((r) => r.id === 'RESERVES_MIN')!,
        severity: 'WARNING' as const,
      };

      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: [warningRule],
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          borrower: { reservesMonths: 3 }, // Below 6 months
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      // Non-blocking failure should result in EXCEPTION (needs manual review)
      expect([DecisionResult.EXCEPTION, DecisionResult.MANUAL_REVIEW]).toContain(
        result.overallResult
      );
    });
  });

  describe('Contract: Condition Generation', () => {
    it('should create conditions when rules fail with createCondition', async () => {
      const ruleWithCondition = DEFAULT_DSCR_ELIGIBILITY_RULES.find(
        (r) => r.id === 'DSCR_MIN'
      )!;

      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: [ruleWithCondition],
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 0.90 }, // Below 1.0
        },
      };

      await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(mockConditionService.createCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'app-001',
          conditionCode: 'DSCR-010',
          category: ConditionCategory.PTD,
        })
      );
    });
  });

  describe('Contract: Evaluation Metrics', () => {
    it('should track evaluation duration', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: DEFAULT_DSCR_ELIGIBILITY_RULES,
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 1.30 },
          ltv: { ratio: 0.70 },
          credit: { score: 740 },
          property: { type: 'SFR', occupancy: 'INVESTMENT' },
          loan: { amount: 400000, purpose: 'RATE_TERM_REFI' },
          borrower: { type: 'INDIVIDUAL', reservesMonths: 8 },
          documents: { rentRollReceived: true },
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.rulesEvaluated).toBeGreaterThan(0);
    });

    it('should correctly count pass/fail/warn/skip', async () => {
      const rules = [
        { ...DEFAULT_DSCR_ELIGIBILITY_RULES[0], id: 'r1' }, // DSCR - will pass
        { ...DEFAULT_DSCR_ELIGIBILITY_RULES[1], id: 'r2' }, // LTV - will pass
        { ...DEFAULT_DSCR_ELIGIBILITY_RULES[2], id: 'r3' }, // Credit - will fail
        { ...DEFAULT_DSCR_ELIGIBILITY_RULES[2], id: 'r4', isActive: false }, // Inactive - will skip
      ];

      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules,
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 1.30 },
          ltv: { ratio: 0.70 },
          credit: { score: 620 }, // Below 660 minimum
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(result.metrics.rulesPassed).toBe(2);
      expect(result.metrics.rulesFailed).toBe(1);
      expect(result.metrics.rulesSkipped).toBe(1);
    });
  });

  describe('Contract: Explainability', () => {
    it('should capture input values for each rule', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: [DEFAULT_DSCR_ELIGIBILITY_RULES[0]], // DSCR_MIN
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 1.25 },
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      const dscrResult = result.ruleResults.find((r) => r.ruleId === 'DSCR_MIN');
      expect(dscrResult).toBeDefined();
      expect(dscrResult?.inputValues['dscr.ratio']).toBe(1.25);
      expect(dscrResult?.threshold).toBe(1.0);
      expect(dscrResult?.actualValue).toBe(1.25);
    });

    it('should generate human-readable explanation', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: DEFAULT_DSCR_ELIGIBILITY_RULES.slice(0, 3),
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: {
          dscr: { ratio: 1.25 },
          ltv: { ratio: 0.70 },
          credit: { score: 740 },
        },
      };

      const result = await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      const explanation = engine.generateExplanation(result);

      expect(explanation).toContain('Decision:');
      expect(explanation).toContain('Rule Results:');
      expect(explanation).toContain('DSCR');
    });
  });

  describe('Contract: Audit Trail', () => {
    it('should persist evaluation results', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: [DEFAULT_DSCR_ELIGIBILITY_RULES[0]],
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: { dscr: { ratio: 1.25 } },
      };

      await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(mockRuleRepository.saveEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'app-001',
          ruleVersionId: 'rv-001',
          evaluationType: 'ELIGIBILITY',
        })
      );
    });

    it('should log to audit service', async () => {
      const ruleVersion: RuleVersion = {
        id: 'rv-001',
        ruleSetName: 'DSCR_ELIGIBILITY',
        version: '1.0.0',
        rules: [DEFAULT_DSCR_ELIGIBILITY_RULES[0]],
        effectiveFrom: new Date(),
        isActive: true,
        createdAt: new Date(),
      };

      (mockRuleRepository.getActiveRuleVersion as any).mockResolvedValue(ruleVersion);

      const context = {
        applicationId: 'app-001',
        data: { dscr: { ratio: 1.25 } },
      };

      await engine.evaluate('DSCR_ELIGIBILITY', context, {
        evaluationType: 'ELIGIBILITY',
      });

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RULE_EVALUATION',
          resourceType: 'application',
          resourceId: 'app-001',
          action: 'EVALUATE',
        })
      );
    });
  });
});

// =====================================================
// DEFAULT RULES TESTS
// =====================================================

describe('Default DSCR Eligibility Rules', () => {
  it('should have all required rules defined', () => {
    const requiredRuleIds = [
      'DSCR_MIN',
      'LTV_MAX',
      'CREDIT_MIN',
      'PROPERTY_TYPE_ELIGIBLE',
      'INVESTMENT_ONLY',
      'LOAN_AMOUNT_MIN',
      'LOAN_AMOUNT_MAX',
    ];

    for (const ruleId of requiredRuleIds) {
      const rule = DEFAULT_DSCR_ELIGIBILITY_RULES.find((r) => r.id === ruleId);
      expect(rule, `Rule ${ruleId} should be defined`).toBeDefined();
    }
  });

  it('should have blocking severity for critical rules', () => {
    const criticalRules = ['DSCR_MIN', 'LTV_MAX', 'CREDIT_MIN'];

    for (const ruleId of criticalRules) {
      const rule = DEFAULT_DSCR_ELIGIBILITY_RULES.find((r) => r.id === ruleId);
      expect(rule?.severity, `Rule ${ruleId} should be BLOCKING`).toBe('BLOCKING');
    }
  });

  it('should have condition creation for rules that need documentation', () => {
    const rulesWithConditions = ['RESERVES_MIN', 'ENTITY_DOCS_REQUIRED', 'RENT_ROLL_REQUIRED'];

    for (const ruleId of rulesWithConditions) {
      const rule = DEFAULT_DSCR_ELIGIBILITY_RULES.find((r) => r.id === ruleId);
      expect(
        rule?.onFail.createCondition,
        `Rule ${ruleId} should create condition on fail`
      ).toBeDefined();
    }
  });
});
