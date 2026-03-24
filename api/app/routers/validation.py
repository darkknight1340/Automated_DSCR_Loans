"""
Pipeline Validation Router

Validates our DSCR pipeline against Encompass loans.
Pulls Encompass data, creates a lead, runs full pipeline, and compares results.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from typing import Any
import logging

from app.adapters.encompass import encompass_client
from app.adapters.propertyreach import PropertyReachAddress
from app.adapters.datatree import datatree_property, Address as DataTreeAddress
from app.services.ingest import ingest_service, ParsedLead
from app.services.dscr import dscr_calculator, DSCRCalculationInput, Money

router = APIRouter()
logger = logging.getLogger(__name__)


def _calculate_piti_breakdown_dict(
    processed: Any,
    prop: dict[str, Any],
    enc: dict[str, Any] | None = None,
    loan_amount_source: str = "Encompass",
    loan_amount_dollars: float | None = None,
) -> dict[str, Any]:
    """Calculate PITI breakdown using forward loan calculation.

    P&I is calculated directly from loan terms (amount, fixed 4.99% rate, 30yr term).
    Taxes from DataTree, Insurance estimated at 0.35% of property value.
    """
    # Defensive: ensure prop is a dict
    if not isinstance(prop, dict):
        prop = {}

    # Use provided loan amount, or get from pipeline/property data
    if loan_amount_dollars is not None:
        loan_amount = loan_amount_dollars
    elif prop.get("total_loan_balance"):
        loan_amount = prop.get("total_loan_balance", 0) / 100  # Convert cents to dollars
    else:
        loan_amount = 0

    # Fixed interest rate for all DSCR calculations
    interest_rate = 4.99  # Fixed rate per business rules
    loan_term_years = 30  # Standard DSCR loan term

    # Get property value for insurance estimate (prefer AVM, fall back to assessed)
    property_value_cents = (
        processed.avm_value or
        prop.get("estimated_value") or
        prop.get("assessed_value") or
        0
    )
    property_value = property_value_cents / 100 if property_value_cents else 0

    # Calculate P&I from loan terms (forward calculation)
    if loan_amount and interest_rate:
        monthly_rate = interest_rate / 100 / 12
        num_payments = loan_term_years * 12
        if monthly_rate > 0:
            monthly_pi = loan_amount * (monthly_rate * (1 + monthly_rate) ** num_payments) / ((1 + monthly_rate) ** num_payments - 1)
        else:
            monthly_pi = loan_amount / num_payments
    else:
        monthly_pi = 0

    # Monthly taxes from DataTree annual taxes
    annual_taxes_cents = prop.get("annual_taxes") or 0
    annual_taxes = annual_taxes_cents / 100
    monthly_taxes = annual_taxes / 12

    # Annual insurance: 0.35% of property value (industry standard)
    annual_insurance = property_value * 0.0035
    monthly_insurance = annual_insurance / 12

    # Total PITIA
    monthly_pitia = monthly_pi + monthly_taxes + monthly_insurance

    if not loan_amount:
        return {
            "principalInterest": None,
            "taxes": None,
            "insurance": None,
            "total": None,
        }

    return {
        # Principal & Interest (calculated from loan terms) - camelCase for frontend
        "principalInterest": round(monthly_pi, 2),
        "principalInterestCalc": f"${loan_amount:,.0f} @ {interest_rate}% for {loan_term_years}yr",

        # Taxes
        "taxes": round(monthly_taxes, 2),
        "taxesCalc": f"${annual_taxes:,.0f}/yr ÷ 12",
        "annualTaxes": round(annual_taxes, 2),

        # Insurance (estimated)
        "insurance": round(monthly_insurance, 2),
        "insuranceCalc": f"0.35% × ${property_value:,.0f} ÷ 12",
        "annualInsurance": round(annual_insurance, 2),

        # Total
        "total": round(monthly_pitia, 2),

        # Loan assumptions
        "loanAmount": loan_amount,
        "interestRate": interest_rate,
        "loanTermYears": loan_term_years,
        "propertyValue": property_value,

        # Source attribution
        "sources": {
            "taxes": "DataTree PropertyDetailReport",
            "insurance": "Estimated (0.35% of property value)",
            "loanTerms": loan_amount_source,
            "propertyValue": "AVM" if processed.avm_value else "Assessed Value",
        },
    }


async def pull_encompass_data(loan_guid: str) -> dict[str, Any]:
    """Pull comprehensive loan data from Encompass for validation."""
    loan = await encompass_client.get_loan(loan_guid)

    # Extended field list for full validation
    fields = await encompass_client.read_fields(loan_guid, [
        # Loan identifiers
        "364",   # Loan number
        "1109",  # Loan amount
        "356",   # Purchase price
        "1014",  # Interest rate
        "353",   # LTV
        "CX.DSCR", "Log.MS.CurrentMilestone",

        # Property address
        "11", "12", "14", "15",  # Street, City, State, Zip

        # Property characteristics
        "1041",  # Property type
        "16",    # Number of units
        "18",    # Year built
        "URLA.X198",  # Living area sqft
        "1974",  # Number of bedrooms
        "URLA.X202",  # Number of bathrooms

        # Valuation
        "1821",  # Appraised value
        "136",   # Estimated value (borrower)

        # PITIA components
        "912",   # Monthly P&I
        "1405",  # Monthly taxes
        "230",   # Monthly insurance
        "736",   # Total PITIA

        # Income/Rent
        "1005",  # Gross rental income (monthly)
        "1007",  # Net rental income

        # Owner/Vesting
        "1869",  # Vesting name
        "37",    # Borrower full name
        "4000",  # Borrower SSN (last 4)

        # Existing liens
        "FL0102",  # First lien balance
        "FL0202",  # Second lien balance
        "VASUMM.X23",  # Total mortgage balance
        "1092",  # Subordinate financing amount
    ])

    def parse_num(val: Any, default: float = 0.0) -> float:
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        try:
            return float(str(val).replace(",", ""))
        except:
            return default

    def parse_int(val: Any, default: int = 0) -> int:
        if val is None:
            return default
        try:
            return int(float(str(val).replace(",", "")))
        except:
            return default

    borrower = loan.get("applications", [{}])[0].get("borrower", {})
    pi = parse_num(fields.get("912"))
    taxes = parse_num(fields.get("1405"))
    insurance = parse_num(fields.get("230"))

    # Calculate implied rent from DSCR
    # Always use calculated PITIA (P+I+T+I) - field 736 often has inconsistent data
    dscr = parse_num(fields.get("CX.DSCR"))
    total_pitia = pi + taxes + insurance
    implied_rent = dscr * total_pitia if dscr > 0 else 0

    return {
        # Identifiers
        "loan_id": fields.get("364") or loan.get("loanIdNumber", ""),
        "loan_guid": loan_guid,
        "milestone": fields.get("Log.MS.CurrentMilestone") or "",

        # Borrower/Owner
        "borrower_name": f"{borrower.get('firstName', '')} {borrower.get('lastName', '')}".strip(),
        "borrower_email": borrower.get("emailAddressText", ""),
        "vesting_name": fields.get("1869") or fields.get("37") or "",

        # Property address
        "property_address": fields.get("11") or "",
        "property_city": fields.get("12") or "",
        "property_state": fields.get("14") or "",
        "property_zip": fields.get("15") or "",

        # Property characteristics
        "property_type": fields.get("1041") or "",
        "units": parse_int(fields.get("16"), 1),
        "year_built": parse_int(fields.get("18")),
        "sqft": parse_int(fields.get("URLA.X198")),
        "bedrooms": parse_int(fields.get("1974")),
        "bathrooms": parse_num(fields.get("URLA.X202")),

        # Loan terms
        "loan_amount": parse_num(fields.get("1109")),
        "interest_rate": parse_num(fields.get("1014")),
        "ltv": parse_num(fields.get("353")),

        # Valuation
        "appraised_value": parse_num(fields.get("1821")),
        "estimated_value": parse_num(fields.get("136")),

        # PITIA
        "monthly_pi": pi,
        "monthly_taxes": taxes,
        "monthly_insurance": insurance,
        "total_pitia": total_pitia,

        # Income/DSCR
        "gross_rental_income": parse_num(fields.get("1005")),
        "net_rental_income": parse_num(fields.get("1007")),
        "dscr": dscr,
        "implied_rent": implied_rent,

        # Existing liens
        "first_lien_balance": parse_num(fields.get("FL0102")),
        "second_lien_balance": parse_num(fields.get("FL0202")),
        "total_lien_balance": parse_num(fields.get("VASUMM.X23")),
        "subordinate_financing": parse_num(fields.get("1092")),
    }


async def run_pipeline_and_persist(enc: dict[str, Any]) -> dict[str, Any]:
    """Run our full pipeline on the property and persist to DB.

    Creates a lead, runs property data fetching, calculates DSCR,
    and persists all results to the database.
    """
    # First, fetch full property data from DataTree (property + liens in ONE call)
    dt_address = DataTreeAddress(
        street=enc["property_address"],
        city=enc["property_city"],
        state=enc["property_state"],
        zip_code=enc["property_zip"],
    )
    dt_report = await datatree_property.get_full_property_data(dt_address)

    # Use lien balance as loan amount (what they actually owe)
    loan_amount_source = "Encompass"  # Default
    if dt_report and dt_report.existing_loans:
        total_lien_balance = sum(
            lien.get("originalAmount", 0) or 0
            for lien in dt_report.existing_loans
        )
        loan_amount_cents = int(total_lien_balance * 100)
        loan_amount_source = "DataTree Liens"
        logger.info(f"Using DataTree lien balance as loan amount: ${total_lien_balance:,.0f}")
    elif dt_report and dt_report.total_loan_balance:
        loan_amount_cents = dt_report.total_loan_balance  # Already in cents
        loan_amount_source = "DataTree"
        logger.info(f"Using DataTree total balance as loan amount: ${loan_amount_cents / 100:,.0f}")
    else:
        # Fall back to Encompass loan amount
        loan_amount_cents = int(enc["loan_amount"] * 100)
        loan_amount_source = "Encompass"
        logger.info(f"No liens found, using Encompass loan amount: ${enc['loan_amount']:,.0f}")

    # Create a ParsedLead from Encompass data
    borrower_parts = enc["borrower_name"].split(" ", 1)
    first_name = borrower_parts[0] if borrower_parts else "Encompass"
    last_name = borrower_parts[1] if len(borrower_parts) > 1 else "Lead"

    parsed_lead = ParsedLead(
        row_number=1,
        first_name=first_name,
        last_name=last_name,
        email=enc["borrower_email"] or f"{enc['loan_id']}@encompass.validation",
        phone=None,
        property_address=enc["property_address"],
        property_city=enc["property_city"],
        property_state=enc["property_state"],
        property_zip=enc["property_zip"],
        loan_amount=loan_amount_cents,
        raw_data={"encompass_guid": enc["loan_guid"], "encompass_loan_id": enc["loan_id"]},
    )

    # Convert DataTree report to property data dict (if we have it)
    prefetched_property_data = None
    if dt_report:
        prefetched_property_data = {
            "property_type": dt_report.property_type or "SFR",
            "year_built": dt_report.year_built,
            "square_feet": dt_report.square_feet,
            "bedrooms": dt_report.bedrooms,
            "bathrooms": dt_report.bathrooms,
            "units": dt_report.units or 1,
            "assessed_value": dt_report.assessed_value,
            "annual_taxes": dt_report.annual_taxes,
            "estimated_value": dt_report.estimated_value,
            "owner_names": dt_report.owner_names or [],
            "mailing_address": dt_report.mailing_address,
            "existing_loans": dt_report.existing_loans or [],
            "total_loan_balance": dt_report.total_loan_balance,
            "mortgage_count": dt_report.mortgage_count,
            "source": "DataTree",
        }

    # Process through full ingest pipeline (persists to DB)
    # Pass pre-fetched property data to avoid duplicate DataTree calls
    processed = await ingest_service._process_lead(
        parsed_lead,
        prefetched_property_data=prefetched_property_data,
    )

    # Calculate simple DSCR using Encompass PITIA for comparison
    # Use monthly_rent which may have been updated by Clear Capital
    rent_estimate = (processed.monthly_rent / 100 if processed.monthly_rent else 0) or processed.rent_estimate or 0
    simple_dscr_enc_pitia = rent_estimate / enc["total_pitia"] if enc["total_pitia"] > 0 else 0

    # Calculate comparison metrics
    dscr_diff = simple_dscr_enc_pitia - enc["dscr"]
    implied_rent = enc.get("implied_rent") or (enc["dscr"] * enc["total_pitia"])

    # Extract pipeline data for comparison (with type conversions)
    prop = processed.property_data or {}
    pipeline_owner = prop.get("owner_names", [""])[0] if prop.get("owner_names") else ""

    # Use Clear Capital AVM if available (premium verification), otherwise use primary AVM
    if processed.data_sources and processed.data_sources.premium_avm:
        pipeline_avm = processed.data_sources.premium_avm.value / 100
        avm_source = processed.data_sources.premium_avm.source
    else:
        pipeline_avm = (processed.avm_value / 100) if processed.avm_value else ((prop.get("estimated_value") or 0) / 100)
        avm_source = processed.avm_source or "RentCast"
    pipeline_sqft = int(prop.get("square_feet") or 0) if prop.get("square_feet") else None
    pipeline_beds = int(prop.get("bedrooms") or 0) if prop.get("bedrooms") else None
    pipeline_baths = float(prop.get("bathrooms") or 0) if prop.get("bathrooms") else None
    pipeline_year = int(prop.get("year_built") or 0) if prop.get("year_built") else None
    pipeline_loans = prop.get("existing_loans", [])
    # Use total_loan_balance from DataTree if available, otherwise sum original amounts
    # Note: DataTree returns original loan amount, Encompass has current balance - these will differ
    pipeline_loan_balance = prop.get("total_loan_balance")
    if pipeline_loan_balance:
        pipeline_loan_balance = pipeline_loan_balance / 100  # Convert from cents to dollars
    else:
        # Fall back to summing original amounts from liens
        pipeline_loan_balance = sum(ln.get("originalAmount", 0) or 0 for ln in pipeline_loans)

    # --- OWNER COMPARISON ---
    enc_owner = (enc.get("vesting_name") or enc.get("borrower_name", "")).upper()
    pipe_owner = pipeline_owner.upper()
    # Check if names have any overlap (partial match)
    owner_match = False
    if enc_owner and pipe_owner:
        enc_parts = set(enc_owner.replace(",", " ").split())
        pipe_parts = set(pipe_owner.replace(",", " ").split())
        common = enc_parts & pipe_parts
        # Match if at least 2 name parts match (first + last) or significant overlap
        owner_match = len(common) >= 2 or (len(common) >= 1 and len(enc_parts) == 1)

    # --- AVM COMPARISON ---
    enc_avm = enc.get("appraised_value") or enc.get("estimated_value") or 0
    avm_diff = pipeline_avm - enc_avm if enc_avm else 0
    avm_diff_pct = (avm_diff / enc_avm * 100) if enc_avm else 0
    avm_match = abs(avm_diff_pct) < 15  # Within 15% tolerance

    # --- RENT COMPARISON ---
    rent_diff = rent_estimate - implied_rent
    rent_diff_pct = (rent_diff / implied_rent * 100) if implied_rent else 0
    rent_match = abs(rent_diff_pct) < 10  # Within 10% tolerance

    # --- PROPERTY CHARACTERISTICS COMPARISON ---
    sqft_match = not enc.get("sqft") or not pipeline_sqft or abs(pipeline_sqft - enc["sqft"]) < 100
    beds_match = not enc.get("bedrooms") or not pipeline_beds or pipeline_beds == enc["bedrooms"]
    baths_match = not enc.get("bathrooms") or not pipeline_baths or abs(pipeline_baths - enc["bathrooms"]) < 0.5
    year_match = not enc.get("year_built") or not pipeline_year or abs(pipeline_year - enc["year_built"]) <= 2
    property_match = sqft_match and beds_match and baths_match and year_match

    # --- LOAN AMOUNT COMPARISON ---
    # Compare DataTree original lien amount vs Encompass loan amount (should match)
    enc_loan_amount = enc.get("loan_amount", 0)
    loan_diff = pipeline_loan_balance - enc_loan_amount if enc_loan_amount else 0
    loan_diff_pct = (loan_diff / enc_loan_amount * 100) if enc_loan_amount else 0
    lien_match = not enc_loan_amount or abs(loan_diff_pct) < 5  # Within 5% tolerance

    # --- DSCR COMPARISON ---
    dscr_match = abs(dscr_diff) < 0.1

    # Store Encompass validation data in lead's analysis
    try:
        from app.db.repositories import lead_repo
        import json as json_module

        # Get existing analysis to preserve dscr fields (ratio, monthlyRent, etc.)
        existing_lead = await lead_repo.get_by_id(processed.lead_id)
        existing_analysis = existing_lead.get("analysis_data") if existing_lead else {}

        # Parse JSON string if needed (handle double-encoding)
        while isinstance(existing_analysis, str):
            try:
                existing_analysis = json_module.loads(existing_analysis) if existing_analysis else {}
            except (json_module.JSONDecodeError, TypeError):
                existing_analysis = {}
                break

        # Ensure we have a dict
        if not isinstance(existing_analysis, dict):
            existing_analysis = {}

        existing_dscr = existing_analysis.get("dscr", {})
        # Handle case where dscr is a string
        if isinstance(existing_dscr, str):
            try:
                existing_dscr = json_module.loads(existing_dscr)
            except (json_module.JSONDecodeError, TypeError):
                existing_dscr = {}
        existing_dscr = existing_dscr if isinstance(existing_dscr, dict) else {}

        # Merge pitiBreakdown into existing dscr (preserves ratio, monthlyRent, etc.)
        merged_dscr = {**existing_dscr, "pitiBreakdown": _calculate_piti_breakdown_dict(processed, prop, enc, loan_amount_source, loan_amount_cents / 100)}

        validation_data = {
            "encompassValidation": {
                # Identifiers
                "loanId": enc["loan_id"],
                "loanGuid": enc["loan_guid"],
                "milestone": enc["milestone"],

                # Loan terms
                "loanAmount": enc["loan_amount"],
                "interestRate": enc["interest_rate"],
                "ltv": enc["ltv"],

                # PITIA
                "monthlyPI": enc["monthly_pi"],
                "monthlyTaxes": enc["monthly_taxes"],
                "monthlyInsurance": enc["monthly_insurance"],
                "totalPITIA": enc["total_pitia"],

                # DSCR Comparison
                "encompassDSCR": enc["dscr"],
                "pipelineDSCR": round(simple_dscr_enc_pitia, 4),
                "dscrDiff": round(dscr_diff, 4),
                "dscrDiffPct": round((dscr_diff / enc["dscr"] * 100) if enc["dscr"] else 0, 2),
                "dscrMatch": dscr_match,

                # Owner Comparison
                "ownerComparison": {
                    "encompassOwner": enc.get("vesting_name") or enc.get("borrower_name"),
                    "pipelineOwner": pipeline_owner,
                    "match": owner_match,
                },

                # AVM Comparison
                "avmComparison": {
                    "encompassValue": enc_avm,
                    "pipelineValue": pipeline_avm,
                    "pipelineSource": avm_source,  # "ClearCapital:ClearAVM" or "RentCast"
                    "diff": round(avm_diff, 0),
                    "diffPct": round(avm_diff_pct, 1),
                    "match": avm_match,
                },

                # Rent Comparison
                "rentComparison": {
                    "encompassImpliedRent": round(implied_rent, 0),
                    "encompassGrossRent": enc.get("gross_rental_income"),
                    "pipelineRent": rent_estimate,
                    "pipelineSource": processed.data_sources.rent_source if processed.data_sources else "RentCast",
                    "diff": round(rent_diff, 0),
                    "diffPct": round(rent_diff_pct, 1),
                    "match": rent_match,
                },

                # Property Characteristics Comparison
                "propertyComparison": {
                    "encompass": {
                        "type": enc.get("property_type"),
                        "sqft": enc.get("sqft"),
                        "bedrooms": enc.get("bedrooms"),
                        "bathrooms": enc.get("bathrooms"),
                        "yearBuilt": enc.get("year_built"),
                        "units": enc.get("units"),
                    },
                    "pipeline": {
                        "type": prop.get("property_type"),
                        "sqft": pipeline_sqft,
                        "bedrooms": pipeline_beds,
                        "bathrooms": pipeline_baths,
                        "yearBuilt": pipeline_year,
                        "units": prop.get("units"),
                    },
                    "match": property_match,
                    "sqftMatch": sqft_match,
                    "bedsMatch": beds_match,
                    "bathsMatch": baths_match,
                    "yearMatch": year_match,
                },

                # Lien/Loan Comparison
                "lienComparison": {
                    "encompassLoanAmount": enc_loan_amount,
                    "encompassTotalBalance": enc_loan_amount,  # For frontend compatibility
                    "pipelineLoanAmount": pipeline_loan_balance,
                    "pipelineTotalBalance": pipeline_loan_balance,  # For frontend compatibility
                    "pipelineLoans": len(pipeline_loans),
                    "diff": round(loan_diff, 0),
                    "diffPct": round(loan_diff_pct, 1),
                    "match": lien_match,
                },

                # Overall Summary
                "summary": {
                    "dscrMatch": dscr_match,
                    "ownerMatch": owner_match,
                    "avmMatch": avm_match,
                    "rentMatch": rent_match,
                    "propertyMatch": property_match,
                    "lienMatch": lien_match,
                    "allMatch": dscr_match and owner_match and avm_match and rent_match and property_match and lien_match,
                    "matchCount": sum([dscr_match, owner_match, avm_match, rent_match, property_match, lien_match]),
                    "totalChecks": 6,
                },
            },
            # Merge PITI breakdown with existing dscr data (preserves ratio, monthlyRent, etc.)
            "dscr": merged_dscr,
        }
        await lead_repo.merge_analysis(processed.lead_id, validation_data)
    except Exception as e:
        logger.warning(f"Failed to store validation data: {e}")

    return {
        # Lead reference for linking
        "lead_id": processed.lead_id,
        "offer_id": processed.offer_id,
        "offer_token": processed.offer_token,

        # Property data from pipeline
        "property_type": processed.property_data.get("property_type") if processed.property_data else None,
        "bedrooms": processed.property_data.get("bedrooms") if processed.property_data else None,
        "bathrooms": processed.property_data.get("bathrooms") if processed.property_data else None,
        "sqft": processed.property_data.get("square_feet") if processed.property_data else None,
        "year_built": processed.property_data.get("year_built") if processed.property_data else None,
        "assessed_value": (processed.property_data.get("assessed_value", 0) / 100) if processed.property_data else None,
        "owner_name": processed.property_data.get("owner_names", [None])[0] if processed.property_data else None,
        "owner_mailing": processed.property_data.get("mailing_address") if processed.property_data else None,

        # Lien/Loan data from pipeline
        "loan_balance": pipeline_loan_balance,
        "loan_count": len(pipeline_loans),

        # Rent data from pipeline
        "rent_estimate": rent_estimate,
        "rent_low": 0,  # Not tracked in ProcessedLead
        "rent_high": 0,
        "comp_count": len(processed.rental_comps) if processed.rental_comps else 0,

        # Comparables from Clear Capital
        "sales_comps": processed.sales_comps,
        "rental_comps": processed.rental_comps,

        # DSCR calculations - use simple DSCR (Rent/PITIA) everywhere (matches Encompass)
        "calculated_dscr": round(simple_dscr_enc_pitia, 4),  # Simple DSCR using Encompass PITIA
        "simple_dscr_pipeline_pitia": round(processed.simple_dscr_ratio or 0, 4),  # Simple DSCR using pipeline PITIA
        "pitia_monthly": (processed.monthly_pitia / 100) if processed.monthly_pitia else 0,
        "simple_dscr_enc_pitia": simple_dscr_enc_pitia,

        # PITI breakdown (from pipeline calculation)
        # PITI breakdown with industry-standard insurance estimate (0.35% of property value)
        "piti_breakdown": _calculate_piti_breakdown_dict(processed, prop, enc, loan_amount_source, loan_amount_cents / 100),

        # AVM
        "avm_value": (processed.avm_value / 100) if processed.avm_value else None,
        "avm_confidence": processed.avm_confidence,

        # Processing status
        "status": processed.status.value,
        "error": processed.error_message,
    }


@router.get("/{loan_guid}")
async def validate_loan(loan_guid: str) -> dict[str, Any]:
    """Validate pipeline against Encompass loan (JSON response).

    Pulls Encompass data, creates a lead in our DB, runs the full pipeline,
    and returns comparison results with a link to the lead detail page.
    """
    try:
        enc = await pull_encompass_data(loan_guid)
        pipe = await run_pipeline_and_persist(enc)

        dscr_diff = pipe["simple_dscr_enc_pitia"] - enc["dscr"]
        dscr_match = abs(dscr_diff) < 0.1

        return {
            "status": "match" if dscr_match else "mismatch",
            "lead_id": pipe["lead_id"],  # For linking to detail page
            "lead_url": f"/leads/{pipe['lead_id']}",
            "loan_url": f"/leads/{pipe['lead_id']}/loan",
            "offer_url": f"/offer/{pipe['offer_token']}" if pipe.get("offer_token") else None,
            "encompass": enc,
            "pipeline": pipe,
            "comparison": {
                "dscr_diff": round(dscr_diff, 3),
                "dscr_diff_pct": round(dscr_diff / enc["dscr"] * 100, 1) if enc["dscr"] else 0,
                "dscr_match": dscr_match,
                "implied_rent": round(enc["dscr"] * enc["total_pitia"], 0),
                "rent_diff": round(pipe["rent_estimate"] - (enc["dscr"] * enc["total_pitia"]), 0),
            },
        }
    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{loan_guid}/html", response_class=HTMLResponse)
async def validate_loan_html(loan_guid: str) -> str:
    """Validate pipeline against Encompass loan (HTML page)."""
    try:
        enc = await pull_encompass_data(loan_guid)
        pipe = await run_pipeline_and_persist(enc)

        dscr_diff = pipe["simple_dscr_enc_pitia"] - enc["dscr"]
        dscr_diff_pct = (dscr_diff / enc["dscr"] * 100) if enc["dscr"] else 0
        dscr_match = abs(dscr_diff) < 0.1

        match_class = "match" if dscr_match else "mismatch"
        match_text = "✓ MATCH" if dscr_match else "✗ MISMATCH"

        # Owner location check
        owner_location = ""
        if pipe["owner_mailing"]:
            mailing_state = pipe["owner_mailing"].get("state", "")
            if mailing_state and mailing_state != enc["property_state"]:
                owner_location = f'<span class="badge badge-success">Investment Property (owner in {mailing_state})</span>'

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Pipeline Validation: {enc["loan_id"]}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; }}
        .header h1 {{ margin: 0 0 10px 0; }}
        .header p {{ margin: 0; opacity: 0.9; }}
        .card {{ background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
        h2 {{ color: #333; margin: 0 0 16px 0; font-size: 18px; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #eee; }}
        th {{ background: #f8f9fa; font-weight: 600; color: #555; }}
        .match {{ color: #28a745; }}
        .mismatch {{ color: #dc3545; }}
        .number {{ font-family: 'SF Mono', Monaco, monospace; }}
        .badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }}
        .badge-success {{ background: #d4edda; color: #155724; }}
        .badge-warning {{ background: #fff3cd; color: #856404; }}
        .badge-info {{ background: #d1ecf1; color: #0c5460; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }}
        .highlight {{ background: #fffbeb; border: 1px solid #fcd34d; }}
        .dscr-box {{ text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px; }}
        .dscr-value {{ font-size: 48px; font-weight: bold; }}
        .dscr-label {{ font-size: 14px; color: #666; margin-top: 8px; }}
        .insight {{ background: #e3f2fd; padding: 16px; border-radius: 8px; margin-top: 16px; }}
        .insight-title {{ font-weight: 600; color: #1565c0; margin-bottom: 8px; }}
        .btn {{ display: inline-block; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-right: 10px; }}
        .btn-primary {{ background: #667eea; color: white; }}
        .btn-secondary {{ background: #f8f9fa; color: #333; border: 1px solid #ddd; }}
        .btn:hover {{ opacity: 0.9; }}
        .actions {{ margin-top: 16px; }}
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>Pipeline Validation Report</h1>
        <p>Loan {enc["loan_id"]} • {enc["property_address"]}, {enc["property_city"]}, {enc["property_state"]} {enc["property_zip"]}</p>
        <div class="actions">
            <a href="http://localhost:3000/leads/{pipe["lead_id"]}/loan" class="btn btn-primary">View Loan Analysis</a>
            <a href="http://localhost:3000/leads/{pipe["lead_id"]}" class="btn btn-secondary">View Lead Details</a>
            {f'<a href="http://localhost:3000/offer/{pipe["offer_token"]}" class="btn btn-secondary">View Offer</a>' if pipe.get("offer_token") else ''}
        </div>
    </div>

    <div class="card highlight">
        <h2>DSCR Comparison <span class="{match_class}" style="font-size: 24px; margin-left: 10px;">{match_text}</span></h2>
        <div class="grid" style="grid-template-columns: repeat(3, 1fr); text-align: center;">
            <div class="dscr-box">
                <div class="dscr-value">{enc["dscr"]:.2f}</div>
                <div class="dscr-label">Encompass DSCR</div>
            </div>
            <div class="dscr-box" style="background: #e8f5e9;">
                <div class="dscr-value {match_class}">{pipe["simple_dscr_enc_pitia"]:.2f}</div>
                <div class="dscr-label">Pipeline DSCR</div>
                <div style="font-size: 12px; color: #666; margin-top: 4px;">(using Encompass PITIA)</div>
            </div>
            <div class="dscr-box">
                <div class="dscr-value {match_class}">{dscr_diff:+.2f}</div>
                <div class="dscr-label">Difference ({dscr_diff_pct:+.1f}%)</div>
            </div>
        </div>
        <div class="insight">
            <div class="insight-title">Key Insight</div>
            Our rent estimate (${pipe["rent_estimate"]:,.0f}/mo) vs Encompass implied rent (${enc["dscr"] * enc["total_pitia"]:,.0f}/mo) = ${pipe["rent_estimate"] - enc["dscr"] * enc["total_pitia"]:+,.0f} difference
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <h2>Loan Summary</h2>
            <table>
                <tr><td>Loan ID</td><td><strong>{enc["loan_id"]}</strong></td></tr>
                <tr><td>Borrower</td><td>{enc["borrower_name"]}</td></tr>
                <tr><td>Milestone</td><td><span class="badge badge-success">{enc["milestone"]}</span></td></tr>
                <tr><td>Loan Amount</td><td class="number">${enc["loan_amount"]:,.0f}</td></tr>
                <tr><td>Interest Rate</td><td class="number">{enc["interest_rate"]}%</td></tr>
                <tr><td>LTV</td><td class="number">{enc["ltv"]:.1f}%</td></tr>
            </table>
        </div>

        <div class="card">
            <h2>Property Details (DataTree)</h2>
            <table>
                <tr><td>Type</td><td>{pipe["property_type"] or "N/A"} {owner_location}</td></tr>
                <tr><td>Beds / Baths</td><td>{pipe["bedrooms"] or "N/A"} / {pipe["bathrooms"] or "N/A"}</td></tr>
                <tr><td>Square Feet</td><td>{f'{pipe["sqft"]:,}' if pipe["sqft"] else "N/A"}</td></tr>
                <tr><td>Year Built</td><td>{pipe["year_built"] or "N/A"}</td></tr>
                <tr><td>Assessed Value</td><td class="number">${pipe["assessed_value"]:,.0f}</td></tr>
                <tr><td>Owner</td><td>{pipe["owner_name"] or "N/A"}</td></tr>
            </table>
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <h2>Monthly Payment (PITIA)</h2>
            <table>
                <tr><th></th><th>Encompass</th><th>Pipeline</th></tr>
                <tr><td>P&I</td><td class="number">${enc["monthly_pi"]:,.2f}</td><td class="number">${pipe["pitia_monthly"] - enc["monthly_taxes"] - enc["monthly_insurance"]:,.2f}</td></tr>
                <tr><td>Taxes</td><td class="number">${enc["monthly_taxes"]:,.2f}</td><td class="number">${enc["monthly_taxes"]:,.2f}</td></tr>
                <tr><td>Insurance</td><td class="number">${enc["monthly_insurance"]:,.2f}</td><td class="number">${enc["monthly_insurance"]:,.2f}</td></tr>
                <tr style="font-weight: bold; background: #f8f9fa;">
                    <td>Total PITIA</td>
                    <td class="number">${enc["total_pitia"]:,.2f}</td>
                    <td class="number">${pipe["pitia_monthly"]:,.2f}</td>
                </tr>
            </table>
        </div>

        <div class="card">
            <h2>Rent Estimate (RentCast)</h2>
            <table>
                <tr><td>Monthly Rent</td><td class="number" style="font-size: 24px; font-weight: bold;">${pipe["rent_estimate"]:,.0f}</td></tr>
                <tr><td>Rent Range</td><td class="number">${pipe["rent_low"]:,.0f} - ${pipe["rent_high"]:,.0f}</td></tr>
                <tr><td>Comparables</td><td>{pipe["comp_count"]} properties</td></tr>
                <tr><td>Encompass Implied Rent</td><td class="number">${enc["dscr"] * enc["total_pitia"]:,.0f}</td></tr>
            </table>
        </div>
    </div>

    <div class="card">
        <h2>DSCR Calculation Methods</h2>
        <table>
            <tr>
                <th>Method</th>
                <th>Formula</th>
                <th>Result</th>
            </tr>
            <tr>
                <td><strong>Simple (Encompass style)</strong></td>
                <td>Rent / PITIA = ${pipe["rent_estimate"]:,.0f} / ${enc["total_pitia"]:,.0f}</td>
                <td class="number"><strong>{pipe["simple_dscr_enc_pitia"]:.3f}</strong></td>
            </tr>
        </table>
    </div>

</div>
</body>
</html>"""
        return html

    except Exception as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
