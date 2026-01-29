"""Application and loan models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from app.models.user import User


class ApplicationStatus(str, Enum):
    """Application status."""

    ACTIVE = "ACTIVE"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    WITHDRAWN = "WITHDRAWN"
    SUSPENDED = "SUSPENDED"


class Milestone(str, Enum):
    """Application milestone in the pipeline."""

    # Funnel stages
    LEADS = "LEADS"
    LEADS_VERIFIED = "LEADS_VERIFIED"
    CONTACTED = "CONTACTED"
    REACHED_LANDING = "REACHED_LANDING"
    VERIFIED_INFO = "VERIFIED_INFO"
    FUNDED = "FUNDED"
    # Additional pipeline stages
    STARTED = "STARTED"
    APPLICATION = "APPLICATION"
    PRE_APPROVED = "PRE_APPROVED"
    PROCESSING = "PROCESSING"
    SUBMITTED = "SUBMITTED"
    CONDITIONALLY_APPROVED = "CONDITIONALLY_APPROVED"
    APPROVED = "APPROVED"
    DOCS_OUT = "DOCS_OUT"
    DOCS_BACK = "DOCS_BACK"
    CLEAR_TO_CLOSE = "CLEAR_TO_CLOSE"
    CLOSING = "CLOSING"
    COMPLETION = "COMPLETION"
    DENIED = "DENIED"
    WITHDRAWN = "WITHDRAWN"


class PropertyType(str, Enum):
    """Property type for DSCR loans."""

    SFR = "SFR"
    CONDO = "CONDO"
    TOWNHOUSE = "TOWNHOUSE"
    DUPLEX = "DUPLEX"
    TRIPLEX = "TRIPLEX"
    FOURPLEX = "FOURPLEX"
    MULTIFAMILY_5PLUS = "MULTIFAMILY_5PLUS"


class LoanPurpose(str, Enum):
    """Loan purpose."""

    PURCHASE = "PURCHASE"
    RATE_TERM_REFINANCE = "RATE_TERM_REFINANCE"
    CASH_OUT_REFINANCE = "CASH_OUT_REFINANCE"


class OccupancyType(str, Enum):
    """Occupancy type."""

    INVESTMENT = "INVESTMENT"
    SECOND_HOME = "SECOND_HOME"


class DSCRTier(str, Enum):
    """DSCR tier classification."""

    EXCELLENT = "EXCELLENT"
    GOOD = "GOOD"
    ACCEPTABLE = "ACCEPTABLE"
    MARGINAL = "MARGINAL"
    BELOW_MIN = "BELOW_MIN"


class Property(BaseModel):
    """Property details."""

    address: str
    city: str
    state: str
    zip_code: str
    county: str
    property_type: PropertyType
    units: int = 1
    year_built: int | None = None
    square_feet: int | None = None
    current_value: int | None = None  # cents
    purchase_price: int | None = None  # cents


class LoanTerms(BaseModel):
    """Loan terms."""

    loan_amount_cents: int
    interest_rate: float
    loan_term_months: int
    amortization_months: int
    loan_purpose: LoanPurpose
    occupancy_type: OccupancyType


class DSCRCalculation(BaseModel):
    """DSCR calculation breakdown."""

    gross_rental_income_cents: int
    vacancy_rate: float
    effective_gross_income_cents: int
    annual_taxes_cents: int
    annual_insurance_cents: int
    annual_hoa_cents: int
    flood_insurance_cents: int = 0
    monthly_pitia_cents: int
    monthly_noi_cents: int
    dscr: float
    dscr_tier: DSCRTier


class ConditionCounts(BaseModel):
    """Condition counts summary."""

    total: int
    pending: int
    cleared: int
    waived: int


class Application(BaseModel):
    """Full application model."""

    id: str
    lead_id: str
    encompass_loan_id: str | None = None
    loan_number: str | None = None
    status: ApplicationStatus = ApplicationStatus.ACTIVE
    milestone: Milestone = Milestone.STARTED
    property: Property
    loan_terms: LoanTerms
    dscr_calculation: DSCRCalculation | None = None
    ltv: float | None = None
    cltv: float | None = None
    credit_score: int | None = None
    assigned_lo_id: str
    assigned_lo: User | None = None
    assigned_processor_id: str | None = None
    assigned_processor: User | None = None
    condition_counts: ConditionCounts | None = None
    created_at: datetime
    updated_at: datetime
    milestone_updated_at: datetime

    class Config:
        from_attributes = True
