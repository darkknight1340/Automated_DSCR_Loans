"""Valuation router - AVM and appraisal endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.adapters.datatree import Address
from app.services.valuation import valuation_service

router = APIRouter()


class ValuationRequest(BaseModel):
    """Valuation request."""
    application_id: str
    street: str
    city: str
    state: str
    zip_code: str
    unit: str | None = None


class AVMResponse(BaseModel):
    """AVM response."""
    order_id: str
    status: str
    estimated_value: int | None  # cents
    confidence: str | None
    vendor: str | None
    value_low: int | None
    value_high: int | None
    error_message: str | None = None


class ReconciliationRequest(BaseModel):
    """Value reconciliation request."""
    avm_value: int  # cents
    appraisal_value: int  # cents
    tolerance: float = 0.10


class ReconciliationResponse(BaseModel):
    """Value reconciliation response."""
    reconciled: bool
    avm_value: int
    appraisal_value: int
    variance_pct: float
    variance_direction: str
    within_tolerance: bool
    recommended_value: int


@router.post("/avm", response_model=AVMResponse)
async def order_avm(request: ValuationRequest) -> AVMResponse:
    """
    Order an AVM (Automated Valuation Model) for a property.
    Uses cascade logic to try multiple vendors.
    """
    address = Address(
        street=request.street,
        city=request.city,
        state=request.state,
        zip_code=request.zip_code,
        unit=request.unit,
    )

    order = await valuation_service.order_avm(request.application_id, address)

    return AVMResponse(
        order_id=order.id,
        status=order.status.value,
        estimated_value=order.estimated_value,
        confidence=None,  # Would come from the report
        vendor=order.vendor_name,
        value_low=None,
        value_high=None,
        error_message=order.error_message,
    )


@router.get("/avm/{order_id}")
async def get_avm(order_id: str) -> dict:
    """Get AVM order status and results."""
    order = await valuation_service.get_valuation(order_id)

    if not order:
        raise HTTPException(status_code=404, detail="AVM order not found")

    return {
        "order_id": order.id,
        "status": order.status.value,
        "estimated_value": order.estimated_value,
        "vendor": order.vendor_name,
        "order_date": order.order_date.isoformat(),
        "completed_date": order.completed_date.isoformat() if order.completed_date else None,
    }


@router.post("/reconcile", response_model=ReconciliationResponse)
async def reconcile_values(request: ReconciliationRequest) -> ReconciliationResponse:
    """
    Reconcile AVM and appraisal values.
    Returns variance analysis and recommended value.
    """
    result = valuation_service.reconcile_values(
        avm_value=request.avm_value,
        appraisal_value=request.appraisal_value,
        tolerance=request.tolerance,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return ReconciliationResponse(
        reconciled=result["reconciled"],
        avm_value=result["avm_value"],
        appraisal_value=result["appraisal_value"],
        variance_pct=result["variance_pct"],
        variance_direction=result["variance_direction"],
        within_tolerance=result["within_tolerance"],
        recommended_value=result["recommended_value"],
    )
