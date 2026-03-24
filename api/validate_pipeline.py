"""
Pipeline Validation Script

Validates our DSCR pipeline against Encompass golden dataset.
For each loan GUID:
1. Pull loan data from Encompass
2. Get property data from DataTree
3. Get rent estimate from RentCast
4. Calculate DSCR using our calculator
5. Compare results and generate report
"""

import asyncio
import os
import json
from dataclasses import dataclass
from typing import Any

# Load env
with open(".env") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ[key] = val

from app.adapters.encompass import encompass_client
from app.adapters.datatree import datatree_property, Address
from app.adapters.rentcast import rentcast_service
from app.services.dscr import dscr_calculator, DSCRCalculationInput, Money


@dataclass
class EncompassData:
    """Data extracted from Encompass."""
    loan_id: str
    loan_guid: str
    borrower_name: str
    property_address: str
    property_city: str
    property_state: str
    property_zip: str
    loan_amount: float
    interest_rate: float
    appraised_value: float
    purchase_price: float
    ltv: float
    monthly_pi: float
    monthly_taxes: float
    monthly_insurance: float
    total_pitia: float
    dscr: float
    milestone: str


@dataclass
class PipelineData:
    """Data from our pipeline."""
    # Property (DataTree)
    property_type: str | None
    bedrooms: int | None
    bathrooms: float | None
    sqft: int | None
    year_built: int | None
    assessed_value: float | None
    owner_name: str | None
    owner_mailing: dict | None

    # Rent (RentCast)
    rent_estimate: float
    rent_low: float
    rent_high: float
    comp_count: int

    # DSCR Calculation (NOI method - conservative)
    calculated_dscr: float
    noi_monthly: float
    pitia_monthly: float
    gross_rent: float
    vacancy_rate: float
    mgmt_fee: float

    # DSCR Simple method (Rent/PITIA - matches Encompass)
    simple_dscr: float
    # DSCR using Encompass PITIA (true comparison)
    simple_dscr_enc_pitia: float


@dataclass
class ValidationResult:
    """Validation comparison result."""
    encompass: EncompassData
    pipeline: PipelineData
    dscr_match: bool
    dscr_diff: float
    dscr_diff_pct: float
    warnings: list[str]


async def pull_encompass_data(loan_guid: str) -> EncompassData:
    """Pull all relevant data from Encompass."""
    print(f"\n[1/4] Pulling Encompass data for {loan_guid}...")

    # Get full loan
    loan = await encompass_client.get_loan(loan_guid)

    # Get specific fields
    fields = await encompass_client.read_fields(loan_guid, [
        "364",   # Loan ID Number
        "1109",  # Loan Amount
        "356",   # Purchase Price
        "1014",  # Interest Rate
        "11",    # Property Street
        "12",    # Property City
        "14",    # Property State
        "15",    # Property Zip
        "4",     # Borrower First Name
        "36",    # Borrower Last Name
        "353",   # LTV
        "1821",  # Appraised Value
        "912",   # Monthly P&I
        "1405",  # Monthly Taxes
        "230",   # Monthly Insurance
        "736",   # Total PITIA
        "CX.DSCR",  # DSCR
        "Log.MS.CurrentMilestone",
    ])

    # Parse values
    def parse_num(val: Any, default: float = 0.0) -> float:
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        try:
            return float(str(val).replace(",", ""))
        except:
            return default

    # Extract borrower name
    borrower = loan.get("applications", [{}])[0].get("borrower", {})
    borrower_name = f"{borrower.get('firstName', '')} {borrower.get('lastName', '')}".strip()

    # Calculate PITIA if not provided
    pi = parse_num(fields.get("912"))
    taxes = parse_num(fields.get("1405"))
    insurance = parse_num(fields.get("230"))
    pitia = parse_num(fields.get("736")) or (pi + taxes + insurance)

    return EncompassData(
        loan_id=fields.get("364") or loan.get("loanIdNumber", ""),
        loan_guid=loan_guid,
        borrower_name=borrower_name,
        property_address=fields.get("11") or "",
        property_city=fields.get("12") or "",
        property_state=fields.get("14") or "",
        property_zip=fields.get("15") or "",
        loan_amount=parse_num(fields.get("1109")),
        interest_rate=parse_num(fields.get("1014")),
        appraised_value=parse_num(fields.get("1821")),
        purchase_price=parse_num(fields.get("356")),
        ltv=parse_num(fields.get("353")),
        monthly_pi=pi,
        monthly_taxes=taxes,
        monthly_insurance=insurance,
        total_pitia=pitia,
        dscr=parse_num(fields.get("CX.DSCR")),
        milestone=fields.get("Log.MS.CurrentMilestone") or "",
    )


async def run_pipeline(enc: EncompassData) -> PipelineData:
    """Run our pipeline on the property."""

    # 2. DataTree - Property Data
    print(f"[2/4] Fetching property data from DataTree...")
    address = Address(
        street=enc.property_address,
        city=enc.property_city,
        state=enc.property_state,
        zip_code=enc.property_zip,
    )

    prop_data = None
    try:
        prop_data = await datatree_property.get_property_report(address)
    except Exception as e:
        print(f"      DataTree error: {e}")

    # 3. RentCast - Rent Estimate
    print(f"[3/4] Fetching rent estimate from RentCast...")
    rent_data = None
    try:
        rent_data = await rentcast_service.get_rent_estimate(
            address=enc.property_address,
            city=enc.property_city,
            state=enc.property_state,
            zip_code=enc.property_zip,
        )
    except Exception as e:
        print(f"      RentCast error: {e}")

    # Extract rent values
    rent_estimate = rent_data.rent_estimate if rent_data else 0
    rent_low = rent_data.rent_low if rent_data else 0
    rent_high = rent_data.rent_high if rent_data else 0
    comp_count = rent_data.comp_count if rent_data else 0

    # 4. Calculate DSCR
    print(f"[4/4] Calculating DSCR...")

    # Use Encompass loan terms + our rent estimate
    # Annual taxes estimate (from Encompass monthly * 12, or DataTree assessed * 0.69%)
    annual_taxes = enc.monthly_taxes * 12 if enc.monthly_taxes else 0
    if not annual_taxes and prop_data and prop_data.assessed_value:
        annual_taxes = (prop_data.assessed_value / 100) * 0.0069  # 0.69% Idaho rate

    # Annual insurance estimate
    annual_insurance = enc.monthly_insurance * 12 if enc.monthly_insurance else 0
    if not annual_insurance and enc.appraised_value:
        annual_insurance = enc.appraised_value * 0.005  # 0.5% estimate

    dscr_input = DSCRCalculationInput(
        application_id=enc.loan_guid,
        property_id=enc.loan_guid,
        gross_monthly_rent=Money(int(rent_estimate * 100)),
        vacancy_rate=0.05,  # 5% default
        annual_property_tax=Money(int(annual_taxes * 100)),
        annual_insurance=Money(int(annual_insurance * 100)),
        loan_amount=Money(int(enc.loan_amount * 100)),
        interest_rate=enc.interest_rate / 100,  # Convert to decimal
        term_months=360,
    )

    result = dscr_calculator.calculate(dscr_input)

    # Calculate simple DSCR (Rent / PITIA) - matches Encompass method
    # Use ENCOMPASS PITIA for apples-to-apples comparison
    pitia = result.debt_service.total_pitia.amount / 100
    simple_dscr = rent_estimate / pitia if pitia > 0 else 0

    # Also calculate using Encompass PITIA directly (for validation)
    encompass_pitia = enc.total_pitia
    simple_dscr_enc_pitia = rent_estimate / encompass_pitia if encompass_pitia > 0 else 0

    return PipelineData(
        # Property
        property_type=prop_data.property_type if prop_data else None,
        bedrooms=prop_data.bedrooms if prop_data else None,
        bathrooms=prop_data.bathrooms if prop_data else None,
        sqft=prop_data.square_feet if prop_data else None,
        year_built=prop_data.year_built if prop_data else None,
        assessed_value=(prop_data.assessed_value / 100) if prop_data and prop_data.assessed_value else None,
        owner_name=prop_data.owner_names[0] if prop_data and prop_data.owner_names else None,
        owner_mailing=prop_data.mailing_address if prop_data else None,

        # Rent
        rent_estimate=rent_estimate,
        rent_low=rent_low,
        rent_high=rent_high,
        comp_count=comp_count,

        # DSCR (NOI method - conservative)
        calculated_dscr=result.dscr_ratio,
        noi_monthly=result.noi.monthly.amount / 100,
        pitia_monthly=result.debt_service.total_pitia.amount / 100,
        gross_rent=rent_estimate,
        vacancy_rate=result.income.vacancy_rate,
        mgmt_fee=dscr_calculator.DEFAULT_MANAGEMENT_FEE_RATE,

        # DSCR Simple (matches Encompass)
        simple_dscr=simple_dscr,
        simple_dscr_enc_pitia=simple_dscr_enc_pitia,
    )


def compare_results(enc: EncompassData, pipe: PipelineData) -> ValidationResult:
    """Compare Encompass vs Pipeline results."""
    warnings = []

    # DSCR comparison using Encompass PITIA (apples-to-apples)
    dscr_diff = pipe.simple_dscr_enc_pitia - enc.dscr
    dscr_diff_pct = (dscr_diff / enc.dscr * 100) if enc.dscr else 0
    dscr_match = abs(dscr_diff) < 0.1  # Within 0.1 tolerance

    if not dscr_match:
        warnings.append(f"DSCR mismatch: Encompass={enc.dscr:.3f}, Pipeline={pipe.simple_dscr_enc_pitia:.3f} (using Encompass PITIA)")

    # Check if rent seems reasonable
    if pipe.rent_estimate and enc.total_pitia:
        implied_rent = enc.dscr * enc.total_pitia
        rent_diff_pct = abs(pipe.rent_estimate - implied_rent) / implied_rent * 100 if implied_rent else 0
        if rent_diff_pct > 10:
            warnings.append(f"Rent estimate differs from Encompass implied rent by {rent_diff_pct:.1f}%")

    # Check owner occupancy
    if pipe.owner_mailing:
        mailing_state = pipe.owner_mailing.get("state", "")
        if mailing_state and mailing_state != enc.property_state:
            warnings.append(f"Investment property confirmed (owner in {mailing_state}, property in {enc.property_state})")

    return ValidationResult(
        encompass=enc,
        pipeline=pipe,
        dscr_match=dscr_match,
        dscr_diff=dscr_diff,
        dscr_diff_pct=dscr_diff_pct,
        warnings=warnings,
    )


def print_report(result: ValidationResult) -> None:
    """Print validation report."""
    enc = result.encompass
    pipe = result.pipeline

    print("\n" + "=" * 80)
    print("                    PIPELINE VALIDATION REPORT")
    print("=" * 80)

    print(f"""
LOAN SUMMARY
{'─' * 80}
Loan ID:        {enc.loan_id}
GUID:           {enc.loan_guid}
Borrower:       {enc.borrower_name}
Property:       {enc.property_address}, {enc.property_city}, {enc.property_state} {enc.property_zip}
Milestone:      {enc.milestone}
""")

    print(f"""
PROPERTY COMPARISON
{'─' * 80}
                          ENCOMPASS              PIPELINE (DataTree)
Property Type             N/A                    {pipe.property_type or 'N/A'}
Beds / Baths              N/A                    {pipe.bedrooms or 'N/A'} / {pipe.bathrooms or 'N/A'}
Square Feet               N/A                    {pipe.sqft or 'N/A':,}
Year Built                N/A                    {pipe.year_built or 'N/A'}
Assessed Value            N/A                    ${pipe.assessed_value:,.0f} if pipe.assessed_value else 'N/A'
Owner                     {enc.borrower_name:20} {pipe.owner_name or 'N/A'}
""")

    print(f"""
VALUATION & LOAN TERMS
{'─' * 80}
                          ENCOMPASS              PIPELINE
Appraised Value           ${enc.appraised_value:,.0f}              N/A
Purchase Price            ${enc.purchase_price:,.0f}              N/A
Loan Amount               ${enc.loan_amount:,.0f}              ${enc.loan_amount:,.0f} (from Encompass)
Interest Rate             {enc.interest_rate}%                 {enc.interest_rate}% (from Encompass)
LTV                       {enc.ltv:.2f}%                {(enc.loan_amount / enc.appraised_value * 100):.2f}%
""")

    print(f"""
MONTHLY PAYMENT (PITIA)
{'─' * 80}
                          ENCOMPASS              PIPELINE
Principal & Interest      ${enc.monthly_pi:,.2f}             ${pipe.pitia_monthly - (enc.monthly_taxes + enc.monthly_insurance):,.2f}
Property Taxes            ${enc.monthly_taxes:,.2f}              ${enc.monthly_taxes:,.2f} (from Encompass)
Insurance                 ${enc.monthly_insurance:,.2f}               ${enc.monthly_insurance:,.2f} (from Encompass)
{'─' * 80}
TOTAL PITIA               ${enc.total_pitia:,.2f}             ${pipe.pitia_monthly:,.2f}
""")

    print(f"""
RENT ESTIMATE
{'─' * 80}
                          ENCOMPASS              PIPELINE (RentCast)
Monthly Rent              (not stored)           ${pipe.rent_estimate:,.0f}
Rent Range                N/A                    ${pipe.rent_low:,.0f} - ${pipe.rent_high:,.0f}
Comparables               N/A                    {pipe.comp_count} properties
""")

    # DSCR comparison with both methods
    match_indicator = "✓ MATCH" if result.dscr_match else "✗ MISMATCH"
    print(f"""
DSCR COMPARISON
{'─' * 80}
                                    ENCOMPASS      PIPELINE       DIFF
Using Encompass PITIA (${enc.total_pitia:,.0f}):
  Rent/PITIA                        {enc.dscr:.3f}          {pipe.simple_dscr_enc_pitia:.3f}          {result.dscr_diff:+.3f} ({result.dscr_diff_pct:+.1f}%)

Using Our PITIA (${pipe.pitia_monthly:,.0f}):
  Rent/PITIA                        N/A            {pipe.simple_dscr:.3f}
  NOI/PITIA (conservative)          N/A            {pipe.calculated_dscr:.3f}

Result: {match_indicator}
""")

    # Our calculation breakdown
    print(f"""
PIPELINE CALCULATION BREAKDOWN
{'─' * 80}
Gross Monthly Rent:       ${pipe.gross_rent:,.0f}
Vacancy Rate:             {pipe.vacancy_rate * 100:.0f}%
Effective Gross Income:   ${pipe.gross_rent * (1 - pipe.vacancy_rate):,.0f}
Management Fee ({pipe.mgmt_fee * 100:.0f}%):       ${pipe.gross_rent * (1 - pipe.vacancy_rate) * pipe.mgmt_fee:,.0f}
Net Operating Income:     ${pipe.noi_monthly:,.0f}
Total PITIA:              ${pipe.pitia_monthly:,.0f}
{'─' * 80}
DSCR = NOI / PITIA = ${pipe.noi_monthly:,.0f} / ${pipe.pitia_monthly:,.0f} = {pipe.calculated_dscr:.3f}
""")

    # Reverse engineer Encompass rent
    if enc.dscr and enc.total_pitia:
        implied_rent = enc.dscr * enc.total_pitia
        print(f"""
REVERSE ENGINEERING ENCOMPASS DSCR
{'─' * 80}
If Encompass uses simple formula: DSCR = Rent / PITIA
Then implied rent = DSCR × PITIA = {enc.dscr:.3f} × ${enc.total_pitia:,.2f} = ${implied_rent:,.0f}/mo

Our RentCast estimate: ${pipe.rent_estimate:,.0f}/mo
Difference: ${pipe.rent_estimate - implied_rent:+,.0f}/mo ({((pipe.rent_estimate - implied_rent) / implied_rent * 100) if implied_rent else 0:+.1f}%)
""")

    # Warnings
    if result.warnings:
        print(f"""
WARNINGS & OBSERVATIONS
{'─' * 80}""")
        for w in result.warnings:
            print(f"• {w}")

    print("\n" + "=" * 80)


def generate_html_report(result: ValidationResult) -> str:
    """Generate HTML report."""
    enc = result.encompass
    pipe = result.pipeline

    match_class = "match" if result.dscr_match else "mismatch"
    match_text = "✓ MATCH" if result.dscr_match else "✗ MISMATCH"

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Pipeline Validation: {enc.loan_id}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .card {{ background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        h1 {{ color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }}
        h2 {{ color: #555; margin-top: 0; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #eee; }}
        th {{ background: #f8f9fa; font-weight: 600; }}
        .match {{ color: #28a745; font-weight: bold; }}
        .mismatch {{ color: #dc3545; font-weight: bold; }}
        .highlight {{ background: #fff3cd; }}
        .number {{ font-family: monospace; }}
        .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; }}
        .badge-success {{ background: #d4edda; color: #155724; }}
        .badge-warning {{ background: #fff3cd; color: #856404; }}
        .badge-danger {{ background: #f8d7da; color: #721c24; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
        @media (max-width: 768px) {{ .grid {{ grid-template-columns: 1fr; }} }}
    </style>
</head>
<body>
<div class="container">
    <h1>Pipeline Validation Report</h1>

    <div class="card">
        <h2>Loan Summary</h2>
        <table>
            <tr><th>Loan ID</th><td>{enc.loan_id}</td></tr>
            <tr><th>GUID</th><td><code>{enc.loan_guid}</code></td></tr>
            <tr><th>Borrower</th><td>{enc.borrower_name}</td></tr>
            <tr><th>Property</th><td>{enc.property_address}, {enc.property_city}, {enc.property_state} {enc.property_zip}</td></tr>
            <tr><th>Milestone</th><td><span class="badge badge-success">{enc.milestone}</span></td></tr>
        </table>
    </div>

    <div class="card highlight">
        <h2>DSCR Comparison <span class="{match_class}">{match_text}</span></h2>
        <table>
            <tr>
                <th>Method</th>
                <th>Encompass</th>
                <th>Pipeline</th>
                <th>Difference</th>
            </tr>
            <tr class="highlight">
                <td><strong>Using Encompass PITIA (${enc.total_pitia:,.0f})</strong></td>
                <td class="number">{enc.dscr:.3f}</td>
                <td class="number">{pipe.simple_dscr_enc_pitia:.3f}</td>
                <td class="number {match_class}">{result.dscr_diff:+.3f} ({result.dscr_diff_pct:+.1f}%)</td>
            </tr>
            <tr>
                <td>Using Pipeline PITIA (${pipe.pitia_monthly:,.0f})</td>
                <td class="number">N/A</td>
                <td class="number">{pipe.simple_dscr:.3f}</td>
                <td>-</td>
            </tr>
            <tr>
                <td>NOI Method (conservative)</td>
                <td class="number">N/A</td>
                <td class="number">{pipe.calculated_dscr:.3f}</td>
                <td>Includes 5% vacancy, 8% mgmt</td>
            </tr>
        </table>
        <p style="margin-top: 10px; font-size: 14px; color: #666;">
            <strong>Key insight:</strong> Our rent estimate (${pipe.rent_estimate:,.0f}) with Encompass PITIA gives DSCR of {pipe.simple_dscr_enc_pitia:.3f}.<br>
            Encompass implied rent = ${enc.dscr * enc.total_pitia:,.0f}/mo (based on DSCR={enc.dscr:.3f} × PITIA=${enc.total_pitia:,.0f})
        </p>
    </div>

    <div class="grid">
        <div class="card">
            <h2>Property Data</h2>
            <table>
                <tr><th></th><th>Encompass</th><th>Pipeline (DataTree)</th></tr>
                <tr><td>Property Type</td><td>N/A</td><td>{pipe.property_type or 'N/A'}</td></tr>
                <tr><td>Beds / Baths</td><td>N/A</td><td>{pipe.bedrooms or 'N/A'} / {pipe.bathrooms or 'N/A'}</td></tr>
                <tr><td>Square Feet</td><td>N/A</td><td>{f'{pipe.sqft:,}' if pipe.sqft else 'N/A'}</td></tr>
                <tr><td>Year Built</td><td>N/A</td><td>{pipe.year_built or 'N/A'}</td></tr>
                <tr><td>Owner</td><td>{enc.borrower_name}</td><td>{pipe.owner_name or 'N/A'}</td></tr>
            </table>
        </div>

        <div class="card">
            <h2>Valuation & Loan</h2>
            <table>
                <tr><th></th><th>Encompass</th><th>Pipeline</th></tr>
                <tr><td>Appraised Value</td><td class="number">${enc.appraised_value:,.0f}</td><td>N/A</td></tr>
                <tr><td>Purchase Price</td><td class="number">${enc.purchase_price:,.0f}</td><td>N/A</td></tr>
                <tr><td>Loan Amount</td><td class="number">${enc.loan_amount:,.0f}</td><td class="number">${enc.loan_amount:,.0f}</td></tr>
                <tr><td>Interest Rate</td><td class="number">{enc.interest_rate}%</td><td class="number">{enc.interest_rate}%</td></tr>
                <tr><td>LTV</td><td class="number">{enc.ltv:.2f}%</td><td class="number">{(enc.loan_amount / enc.appraised_value * 100):.2f}%</td></tr>
            </table>
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <h2>Monthly Payment (PITIA)</h2>
            <table>
                <tr><th></th><th>Encompass</th><th>Pipeline</th></tr>
                <tr><td>P&I</td><td class="number">${enc.monthly_pi:,.2f}</td><td class="number">${pipe.pitia_monthly - enc.monthly_taxes - enc.monthly_insurance:,.2f}</td></tr>
                <tr><td>Taxes</td><td class="number">${enc.monthly_taxes:,.2f}</td><td class="number">${enc.monthly_taxes:,.2f}</td></tr>
                <tr><td>Insurance</td><td class="number">${enc.monthly_insurance:,.2f}</td><td class="number">${enc.monthly_insurance:,.2f}</td></tr>
                <tr style="font-weight: bold; background: #f8f9fa;">
                    <td>Total PITIA</td>
                    <td class="number">${enc.total_pitia:,.2f}</td>
                    <td class="number">${pipe.pitia_monthly:,.2f}</td>
                </tr>
            </table>
        </div>

        <div class="card">
            <h2>Rent Estimate (RentCast)</h2>
            <table>
                <tr><th></th><th>Encompass</th><th>Pipeline</th></tr>
                <tr><td>Monthly Rent</td><td>(not stored)</td><td class="number">${pipe.rent_estimate:,.0f}</td></tr>
                <tr><td>Rent Range</td><td>N/A</td><td class="number">${pipe.rent_low:,.0f} - ${pipe.rent_high:,.0f}</td></tr>
                <tr><td>Comparables</td><td>N/A</td><td>{pipe.comp_count} properties</td></tr>
                <tr><td>Implied Rent (from Encompass DSCR)</td><td class="number">${enc.dscr * enc.total_pitia:,.0f}</td><td>-</td></tr>
            </table>
        </div>
    </div>

    <div class="card">
        <h2>Pipeline Calculation Breakdown</h2>
        <table>
            <tr><td>Gross Monthly Rent</td><td class="number">${pipe.gross_rent:,.0f}</td></tr>
            <tr><td>Vacancy Rate</td><td class="number">{pipe.vacancy_rate * 100:.0f}%</td></tr>
            <tr><td>Effective Gross Income</td><td class="number">${pipe.gross_rent * (1 - pipe.vacancy_rate):,.0f}</td></tr>
            <tr><td>Management Fee ({pipe.mgmt_fee * 100:.0f}%)</td><td class="number">${pipe.gross_rent * (1 - pipe.vacancy_rate) * pipe.mgmt_fee:,.0f}</td></tr>
            <tr><td>Net Operating Income</td><td class="number">${pipe.noi_monthly:,.0f}</td></tr>
            <tr><td>Total PITIA</td><td class="number">${pipe.pitia_monthly:,.0f}</td></tr>
            <tr style="font-weight: bold; background: #e3f2fd;">
                <td>DSCR (NOI / PITIA)</td>
                <td class="number">{pipe.calculated_dscr:.3f}</td>
            </tr>
            <tr style="font-weight: bold; background: #fff3cd;">
                <td>DSCR Simple (Rent / PITIA)</td>
                <td class="number">{pipe.simple_dscr:.3f}</td>
            </tr>
        </table>
    </div>

    {"<div class='card'><h2>Warnings & Observations</h2><ul>" + "".join(f"<li>{w}</li>" for w in result.warnings) + "</ul></div>" if result.warnings else ""}

</div>
</body>
</html>"""
    return html


async def validate_loan(loan_guid: str, save_html: bool = True) -> ValidationResult:
    """Main validation function for a single loan."""
    print(f"\n{'=' * 80}")
    print(f"VALIDATING LOAN: {loan_guid}")
    print(f"{'=' * 80}")

    # Pull Encompass data
    enc = await pull_encompass_data(loan_guid)

    # Run our pipeline
    pipe = await run_pipeline(enc)

    # Compare results
    result = compare_results(enc, pipe)

    # Print report
    print_report(result)

    # Save HTML report
    if save_html:
        html = generate_html_report(result)
        filename = f"validation_report_{enc.loan_id.replace('-', '_')}.html"
        with open(filename, "w") as f:
            f.write(html)
        print(f"\n📄 HTML report saved: {filename}")

    return result


async def main():
    """Main entry point."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python validate_pipeline.py <loan_guid>")
        print("Example: python validate_pipeline.py 6c2ce013-55b5-4225-a5f7-eba070db2b0b")
        sys.exit(1)

    loan_guid = sys.argv[1]
    await validate_loan(loan_guid)


if __name__ == "__main__":
    asyncio.run(main())
