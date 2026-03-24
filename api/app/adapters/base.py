"""
Standardized result types for data providers.

These types provide a common interface for AVM, rent estimation, and verification
results, enabling easy swapping between providers (RentCast, Clear Capital, DataTree, etc.)
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AVMResult:
    """Standardized AVM result from any provider."""

    value: int  # cents
    value_low: int | None = None
    value_high: int | None = None
    confidence: str | None = None  # "HIGH", "MEDIUM", "LOW"
    source: str = ""  # Provider name
    raw_data: dict[str, Any] | None = None


@dataclass
class RentEstimateResult:
    """Standardized rent estimate from any provider."""

    estimate: int  # dollars/month
    low: int | None = None
    high: int | None = None
    comp_count: int = 0
    comps: list[dict[str, Any]] | None = None
    source: str = ""
    raw_data: dict[str, Any] | None = None


@dataclass
class VerificationResult:
    """Result of verifying a value against an external source (Zillow, Redfin)."""

    source: str  # "Zillow" or "Redfin"
    found_value: int | None  # Value found on the site (cents for AVM, dollars for rent)
    expected_value: int  # Value we were comparing against
    diff_pct: float | None = None  # Percentage difference
    match: bool = False  # Within acceptable tolerance (15%)
    error: str | None = None  # Error message if scraping failed


@dataclass
class DataSources:
    """Track source of each data point for attribution on loan details page."""

    property_source: str = "PropertyReach"
    avm_source: str = ""
    avm_verified_by: list[VerificationResult] = field(default_factory=list)
    rent_source: str = ""
    rent_verified_by: list[VerificationResult] = field(default_factory=list)
    premium_avm: AVMResult | None = None  # Clear Capital if DSCR > 0.75
    taxes_source: str = "DataTree"

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON storage in analysis_data."""
        result = {
            "property": self.property_source,
            "avm": self.avm_source,
            "avmVerified": [v.source for v in self.avm_verified_by if v.match],
            "rent": self.rent_source,
            "rentVerified": [v.source for v in self.rent_verified_by if v.match],
            "taxes": self.taxes_source,
        }

        if self.premium_avm:
            result["premiumAvm"] = self.premium_avm.source

        return result

    def get_avm_verification_dict(self) -> dict[str, Any]:
        """Get AVM verification results as dict for analysis_data."""
        return {
            v.source: {
                "value": v.found_value,
                "diffPct": v.diff_pct,
                "match": v.match,
                "error": v.error,
            }
            for v in self.avm_verified_by
        }

    def get_rent_verification_dict(self) -> dict[str, Any]:
        """Get rent verification results as dict for analysis_data."""
        return {
            v.source: {
                "estimate": v.found_value,
                "diffPct": v.diff_pct,
                "match": v.match,
                "error": v.error,
            }
            for v in self.rent_verified_by
        }
