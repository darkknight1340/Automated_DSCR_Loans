"""
Rules Engine

Evaluates loan applications against underwriting guidelines.
Supports DSCR-specific rules and investor overlays.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable
from uuid import uuid4


class RuleCategory(str, Enum):
    """Rule category."""
    ELIGIBILITY = "ELIGIBILITY"
    CREDIT = "CREDIT"
    PROPERTY = "PROPERTY"
    INCOME = "INCOME"
    COLLATERAL = "COLLATERAL"


class RuleSeverity(str, Enum):
    """Rule violation severity."""
    HARD_STOP = "HARD_STOP"  # Automatic decline
    EXCEPTION_REQUIRED = "EXCEPTION_REQUIRED"  # Needs exception approval
    WARNING = "WARNING"  # Informational, proceed with caution
    INFO = "INFO"  # Just informational


class RuleStatus(str, Enum):
    """Rule evaluation status."""
    PASS = "PASS"
    FAIL = "FAIL"
    WARNING = "WARNING"
    NOT_APPLICABLE = "NOT_APPLICABLE"


@dataclass
class RuleResult:
    """Individual rule evaluation result."""
    rule_id: str
    rule_name: str
    category: RuleCategory
    status: RuleStatus
    severity: RuleSeverity
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    exception_eligible: bool = False


@dataclass
class RulesEvaluationResult:
    """Complete rules evaluation result."""
    id: str
    application_id: str
    evaluated_at: datetime
    overall_status: RuleStatus
    rule_results: list[RuleResult]
    hard_stops: list[RuleResult]
    exceptions_required: list[RuleResult]
    warnings: list[RuleResult]
    passed_count: int
    failed_count: int
    warning_count: int


@dataclass
class LoanData:
    """Loan data for rules evaluation."""
    application_id: str
    dscr: float
    ltv: float
    cltv: float
    credit_score: int
    property_type: str
    property_state: str
    loan_amount: int  # cents
    loan_purpose: str
    occupancy_type: str
    units: int
    is_rural: bool = False
    months_reserves: int = 0
    prior_bankruptcies: int = 0
    prior_foreclosures: int = 0
    current_delinquencies: int = 0


class RulesEngine:
    """DSCR loan rules engine."""

    def __init__(self) -> None:
        self.rules: list[dict[str, Any]] = self._init_rules()

    def evaluate(self, loan_data: LoanData) -> RulesEvaluationResult:
        """Evaluate all rules against loan data."""
        results: list[RuleResult] = []

        for rule in self.rules:
            result = self._evaluate_rule(rule, loan_data)
            results.append(result)

        # Categorize results
        hard_stops = [r for r in results if r.status == RuleStatus.FAIL and r.severity == RuleSeverity.HARD_STOP]
        exceptions_required = [r for r in results if r.status == RuleStatus.FAIL and r.severity == RuleSeverity.EXCEPTION_REQUIRED]
        warnings = [r for r in results if r.status == RuleStatus.WARNING]

        # Determine overall status
        if hard_stops:
            overall_status = RuleStatus.FAIL
        elif exceptions_required:
            overall_status = RuleStatus.WARNING
        else:
            overall_status = RuleStatus.PASS

        passed_count = len([r for r in results if r.status == RuleStatus.PASS])
        failed_count = len([r for r in results if r.status == RuleStatus.FAIL])
        warning_count = len([r for r in results if r.status == RuleStatus.WARNING])

        return RulesEvaluationResult(
            id=str(uuid4()),
            application_id=loan_data.application_id,
            evaluated_at=datetime.utcnow(),
            overall_status=overall_status,
            rule_results=results,
            hard_stops=hard_stops,
            exceptions_required=exceptions_required,
            warnings=warnings,
            passed_count=passed_count,
            failed_count=failed_count,
            warning_count=warning_count,
        )

    def _evaluate_rule(self, rule: dict[str, Any], loan_data: LoanData) -> RuleResult:
        """Evaluate a single rule."""
        rule_id = rule["id"]
        rule_name = rule["name"]
        category = rule["category"]
        severity = rule["severity"]
        check_fn = rule["check"]
        message_fn = rule["message"]

        try:
            passed = check_fn(loan_data)
            status = RuleStatus.PASS if passed else (
                RuleStatus.WARNING if severity == RuleSeverity.WARNING else RuleStatus.FAIL
            )
            message = message_fn(loan_data, passed)
        except Exception as e:
            status = RuleStatus.NOT_APPLICABLE
            message = f"Rule evaluation error: {str(e)}"

        return RuleResult(
            rule_id=rule_id,
            rule_name=rule_name,
            category=category,
            status=status,
            severity=severity,
            message=message,
            exception_eligible=severity == RuleSeverity.EXCEPTION_REQUIRED,
        )

    def _init_rules(self) -> list[dict[str, Any]]:
        """Initialize underwriting rules."""
        return [
            # DSCR Rules
            {
                "id": "DSCR-001",
                "name": "Minimum DSCR",
                "category": RuleCategory.INCOME,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.dscr >= 0.75,
                "message": lambda d, p: f"DSCR of {d.dscr:.2f} {'meets' if p else 'does not meet'} minimum 0.75 requirement",
            },
            {
                "id": "DSCR-002",
                "name": "DSCR Below 1.0",
                "category": RuleCategory.INCOME,
                "severity": RuleSeverity.EXCEPTION_REQUIRED,
                "check": lambda d: d.dscr >= 1.0,
                "message": lambda d, p: f"DSCR of {d.dscr:.2f} is {'above' if p else 'below'} 1.0 threshold",
            },

            # LTV Rules
            {
                "id": "LTV-001",
                "name": "Maximum LTV",
                "category": RuleCategory.COLLATERAL,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.ltv <= 80,
                "message": lambda d, p: f"LTV of {d.ltv:.1f}% {'is within' if p else 'exceeds'} 80% maximum",
            },
            {
                "id": "LTV-002",
                "name": "High LTV Warning",
                "category": RuleCategory.COLLATERAL,
                "severity": RuleSeverity.WARNING,
                "check": lambda d: d.ltv <= 75,
                "message": lambda d, p: f"LTV of {d.ltv:.1f}% {'is' if p else 'is not'} within preferred 75% threshold",
            },

            # Credit Rules
            {
                "id": "CREDIT-001",
                "name": "Minimum Credit Score",
                "category": RuleCategory.CREDIT,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.credit_score >= 660,
                "message": lambda d, p: f"Credit score of {d.credit_score} {'meets' if p else 'does not meet'} minimum 660 requirement",
            },
            {
                "id": "CREDIT-002",
                "name": "Credit Score Warning",
                "category": RuleCategory.CREDIT,
                "severity": RuleSeverity.WARNING,
                "check": lambda d: d.credit_score >= 700,
                "message": lambda d, p: f"Credit score of {d.credit_score} {'is' if p else 'is not'} above preferred 700 threshold",
            },
            {
                "id": "CREDIT-003",
                "name": "Recent Bankruptcy",
                "category": RuleCategory.CREDIT,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.prior_bankruptcies == 0,
                "message": lambda d, p: "No bankruptcy seasoning issues" if p else f"Borrower has {d.prior_bankruptcies} prior bankruptcy(ies)",
            },
            {
                "id": "CREDIT-004",
                "name": "Recent Foreclosure",
                "category": RuleCategory.CREDIT,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.prior_foreclosures == 0,
                "message": lambda d, p: "No foreclosure seasoning issues" if p else f"Borrower has {d.prior_foreclosures} prior foreclosure(s)",
            },

            # Property Rules
            {
                "id": "PROP-001",
                "name": "Eligible Property Type",
                "category": RuleCategory.PROPERTY,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.property_type in ["SFR", "CONDO", "TOWNHOUSE", "DUPLEX", "TRIPLEX", "FOURPLEX", "MULTIFAMILY_5PLUS"],
                "message": lambda d, p: f"Property type {d.property_type} {'is' if p else 'is not'} eligible",
            },
            {
                "id": "PROP-002",
                "name": "Rural Property",
                "category": RuleCategory.PROPERTY,
                "severity": RuleSeverity.EXCEPTION_REQUIRED,
                "check": lambda d: not d.is_rural,
                "message": lambda d, p: "Property is not in a rural area" if p else "Property is in a rural area - exception required",
            },

            # Loan Amount Rules
            {
                "id": "LOAN-001",
                "name": "Minimum Loan Amount",
                "category": RuleCategory.ELIGIBILITY,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.loan_amount >= 10000000,  # $100,000
                "message": lambda d, p: f"Loan amount ${d.loan_amount / 100:,.0f} {'meets' if p else 'does not meet'} minimum $100,000",
            },
            {
                "id": "LOAN-002",
                "name": "Maximum Loan Amount",
                "category": RuleCategory.ELIGIBILITY,
                "severity": RuleSeverity.HARD_STOP,
                "check": lambda d: d.loan_amount <= 300000000,  # $3,000,000
                "message": lambda d, p: f"Loan amount ${d.loan_amount / 100:,.0f} {'is within' if p else 'exceeds'} maximum $3,000,000",
            },

            # Reserve Rules
            {
                "id": "RESERVE-001",
                "name": "Minimum Reserves",
                "category": RuleCategory.ELIGIBILITY,
                "severity": RuleSeverity.EXCEPTION_REQUIRED,
                "check": lambda d: d.months_reserves >= 6,
                "message": lambda d, p: f"{d.months_reserves} months reserves {'meets' if p else 'does not meet'} 6 month minimum",
            },
        ]


# Export singleton
rules_engine = RulesEngine()
