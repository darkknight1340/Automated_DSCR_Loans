"""
Decision Service

Automated underwriting decision engine for DSCR loans.
Combines rules evaluation, pricing, and risk assessment.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from app.services.rules import rules_engine, LoanData, RuleStatus
from app.services.pricing import pricing_engine, PricingInput, PricingResult


class DecisionType(str, Enum):
    """Decision type."""
    APPROVED = "APPROVED"
    CONDITIONALLY_APPROVED = "CONDITIONALLY_APPROVED"
    REFERRED = "REFERRED"  # Needs manual review
    DECLINED = "DECLINED"
    SUSPENDED = "SUSPENDED"


class DecisionReason(str, Enum):
    """Reason codes for decisions."""
    MEETS_GUIDELINES = "MEETS_GUIDELINES"
    EXCEPTION_REQUIRED = "EXCEPTION_REQUIRED"
    HARD_STOP_VIOLATION = "HARD_STOP_VIOLATION"
    HIGH_RISK = "HIGH_RISK"
    PRICING_INELIGIBLE = "PRICING_INELIGIBLE"
    MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"


@dataclass
class Condition:
    """Condition for approval."""
    id: str
    category: str  # PTD, PTC, PTF
    description: str
    required: bool
    source: str  # AUTOMATED, MANUAL


@dataclass
class DecisionResult:
    """Underwriting decision result."""
    id: str
    application_id: str
    decision_type: DecisionType
    decision_reason: DecisionReason
    decided_at: datetime

    # Rules evaluation
    rules_passed: bool
    hard_stops: int
    exceptions_required: int
    warnings: int

    # Pricing
    pricing: PricingResult | None
    final_rate: float | None
    eligible_for_pricing: bool

    # Conditions
    conditions: list[Condition]

    # Details
    details: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


class DecisionService:
    """Automated decision engine."""

    def evaluate(
        self,
        loan_data: LoanData,
        pricing_input: PricingInput | None = None,
    ) -> DecisionResult:
        """Evaluate loan for automated decision."""
        conditions: list[Condition] = []
        notes: list[str] = []

        # 1. Run rules engine
        rules_result = rules_engine.evaluate(loan_data)

        # 2. Run pricing (if eligible)
        pricing_result: PricingResult | None = None
        if pricing_input:
            pricing_result = pricing_engine.calculate_pricing(pricing_input)

        # 3. Determine decision
        decision_type, decision_reason = self._determine_decision(
            rules_result.overall_status,
            rules_result.hard_stops,
            rules_result.exceptions_required,
            pricing_result,
        )

        # 4. Generate conditions
        conditions = self._generate_conditions(
            rules_result,
            pricing_result,
            loan_data,
        )

        # 5. Add notes
        if rules_result.hard_stops:
            notes.append(f"Hard stop violations: {len(rules_result.hard_stops)}")
            for hs in rules_result.hard_stops:
                notes.append(f"  - {hs.rule_name}: {hs.message}")

        if rules_result.exceptions_required:
            notes.append(f"Exceptions required: {len(rules_result.exceptions_required)}")

        return DecisionResult(
            id=str(uuid4()),
            application_id=loan_data.application_id,
            decision_type=decision_type,
            decision_reason=decision_reason,
            decided_at=datetime.utcnow(),
            rules_passed=rules_result.overall_status == RuleStatus.PASS,
            hard_stops=len(rules_result.hard_stops),
            exceptions_required=len(rules_result.exceptions_required),
            warnings=len(rules_result.warnings),
            pricing=pricing_result,
            final_rate=pricing_result.final_rate if pricing_result else None,
            eligible_for_pricing=pricing_result.eligible if pricing_result else False,
            conditions=conditions,
            details={
                "rules_evaluation_id": rules_result.id,
                "passed_rules": rules_result.passed_count,
                "failed_rules": rules_result.failed_count,
            },
            notes=notes,
        )

    def _determine_decision(
        self,
        rules_status: RuleStatus,
        hard_stops: list,
        exceptions: list,
        pricing: PricingResult | None,
    ) -> tuple[DecisionType, DecisionReason]:
        """Determine decision type and reason."""
        # Hard stops = automatic decline
        if hard_stops:
            return DecisionType.DECLINED, DecisionReason.HARD_STOP_VIOLATION

        # Pricing ineligible = decline
        if pricing and not pricing.eligible:
            return DecisionType.DECLINED, DecisionReason.PRICING_INELIGIBLE

        # Exceptions required = referred for manual review
        if exceptions:
            return DecisionType.REFERRED, DecisionReason.EXCEPTION_REQUIRED

        # High risk tier = referred
        if pricing and pricing.risk_tier.value == "HIGH_RISK":
            return DecisionType.REFERRED, DecisionReason.HIGH_RISK

        # Everything passes = conditionally approved
        return DecisionType.CONDITIONALLY_APPROVED, DecisionReason.MEETS_GUIDELINES

    def _generate_conditions(
        self,
        rules_result: Any,
        pricing_result: PricingResult | None,
        loan_data: LoanData,
    ) -> list[Condition]:
        """Generate conditions for approval."""
        conditions: list[Condition] = []

        # Standard conditions (PTD - Prior to Docs)
        conditions.append(Condition(
            id=str(uuid4()),
            category="PTD",
            description="Verify borrower identity",
            required=True,
            source="AUTOMATED",
        ))

        conditions.append(Condition(
            id=str(uuid4()),
            category="PTD",
            description="Obtain credit report",
            required=True,
            source="AUTOMATED",
        ))

        conditions.append(Condition(
            id=str(uuid4()),
            category="PTD",
            description="Verify property ownership/purchase contract",
            required=True,
            source="AUTOMATED",
        ))

        # DSCR-specific conditions
        conditions.append(Condition(
            id=str(uuid4()),
            category="PTD",
            description="Obtain rent schedule or lease agreements",
            required=True,
            source="AUTOMATED",
        ))

        if loan_data.units > 1:
            conditions.append(Condition(
                id=str(uuid4()),
                category="PTD",
                description="Obtain rent roll for all units",
                required=True,
                source="AUTOMATED",
            ))

        # Appraisal condition (PTC - Prior to Clear)
        conditions.append(Condition(
            id=str(uuid4()),
            category="PTC",
            description="Obtain satisfactory appraisal",
            required=True,
            source="AUTOMATED",
        ))

        # Title condition (PTF - Prior to Funding)
        conditions.append(Condition(
            id=str(uuid4()),
            category="PTF",
            description="Clear title with no liens",
            required=True,
            source="AUTOMATED",
        ))

        conditions.append(Condition(
            id=str(uuid4()),
            category="PTF",
            description="Proof of hazard insurance",
            required=True,
            source="AUTOMATED",
        ))

        # Add conditions based on rule warnings
        for warning in rules_result.warnings:
            conditions.append(Condition(
                id=str(uuid4()),
                category="PTD",
                description=f"Address: {warning.message}",
                required=False,
                source="AUTOMATED",
            ))

        return conditions


# Export singleton
decision_service = DecisionService()
