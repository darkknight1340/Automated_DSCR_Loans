"""
Pricing Engine

Calculates loan pricing based on risk factors including:
- DSCR ratio
- LTV ratio
- Credit score
- Property type
- Loan amount
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any


class RiskTier(str, Enum):
    """Risk tier classification."""
    EXCELLENT = "EXCELLENT"
    GOOD = "GOOD"
    ACCEPTABLE = "ACCEPTABLE"
    MARGINAL = "MARGINAL"
    HIGH_RISK = "HIGH_RISK"


@dataclass
class PricingInput:
    """Input for pricing calculation."""
    dscr: float
    ltv: float
    credit_score: int
    property_type: str
    loan_amount: int  # cents
    loan_purpose: str
    state: str
    is_cash_out: bool = False


@dataclass
class PricingAdjustment:
    """Individual pricing adjustment."""
    factor: str
    adjustment_bps: int  # basis points
    reason: str


@dataclass
class PricingResult:
    """Pricing calculation result."""
    base_rate: float
    adjustments: list[PricingAdjustment]
    total_adjustment_bps: int
    final_rate: float
    risk_tier: RiskTier
    eligible: bool
    ineligibility_reasons: list[str]


class PricingEngine:
    """DSCR loan pricing engine."""

    # Base rates by risk tier
    BASE_RATES = {
        RiskTier.EXCELLENT: 6.50,
        RiskTier.GOOD: 6.875,
        RiskTier.ACCEPTABLE: 7.25,
        RiskTier.MARGINAL: 7.75,
        RiskTier.HIGH_RISK: 8.50,
    }

    # DSCR adjustments (bps)
    DSCR_ADJUSTMENTS = {
        (1.50, float("inf")): -25,  # DSCR >= 1.50
        (1.25, 1.50): 0,  # 1.25 <= DSCR < 1.50
        (1.10, 1.25): 25,  # 1.10 <= DSCR < 1.25
        (1.00, 1.10): 50,  # 1.00 <= DSCR < 1.10
        (0.0, 1.00): 125,  # DSCR < 1.00 (No ratio)
    }

    # LTV adjustments (bps)
    LTV_ADJUSTMENTS = {
        (0, 65): -25,
        (65, 70): 0,
        (70, 75): 25,
        (75, 80): 50,
        (80, float("inf")): 100,
    }

    # Credit score adjustments (bps)
    CREDIT_ADJUSTMENTS = {
        (760, float("inf")): -25,
        (740, 760): 0,
        (720, 740): 25,
        (700, 720): 50,
        (680, 700): 100,
        (660, 680): 150,
        (0, 660): None,  # Ineligible
    }

    # Property type adjustments (bps)
    PROPERTY_TYPE_ADJUSTMENTS = {
        "SFR": 0,
        "CONDO": 25,
        "TOWNHOUSE": 25,
        "DUPLEX": 50,
        "TRIPLEX": 75,
        "FOURPLEX": 75,
        "MULTIFAMILY_5PLUS": 125,
    }

    # Minimum requirements
    MIN_DSCR = 0.75  # No ratio allowed
    MIN_CREDIT_SCORE = 660
    MAX_LTV = 80

    def calculate_pricing(self, input_data: PricingInput) -> PricingResult:
        """Calculate loan pricing."""
        adjustments: list[PricingAdjustment] = []
        ineligibility_reasons: list[str] = []

        # Check eligibility
        if input_data.credit_score < self.MIN_CREDIT_SCORE:
            ineligibility_reasons.append(f"Credit score {input_data.credit_score} below minimum {self.MIN_CREDIT_SCORE}")

        if input_data.ltv > self.MAX_LTV:
            ineligibility_reasons.append(f"LTV {input_data.ltv}% exceeds maximum {self.MAX_LTV}%")

        if input_data.dscr < self.MIN_DSCR:
            ineligibility_reasons.append(f"DSCR {input_data.dscr} below minimum {self.MIN_DSCR}")

        # Determine risk tier
        risk_tier = self._determine_risk_tier(input_data)
        base_rate = self.BASE_RATES[risk_tier]

        # DSCR adjustment
        dscr_adj = self._get_dscr_adjustment(input_data.dscr)
        if dscr_adj != 0:
            adjustments.append(PricingAdjustment(
                factor="DSCR",
                adjustment_bps=dscr_adj,
                reason=f"DSCR of {input_data.dscr:.2f}",
            ))

        # LTV adjustment
        ltv_adj = self._get_ltv_adjustment(input_data.ltv)
        if ltv_adj != 0:
            adjustments.append(PricingAdjustment(
                factor="LTV",
                adjustment_bps=ltv_adj,
                reason=f"LTV of {input_data.ltv:.1f}%",
            ))

        # Credit adjustment
        credit_adj = self._get_credit_adjustment(input_data.credit_score)
        if credit_adj is not None and credit_adj != 0:
            adjustments.append(PricingAdjustment(
                factor="Credit Score",
                adjustment_bps=credit_adj,
                reason=f"Credit score of {input_data.credit_score}",
            ))

        # Property type adjustment
        prop_adj = self.PROPERTY_TYPE_ADJUSTMENTS.get(input_data.property_type, 50)
        if prop_adj != 0:
            adjustments.append(PricingAdjustment(
                factor="Property Type",
                adjustment_bps=prop_adj,
                reason=f"Property type: {input_data.property_type}",
            ))

        # Cash out adjustment
        if input_data.is_cash_out:
            adjustments.append(PricingAdjustment(
                factor="Cash Out",
                adjustment_bps=50,
                reason="Cash-out refinance",
            ))

        # Calculate total
        total_adjustment_bps = sum(a.adjustment_bps for a in adjustments)
        final_rate = base_rate + (total_adjustment_bps / 100)

        return PricingResult(
            base_rate=base_rate,
            adjustments=adjustments,
            total_adjustment_bps=total_adjustment_bps,
            final_rate=round(final_rate, 3),
            risk_tier=risk_tier,
            eligible=len(ineligibility_reasons) == 0,
            ineligibility_reasons=ineligibility_reasons,
        )

    def _determine_risk_tier(self, input_data: PricingInput) -> RiskTier:
        """Determine overall risk tier."""
        # Simple scoring based on key factors
        score = 0

        # DSCR scoring
        if input_data.dscr >= 1.50:
            score += 4
        elif input_data.dscr >= 1.25:
            score += 3
        elif input_data.dscr >= 1.10:
            score += 2
        elif input_data.dscr >= 1.00:
            score += 1

        # Credit scoring
        if input_data.credit_score >= 760:
            score += 4
        elif input_data.credit_score >= 740:
            score += 3
        elif input_data.credit_score >= 720:
            score += 2
        elif input_data.credit_score >= 700:
            score += 1

        # LTV scoring (inverse)
        if input_data.ltv <= 65:
            score += 4
        elif input_data.ltv <= 70:
            score += 3
        elif input_data.ltv <= 75:
            score += 2
        elif input_data.ltv <= 80:
            score += 1

        # Map score to tier
        if score >= 10:
            return RiskTier.EXCELLENT
        elif score >= 7:
            return RiskTier.GOOD
        elif score >= 4:
            return RiskTier.ACCEPTABLE
        elif score >= 2:
            return RiskTier.MARGINAL
        else:
            return RiskTier.HIGH_RISK

    def _get_dscr_adjustment(self, dscr: float) -> int:
        """Get DSCR adjustment in basis points."""
        for (low, high), adj in self.DSCR_ADJUSTMENTS.items():
            if low <= dscr < high:
                return adj
        return 0

    def _get_ltv_adjustment(self, ltv: float) -> int:
        """Get LTV adjustment in basis points."""
        for (low, high), adj in self.LTV_ADJUSTMENTS.items():
            if low <= ltv < high:
                return adj
        return 0

    def _get_credit_adjustment(self, score: int) -> int | None:
        """Get credit score adjustment in basis points."""
        for (low, high), adj in self.CREDIT_ADJUSTMENTS.items():
            if low <= score < high:
                return adj
        return None


# Export singleton
pricing_engine = PricingEngine()
