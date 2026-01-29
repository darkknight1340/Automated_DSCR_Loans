"""
DSCR (Debt Service Coverage Ratio) Calculator

Calculates DSCR for investment properties based on rental income
and debt service (PITIA - Principal, Interest, Taxes, Insurance, Association dues).
"""

import math
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4


# =============================================================================
# Types
# =============================================================================

class WarningSeverity(str, Enum):
    """Warning severity levels."""
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


@dataclass
class Money:
    """Money value in cents."""
    amount: int  # cents
    currency: str = "USD"


@dataclass
class RentRollEntry:
    """Rent roll entry for a unit."""
    unit_number: str | None = None
    unit_type: str = ""
    bedrooms: int = 0
    bathrooms: float = 0
    square_feet: int | None = None
    monthly_rent: Money = field(default_factory=lambda: Money(0))
    is_vacant: bool = False
    lease_expiration: datetime | None = None


@dataclass
class DSCRWarning:
    """DSCR calculation warning."""
    code: str
    message: str
    severity: WarningSeverity


@dataclass
class DSCRCalculationInput:
    """Input for DSCR calculation."""
    application_id: str
    property_id: str

    # Rental income
    gross_monthly_rent: Money | None = None
    rent_roll: list[RentRollEntry] | None = None
    vacancy_rate: float | None = None  # Default 5%
    other_income: Money | None = None

    # Expenses
    annual_property_tax: Money | None = None
    annual_insurance: Money | None = None
    monthly_hoa: Money | None = None
    management_fee_rate: float | None = None  # As decimal (0.08 = 8%)
    monthly_flood_insurance: Money | None = None
    other_monthly_expenses: Money | None = None

    # Loan terms
    loan_amount: Money = field(default_factory=lambda: Money(0))
    interest_rate: float = 0.0  # Annual rate as decimal (0.075 = 7.5%)
    term_months: int = 360
    interest_only_months: int | None = None

    # STR specific
    is_short_term_rental: bool = False
    str_annualized_income: Money | None = None


@dataclass
class DSCRIncomeBreakdown:
    """Income breakdown."""
    gross_monthly_rent: Money
    vacancy_rate: float
    effective_gross_rent: Money
    other_income: Money | None = None


@dataclass
class DSCRExpenseBreakdown:
    """Expense breakdown."""
    property_tax_monthly: Money
    insurance_monthly: Money
    hoa_monthly: Money
    management_fee_monthly: Money
    flood_insurance_monthly: Money
    other_expenses: Money
    total_expenses: Money


@dataclass
class DSCRNOIBreakdown:
    """NOI breakdown."""
    monthly: Money
    annual: Money


@dataclass
class DSCRDebtServiceBreakdown:
    """Debt service breakdown."""
    principal_and_interest: Money
    total_pitia: Money


@dataclass
class DSCRCalculationResult:
    """DSCR calculation result."""
    id: str
    application_id: str
    property_id: str

    income: DSCRIncomeBreakdown
    expenses: DSCRExpenseBreakdown
    noi: DSCRNOIBreakdown
    debt_service: DSCRDebtServiceBreakdown

    dscr_ratio: float

    calculated_at: datetime
    calculator_version: str
    inputs: dict[str, Any]
    formula: str

    warnings: list[DSCRWarning]
    meets_minimum: bool
    minimum_required: float


@dataclass
class DSCRScenario:
    """DSCR scenario for comparison."""
    name: str
    description: str
    adjustments: dict[str, Any]
    dscr_result: float


# =============================================================================
# Calculator
# =============================================================================

class DSCRCalculator:
    """DSCR calculator for investment properties."""

    CALCULATOR_VERSION = "2.0.0"
    DEFAULT_VACANCY_RATE = 0.05
    DEFAULT_MANAGEMENT_FEE_RATE = 0.08
    MINIMUM_DSCR = 1.0
    PREFERRED_DSCR = 1.25

    def calculate(self, input_data: DSCRCalculationInput) -> DSCRCalculationResult:
        """Calculate DSCR for an application."""
        warnings: list[DSCRWarning] = []

        # 1. Calculate Gross Rent
        gross_monthly_rent = self._calculate_gross_rent(input_data, warnings)

        # 2. Apply vacancy rate
        vacancy_rate = input_data.vacancy_rate or self.DEFAULT_VACANCY_RATE
        effective_gross_rent = self._apply_vacancy(gross_monthly_rent, vacancy_rate)

        # 3. Add other income
        other_income = input_data.other_income or Money(0)
        total_gross_income = self._add_money(effective_gross_rent, other_income)

        # 4. Calculate expenses
        expenses = self._calculate_expenses(input_data, total_gross_income, warnings)

        # 5. Calculate NOI
        noi_monthly = self._subtract_money(total_gross_income, expenses.total_expenses)
        noi_annual = self._multiply_money(noi_monthly, 12)

        # 6. Calculate debt service
        debt_service = self._calculate_debt_service(input_data)

        # 7. Calculate DSCR
        dscr_ratio = self._calculate_ratio(noi_monthly, debt_service.total_pitia)

        # Validate and add warnings
        self._validate_result(dscr_ratio, warnings)

        return DSCRCalculationResult(
            id=str(uuid4()),
            application_id=input_data.application_id,
            property_id=input_data.property_id,
            income=DSCRIncomeBreakdown(
                gross_monthly_rent=gross_monthly_rent,
                vacancy_rate=vacancy_rate,
                effective_gross_rent=effective_gross_rent,
                other_income=input_data.other_income,
            ),
            expenses=expenses,
            noi=DSCRNOIBreakdown(monthly=noi_monthly, annual=noi_annual),
            debt_service=debt_service,
            dscr_ratio=dscr_ratio,
            calculated_at=datetime.utcnow(),
            calculator_version=self.CALCULATOR_VERSION,
            inputs=self._sanitize_inputs(input_data),
            formula=self._get_formula(),
            warnings=warnings,
            meets_minimum=dscr_ratio >= self.MINIMUM_DSCR,
            minimum_required=self.MINIMUM_DSCR,
        )

    def calculate_scenarios(self, input_data: DSCRCalculationInput) -> list[DSCRScenario]:
        """Calculate multiple scenarios for comparison."""
        scenarios: list[DSCRScenario] = []

        # Base case
        base_result = self.calculate(input_data)
        scenarios.append(DSCRScenario(
            name="Base Case",
            description="Current inputs",
            adjustments={},
            dscr_result=base_result.dscr_ratio,
        ))

        # Stress test: Higher vacancy
        high_vacancy_input = DSCRCalculationInput(
            **{**input_data.__dict__, "vacancy_rate": 0.10}
        )
        high_vacancy = self.calculate(high_vacancy_input)
        scenarios.append(DSCRScenario(
            name="High Vacancy",
            description="10% vacancy rate",
            adjustments={"vacancy_rate": 0.10},
            dscr_result=high_vacancy.dscr_ratio,
        ))

        # Stress test: Rate increase
        rate_increase_input = DSCRCalculationInput(
            **{**input_data.__dict__, "interest_rate": input_data.interest_rate + 0.01}
        )
        rate_increase = self.calculate(rate_increase_input)
        scenarios.append(DSCRScenario(
            name="Rate +1%",
            description="Interest rate increase of 1%",
            adjustments={"interest_rate": input_data.interest_rate + 0.01},
            dscr_result=rate_increase.dscr_ratio,
        ))

        # Stress test: Rent decrease
        if input_data.gross_monthly_rent:
            reduced_rent = Money(int(input_data.gross_monthly_rent.amount * 0.90))
            rent_decrease_input = DSCRCalculationInput(
                **{**input_data.__dict__, "gross_monthly_rent": reduced_rent}
            )
            rent_decrease = self.calculate(rent_decrease_input)
            scenarios.append(DSCRScenario(
                name="Rent -10%",
                description="Rent decrease of 10%",
                adjustments={"rent_adjustment": -0.10},
                dscr_result=rent_decrease.dscr_ratio,
            ))

        return scenarios

    def calculate_required_rent(
        self,
        input_data: DSCRCalculationInput,
        target_dscr: float | None = None,
    ) -> Money:
        """Calculate required rent for target DSCR."""
        target = target_dscr or self.MINIMUM_DSCR

        # Calculate debt service
        debt_service = self._calculate_debt_service(input_data)

        # Required NOI = DSCR * PITIA
        required_noi = self._multiply_money(debt_service.total_pitia, target)

        # Add back fixed expenses
        fixed_expenses = self._calculate_fixed_expenses(input_data)
        required_gross_before_vacancy = self._add_money(required_noi, fixed_expenses)

        # Gross up for vacancy
        vacancy_rate = input_data.vacancy_rate or self.DEFAULT_VACANCY_RATE
        required_gross_rent = self._divide_money(required_gross_before_vacancy, 1 - vacancy_rate)

        # Gross up for management fee
        mgmt_rate = input_data.management_fee_rate or self.DEFAULT_MANAGEMENT_FEE_RATE
        final_required_rent = self._divide_money(required_gross_rent, 1 - mgmt_rate)

        return final_required_rent

    def calculate_max_loan_amount(
        self,
        input_data: DSCRCalculationInput,
        target_dscr: float | None = None,
    ) -> Money:
        """Calculate maximum loan amount for given DSCR target."""
        target = target_dscr or self.MINIMUM_DSCR

        # Calculate NOI
        gross_monthly_rent = input_data.gross_monthly_rent or Money(0)
        vacancy_rate = input_data.vacancy_rate or self.DEFAULT_VACANCY_RATE
        effective_gross_rent = self._apply_vacancy(gross_monthly_rent, vacancy_rate)

        expenses = self._calculate_expenses(input_data, effective_gross_rent, [])
        noi_monthly = self._subtract_money(effective_gross_rent, expenses.total_expenses)

        # Max PITIA = NOI / targetDSCR
        max_pitia = self._divide_money(noi_monthly, target)

        # Subtract T&I to get max P&I
        ti_monthly = self._add_money(
            expenses.property_tax_monthly,
            self._add_money(expenses.insurance_monthly, expenses.hoa_monthly),
        )
        max_pi = self._subtract_money(max_pitia, ti_monthly)

        if max_pi.amount <= 0:
            return Money(0)

        # Back-calculate loan amount from P&I
        monthly_rate = input_data.interest_rate / 12
        num_payments = input_data.term_months

        if monthly_rate > 0:
            factor = math.pow(1 + monthly_rate, num_payments)
            loan_amount_cents = (max_pi.amount * (factor - 1)) / (monthly_rate * factor)
        else:
            loan_amount_cents = max_pi.amount * num_payments

        return Money(int(loan_amount_cents))

    # =========================================================================
    # Private Methods
    # =========================================================================

    def _calculate_gross_rent(
        self,
        input_data: DSCRCalculationInput,
        warnings: list[DSCRWarning],
    ) -> Money:
        """Calculate gross monthly rent."""
        # For STR, use annualized income
        if input_data.is_short_term_rental and input_data.str_annualized_income:
            return self._divide_money(input_data.str_annualized_income, 12)

        # If rent roll provided, sum it up
        if input_data.rent_roll:
            total = Money(0)
            for entry in input_data.rent_roll:
                if not entry.is_vacant:
                    total = self._add_money(total, entry.monthly_rent)

            # Warn if differs from stated rent
            if input_data.gross_monthly_rent:
                diff = abs(total.amount - input_data.gross_monthly_rent.amount)
                if input_data.gross_monthly_rent.amount > 0:
                    pct_diff = diff / input_data.gross_monthly_rent.amount
                    if pct_diff > 0.1:
                        warnings.append(DSCRWarning(
                            code="RENT_DISCREPANCY",
                            message=f"Rent roll total (${total.amount / 100:.2f}) differs from stated rent (${input_data.gross_monthly_rent.amount / 100:.2f}) by {pct_diff * 100:.1f}%",
                            severity=WarningSeverity.WARNING,
                        ))
            return total

        # Use stated gross rent
        if input_data.gross_monthly_rent:
            return input_data.gross_monthly_rent

        # No rent data
        warnings.append(DSCRWarning(
            code="NO_RENT_DATA",
            message="No rental income data provided",
            severity=WarningSeverity.ERROR,
        ))
        return Money(0)

    def _apply_vacancy(self, gross_rent: Money, vacancy_rate: float) -> Money:
        """Apply vacancy rate to gross rent."""
        return Money(int(gross_rent.amount * (1 - vacancy_rate)), gross_rent.currency)

    def _calculate_expenses(
        self,
        input_data: DSCRCalculationInput,
        total_gross_income: Money,
        warnings: list[DSCRWarning],
    ) -> DSCRExpenseBreakdown:
        """Calculate all expenses."""
        # Property tax (annual to monthly)
        property_tax_monthly = (
            self._divide_money(input_data.annual_property_tax, 12)
            if input_data.annual_property_tax
            else Money(0)
        )

        # Insurance (annual to monthly)
        insurance_monthly = (
            self._divide_money(input_data.annual_insurance, 12)
            if input_data.annual_insurance
            else Money(0)
        )

        # HOA
        hoa_monthly = input_data.monthly_hoa or Money(0)

        # Management fee
        mgmt_rate = input_data.management_fee_rate or self.DEFAULT_MANAGEMENT_FEE_RATE
        management_fee_monthly = self._multiply_money(total_gross_income, mgmt_rate)

        # Flood insurance
        flood_insurance_monthly = input_data.monthly_flood_insurance or Money(0)

        # Other expenses
        other_expenses = input_data.other_monthly_expenses or Money(0)

        # Validate expense ratio
        expense_sum = (
            property_tax_monthly.amount
            + insurance_monthly.amount
            + hoa_monthly.amount
            + management_fee_monthly.amount
        )
        if total_gross_income.amount > 0:
            expense_ratio = expense_sum / total_gross_income.amount
            if expense_ratio > 0.5:
                warnings.append(DSCRWarning(
                    code="HIGH_EXPENSE_RATIO",
                    message=f"Operating expense ratio of {expense_ratio * 100:.1f}% is unusually high",
                    severity=WarningSeverity.WARNING,
                ))

        # Total expenses
        total = property_tax_monthly
        total = self._add_money(total, insurance_monthly)
        total = self._add_money(total, hoa_monthly)
        total = self._add_money(total, management_fee_monthly)
        total = self._add_money(total, flood_insurance_monthly)
        total = self._add_money(total, other_expenses)

        return DSCRExpenseBreakdown(
            property_tax_monthly=property_tax_monthly,
            insurance_monthly=insurance_monthly,
            hoa_monthly=hoa_monthly,
            management_fee_monthly=management_fee_monthly,
            flood_insurance_monthly=flood_insurance_monthly,
            other_expenses=other_expenses,
            total_expenses=total,
        )

    def _calculate_fixed_expenses(self, input_data: DSCRCalculationInput) -> Money:
        """Calculate fixed expenses (excluding management fee)."""
        property_tax_monthly = (
            self._divide_money(input_data.annual_property_tax, 12)
            if input_data.annual_property_tax
            else Money(0)
        )
        insurance_monthly = (
            self._divide_money(input_data.annual_insurance, 12)
            if input_data.annual_insurance
            else Money(0)
        )
        hoa_monthly = input_data.monthly_hoa or Money(0)
        flood_insurance_monthly = input_data.monthly_flood_insurance or Money(0)

        total = property_tax_monthly
        total = self._add_money(total, insurance_monthly)
        total = self._add_money(total, hoa_monthly)
        total = self._add_money(total, flood_insurance_monthly)
        return total

    def _calculate_debt_service(
        self, input_data: DSCRCalculationInput
    ) -> DSCRDebtServiceBreakdown:
        """Calculate debt service (P&I and PITIA)."""
        loan_dollars = input_data.loan_amount.amount / 100
        monthly_rate = input_data.interest_rate / 12
        num_payments = input_data.term_months

        if input_data.interest_only_months and input_data.interest_only_months > 0:
            # Interest-only payment
            monthly_pi = loan_dollars * monthly_rate
        else:
            # Fully amortizing
            if monthly_rate > 0:
                factor = math.pow(1 + monthly_rate, num_payments)
                monthly_pi = (loan_dollars * monthly_rate * factor) / (factor - 1)
            else:
                monthly_pi = loan_dollars / num_payments

        principal_and_interest = Money(int(monthly_pi * 100))

        # Add T&I for PITIA
        property_tax_monthly = (
            self._divide_money(input_data.annual_property_tax, 12)
            if input_data.annual_property_tax
            else Money(0)
        )
        insurance_monthly = (
            self._divide_money(input_data.annual_insurance, 12)
            if input_data.annual_insurance
            else Money(0)
        )
        hoa_monthly = input_data.monthly_hoa or Money(0)

        total_pitia = principal_and_interest
        total_pitia = self._add_money(total_pitia, property_tax_monthly)
        total_pitia = self._add_money(total_pitia, insurance_monthly)
        total_pitia = self._add_money(total_pitia, hoa_monthly)

        return DSCRDebtServiceBreakdown(
            principal_and_interest=principal_and_interest,
            total_pitia=total_pitia,
        )

    def _calculate_ratio(self, noi: Money, debt_service: Money) -> float:
        """Calculate DSCR ratio."""
        if debt_service.amount == 0:
            return float("inf")
        return noi.amount / debt_service.amount

    def _validate_result(
        self, dscr_ratio: float, warnings: list[DSCRWarning]
    ) -> None:
        """Validate DSCR result and add warnings."""
        if dscr_ratio < self.MINIMUM_DSCR:
            warnings.append(DSCRWarning(
                code="BELOW_MINIMUM_DSCR",
                message=f"DSCR of {dscr_ratio:.3f} is below minimum requirement of {self.MINIMUM_DSCR}",
                severity=WarningSeverity.ERROR,
            ))
        elif dscr_ratio < self.PREFERRED_DSCR:
            warnings.append(DSCRWarning(
                code="BELOW_PREFERRED_DSCR",
                message=f"DSCR of {dscr_ratio:.3f} is below preferred level of {self.PREFERRED_DSCR}",
                severity=WarningSeverity.WARNING,
            ))

        if dscr_ratio > 3.0:
            warnings.append(DSCRWarning(
                code="UNUSUALLY_HIGH_DSCR",
                message=f"DSCR of {dscr_ratio:.3f} is unusually high - verify income data",
                severity=WarningSeverity.INFO,
            ))

    def _sanitize_inputs(self, input_data: DSCRCalculationInput) -> dict[str, Any]:
        """Sanitize inputs for storage."""
        return {
            "application_id": input_data.application_id,
            "property_id": input_data.property_id,
            "gross_monthly_rent": input_data.gross_monthly_rent.amount if input_data.gross_monthly_rent else None,
            "rent_roll_units": len(input_data.rent_roll) if input_data.rent_roll else 0,
            "vacancy_rate": input_data.vacancy_rate,
            "loan_amount": input_data.loan_amount.amount,
            "interest_rate": input_data.interest_rate,
            "term_months": input_data.term_months,
            "interest_only_months": input_data.interest_only_months,
            "is_short_term_rental": input_data.is_short_term_rental,
        }

    def _get_formula(self) -> str:
        """Get DSCR formula explanation."""
        return """
DSCR = NOI / Debt Service

Where:
  NOI = Effective Gross Income - Operating Expenses
  Effective Gross Income = Gross Rent × (1 - Vacancy Rate) + Other Income
  Operating Expenses = Management Fee + Property Tax + Insurance + HOA
  Debt Service = P&I + Property Tax + Insurance + HOA (PITIA)

Note: For DSCR loans, we use NOI / PITIA (not just P&I)
        """.strip()

    # Money utility methods
    def _add_money(self, a: Money, b: Money) -> Money:
        return Money(a.amount + b.amount, a.currency)

    def _subtract_money(self, a: Money, b: Money) -> Money:
        return Money(a.amount - b.amount, a.currency)

    def _multiply_money(self, a: Money, factor: float) -> Money:
        return Money(int(a.amount * factor), a.currency)

    def _divide_money(self, a: Money, divisor: float) -> Money:
        if divisor == 0:
            return Money(0, a.currency)
        return Money(int(a.amount / divisor), a.currency)


# Export singleton
dscr_calculator = DSCRCalculator()
