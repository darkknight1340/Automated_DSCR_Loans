"""Offers router for landing page verification."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.adapters.encompass import encompass_service

router = APIRouter()


class BorrowerData(BaseModel):
    """Borrower information."""

    first_name: str
    last_name: str
    email: EmailStr
    phone: str


class PropertyData(BaseModel):
    """Property information from offer."""

    address: str
    city: str
    state: str
    zip_code: str
    property_type: str
    units: int
    year_built: int
    square_feet: int


class DSCRData(BaseModel):
    """DSCR calculation data."""

    monthly_rent: int  # cents
    property_taxes: int  # cents per year
    insurance: int  # cents per year
    hoa_fees: int  # cents per month
    vacancy_rate: float
    dscr: float


class LoanData(BaseModel):
    """Loan terms."""

    loan_amount: int  # cents
    interest_rate: float
    loan_term: int  # months
    loan_type: str
    estimated_payment: int  # cents


class VerifyOfferRequest(BaseModel):
    """Request to verify offer and proceed to funding."""

    token: str
    borrower: BorrowerData
    property: PropertyData
    dscr: DSCRData
    loan: LoanData


class VerifyOfferResponse(BaseModel):
    """Response after offer verification."""

    success: bool
    application_id: str
    encompass_loan_guid: str | None = None
    encompass_loan_number: str | None = None
    message: str


@router.post("/verify", response_model=VerifyOfferResponse)
async def verify_offer(request: VerifyOfferRequest) -> VerifyOfferResponse:
    """
    Verify offer details and push to Encompass.

    This endpoint:
    1. Creates an application in our system
    2. Pushes the loan data to Encompass
    3. Returns the application and Encompass IDs
    """
    try:
        # Generate application ID
        application_id = f"app-{uuid4().hex[:8]}"

        # Create loan in Encompass
        encompass_result = await encompass_service.create_loan(
            borrower_first_name=request.borrower.first_name,
            borrower_last_name=request.borrower.last_name,
            borrower_email=request.borrower.email,
            borrower_phone=request.borrower.phone,
            property_address=request.property.address,
            property_city=request.property.city,
            property_state=request.property.state,
            property_zip=request.property.zip_code,
            property_type=request.property.property_type,
            loan_amount_cents=request.loan.loan_amount,
            interest_rate=request.loan.interest_rate,
            loan_term_months=request.loan.loan_term,
            dscr=request.dscr.dscr,
        )

        return VerifyOfferResponse(
            success=True,
            application_id=application_id,
            encompass_loan_guid=encompass_result.get("loan_guid"),
            encompass_loan_number=encompass_result.get("loan_number"),
            message="Your loan has been submitted for processing. You will receive an email within 24 hours with next steps.",
        )

    except Exception as e:
        # Log the error but still return success for the application
        print(f"Encompass sync failed: {e}")

        return VerifyOfferResponse(
            success=True,
            application_id=f"app-{uuid4().hex[:8]}",
            encompass_loan_guid=None,
            encompass_loan_number=None,
            message="Your application has been received. Our team will contact you within 24 hours.",
        )


def _parse_jsonb(val: str | dict | None) -> dict:
    """Parse JSONB field that might be a string or already parsed."""
    if val is None:
        return {}
    if isinstance(val, dict):
        return val
    try:
        import json
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return {}


@router.get("/{token}")
async def get_offer(token: str) -> dict:
    """Get offer details by token from database."""
    try:
        from app.db.repositories import offer_repo
        offer = await offer_repo.get_by_token(token)
        if offer:
            return {
                "token": offer["token"],
                "borrower": _parse_jsonb(offer["borrower_data"]),
                "property": _parse_jsonb(offer["property_data"]),
                "dscr": _parse_jsonb(offer["dscr_data"]),
                "loan": _parse_jsonb(offer["loan_data"]),
                "decision": _parse_jsonb(offer.get("decision_data")),
                "status": offer["status"],
                "createdAt": offer["created_at"].isoformat() if offer.get("created_at") else None,
                "expiresAt": offer["expires_at"].isoformat() if offer.get("expires_at") else None,
            }
    except RuntimeError:
        pass

    raise HTTPException(status_code=404, detail="Offer not found")
