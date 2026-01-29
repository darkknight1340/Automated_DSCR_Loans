"""
Valuation Service

Handles property valuations through AVMs (Automated Valuation Models)
and traditional appraisals for DSCR loans.

DSCR Valuation Strategy:
- AVM for pre-approval decisioning (fast, low cost)
- Full appraisal for final underwriting (required for most loans)
- AVM cascade: Primary → Secondary → Tertiary vendors
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from app.adapters.datatree import datatree_avm, Address, AVMReport


class ValuationType(str, Enum):
    """Type of valuation."""
    AVM = "AVM"
    DESKTOP_APPRAISAL = "DESKTOP_APPRAISAL"
    DRIVE_BY = "DRIVE_BY"
    FULL_INTERIOR = "FULL_INTERIOR"
    HYBRID = "HYBRID"


class ValuationStatus(str, Enum):
    """Valuation order status."""
    PENDING = "PENDING"
    ORDERED = "ORDERED"
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"


@dataclass
class ValuationOrder:
    """Valuation order."""
    id: str
    application_id: str
    property_id: str
    valuation_type: ValuationType
    status: ValuationStatus
    address: Address
    order_date: datetime
    completed_date: datetime | None = None
    estimated_value: int | None = None  # cents
    vendor_name: str | None = None
    vendor_order_id: str | None = None
    error_message: str | None = None


@dataclass
class AVMCascadeResult:
    """Result of AVM cascade."""
    success: bool
    reports: list[AVMReport] = field(default_factory=list)
    final_value: int | None = None  # cents
    confidence: str | None = None
    vendor_used: str | None = None
    cascade_attempts: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)


class ValuationService:
    """Service for managing property valuations."""

    # AVM vendors in cascade order
    AVM_CASCADE = ["DataTree"]  # Add more vendors here

    async def order_avm(self, application_id: str, address: Address) -> ValuationOrder:
        """Order an AVM valuation with cascade fallback."""
        order = ValuationOrder(
            id=str(uuid4()),
            application_id=application_id,
            property_id=str(uuid4()),
            valuation_type=ValuationType.AVM,
            status=ValuationStatus.ORDERED,
            address=address,
            order_date=datetime.utcnow(),
        )

        # Try cascade
        result = await self._run_avm_cascade(address)

        if result.success and result.final_value:
            order.status = ValuationStatus.COMPLETED
            order.completed_date = datetime.utcnow()
            order.estimated_value = result.final_value
            order.vendor_name = result.vendor_used
        else:
            order.status = ValuationStatus.FAILED
            order.error_message = "; ".join([e.get("message", "") for e in result.errors])

        return order

    async def _run_avm_cascade(self, address: Address) -> AVMCascadeResult:
        """Run AVM cascade through vendors until success."""
        result = AVMCascadeResult(success=False)

        for vendor_name in self.AVM_CASCADE:
            result.cascade_attempts += 1

            if vendor_name == "DataTree":
                avm_result = await datatree_avm.order_avm(address)

                if avm_result.get("success") and avm_result.get("report"):
                    report = avm_result["report"]
                    result.success = True
                    result.reports.append(report)
                    result.final_value = report.estimated_value
                    result.confidence = report.confidence_level.value if report.confidence_level else None
                    result.vendor_used = vendor_name
                    break
                else:
                    result.errors.append(avm_result.get("error", {"message": "Unknown error"}))

        return result

    async def get_valuation(self, order_id: str) -> ValuationOrder | None:
        """Get valuation order by ID."""
        # In production, this would query the database
        return None

    def reconcile_values(
        self,
        avm_value: int,
        appraisal_value: int,
        tolerance: float = 0.10,
    ) -> dict[str, Any]:
        """Reconcile AVM and appraisal values."""
        if appraisal_value == 0:
            return {"reconciled": False, "error": "Appraisal value is zero"}

        variance = (avm_value - appraisal_value) / appraisal_value
        variance_pct = abs(variance * 100)

        return {
            "reconciled": variance_pct <= tolerance * 100,
            "avm_value": avm_value,
            "appraisal_value": appraisal_value,
            "variance_pct": round(variance_pct, 2),
            "variance_direction": "over" if variance > 0 else "under",
            "within_tolerance": variance_pct <= tolerance * 100,
            "recommended_value": appraisal_value,  # Always use appraisal for final
        }


# Export singleton
valuation_service = ValuationService()
