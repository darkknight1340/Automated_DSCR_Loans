"""Property router - property data and valuation endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.adapters.datatree import datatree_property, Address
from app.adapters.propertyreach import property_reach, PropertyReachAddress

router = APIRouter()


class PropertyLookupRequest(BaseModel):
    """Property lookup request."""
    street: str
    city: str
    state: str
    zip_code: str
    unit: str | None = None


class PropertyDataResponse(BaseModel):
    """Combined property data response."""
    address: dict
    characteristics: dict | None = None
    assessment: dict | None = None
    ownership: dict | None = None
    mortgages: list | None = None
    equity: dict | None = None
    str_analysis: dict | None = None
    source: str


@router.post("/lookup", response_model=PropertyDataResponse)
async def lookup_property(request: PropertyLookupRequest) -> PropertyDataResponse:
    """
    Look up property data from available sources.
    Tries PropertyReach first, falls back to DataTree.
    """
    # Try PropertyReach first
    pr_address = PropertyReachAddress(
        street=request.street,
        city=request.city,
        state=request.state,
        zip=request.zip_code,
    )
    pr_report = await property_reach.get_property_report(pr_address)

    if pr_report:
        return PropertyDataResponse(
            address={
                "street": request.street,
                "city": request.city,
                "state": request.state,
                "zip_code": request.zip_code,
            },
            characteristics={
                "property_type": pr_report.property.characteristics.property_type,
                "year_built": pr_report.property.characteristics.year_built,
                "square_feet": pr_report.property.characteristics.square_feet,
                "bedrooms": pr_report.property.characteristics.bedrooms,
                "bathrooms": pr_report.property.characteristics.bathrooms,
                "units": pr_report.property.characteristics.units,
            },
            assessment={
                "assessed_value": pr_report.property.assessment.assessed_value,
                "annual_taxes": pr_report.property.assessment.annual_taxes,
                "tax_year": pr_report.property.assessment.tax_year,
            },
            ownership={
                "names": pr_report.owner.names,
                "owner_type": pr_report.owner.owner_type.value,
                "owner_occupied": pr_report.owner.owner_occupied,
            },
            mortgages=[
                {
                    "position": m.position,
                    "lender": m.lender_name,
                    "original_amount": m.original_amount,
                    "recording_date": m.recording_date,
                }
                for m in pr_report.mortgages
            ],
            equity={
                "estimated_value": pr_report.equity.estimated_value,
                "total_mortgage_balance": pr_report.equity.total_mortgage_balance,
                "estimated_equity": pr_report.equity.estimated_equity,
                "ltv_ratio": pr_report.equity.ltv_ratio,
            },
            str_analysis={
                "is_str": pr_report.str_analysis.is_short_term_rental,
                "confidence": pr_report.str_analysis.confidence,
                "estimated_monthly_revenue": pr_report.str_analysis.estimated_monthly_revenue,
            } if pr_report.str_analysis else None,
            source="PropertyReach",
        )

    # Fall back to DataTree
    dt_address = Address(
        street=request.street,
        city=request.city,
        state=request.state,
        zip_code=request.zip_code,
        unit=request.unit,
    )
    dt_data = await datatree_property.get_property_data(dt_address)

    if dt_data:
        return PropertyDataResponse(
            address=dt_data.address,
            characteristics=dt_data.characteristics,
            assessment=dt_data.assessment,
            ownership=dt_data.ownership,
            mortgages=dt_data.mortgages,
            source="DataTree",
        )

    # No data available
    raise HTTPException(
        status_code=404,
        detail="Property data not available. Configure PROPERTYREACH_API_KEY or DATATREE credentials.",
    )


@router.post("/str-analysis")
async def analyze_str(request: PropertyLookupRequest) -> dict:
    """
    Analyze if property is a short-term rental.
    Returns STR detection results and revenue estimates.
    """
    pr_address = PropertyReachAddress(
        street=request.street,
        city=request.city,
        state=request.state,
        zip=request.zip_code,
    )

    str_analysis = await property_reach.detect_str(pr_address)

    if not str_analysis:
        raise HTTPException(
            status_code=404,
            detail="STR analysis not available. Configure PROPERTYREACH_API_KEY.",
        )

    return {
        "is_short_term_rental": str_analysis.is_short_term_rental,
        "confidence": str_analysis.confidence,
        "platforms": [
            {
                "platform": p.platform.value,
                "listing_url": p.listing_url,
                "nightly_avg_rate": p.nightly_avg_rate,
                "avg_occupancy_rate": p.avg_occupancy_rate,
                "review_count": p.review_count,
                "avg_rating": p.avg_rating,
            }
            for p in str_analysis.platforms
        ],
        "estimated_annual_revenue": str_analysis.estimated_annual_revenue,
        "estimated_monthly_revenue": str_analysis.estimated_monthly_revenue,
    }


@router.post("/dscr-inputs")
async def get_dscr_inputs(
    request: PropertyLookupRequest,
    loan_amount: int,  # cents
    interest_rate: float,
    term_months: int = 360,
) -> dict:
    """
    Get DSCR calculation inputs from property data.
    Combines property assessment data with loan terms.
    """
    pr_address = PropertyReachAddress(
        street=request.street,
        city=request.city,
        state=request.state,
        zip=request.zip_code,
    )

    dscr_inputs = await property_reach.compute_dscr_inputs(
        pr_address,
        loan_amount,
        interest_rate,
        term_months,
    )

    if not dscr_inputs:
        raise HTTPException(
            status_code=404,
            detail="DSCR inputs not available. Configure PROPERTYREACH_API_KEY.",
        )

    return {
        "gross_monthly_rent": dscr_inputs.gross_monthly_rent,
        "monthly_taxes": dscr_inputs.monthly_taxes,
        "monthly_insurance": dscr_inputs.monthly_insurance,
        "monthly_hoa": dscr_inputs.monthly_hoa,
        "is_str": dscr_inputs.is_str,
        "str_monthly_revenue": dscr_inputs.str_monthly_revenue,
        "estimated_pitia": dscr_inputs.estimated_pitia,
        "estimated_dscr": dscr_inputs.estimated_dscr,
    }
