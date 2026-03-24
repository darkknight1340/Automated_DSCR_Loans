"""Leads router — reads from PostgreSQL, falls back to in-memory store."""

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.lead import Lead, LeadCreate, LeadUpdate, LeadStatus, LeadSource
from app.auth import get_current_user, FirebaseUser

router = APIRouter(dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _db_row_to_lead(row: dict[str, Any]) -> dict[str, Any]:
    """Convert a DB row from leads.leads into a camelCase dict for the frontend."""
    analysis = _parse_jsonb(row.get("analysis_data"))
    prop = analysis.get("property", {}) if isinstance(analysis, dict) else {}
    decision = analysis.get("decision", {}) if isinstance(analysis, dict) else {}

    return {
        "id": str(row["id"]),
        "firstName": row.get("first_name", ""),
        "lastName": row.get("last_name", ""),
        "email": row.get("email", "unknown@example.com"),
        "phone": row.get("phone"),
        "status": row.get("status", "NEW"),
        "source": "WEBSITE",
        "score": 0,
        "propertyAddress": prop.get("address") or row.get("property_address"),
        "propertyState": prop.get("state") or row.get("property_state"),
        "estimatedLoanAmount": int(row["requested_amount"] * 100) if row.get("requested_amount") else None,
        "estimatedPropertyValue": int(prop["estimatedValue"] * 100) if prop.get("estimatedValue") else None,
        "estimatedDSCR": _extract_dscr(row),
        "decisionResult": decision.get("result"),
        "createdAt": str(row.get("created_at", datetime.now(timezone.utc))),
        "updatedAt": str(row.get("updated_at", row.get("created_at", datetime.now(timezone.utc)))),
    }


def _map_db_status(status: str) -> LeadStatus:
    """Map DB lead status string to LeadStatus enum."""
    mapping = {
        "NEW": LeadStatus.NEW,
        "CONTACTED": LeadStatus.CONTACTED,
        "QUALIFIED": LeadStatus.QUALIFIED,
        "APPLICATION_STARTED": LeadStatus.APPLICATION_STARTED,
        "CONVERTED": LeadStatus.CONVERTED,
        "DISQUALIFIED": LeadStatus.DISQUALIFIED,
        "DEAD": LeadStatus.DEAD,
    }
    return mapping.get(status, LeadStatus.NEW)


def _parse_jsonb(val: Any) -> Any:
    """Parse a JSONB value that may be a string or already decoded."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, ValueError):
            return val
    return val


def _extract_dscr(row: dict[str, Any]) -> float | None:
    """Pull DSCR ratio from analysis_data JSONB if available."""
    analysis = _parse_jsonb(row.get("analysis_data"))
    if isinstance(analysis, dict):
        dscr = analysis.get("dscr", {})
        return dscr.get("ratio")
    return None


# ---------------------------------------------------------------------------
# Stats endpoint (MUST be before /{lead_id} to avoid path conflict)
# ---------------------------------------------------------------------------

@router.get("/stats")
async def lead_stats() -> dict[str, Any]:
    """Dashboard statistics from DB."""
    try:
        from app.db.repositories import lead_repo, offer_repo, decision_repo
        from app.db.connection import query_one

        total = await lead_repo.count()
        active = await lead_repo.count(status="NEW")

        # Count offers
        offer_row = await query_one("SELECT COUNT(*) as cnt FROM leads.offers")
        offers = offer_row["cnt"] if offer_row else 0

        # Count decisions by result
        approved_row = await query_one(
            "SELECT COUNT(*) as cnt FROM decisioning.decisions WHERE decision_result = 'APPROVED'"
        )
        denied_row = await query_one(
            "SELECT COUNT(*) as cnt FROM decisioning.decisions WHERE decision_result = 'DENIED'"
        )

        return {
            "totalLeads": total,
            "activeLeads": active,
            "applications": total,  # every processed lead gets an application
            "offers": offers,
            "approvals": approved_row["cnt"] if approved_row else 0,
            "rejections": denied_row["cnt"] if denied_row else 0,
        }
    except RuntimeError:
        return {
            "totalLeads": 0,
            "activeLeads": 0,
            "applications": 0,
            "offers": 0,
            "approvals": 0,
            "rejections": 0,
        }


# ---------------------------------------------------------------------------
# List leads
# ---------------------------------------------------------------------------

@router.get("")
async def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: LeadStatus | None = None,
    source: LeadSource | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    """List all leads with pagination and filtering."""
    try:
        from app.db.repositories import lead_repo

        # Map enum status to DB string
        db_status = status.value if status else None

        offset = (page - 1) * page_size
        rows = await lead_repo.list_all(limit=page_size, offset=offset, status=db_status)
        total_count = await lead_repo.count(status=db_status)
        total_pages = (total_count + page_size - 1) // page_size

        leads = [_db_row_to_lead(r) for r in rows]

        return {
            "data": leads,
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "totalCount": total_count,
                "totalPages": total_pages,
            },
        }
    except RuntimeError:
        # DB not available — return empty list
        return {
            "data": [],
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "totalCount": 0,
                "totalPages": 0,
            },
        }


# ---------------------------------------------------------------------------
# Detail endpoint (enriched join across tables)
# ---------------------------------------------------------------------------

@router.get("/{lead_id}/detail")
async def get_lead_detail(lead_id: str) -> dict[str, Any]:
    """Rich lead detail with application, property, decision, offer, and AVM data."""
    try:
        from app.db.repositories import lead_repo

        row = await lead_repo.get_lead_detail(lead_id)
        if not row:
            raise HTTPException(status_code=404, detail="Lead not found")

        # Build structured response
        detail: dict[str, Any] = {
            "id": str(row["id"]),
            "firstName": row.get("first_name", ""),
            "lastName": row.get("last_name", ""),
            "email": row.get("email", ""),
            "phone": row.get("phone"),
            "status": row.get("status", "NEW"),
            "createdAt": str(row.get("created_at", "")),
            "analysisData": _parse_jsonb(row.get("analysis_data")),
        }

        # Application
        if row.get("app_id"):
            detail["application"] = {
                "id": str(row["app_id"]),
                "loanAmount": float(row["app_loan_amount"]) if row.get("app_loan_amount") else None,
                "status": row.get("app_status"),
                "ltvRatio": float(row["ltv_ratio"]) if row.get("ltv_ratio") else None,
                "loanPurpose": row.get("loan_purpose"),
            }

        # Property
        if row.get("prop_id"):
            detail["property"] = {
                "id": str(row["prop_id"]),
                "address": row.get("prop_address"),
                "city": row.get("prop_city"),
                "state": row.get("prop_state"),
                "zip": row.get("prop_zip"),
                "propertyType": row.get("prop_type"),
                "yearBuilt": row.get("year_built"),
                "squareFeet": row.get("square_feet"),
                "bedrooms": row.get("bedrooms"),
                "bathrooms": float(row["bathrooms"]) if row.get("bathrooms") else None,
                "units": row.get("units"),
                "stories": row.get("stories"),
                "pool": row.get("pool"),
                "garageSpaces": row.get("garage_spaces"),
                "estimatedValue": float(row["prop_value"]) if row.get("prop_value") else None,
                "assessedValue": float(row["prop_assessed"]) if row.get("prop_assessed") else None,
                "annualTaxes": float(row["annual_taxes"]) if row.get("annual_taxes") else None,
                "marketMonthlyRent": float(row["market_monthly_rent"]) if row.get("market_monthly_rent") else None,
                "ownerInfo": _parse_jsonb(row.get("owner_info")),
                "existingLoans": _parse_jsonb(row.get("existing_loans")),
            }

        # Decision
        if row.get("decision_result"):
            detail["decision"] = {
                "result": row["decision_result"],
                "summary": row.get("decision_summary"),
                "denialReasons": _parse_jsonb(row.get("denial_reasons")),
                "decidedAt": str(row["decided_at"]) if row.get("decided_at") else None,
            }

        # Offer
        if row.get("offer_token"):
            detail["offer"] = {
                "token": row["offer_token"],
                "status": row.get("offer_status"),
                "url": f"/offer/{row['offer_token']}",
            }

        # AVM
        if row.get("avm_value"):
            detail["avm"] = {
                "value": float(row["avm_value"]),
                "confidence": row.get("avm_confidence"),
            }

        return detail

    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database unavailable")


# ---------------------------------------------------------------------------
# Get single lead
# ---------------------------------------------------------------------------

@router.get("/{lead_id}")
async def get_lead(lead_id: str) -> dict[str, Any]:
    """Get a specific lead by ID."""
    try:
        from app.db.repositories import lead_repo
        row = await lead_repo.get_by_id(lead_id)
        if not row:
            raise HTTPException(status_code=404, detail="Lead not found")
        return _db_row_to_lead(row)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database unavailable")


# ---------------------------------------------------------------------------
# Create lead (kept for API compatibility)
# ---------------------------------------------------------------------------

@router.post("", response_model=Lead, status_code=201)
async def create_lead(lead_data: LeadCreate) -> Lead:
    """Create a new lead."""
    try:
        from app.db.repositories import lead_repo
        row = await lead_repo.create(
            first_name=lead_data.first_name,
            last_name=lead_data.last_name,
            email=lead_data.email,
            phone=lead_data.phone,
            property_address=lead_data.property_address,
            property_state=lead_data.property_state,
            requested_amount=lead_data.estimated_loan_amount / 100 if lead_data.estimated_loan_amount else None,
        )
        return Lead(**_db_row_to_lead(row))
    except RuntimeError:
        # Fallback to in-memory
        now = datetime.now(timezone.utc)
        return Lead(
            id=f"lead-{uuid4().hex[:8]}",
            **lead_data.model_dump(),
            status=LeadStatus.NEW,
            score=50,
            created_at=now,
            updated_at=now,
        )
