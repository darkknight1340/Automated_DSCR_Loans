/**
 * Rules Engine
 *
 * Evaluates eligibility rules, generates conditions, and provides
 * explainable decisions for DSCR loans.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Rule,
  RuleVersion,
  RuleCondition,
  RuleOutcome,
  RuleEvaluation,
  RuleEvaluationResult,
  DecisionResult,
  RuleResult,
  ConditionCategory,
  Condition,
  ConditionStatus,
} from '../../types';

// =====================================================
// TYPES
// =====================================================

export interface RuleContext {
  applicationId: string;
  data: Record<string, unknown>;
}

export interface EvaluationOptions {
  evaluationType: 'ELIGIBILITY' | 'PRICING' | 'CONDITIONS';
  triggerEvent?: string;
  stopOnFirstFailure?: boolean;
}

// =====================================================
// RULE EVALUATOR
// =====================================================

export class RuleEvaluator {
  private readonly operators: Record<
    string,
    (actual: unknown, expected: unknown) => boolean
  > = {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    gt: (a, b) => (a as number) > (b as number),
    gte: (a, b) => (a as number) >= (b as number),
    lt: (a, b) => (a as number) < (b as number),
    lte: (a, b) => (a as number) <= (b as number),
    in: (a, b) => (b as unknown[]).includes(a),
    not_in: (a, b) => !(b as unknown[]).includes(a),
    between: (a, b) => {
      const [min, max] = b as [number, number];
      return (a as number) >= min && (a as number) <= max;
    },
    contains: (a, b) => String(a).includes(String(b)),
    not_contains: (a, b) => !String(a).includes(String(b)),
    exists: (a) => a !== undefined && a !== null,
    not_exists: (a) => a === undefined || a === null,
    regex: (a, b) => new RegExp(b as string).test(String(a)),
  };

  /**
   * Evaluate a single condition
   */
  evaluateCondition(condition: RuleCondition, context: RuleContext): boolean {
    switch (condition.type) {
      case 'SIMPLE':
        return this.evaluateSimpleCondition(condition, context);
      case 'COMPOUND':
        return this.evaluateCompoundCondition(condition, context);
      case 'CUSTOM':
        return this.evaluateCustomCondition(condition, context);
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }

  private evaluateSimpleCondition(
    condition: RuleCondition,
    context: RuleContext
  ): boolean {
    const { field, operator, value } = condition;

    if (!field || !operator) {
      throw new Error('Simple condition requires field and operator');
    }

    const actualValue = this.getFieldValue(context.data, field);
    const operatorFn = this.operators[operator];

    if (!operatorFn) {
      throw new Error(`Unknown operator: ${operator}`);
    }

    return operatorFn(actualValue, value);
  }

  private evaluateCompoundCondition(
    condition: RuleCondition,
    context: RuleContext
  ): boolean {
    const { logic, conditions } = condition;

    if (!conditions || conditions.length === 0) {
      return true;
    }

    if (logic === 'AND') {
      return conditions.every((c) => this.evaluateCondition(c, context));
    } else if (logic === 'OR') {
      return conditions.some((c) => this.evaluateCondition(c, context));
    }

    throw new Error(`Unknown logic operator: ${logic}`);
  }

  private evaluateCustomCondition(
    condition: RuleCondition,
    context: RuleContext
  ): boolean {
    // Custom functions would be registered and called here
    // For now, throw an error
    throw new Error(
      `Custom condition function not implemented: ${condition.customFunction}`
    );
  }

  private getFieldValue(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// =====================================================
// RULES ENGINE
// =====================================================

export class RulesEngine {
  private readonly evaluator: RuleEvaluator;

  constructor(
    private readonly ruleRepository: RuleRepository,
    private readonly conditionService: ConditionService,
    private readonly auditLog: AuditLogger,
  ) {
    this.evaluator = new RuleEvaluator();
  }

  /**
   * Evaluate all active rules for a given context
   */
  async evaluate(
    ruleSetName: string,
    context: RuleContext,
    options: EvaluationOptions
  ): Promise<RuleEvaluation> {
    const startTime = Date.now();

    // Get active rule version
    const ruleVersion = await this.ruleRepository.getActiveRuleVersion(ruleSetName);
    if (!ruleVersion) {
      throw new Error(`No active rule version found for: ${ruleSetName}`);
    }

    const results: RuleEvaluationResult[] = [];
    const conditionsToCreate: Array<{
      code: string;
      category: ConditionCategory;
      title: string;
      description: string;
      ruleId: string;
    }> = [];

    let hasBlockingFailure = false;

    // Evaluate each rule
    for (const rule of ruleVersion.rules) {
      if (!rule.isActive) {
        results.push(this.createSkippedResult(rule, 'Rule is inactive'));
        continue;
      }

      // Stop early if requested and we have a blocking failure
      if (options.stopOnFirstFailure && hasBlockingFailure) {
        results.push(this.createSkippedResult(rule, 'Previous blocking failure'));
        continue;
      }

      try {
        const result = this.evaluateRule(rule, context);
        results.push(result);

        // Track conditions to create
        if (result.result === RuleResult.FAIL && rule.onFail.createCondition) {
          conditionsToCreate.push({
            ...rule.onFail.createCondition,
            ruleId: rule.id,
          });
        }

        // Check for blocking failure
        if (result.result === RuleResult.FAIL && rule.severity === 'BLOCKING') {
          hasBlockingFailure = true;
        }
      } catch (error) {
        results.push(
          this.createErrorResult(rule, error instanceof Error ? error.message : 'Unknown error')
        );
      }
    }

    // Determine overall result
    const overallResult = this.determineOverallResult(results, ruleVersion.rules);

    // Create conditions
    const createdConditions: string[] = [];
    for (const conditionDef of conditionsToCreate) {
      const condition = await this.conditionService.createCondition({
        applicationId: context.applicationId,
        conditionCode: conditionDef.code,
        category: conditionDef.category,
        title: conditionDef.title,
        description: conditionDef.description,
        source: 'SYSTEM',
        ruleId: conditionDef.ruleId,
      });
      createdConditions.push(condition.id);

      // Update result with condition ID
      const resultForRule = results.find((r) => r.ruleId === conditionDef.ruleId);
      if (resultForRule) {
        resultForRule.conditionCreated = condition.id;
      }
    }

    const duration = Date.now() - startTime;

    const evaluation: RuleEvaluation = {
      id: uuidv4(),
      applicationId: context.applicationId,
      ruleVersionId: ruleVersion.id,
      evaluationType: options.evaluationType,
      triggerEvent: options.triggerEvent,
      inputSnapshot: context.data,
      overallResult,
      ruleResults: results,
      metrics: {
        rulesEvaluated: results.filter((r) => r.result !== RuleResult.SKIP).length,
        rulesPassed: results.filter((r) => r.result === RuleResult.PASS).length,
        rulesFailed: results.filter((r) => r.result === RuleResult.FAIL).length,
        rulesWarned: results.filter((r) => r.result === RuleResult.WARN).length,
        rulesSkipped: results.filter((r) => r.result === RuleResult.SKIP).length,
        durationMs: duration,
      },
      evaluatedAt: new Date(),
      syncedToEncompass: false,
    };

    // Save evaluation
    await this.ruleRepository.saveEvaluation(evaluation);

    // Audit log
    await this.auditLog.log({
      eventType: 'RULE_EVALUATION',
      resourceType: 'application',
      resourceId: context.applicationId,
      action: 'EVALUATE',
      newState: {
        evaluationId: evaluation.id,
        overallResult,
        metrics: evaluation.metrics,
        conditionsCreated: createdConditions,
      },
    });

    return evaluation;
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(rule: Rule, context: RuleContext): RuleEvaluationResult {
    const passed = this.evaluator.evaluateCondition(rule.condition, context);

    const outcome = passed ? rule.onPass : rule.onFail;
    const inputValues = this.extractInputValues(rule.condition, context);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      result: outcome.result,
      inputValues,
      threshold: this.extractThreshold(rule.condition),
      actualValue: inputValues[rule.condition.field ?? ''],
      message: outcome.message,
    };
  }

  private createSkippedResult(rule: Rule, reason: string): RuleEvaluationResult {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      result: RuleResult.SKIP,
      inputValues: {},
      message: reason,
    };
  }

  private createErrorResult(rule: Rule, error: string): RuleEvaluationResult {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      result: RuleResult.FAIL,
      inputValues: {},
      message: `Evaluation error: ${error}`,
    };
  }

  private determineOverallResult(
    results: RuleEvaluationResult[],
    rules: Rule[]
  ): DecisionResult {
    // Check for any blocking failures
    const blockingFailures = results.filter((r, idx) => {
      return r.result === RuleResult.FAIL && rules[idx]?.severity === 'BLOCKING';
    });

    if (blockingFailures.length > 0) {
      return DecisionResult.DENIED;
    }

    // Check for any failures (would need exception)
    const anyFailures = results.some((r) => r.result === RuleResult.FAIL);
    if (anyFailures) {
      return DecisionResult.EXCEPTION;
    }

    // Check for warnings (might need review)
    const anyWarnings = results.some((r) => r.result === RuleResult.WARN);
    if (anyWarnings) {
      return DecisionResult.MANUAL_REVIEW;
    }

    // All passed
    return DecisionResult.APPROVED;
  }

  private extractInputValues(
    condition: RuleCondition,
    context: RuleContext
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    const extractFromCondition = (cond: RuleCondition) => {
      if (cond.field) {
        values[cond.field] = this.getFieldValue(context.data, cond.field);
      }
      if (cond.conditions) {
        for (const subCond of cond.conditions) {
          extractFromCondition(subCond);
        }
      }
    };

    extractFromCondition(condition);
    return values;
  }

  private extractThreshold(condition: RuleCondition): unknown {
    if (condition.type === 'SIMPLE') {
      return condition.value;
    }
    return undefined;
  }

  private getFieldValue(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Generate explanation for a rule evaluation
   */
  generateExplanation(evaluation: RuleEvaluation): string {
    const lines: string[] = [];

    lines.push(`Decision: ${evaluation.overallResult}`);
    lines.push('');
    lines.push('Rule Results:');

    for (const result of evaluation.ruleResults) {
      const icon =
        result.result === RuleResult.PASS
          ? '✓'
          : result.result === RuleResult.FAIL
          ? '✗'
          : result.result === RuleResult.WARN
          ? '⚠'
          : '○';

      lines.push(`  ${icon} ${result.ruleName}: ${result.message}`);

      if (result.threshold !== undefined && result.actualValue !== undefined) {
        lines.push(`    Required: ${result.threshold}, Actual: ${result.actualValue}`);
      }

      if (result.conditionCreated) {
        lines.push(`    → Condition created: ${result.conditionCreated}`);
      }
    }

    lines.push('');
    lines.push(`Evaluated at: ${evaluation.evaluatedAt.toISOString()}`);
    lines.push(`Duration: ${evaluation.metrics.durationMs}ms`);

    return lines.join('\n');
  }
}

// =====================================================
// DEFAULT DSCR ELIGIBILITY RULES
// =====================================================

export const DEFAULT_DSCR_ELIGIBILITY_RULES: Rule[] = [
  // DSCR Minimum
  {
    id: 'DSCR_MIN',
    name: 'Minimum DSCR Requirement',
    description: 'DSCR must be at least 1.0',
    category: 'DSCR',
    condition: {
      type: 'SIMPLE',
      field: 'dscr.ratio',
      operator: 'gte',
      value: 1.0,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'DSCR meets minimum requirement',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'DSCR is below minimum requirement of 1.0',
      createCondition: {
        code: 'DSCR-010',
        category: ConditionCategory.PTD,
        title: 'Low DSCR Exception Approval',
        description: 'DSCR below 1.0 requires senior UW approval',
      },
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Maximum LTV
  {
    id: 'LTV_MAX',
    name: 'Maximum LTV Requirement',
    description: 'LTV cannot exceed 80%',
    category: 'LTV',
    condition: {
      type: 'SIMPLE',
      field: 'ltv.ratio',
      operator: 'lte',
      value: 0.80,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'LTV is within maximum limit',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'LTV exceeds maximum of 80%',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Minimum Credit Score
  {
    id: 'CREDIT_MIN',
    name: 'Minimum Credit Score',
    description: 'Credit score must be at least 660',
    category: 'CREDIT',
    condition: {
      type: 'SIMPLE',
      field: 'credit.score',
      operator: 'gte',
      value: 660,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Credit score meets minimum requirement',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'Credit score is below minimum of 660',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Property Type Eligibility
  {
    id: 'PROPERTY_TYPE_ELIGIBLE',
    name: 'Eligible Property Type',
    description: 'Property type must be eligible for DSCR loans',
    category: 'PROPERTY',
    condition: {
      type: 'SIMPLE',
      field: 'property.type',
      operator: 'in',
      value: ['SFR', 'CONDO', 'TOWNHOUSE', '2_4_UNIT', 'MULTIFAMILY'],
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Property type is eligible',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'Property type is not eligible for DSCR loans',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Investment Property Only
  {
    id: 'INVESTMENT_ONLY',
    name: 'Investment Property Requirement',
    description: 'Property must be investment (not owner-occupied)',
    category: 'PROPERTY',
    condition: {
      type: 'SIMPLE',
      field: 'property.occupancy',
      operator: 'eq',
      value: 'INVESTMENT',
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Property is investment property',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'DSCR loans are only available for investment properties',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Minimum Loan Amount
  {
    id: 'LOAN_AMOUNT_MIN',
    name: 'Minimum Loan Amount',
    description: 'Loan amount must be at least $100,000',
    category: 'LOAN',
    condition: {
      type: 'SIMPLE',
      field: 'loan.amount',
      operator: 'gte',
      value: 100000,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Loan amount meets minimum',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'Loan amount is below minimum of $100,000',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Maximum Loan Amount
  {
    id: 'LOAN_AMOUNT_MAX',
    name: 'Maximum Loan Amount',
    description: 'Loan amount cannot exceed $3,000,000',
    category: 'LOAN',
    condition: {
      type: 'SIMPLE',
      field: 'loan.amount',
      operator: 'lte',
      value: 3000000,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Loan amount is within maximum',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'Loan amount exceeds maximum of $3,000,000',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Cash-out Limit
  {
    id: 'CASH_OUT_MAX',
    name: 'Maximum Cash-Out Amount',
    description: 'Cash-out cannot exceed $500,000 or 75% LTV',
    category: 'LOAN',
    condition: {
      type: 'COMPOUND',
      logic: 'OR',
      conditions: [
        {
          type: 'SIMPLE',
          field: 'loan.purpose',
          operator: 'ne',
          value: 'CASH_OUT_REFI',
        },
        {
          type: 'COMPOUND',
          logic: 'AND',
          conditions: [
            {
              type: 'SIMPLE',
              field: 'loan.cashOutAmount',
              operator: 'lte',
              value: 500000,
            },
            {
              type: 'SIMPLE',
              field: 'ltv.ratio',
              operator: 'lte',
              value: 0.75,
            },
          ],
        },
      ],
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Cash-out is within limits',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'Cash-out exceeds limits (max $500K or 75% LTV)',
    },
    severity: 'BLOCKING',
    isActive: true,
  },

  // Reserve Requirements
  {
    id: 'RESERVES_MIN',
    name: 'Minimum Reserves',
    description: 'Must have at least 6 months of reserves',
    category: 'BORROWER',
    condition: {
      type: 'SIMPLE',
      field: 'borrower.reservesMonths',
      operator: 'gte',
      value: 6,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Reserve requirement met',
    },
    onFail: {
      result: RuleResult.FAIL,
      message: 'Insufficient reserves (minimum 6 months required)',
      createCondition: {
        code: 'DSCR-003',
        category: ConditionCategory.PTD,
        title: 'Verify Reserves',
        description: 'Provide bank statements showing 6 months of reserves',
      },
    },
    severity: 'WARNING',
    isActive: true,
  },

  // Entity Documentation (if entity borrower)
  {
    id: 'ENTITY_DOCS_REQUIRED',
    name: 'Entity Documentation Required',
    description: 'Entity borrowers must provide formation documents',
    category: 'BORROWER',
    condition: {
      type: 'COMPOUND',
      logic: 'OR',
      conditions: [
        {
          type: 'SIMPLE',
          field: 'borrower.type',
          operator: 'eq',
          value: 'INDIVIDUAL',
        },
        {
          type: 'SIMPLE',
          field: 'borrower.entityDocsReceived',
          operator: 'eq',
          value: true,
        },
      ],
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Entity documentation requirement met',
    },
    onFail: {
      result: RuleResult.WARN,
      message: 'Entity documentation required',
      createCondition: {
        code: 'DSCR-002',
        category: ConditionCategory.PTD,
        title: 'Entity Documentation',
        description: 'Provide operating agreement and certificate of good standing',
      },
    },
    severity: 'WARNING',
    isActive: true,
  },

  // Rent Roll Required
  {
    id: 'RENT_ROLL_REQUIRED',
    name: 'Rent Roll Documentation',
    description: 'Rent roll must be provided for income verification',
    category: 'PROPERTY',
    condition: {
      type: 'SIMPLE',
      field: 'documents.rentRollReceived',
      operator: 'eq',
      value: true,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'Rent roll documentation received',
    },
    onFail: {
      result: RuleResult.WARN,
      message: 'Rent roll documentation required',
      createCondition: {
        code: 'DSCR-001',
        category: ConditionCategory.PTD,
        title: 'Rent Roll Documentation',
        description: 'Provide current rent roll showing all unit rents and lease terms',
      },
    },
    severity: 'WARNING',
    isActive: true,
  },

  // Soft DSCR Warning
  {
    id: 'DSCR_PREFERRED',
    name: 'DSCR Below Preferred Level',
    description: 'DSCR below 1.25 may result in rate adjustment',
    category: 'DSCR',
    condition: {
      type: 'SIMPLE',
      field: 'dscr.ratio',
      operator: 'gte',
      value: 1.25,
    },
    onPass: {
      result: RuleResult.PASS,
      message: 'DSCR meets preferred level',
    },
    onFail: {
      result: RuleResult.WARN,
      message: 'DSCR below 1.25 - rate adder may apply',
    },
    severity: 'INFO',
    isActive: true,
  },
];

// =====================================================
// INTERFACES FOR DI
// =====================================================

export interface RuleRepository {
  getActiveRuleVersion(ruleSetName: string): Promise<RuleVersion | null>;
  saveEvaluation(evaluation: RuleEvaluation): Promise<void>;
}

export interface ConditionService {
  createCondition(params: {
    applicationId: string;
    conditionCode: string;
    category: ConditionCategory;
    title: string;
    description: string;
    source: 'SYSTEM' | 'UW' | 'INVESTOR';
    ruleId?: string;
  }): Promise<Condition>;
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
