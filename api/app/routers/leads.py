"""Leads router."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from app.models.lead import Lead, LeadCreate, LeadUpdate, LeadStatus, LeadSource
from app.models.common import PaginatedResponse, Pagination

router = APIRouter()

# In-memory storage (fallback when no database)
_leads_store: dict[str, Lead] = {}


def _init_sample_leads() -> None:
    """Initialize sample leads for demo."""
    if _leads_store:
        return

    sample_leads = [
        Lead(
            id="lead-001",
            first_name="John",
            last_name="Smith",
            email="john.smith@example.com",
            phone="555-123-4567",
            status=LeadStatus.QUALIFIED,
            source=LeadSource.WEBSITE,
            score=85,
            property_address="123 Investment Ave",
            property_state="TX",
            estimated_loan_amount=45000000,  # $450,000
            estimated_property_value=60000000,  # $600,000
            estimated_dscr=1.25,
            utm_source="google",
            utm_medium="cpc",
            utm_campaign="dscr-loans",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
        Lead(
            id="lead-002",
            first_name="Sarah",
            last_name="Johnson",
            email="sarah.j@example.com",
            phone="555-234-5678",
            status=LeadStatus.CONTACTED,
            source=LeadSource.REFERRAL,
            score=72,
            property_address="456 Rental Blvd",
            property_state="FL",
            estimated_loan_amount=32000000,
            estimated_property_value=42500000,
            estimated_dscr=1.18,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
        Lead(
            id="lead-003",
            first_name="Michael",
            last_name="Chen",
            email="m.chen@example.com",
            phone="555-345-6789",
            status=LeadStatus.NEW,
            source=LeadSource.PAID_AD,
            score=65,
            property_address="789 Investor Lane",
            property_state="CA",
            estimated_loan_amount=78000000,
            estimated_property_value=98000000,
            estimated_dscr=1.35,
            utm_source="facebook",
            utm_medium="paid",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
        Lead(
            id="lead-004",
            first_name="Emily",
            last_name="Rodriguez",
            email="emily.r@example.com",
            phone="555-456-7890",
            status=LeadStatus.APPLICATION_STARTED,
            source=LeadSource.BROKER,
            score=92,
            property_address="321 Duplex Dr",
            property_state="AZ",
            estimated_loan_amount=52000000,
            estimated_property_value=68000000,
            estimated_dscr=1.42,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
        Lead(
            id="lead-005",
            first_name="David",
            last_name="Williams",
            email="d.williams@example.com",
            phone="555-567-8901",
            status=LeadStatus.NURTURING,
            source=LeadSource.ORGANIC,
            score=58,
            property_address="654 Condo Court",
            property_state="NV",
            estimated_loan_amount=28000000,
            estimated_property_value=35000000,
            estimated_dscr=1.08,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    ]

    for lead in sample_leads:
        _leads_store[lead.id] = lead


# Initialize on module load
_init_sample_leads()


@router.get("", response_model=PaginatedResponse[Lead])
async def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: LeadStatus | None = None,
    source: LeadSource | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    """List all leads with pagination and filtering."""
    leads = list(_leads_store.values())

    # Apply filters
    if status:
        leads = [l for l in leads if l.status == status]
    if source:
        leads = [l for l in leads if l.source == source]
    if search:
        search_lower = search.lower()
        leads = [
            l
            for l in leads
            if search_lower in l.first_name.lower()
            or search_lower in l.last_name.lower()
            or search_lower in l.email.lower()
        ]

    # Sort by created_at descending
    leads.sort(key=lambda x: x.created_at, reverse=True)

    # Paginate
    total_count = len(leads)
    total_pages = (total_count + page_size - 1) // page_size
    start = (page - 1) * page_size
    end = start + page_size
    paginated_leads = leads[start:end]

    return {
        "data": paginated_leads,
        "pagination": Pagination(
            page=page,
            page_size=page_size,
            total_count=total_count,
            total_pages=total_pages,
        ),
    }


@router.get("/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str) -> Lead:
    """Get a specific lead by ID."""
    lead = _leads_store.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.post("", response_model=Lead, status_code=201)
async def create_lead(lead_data: LeadCreate) -> Lead:
    """Create a new lead."""
    now = datetime.now(timezone.utc)
    lead = Lead(
        id=f"lead-{uuid4().hex[:8]}",
        **lead_data.model_dump(),
        status=LeadStatus.NEW,
        score=50,  # Default score
        created_at=now,
        updated_at=now,
    )
    _leads_store[lead.id] = lead
    return lead


@router.patch("/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, lead_data: LeadUpdate) -> Lead:
    """Update a lead."""
    lead = _leads_store.get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    update_data = lead_data.model_dump(exclude_unset=True)
    updated_lead = lead.model_copy(
        update={
            **update_data,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    _leads_store[lead_id] = updated_lead
    return updated_lead


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(lead_id: str) -> None:
    """Delete a lead."""
    if lead_id not in _leads_store:
        raise HTTPException(status_code=404, detail="Lead not found")
    del _leads_store[lead_id]
