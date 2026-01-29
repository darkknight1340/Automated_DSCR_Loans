"""Applications router."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from app.models.application import (
    Application,
    ApplicationStatus,
    Milestone,
    Property,
    PropertyType,
    LoanTerms,
    LoanPurpose,
    OccupancyType,
    DSCRCalculation,
    DSCRTier,
    ConditionCounts,
)
from app.models.common import PaginatedResponse, Pagination

router = APIRouter()

# In-memory storage
_applications_store: dict[str, Application] = {}


def _init_sample_applications() -> None:
    """Initialize sample applications for demo."""
    if _applications_store:
        return

    now = datetime.now(timezone.utc)

    sample_apps = [
        Application(
            id="app-001",
            lead_id="lead-001",
            loan_number="DSCR-2024-001",
            status=ApplicationStatus.ACTIVE,
            milestone=Milestone.PROCESSING,
            property=Property(
                address="123 Investment Ave",
                city="Austin",
                state="TX",
                zip_code="78701",
                county="Travis",
                property_type=PropertyType.SFR,
                units=1,
                year_built=2018,
                square_feet=2200,
                current_value=60000000,
                purchase_price=55000000,
            ),
            loan_terms=LoanTerms(
                loan_amount_cents=45000000,
                interest_rate=7.25,
                loan_term_months=360,
                amortization_months=360,
                loan_purpose=LoanPurpose.PURCHASE,
                occupancy_type=OccupancyType.INVESTMENT,
            ),
            dscr_calculation=DSCRCalculation(
                gross_rental_income_cents=4200000,
                vacancy_rate=0.05,
                effective_gross_income_cents=3990000,
                annual_taxes_cents=720000,
                annual_insurance_cents=180000,
                annual_hoa_cents=0,
                flood_insurance_cents=0,
                monthly_pitia_cents=345000,
                monthly_noi_cents=332500,
                dscr=1.25,
                dscr_tier=DSCRTier.GOOD,
            ),
            ltv=75.0,
            credit_score=720,
            assigned_lo_id="lo-001",
            condition_counts=ConditionCounts(total=12, pending=4, cleared=7, waived=1),
            created_at=now,
            updated_at=now,
            milestone_updated_at=now,
        ),
        Application(
            id="app-002",
            lead_id="lead-004",
            loan_number="DSCR-2024-002",
            status=ApplicationStatus.ACTIVE,
            milestone=Milestone.PRE_APPROVED,
            property=Property(
                address="321 Duplex Dr",
                city="Phoenix",
                state="AZ",
                zip_code="85001",
                county="Maricopa",
                property_type=PropertyType.DUPLEX,
                units=2,
                year_built=2015,
                square_feet=2800,
                current_value=68000000,
                purchase_price=62000000,
            ),
            loan_terms=LoanTerms(
                loan_amount_cents=52000000,
                interest_rate=7.125,
                loan_term_months=360,
                amortization_months=360,
                loan_purpose=LoanPurpose.PURCHASE,
                occupancy_type=OccupancyType.INVESTMENT,
            ),
            dscr_calculation=DSCRCalculation(
                gross_rental_income_cents=5600000,
                vacancy_rate=0.05,
                effective_gross_income_cents=5320000,
                annual_taxes_cents=840000,
                annual_insurance_cents=240000,
                annual_hoa_cents=120000,
                flood_insurance_cents=0,
                monthly_pitia_cents=395000,
                monthly_noi_cents=443333,
                dscr=1.42,
                dscr_tier=DSCRTier.EXCELLENT,
            ),
            ltv=76.5,
            credit_score=745,
            assigned_lo_id="lo-001",
            condition_counts=ConditionCounts(total=8, pending=2, cleared=6, waived=0),
            created_at=now,
            updated_at=now,
            milestone_updated_at=now,
        ),
    ]

    for app in sample_apps:
        _applications_store[app.id] = app


# Initialize on module load
_init_sample_applications()


@router.get("", response_model=PaginatedResponse[Application])
async def list_applications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: ApplicationStatus | None = None,
    milestone: Milestone | None = None,
) -> dict[str, Any]:
    """List all applications with pagination and filtering."""
    apps = list(_applications_store.values())

    # Apply filters
    if status:
        apps = [a for a in apps if a.status == status]
    if milestone:
        apps = [a for a in apps if a.milestone == milestone]

    # Sort by updated_at descending
    apps.sort(key=lambda x: x.updated_at, reverse=True)

    # Paginate
    total_count = len(apps)
    total_pages = (total_count + page_size - 1) // page_size
    start = (page - 1) * page_size
    end = start + page_size
    paginated_apps = apps[start:end]

    return {
        "data": paginated_apps,
        "pagination": Pagination(
            page=page,
            page_size=page_size,
            total_count=total_count,
            total_pages=total_pages,
        ),
    }


@router.get("/{app_id}", response_model=Application)
async def get_application(app_id: str) -> Application:
    """Get a specific application by ID."""
    app = _applications_store.get(app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.post("", response_model=Application, status_code=201)
async def create_application(
    lead_id: str,
    property_data: Property,
    loan_terms: LoanTerms,
) -> Application:
    """Create a new application."""
    now = datetime.now(timezone.utc)
    app = Application(
        id=f"app-{uuid4().hex[:8]}",
        lead_id=lead_id,
        property=property_data,
        loan_terms=loan_terms,
        assigned_lo_id="lo-001",  # Default assignment
        created_at=now,
        updated_at=now,
        milestone_updated_at=now,
    )
    _applications_store[app.id] = app
    return app


@router.patch("/{app_id}/milestone", response_model=Application)
async def update_milestone(app_id: str, milestone: Milestone) -> Application:
    """Update application milestone."""
    app = _applications_store.get(app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    now = datetime.now(timezone.utc)
    updated_app = app.model_copy(
        update={
            "milestone": milestone,
            "updated_at": now,
            "milestone_updated_at": now,
        }
    )
    _applications_store[app_id] = updated_app
    return updated_app
