/**
 * DSCR (Debt Service Coverage Ratio) Calculator
 *
 * Calculates DSCR for investment properties based on rental income
 * and debt service (PITIA - Principal, Interest, Taxes, Insurance, Association dues).
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Money,
  DSCRCalculation,
  Property,
  RentRollEntry,
  Application,
} from '../../types';

// =====================================================
// TYPES
// =====================================================

export interface DSCRCalculationInput {
  applicationId: string;
  propertyId: string;

  // Rental income
  grossMonthlyRent?: Money;
  rentRoll?: RentRollEntry[];
  vacancyRate?: number; // Default 5%
  otherIncome?: Money;

  // Expenses
  annualPropertyTax?: Money;
  annualInsurance?: Money;
  monthlyHOA?: Money;
  managementFeeRate?: number; // As decimal (0.08 = 8%)
  monthlyFloodInsurance?: Money;
  otherMonthlyExpenses?: Money;

  // Loan terms (for debt service)
  loanAmount: Money;
  interestRate: number; // Annual rate as decimal (0.075 = 7.5%)
  termMonths: number;
  interestOnlyMonths?: number;

  // STR specific
  isShortTermRental?: boolean;
  strAnnualizedIncome?: Money;
}

export interface DSCRCalculationResult extends DSCRCalculation {
  warnings: DSCRWarning[];
  meetsMinimum: boolean;
  minimumRequired: number;
}

export interface DSCRWarning {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export interface DSCRScenario {
  name: string;
  description: string;
  adjustments: {
    vacancyRate?: number;
    interestRate?: number;
    rentAdjustment?: number; // Percentage adjustment
  };
  dscrResult: number;
}

// =====================================================
// CALCULATOR
// =====================================================

export class DSCRCalculator {
  private readonly CALCULATOR_VERSION = '2.0.0';
  private readonly DEFAULT_VACANCY_RATE = 0.05;
  private readonly DEFAULT_MANAGEMENT_FEE_RATE = 0.08;
  private readonly MINIMUM_DSCR = 1.0;
  private readonly PREFERRED_DSCR = 1.25;

  /**
   * Calculate DSCR for an application
   */
  calculate(input: DSCRCalculationInput): DSCRCalculationResult {
    const warnings: DSCRWarning[] = [];

    // 1. Calculate Gross Rent
    const grossMonthlyRent = this.calculateGrossRent(input, warnings);

    // 2. Apply vacancy rate
    const vacancyRate = input.vacancyRate ?? this.DEFAULT_VACANCY_RATE;
    const effectiveGrossRent = this.applyVacancy(grossMonthlyRent, vacancyRate);

    // 3. Add other income
    const totalGrossIncome = this.addMoney(
      effectiveGrossRent,
      input.otherIncome ?? { amount: 0, currency: 'USD' }
    );

    // 4. Calculate expenses
    const expenses = this.calculateExpenses(input, totalGrossIncome, warnings);

    // 5. Calculate NOI
    const noiMonthly = this.subtractMoney(totalGrossIncome, expenses.totalExpenses);
    const noiAnnual = this.multiplyMoney(noiMonthly, 12);

    // 6. Calculate debt service
    const debtService = this.calculateDebtService(input);

    // 7. Calculate DSCR
    const dscrRatio = this.calculateRatio(noiMonthly, debtService.totalPITIA);

    // Validate and add warnings
    this.validateResult(dscrRatio, warnings);

    const result: DSCRCalculationResult = {
      id: uuidv4(),
      applicationId: input.applicationId,
      propertyId: input.propertyId,

      income: {
        grossMonthlyRent,
        vacancyRate,
        effectiveGrossRent,
        otherIncome: input.otherIncome,
      },

      expenses: {
        propertyTaxMonthly: expenses.propertyTaxMonthly,
        insuranceMonthly: expenses.insuranceMonthly,
        hoaMonthly: expenses.hoaMonthly,
        managementFeeMonthly: expenses.managementFeeMonthly,
        floodInsuranceMonthly: expenses.floodInsuranceMonthly,
        otherExpenses: expenses.otherExpenses,
        totalExpenses: expenses.totalExpenses,
      },

      noi: {
        monthly: noiMonthly,
        annual: noiAnnual,
      },

      debtService: {
        principalAndInterest: debtService.principalAndInterest,
        totalPITIA: debtService.totalPITIA,
      },

      dscrRatio,

      calculatedAt: new Date(),
      calculatorVersion: this.CALCULATOR_VERSION,
      inputs: this.sanitizeInputs(input),
      formula: this.getFormula(),

      warnings,
      meetsMinimum: dscrRatio >= this.MINIMUM_DSCR,
      minimumRequired: this.MINIMUM_DSCR,
    };

    return result;
  }

  /**
   * Calculate multiple scenarios for comparison
   */
  calculateScenarios(input: DSCRCalculationInput): DSCRScenario[] {
    const scenarios: DSCRScenario[] = [];

    // Base case
    const baseResult = this.calculate(input);
    scenarios.push({
      name: 'Base Case',
      description: 'Current inputs',
      adjustments: {},
      dscrResult: baseResult.dscrRatio,
    });

    // Stress test: Higher vacancy
    const highVacancy = this.calculate({
      ...input,
      vacancyRate: 0.10, // 10% vacancy
    });
    scenarios.push({
      name: 'High Vacancy',
      description: '10% vacancy rate',
      adjustments: { vacancyRate: 0.10 },
      dscrResult: highVacancy.dscrRatio,
    });

    // Stress test: Rate increase
    const rateIncrease = this.calculate({
      ...input,
      interestRate: input.interestRate + 0.01, // +1%
    });
    scenarios.push({
      name: 'Rate +1%',
      description: 'Interest rate increase of 1%',
      adjustments: { interestRate: input.interestRate + 0.01 },
      dscrResult: rateIncrease.dscrRatio,
    });

    // Stress test: Rent decrease
    const rentDecrease = this.calculate({
      ...input,
      grossMonthlyRent: input.grossMonthlyRent
        ? this.multiplyMoney(input.grossMonthlyRent, 0.90)
        : undefined,
    });
    scenarios.push({
      name: 'Rent -10%',
      description: 'Rent decrease of 10%',
      adjustments: { rentAdjustment: -0.10 },
      dscrResult: rentDecrease.dscrRatio,
    });

    // Combined stress
    const combinedStress = this.calculate({
      ...input,
      vacancyRate: 0.08,
      interestRate: input.interestRate + 0.005,
      grossMonthlyRent: input.grossMonthlyRent
        ? this.multiplyMoney(input.grossMonthlyRent, 0.95)
        : undefined,
    });
    scenarios.push({
      name: 'Combined Stress',
      description: '8% vacancy, +0.5% rate, -5% rent',
      adjustments: {
        vacancyRate: 0.08,
        interestRate: input.interestRate + 0.005,
        rentAdjustment: -0.05,
      },
      dscrResult: combinedStress.dscrRatio,
    });

    return scenarios;
  }

  /**
   * Calculate required rent for target DSCR
   */
  calculateRequiredRent(
    input: Omit<DSCRCalculationInput, 'grossMonthlyRent' | 'rentRoll'>,
    targetDSCR: number = this.MINIMUM_DSCR
  ): Money {
    // Work backwards from target DSCR

    // 1. Calculate debt service
    const debtService = this.calculateDebtService({
      ...input,
      grossMonthlyRent: { amount: 0, currency: 'USD' },
    } as DSCRCalculationInput);

    // 2. Required NOI = DSCR * PITIA
    const requiredNOI = this.multiplyMoney(debtService.totalPITIA, targetDSCR);

    // 3. Add back fixed expenses to get required gross income
    const fixedExpenses = this.calculateFixedExpenses(input);
    const requiredGrossBeforeVacancy = this.addMoney(requiredNOI, fixedExpenses);

    // 4. Gross up for vacancy
    const vacancyRate = input.vacancyRate ?? this.DEFAULT_VACANCY_RATE;
    const requiredGrossRent = this.divideMoney(
      requiredGrossBeforeVacancy,
      (1 - vacancyRate)
    );

    // 5. Gross up for management fee (if percentage-based)
    const mgmtRate = input.managementFeeRate ?? this.DEFAULT_MANAGEMENT_FEE_RATE;
    const finalRequiredRent = this.divideMoney(requiredGrossRent, (1 - mgmtRate));

    return finalRequiredRent;
  }

  /**
   * Calculate maximum loan amount for given DSCR target
   */
  calculateMaxLoanAmount(
    input: Omit<DSCRCalculationInput, 'loanAmount'>,
    targetDSCR: number = this.MINIMUM_DSCR
  ): Money {
    // 1. Calculate NOI
    const grossMonthlyRent = input.grossMonthlyRent ?? { amount: 0, currency: 'USD' };
    const vacancyRate = input.vacancyRate ?? this.DEFAULT_VACANCY_RATE;
    const effectiveGrossRent = this.applyVacancy(grossMonthlyRent, vacancyRate);

    const tempInput = {
      ...input,
      loanAmount: { amount: 100000 * 100, currency: 'USD' }, // Placeholder
    } as DSCRCalculationInput;

    const expenses = this.calculateExpenses(tempInput, effectiveGrossRent, []);
    const noiMonthly = this.subtractMoney(effectiveGrossRent, expenses.totalExpenses);

    // 2. Max PITIA = NOI / targetDSCR
    const maxPITIA = this.divideMoney(noiMonthly, targetDSCR);

    // 3. Subtract T&I to get max P&I
    const tiMonthly = this.addMoney(
      expenses.propertyTaxMonthly,
      this.addMoney(expenses.insuranceMonthly, expenses.hoaMonthly)
    );
    const maxPI = this.subtractMoney(maxPITIA, tiMonthly);

    if (maxPI.amount <= 0) {
      return { amount: 0, currency: 'USD' };
    }

    // 4. Back-calculate loan amount from P&I
    const monthlyRate = input.interestRate / 12;
    const numPayments = input.termMonths;

    // P&I = L * [r(1+r)^n] / [(1+r)^n - 1]
    // L = P&I * [(1+r)^n - 1] / [r(1+r)^n]

    const factor = Math.pow(1 + monthlyRate, numPayments);
    const loanAmountCents =
      (maxPI.amount * (factor - 1)) / (monthlyRate * factor);

    return {
      amount: Math.floor(loanAmountCents),
      currency: 'USD',
    };
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  private calculateGrossRent(
    input: DSCRCalculationInput,
    warnings: DSCRWarning[]
  ): Money {
    // For STR, use annualized income
    if (input.isShortTermRental && input.strAnnualizedIncome) {
      return this.divideMoney(input.strAnnualizedIncome, 12);
    }

    // If rent roll provided, sum it up
    if (input.rentRoll && input.rentRoll.length > 0) {
      const totalFromRentRoll = input.rentRoll.reduce(
        (sum, entry) => {
          if (!entry.isVacant) {
            return this.addMoney(sum, entry.monthlyRent);
          }
          return sum;
        },
        { amount: 0, currency: 'USD' }
      );

      // Warn if rent roll differs significantly from stated rent
      if (input.grossMonthlyRent) {
        const diff = Math.abs(
          totalFromRentRoll.amount - input.grossMonthlyRent.amount
        );
        const pctDiff = diff / input.grossMonthlyRent.amount;

        if (pctDiff > 0.1) {
          warnings.push({
            code: 'RENT_DISCREPANCY',
            message: `Rent roll total ($${(totalFromRentRoll.amount / 100).toFixed(2)}) differs from stated rent ($${(input.grossMonthlyRent.amount / 100).toFixed(2)}) by ${(pctDiff * 100).toFixed(1)}%`,
            severity: 'WARNING',
          });
        }
      }

      return totalFromRentRoll;
    }

    // Use stated gross rent
    if (input.grossMonthlyRent) {
      return input.grossMonthlyRent;
    }

    // No rent data
    warnings.push({
      code: 'NO_RENT_DATA',
      message: 'No rental income data provided',
      severity: 'ERROR',
    });

    return { amount: 0, currency: 'USD' };
  }

  private applyVacancy(grossRent: Money, vacancyRate: number): Money {
    return {
      amount: Math.round(grossRent.amount * (1 - vacancyRate)),
      currency: grossRent.currency,
    };
  }

  private calculateExpenses(
    input: DSCRCalculationInput,
    totalGrossIncome: Money,
    warnings: DSCRWarning[]
  ): {
    propertyTaxMonthly: Money;
    insuranceMonthly: Money;
    hoaMonthly: Money;
    managementFeeMonthly: Money;
    floodInsuranceMonthly: Money;
    otherExpenses: Money;
    totalExpenses: Money;
  } {
    // Property tax (annual to monthly)
    const propertyTaxMonthly = input.annualPropertyTax
      ? this.divideMoney(input.annualPropertyTax, 12)
      : { amount: 0, currency: 'USD' };

    // Insurance (annual to monthly)
    const insuranceMonthly = input.annualInsurance
      ? this.divideMoney(input.annualInsurance, 12)
      : { amount: 0, currency: 'USD' };

    // HOA
    const hoaMonthly = input.monthlyHOA ?? { amount: 0, currency: 'USD' };

    // Management fee (percentage of gross income)
    const mgmtRate = input.managementFeeRate ?? this.DEFAULT_MANAGEMENT_FEE_RATE;
    const managementFeeMonthly = this.multiplyMoney(totalGrossIncome, mgmtRate);

    // Flood insurance
    const floodInsuranceMonthly = input.monthlyFloodInsurance ?? {
      amount: 0,
      currency: 'USD',
    };

    // Other expenses
    const otherExpenses = input.otherMonthlyExpenses ?? {
      amount: 0,
      currency: 'USD',
    };

    // Validate expense reasonableness
    const expenseRatio =
      (propertyTaxMonthly.amount +
        insuranceMonthly.amount +
        hoaMonthly.amount +
        managementFeeMonthly.amount) /
      totalGrossIncome.amount;

    if (expenseRatio > 0.5) {
      warnings.push({
        code: 'HIGH_EXPENSE_RATIO',
        message: `Operating expense ratio of ${(expenseRatio * 100).toFixed(1)}% is unusually high`,
        severity: 'WARNING',
      });
    }

    // Total expenses
    let total = this.addMoney(propertyTaxMonthly, insuranceMonthly);
    total = this.addMoney(total, hoaMonthly);
    total = this.addMoney(total, managementFeeMonthly);
    total = this.addMoney(total, floodInsuranceMonthly);
    total = this.addMoney(total, otherExpenses);

    return {
      propertyTaxMonthly,
      insuranceMonthly,
      hoaMonthly,
      managementFeeMonthly,
      floodInsuranceMonthly,
      otherExpenses,
      totalExpenses: total,
    };
  }

  private calculateFixedExpenses(
    input: Omit<DSCRCalculationInput, 'grossMonthlyRent' | 'rentRoll'>
  ): Money {
    // Property tax (annual to monthly)
    const propertyTaxMonthly = input.annualPropertyTax
      ? this.divideMoney(input.annualPropertyTax, 12)
      : { amount: 0, currency: 'USD' };

    // Insurance (annual to monthly)
    const insuranceMonthly = input.annualInsurance
      ? this.divideMoney(input.annualInsurance, 12)
      : { amount: 0, currency: 'USD' };

    // HOA
    const hoaMonthly = input.monthlyHOA ?? { amount: 0, currency: 'USD' };

    // Flood insurance
    const floodInsuranceMonthly = input.monthlyFloodInsurance ?? {
      amount: 0,
      currency: 'USD',
    };

    let total = this.addMoney(propertyTaxMonthly, insuranceMonthly);
    total = this.addMoney(total, hoaMonthly);
    total = this.addMoney(total, floodInsuranceMonthly);

    return total;
  }

  private calculateDebtService(input: DSCRCalculationInput): {
    principalAndInterest: Money;
    totalPITIA: Money;
  } {
    const loanAmount = input.loanAmount.amount / 100; // Convert to dollars
    const monthlyRate = input.interestRate / 12;
    const numPayments = input.termMonths;

    let monthlyPI: number;

    if (input.interestOnlyMonths && input.interestOnlyMonths > 0) {
      // Interest-only payment
      monthlyPI = loanAmount * monthlyRate;
    } else {
      // Fully amortizing
      const factor = Math.pow(1 + monthlyRate, numPayments);
      monthlyPI = (loanAmount * monthlyRate * factor) / (factor - 1);
    }

    const principalAndInterest: Money = {
      amount: Math.round(monthlyPI * 100),
      currency: 'USD',
    };

    // Add T&I for PITIA
    const propertyTaxMonthly = input.annualPropertyTax
      ? this.divideMoney(input.annualPropertyTax, 12)
      : { amount: 0, currency: 'USD' };

    const insuranceMonthly = input.annualInsurance
      ? this.divideMoney(input.annualInsurance, 12)
      : { amount: 0, currency: 'USD' };

    const hoaMonthly = input.monthlyHOA ?? { amount: 0, currency: 'USD' };

    let totalPITIA = this.addMoney(principalAndInterest, propertyTaxMonthly);
    totalPITIA = this.addMoney(totalPITIA, insuranceMonthly);
    totalPITIA = this.addMoney(totalPITIA, hoaMonthly);

    return {
      principalAndInterest,
      totalPITIA,
    };
  }

  private calculateRatio(noi: Money, debtService: Money): number {
    if (debtService.amount === 0) {
      return Infinity;
    }
    return noi.amount / debtService.amount;
  }

  private validateResult(dscrRatio: number, warnings: DSCRWarning[]): void {
    if (dscrRatio < this.MINIMUM_DSCR) {
      warnings.push({
        code: 'BELOW_MINIMUM_DSCR',
        message: `DSCR of ${dscrRatio.toFixed(3)} is below minimum requirement of ${this.MINIMUM_DSCR}`,
        severity: 'ERROR',
      });
    } else if (dscrRatio < this.PREFERRED_DSCR) {
      warnings.push({
        code: 'BELOW_PREFERRED_DSCR',
        message: `DSCR of ${dscrRatio.toFixed(3)} is below preferred level of ${this.PREFERRED_DSCR}`,
        severity: 'WARNING',
      });
    }

    if (dscrRatio > 3.0) {
      warnings.push({
        code: 'UNUSUALLY_HIGH_DSCR',
        message: `DSCR of ${dscrRatio.toFixed(3)} is unusually high - verify income data`,
        severity: 'INFO',
      });
    }
  }

  private sanitizeInputs(input: DSCRCalculationInput): Record<string, unknown> {
    return {
      applicationId: input.applicationId,
      propertyId: input.propertyId,
      grossMonthlyRent: input.grossMonthlyRent,
      rentRollUnits: input.rentRoll?.length ?? 0,
      vacancyRate: input.vacancyRate,
      loanAmount: input.loanAmount,
      interestRate: input.interestRate,
      termMonths: input.termMonths,
      interestOnlyMonths: input.interestOnlyMonths,
      annualPropertyTax: input.annualPropertyTax,
      annualInsurance: input.annualInsurance,
      monthlyHOA: input.monthlyHOA,
      managementFeeRate: input.managementFeeRate,
      isShortTermRental: input.isShortTermRental,
    };
  }

  private getFormula(): string {
    return `
DSCR = NOI / Debt Service

Where:
  NOI = Effective Gross Income - Operating Expenses
  Effective Gross Income = Gross Rent × (1 - Vacancy Rate) + Other Income
  Operating Expenses = Management Fee + Property Tax + Insurance + HOA
  Debt Service = P&I + Property Tax + Insurance + HOA (PITIA)

Note: For DSCR loans, we use NOI / PITIA (not just P&I)
    `.trim();
  }

  // Money utility methods
  private addMoney(a: Money, b: Money): Money {
    return { amount: a.amount + b.amount, currency: a.currency };
  }

  private subtractMoney(a: Money, b: Money): Money {
    return { amount: a.amount - b.amount, currency: a.currency };
  }

  private multiplyMoney(a: Money, factor: number): Money {
    return { amount: Math.round(a.amount * factor), currency: a.currency };
  }

  private divideMoney(a: Money, divisor: number): Money {
    return { amount: Math.round(a.amount / divisor), currency: a.currency };
  }
}
