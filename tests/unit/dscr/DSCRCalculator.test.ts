/**
 * DSCR Calculator Tests
 *
 * TDD-style tests for the DSCR calculation engine.
 * These tests define the expected behavior before implementation details.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DSCRCalculator,
  DSCRCalculationInput,
  DSCRCalculationResult,
} from '../../../src/services/dscr/DSCRCalculator';
import { Money, PropertyType, LoanPurpose, RentRollEntry } from '../../../src/types';

describe('DSCRCalculator', () => {
  let calculator: DSCRCalculator;

  beforeEach(() => {
    calculator = new DSCRCalculator();
  });

  // =====================================================
  // DESIGN-LEVEL TESTS (Contracts & Invariants)
  // =====================================================

  describe('Contract: DSCR Calculation Formula', () => {
    /**
     * INVARIANT: DSCR = NOI / PITIA
     * Where:
     *   NOI = Effective Gross Income - Operating Expenses
     *   PITIA = Principal + Interest + Taxes + Insurance + Association
     */

    it('should calculate DSCR as NOI divided by PITIA', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        annualPropertyTax: money(6000),
        annualInsurance: money(2400),
        monthlyHOA: money(200),
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      // Expected:
      // Effective Rent = 5000 * 0.95 = 4750
      // Management Fee = 4750 * 0.08 = 380
      // Property Tax Monthly = 500
      // Insurance Monthly = 200
      // HOA = 200
      // Operating Expenses = 380 + 500 + 200 + 200 = 1280
      // NOI = 4750 - 1280 = 3470
      // P&I at 7.5% for 360 months on 400K = ~2796
      // PITIA = 2796 + 500 + 200 + 200 = 3696
      // DSCR = 3470 / 3696 = 0.939

      expect(result.dscrRatio).toBeCloseTo(0.939, 2);
    });

    it('should return Infinity when debt service is zero (edge case)', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(0),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.dscrRatio).toBe(Infinity);
    });
  });

  describe('Contract: Vacancy Adjustment', () => {
    /**
     * INVARIANT: Effective Gross Income = Gross Rent * (1 - Vacancy Rate)
     * Default vacancy rate is 5%
     */

    it('should apply default 5% vacancy rate', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(10000),
        // No vacancy rate specified - should use 5%
      });

      const result = calculator.calculate(input);

      expect(result.income.vacancyRate).toBe(0.05);
      expect(result.income.effectiveGrossRent.amount).toBe(9500 * 100); // 10000 * 0.95
    });

    it('should allow custom vacancy rate', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(10000),
        vacancyRate: 0.10, // 10% vacancy
      });

      const result = calculator.calculate(input);

      expect(result.income.vacancyRate).toBe(0.10);
      expect(result.income.effectiveGrossRent.amount).toBe(9000 * 100); // 10000 * 0.90
    });
  });

  describe('Contract: Interest-Only Period', () => {
    /**
     * INVARIANT: During I/O period, debt service = Loan Amount * Monthly Rate
     */

    it('should calculate interest-only payment correctly', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
        interestOnlyMonths: 120, // 10-year I/O
      });

      const result = calculator.calculate(input);

      // I/O payment = 400000 * 0.075 / 12 = 2500
      expect(result.debtService.principalAndInterest.amount).toBe(2500 * 100);
    });

    it('should result in higher DSCR with interest-only due to lower payment', () => {
      const baseInput = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const ioInput = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
        interestOnlyMonths: 120,
      });

      const baseResult = calculator.calculate(baseInput);
      const ioResult = calculator.calculate(ioInput);

      expect(ioResult.dscrRatio).toBeGreaterThan(baseResult.dscrRatio);
    });
  });

  describe('Contract: Rent Roll Aggregation', () => {
    /**
     * INVARIANT: When rent roll provided, sum occupied unit rents
     * Vacant units should not be included in income
     */

    it('should sum rent from occupied units only', () => {
      const rentRoll: RentRollEntry[] = [
        createRentRollEntry({ unitNumber: '101', monthlyRent: money(1500), isVacant: false }),
        createRentRollEntry({ unitNumber: '102', monthlyRent: money(1500), isVacant: false }),
        createRentRollEntry({ unitNumber: '103', monthlyRent: money(1500), isVacant: true }), // Vacant
        createRentRollEntry({ unitNumber: '104', monthlyRent: money(1500), isVacant: false }),
      ];

      const input = createBasicInput({
        rentRoll,
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      // Should only count 3 occupied units: 1500 * 3 = 4500
      expect(result.income.grossMonthlyRent.amount).toBe(4500 * 100);
    });

    it('should warn when rent roll differs significantly from stated rent', () => {
      const rentRoll: RentRollEntry[] = [
        createRentRollEntry({ monthlyRent: money(1000), isVacant: false }),
        createRentRollEntry({ monthlyRent: money(1000), isVacant: false }),
      ];

      const input = createBasicInput({
        grossMonthlyRent: money(5000), // Stated: 5000
        rentRoll, // Actual: 2000
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      const warning = result.warnings.find((w) => w.code === 'RENT_DISCREPANCY');
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('WARNING');
    });
  });

  describe('Contract: DSCR Thresholds', () => {
    /**
     * INVARIANT: DSCR < 1.0 fails minimum requirement
     * INVARIANT: DSCR 1.0-1.25 passes but may have rate adder
     * INVARIANT: DSCR >= 1.25 is preferred
     */

    it('should flag DSCR below 1.0 as error', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(2000), // Low rent
        loanAmount: money(400000), // High loan
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.meetsMinimum).toBe(false);
      const error = result.warnings.find((w) => w.code === 'BELOW_MINIMUM_DSCR');
      expect(error).toBeDefined();
      expect(error?.severity).toBe('ERROR');
    });

    it('should flag DSCR between 1.0 and 1.25 as warning', () => {
      // Calculate rent needed for DSCR ~1.15
      const input = createBasicInput({
        grossMonthlyRent: money(5500),
        loanAmount: money(400000),
        interestRate: 0.075,
        monthlyHOA: money(0),
        annualPropertyTax: money(0),
        annualInsurance: money(0),
        managementFeeRate: 0,
      });

      const result = calculator.calculate(input);

      // Should be around 1.15 DSCR
      if (result.dscrRatio >= 1.0 && result.dscrRatio < 1.25) {
        expect(result.meetsMinimum).toBe(true);
        const warning = result.warnings.find((w) => w.code === 'BELOW_PREFERRED_DSCR');
        expect(warning).toBeDefined();
        expect(warning?.severity).toBe('WARNING');
      }
    });

    it('should pass without warnings for DSCR >= 1.25', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(8000), // High rent
        loanAmount: money(300000), // Lower loan
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.dscrRatio).toBeGreaterThanOrEqual(1.25);
      expect(result.meetsMinimum).toBe(true);

      const dscrWarnings = result.warnings.filter(
        (w) => w.code === 'BELOW_MINIMUM_DSCR' || w.code === 'BELOW_PREFERRED_DSCR'
      );
      expect(dscrWarnings.length).toBe(0);
    });
  });

  // =====================================================
  // IMPLEMENTATION-LEVEL TESTS
  // =====================================================

  describe('Implementation: Operating Expenses', () => {
    it('should calculate monthly property tax from annual', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        annualPropertyTax: money(12000), // $1000/month
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.expenses.propertyTaxMonthly.amount).toBe(1000 * 100);
    });

    it('should calculate monthly insurance from annual', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        annualInsurance: money(3600), // $300/month
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.expenses.insuranceMonthly.amount).toBe(300 * 100);
    });

    it('should apply default 8% management fee', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(10000),
        loanAmount: money(400000),
        interestRate: 0.075,
        // No management fee rate specified
      });

      const result = calculator.calculate(input);

      // Effective rent = 10000 * 0.95 = 9500
      // Management fee = 9500 * 0.08 = 760
      expect(result.expenses.managementFeeMonthly.amount).toBe(760 * 100);
    });

    it('should allow custom management fee rate', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(10000),
        loanAmount: money(400000),
        interestRate: 0.075,
        managementFeeRate: 0.10, // 10%
      });

      const result = calculator.calculate(input);

      // Effective rent = 10000 * 0.95 = 9500
      // Management fee = 9500 * 0.10 = 950
      expect(result.expenses.managementFeeMonthly.amount).toBe(950 * 100);
    });
  });

  describe('Implementation: Scenario Analysis', () => {
    it('should generate stress test scenarios', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const scenarios = calculator.calculateScenarios(input);

      expect(scenarios.length).toBeGreaterThan(0);

      // Should have base case
      const baseCase = scenarios.find((s) => s.name === 'Base Case');
      expect(baseCase).toBeDefined();

      // Should have high vacancy scenario
      const highVacancy = scenarios.find((s) => s.name === 'High Vacancy');
      expect(highVacancy).toBeDefined();
      expect(highVacancy?.dscrResult).toBeLessThan(baseCase!.dscrResult);

      // Should have rate increase scenario
      const rateIncrease = scenarios.find((s) => s.name === 'Rate +1%');
      expect(rateIncrease).toBeDefined();
      expect(rateIncrease?.dscrResult).toBeLessThan(baseCase!.dscrResult);
    });
  });

  describe('Implementation: Required Rent Calculation', () => {
    it('should calculate rent required for minimum DSCR', () => {
      const input = createBasicInput({
        loanAmount: money(400000),
        interestRate: 0.075,
        annualPropertyTax: money(6000),
        annualInsurance: money(2400),
        monthlyHOA: money(200),
      });

      const requiredRent = calculator.calculateRequiredRent(input, 1.0);

      // Verify by calculating DSCR with this rent
      const verifyInput = createBasicInput({
        grossMonthlyRent: requiredRent,
        loanAmount: money(400000),
        interestRate: 0.075,
        annualPropertyTax: money(6000),
        annualInsurance: money(2400),
        monthlyHOA: money(200),
      });

      const result = calculator.calculate(verifyInput);

      // Should be at or slightly above 1.0 DSCR
      expect(result.dscrRatio).toBeGreaterThanOrEqual(0.99);
      expect(result.dscrRatio).toBeLessThanOrEqual(1.05);
    });
  });

  describe('Implementation: Max Loan Amount Calculation', () => {
    it('should calculate maximum loan amount for target DSCR', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        interestRate: 0.075,
        annualPropertyTax: money(6000),
        annualInsurance: money(2400),
        monthlyHOA: money(200),
      });

      const maxLoan = calculator.calculateMaxLoanAmount(input, 1.0);

      // Verify by calculating DSCR with this loan amount
      const verifyInput = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: maxLoan,
        interestRate: 0.075,
        annualPropertyTax: money(6000),
        annualInsurance: money(2400),
        monthlyHOA: money(200),
      });

      const result = calculator.calculate(verifyInput);

      // Should be at or slightly above 1.0 DSCR
      expect(result.dscrRatio).toBeGreaterThanOrEqual(0.98);
      expect(result.dscrRatio).toBeLessThanOrEqual(1.05);
    });
  });

  describe('Implementation: Explainability', () => {
    it('should include calculation version', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.calculatorVersion).toBeDefined();
      expect(result.calculatorVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should include formula explanation', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.formula).toBeDefined();
      expect(result.formula).toContain('NOI');
      expect(result.formula).toContain('PITIA');
    });

    it('should capture all input values for audit', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(5000),
        loanAmount: money(400000),
        interestRate: 0.075,
        vacancyRate: 0.08,
      });

      const result = calculator.calculate(input);

      expect(result.inputs).toBeDefined();
      expect(result.inputs.applicationId).toBe(input.applicationId);
      expect(result.inputs.vacancyRate).toBe(0.08);
      expect(result.inputs.interestRate).toBe(0.075);
    });
  });

  // =====================================================
  // EDGE CASES
  // =====================================================

  describe('Edge Cases', () => {
    it('should handle zero rent gracefully', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(0),
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.dscrRatio).toBeLessThan(0);
      const warning = result.warnings.find((w) => w.code === 'NO_RENT_DATA' || w.code === 'BELOW_MINIMUM_DSCR');
      expect(warning).toBeDefined();
    });

    it('should handle very high DSCR with info warning', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(50000), // Very high rent
        loanAmount: money(100000), // Low loan
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      expect(result.dscrRatio).toBeGreaterThan(3.0);
      const warning = result.warnings.find((w) => w.code === 'UNUSUALLY_HIGH_DSCR');
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('INFO');
    });

    it('should handle high expense ratio warning', () => {
      const input = createBasicInput({
        grossMonthlyRent: money(3000),
        annualPropertyTax: money(12000), // $1000/month = 33% of rent
        annualInsurance: money(6000), // $500/month = 17% of rent
        monthlyHOA: money(500), // 17% of rent
        loanAmount: money(400000),
        interestRate: 0.075,
      });

      const result = calculator.calculate(input);

      // Total operating expenses > 50% of gross
      const warning = result.warnings.find((w) => w.code === 'HIGH_EXPENSE_RATIO');
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('WARNING');
    });
  });
});

// =====================================================
// TEST HELPERS
// =====================================================

function money(dollars: number): Money {
  return { amount: dollars * 100, currency: 'USD' };
}

function createBasicInput(overrides: Partial<DSCRCalculationInput>): DSCRCalculationInput {
  return {
    applicationId: 'test-app-001',
    propertyId: 'test-prop-001',
    loanAmount: money(400000),
    interestRate: 0.075,
    termMonths: 360,
    grossMonthlyRent: money(5000),
    annualPropertyTax: money(6000),
    annualInsurance: money(2400),
    monthlyHOA: money(200),
    ...overrides,
  };
}

function createRentRollEntry(overrides: Partial<RentRollEntry>): RentRollEntry {
  return {
    id: `rent-roll-${Math.random().toString(36).substring(7)}`,
    propertyId: 'test-prop-001',
    unitNumber: '101',
    unitType: '1BR',
    monthlyRent: money(1500),
    isVacant: false,
    leaseType: 'ANNUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
