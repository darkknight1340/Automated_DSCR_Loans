"""
End-to-end pipeline test — runs each stage independently.
Usage: python test_pipeline.py "street" "city" "state" "zip"
Loan amount is determined automatically from existing loans (refinance)
or 75% of property value (cash-out) — matching the real pipeline logic.
"""

import asyncio
import json
import sys
import os

# Load env before any app imports
from dotenv import load_dotenv
load_dotenv()


def pp(label: str, data):
    """Pretty print a stage result."""
    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"{'='*70}")
    if isinstance(data, dict):
        print(json.dumps(data, indent=2, default=str))
    else:
        print(data)
    print()


async def main():
    # Test property — override via CLI: python test_pipeline.py "street" "city" "state" "zip"
    street = sys.argv[1] if len(sys.argv) > 1 else "3449 N Academy Ave"
    city = sys.argv[2] if len(sys.argv) > 2 else "Sanger"
    state = sys.argv[3] if len(sys.argv) > 3 else "CA"
    zip_code = sys.argv[4] if len(sys.argv) > 4 else "93657"

    # Loan amount will be determined from existing loans after PropertyReach
    loan_amount_cents = 0
    loan_purpose = "PURCHASE"  # Will be updated based on loan determination

    print(f"\nTest Property: {street}, {city}, {state} {zip_code}")

    # =========================================================================
    # STAGE 1: PropertyReach
    # =========================================================================
    print("\n\n>>> STAGE 1: PropertyReach - Fetching property data...")
    from app.adapters.propertyreach import property_reach, PropertyReachAddress

    address = PropertyReachAddress(
        street=street,
        city=city,
        state=state,
        zip=zip_code,
    )

    property_data = None
    try:
        report = await property_reach.get_property_report(address)
        if report:
            property_data = {
                "property_type": report.property.characteristics.property_type,
                "year_built": report.property.characteristics.year_built,
                "square_feet": report.property.characteristics.square_feet,
                "lot_size_sqft": report.property.characteristics.lot_size_sqft,
                "bedrooms": report.property.characteristics.bedrooms,
                "bathrooms": report.property.characteristics.bathrooms,
                "stories": report.property.characteristics.stories,
                "units": report.property.characteristics.units,
                "pool": report.property.characteristics.pool,
                "garage_spaces": report.property.characteristics.garage_spaces,
                "assessed_value": report.property.assessment.assessed_value,
                "annual_taxes": report.property.assessment.annual_taxes,
                "estimated_value": report.property.market_value.estimated_value,
                "estimated_equity": report.equity.estimated_equity,
                "monthly_rent_estimate": report.estimated_rent * 100 if report.estimated_rent else int(report.property.market_value.estimated_value * 0.008),
                "is_str": report.str_analysis.is_short_term_rental if report.str_analysis else False,
                "str_monthly_revenue": report.str_analysis.estimated_monthly_revenue if report.str_analysis else None,
                "owner_occupied": report.owner.owner_occupied,
                "ltv": report.equity.ltv_ratio,
            }
            pp("STAGE 1 RESULT: Property Data", property_data)

            # Show owner contacts
            owner_info = []
            for c in report.owner.contacts:
                owner_info.append({
                    "name": c.name,
                    "type": c.owner_type,
                    "phones": c.phones,
                    "emails": c.emails,
                    "deceased": c.deceased,
                })
            owner_info_display = {
                "owner_count": len(report.owner.contacts),
                "owners": owner_info,
                "mailing_address": report.owner.mailing_address,
                "ownership_months": report.owner.ownership_months,
                "ownership_type": report.owner.ownership_type,
            }
            pp("STAGE 1 RESULT: Owner Contacts", owner_info_display)

            # Show existing loans
            loans_display = []
            for m in report.mortgages:
                loans_display.append({
                    "position": m.position,
                    "lender": m.lender_name,
                    "original_amount": m.original_amount / 100,
                    "estimated_balance": m.current_balance / 100 if m.current_balance else None,
                    "rate": f"{m.interest_rate*100:.2f}%" if m.interest_rate else "N/A",
                    "monthly_payment": m.monthly_payment / 100 if m.monthly_payment else None,
                    "loan_type": m.loan_type,
                    "term_months": m.loan_term_months,
                    "due_date": m.due_date,
                    "recording_date": m.recording_date,
                    "flags": m.loan_flags,
                })
            pp("STAGE 1 RESULT: Existing Loans", {"loan_count": len(loans_display), "loans": loans_display})
        else:
            print("  PropertyReach returned no data, using defaults")
    except Exception as e:
        print(f"  PropertyReach error: {e}")

    if not property_data:
        property_data = {
            "property_type": "SFR",
            "estimated_value": 0,
            "annual_taxes": 720000,
            "monthly_rent_estimate": 0,
        }
        pp("STAGE 1 RESULT: Defaults (PropertyReach unavailable)", property_data)

    # =========================================================================
    # STAGE 1c: Determine Loan Amount from Existing Loans
    # =========================================================================
    print("\n>>> STAGE 1c: Determining Loan Amount...")

    # Collect existing_loans from PropertyReach data (in dollars in JSONB)
    existing_loans_raw = []
    if report:
        for m in report.mortgages:
            existing_loans_raw.append({
                "position": m.position,
                "lenderName": m.lender_name,
                "estimatedBalance": m.current_balance / 100 if m.current_balance else None,
                "isActive": m.is_active,
            })

    # Determine loan amount: sum of existing loan balances → RATE_TERM_REFI
    active_loans = [ln for ln in existing_loans_raw if ln.get("isActive") is not False]
    if active_loans:
        total_balance_dollars = sum(ln.get("estimatedBalance") or 0 for ln in active_loans)
        if total_balance_dollars > 0:
            loan_amount_cents = int(total_balance_dollars * 100)  # dollars → cents
            loan_purpose = "RATE_TERM_REFI"
            pp("STAGE 1c RESULT: Loan Amount from Existing Loans", {
                "active_loans": len(active_loans),
                "total_balance": f"${total_balance_dollars:,.0f}",
                "loan_amount_cents": loan_amount_cents,
                "loan_purpose": loan_purpose,
            })

    if not loan_amount_cents and property_data.get("estimated_value"):
        # No existing loans — 75% of property value (cash-out opportunity)
        loan_amount_cents = int(property_data["estimated_value"] * 0.75)
        loan_purpose = "CASH_OUT_REFI"
        pp("STAGE 1c RESULT: Loan Amount from 75% Property Value", {
            "property_value_cents": property_data["estimated_value"],
            "loan_amount_cents": loan_amount_cents,
            "loan_purpose": loan_purpose,
        })

    if not loan_amount_cents:
        loan_amount_cents = 45000000  # $450K fallback
        loan_purpose = "PURCHASE"
        pp("STAGE 1c RESULT: Fallback Loan Amount", {
            "loan_amount_cents": loan_amount_cents,
            "loan_purpose": loan_purpose,
        })

    print(f"  Loan Amount: ${loan_amount_cents/100:,.0f} ({loan_purpose})")

    # =========================================================================
    # STAGE 2: DSCR Calculation
    # =========================================================================
    print("\n>>> STAGE 2: DSCR Calculation...")
    from app.services.dscr import dscr_calculator, DSCRCalculationInput, Money

    monthly_rent = property_data.get("monthly_rent_estimate", 0)
    if not monthly_rent:
        monthly_rent = 350000  # Default $3,500

    annual_taxes = property_data.get("annual_taxes", 720000)
    est_value = property_data.get("estimated_value", 60000000)
    annual_insurance = int(est_value * 0.0035) if est_value else 210000

    try:
        dscr_input = DSCRCalculationInput(
            application_id="test",
            property_id="test",
            gross_monthly_rent=Money(monthly_rent),
            vacancy_rate=0.05,
            annual_property_tax=Money(annual_taxes),
            annual_insurance=Money(annual_insurance),
            loan_amount=Money(loan_amount_cents),
            interest_rate=0.05,  # 5% rate per user
            term_months=360,
        )

        dscr_result = dscr_calculator.calculate(dscr_input)
        dscr_data = {
            "dscr_ratio": round(dscr_result.dscr_ratio, 4),
            "meets_minimum_1.0": dscr_result.dscr_ratio >= 1.0,
            "monthly_rent": monthly_rent / 100,
            "monthly_noi": dscr_result.noi.monthly.amount / 100,
            "monthly_pitia": dscr_result.debt_service.total_pitia.amount / 100,
            "monthly_pi": dscr_result.debt_service.principal_and_interest.amount / 100,
            "loan_amount": loan_amount_cents / 100,
            "interest_rate": "5.00%",
        }
        pp("STAGE 2 RESULT: DSCR Calculation", dscr_data)
    except Exception as e:
        print(f"  DSCR calculation error: {e}")
        import traceback; traceback.print_exc()
        dscr_data = {"dscr_ratio": 0, "meets_minimum_1.0": False}

    # =========================================================================
    # STAGE 3: DataTree AVM
    # =========================================================================
    print("\n>>> STAGE 3: DataTree AVM - Fetching automated valuation...")
    from app.adapters.datatree import datatree_avm, Address as DTAddress

    dt_address = DTAddress(
        street=street,
        city=city,
        state=state,
        zip_code=zip_code,
    )

    avm_data = None
    try:
        avm_result = await datatree_avm.order_avm(dt_address)
        if avm_result.get("success") and avm_result.get("report"):
            report = avm_result["report"]
            avm_data = {
                "estimated_value": report.estimated_value / 100 if report.estimated_value else None,
                "value_low": report.value_low / 100 if report.value_low else None,
                "value_high": report.value_high / 100 if report.value_high else None,
                "confidence_score": report.confidence_score,
                "confidence_level": report.confidence_level.value if report.confidence_level else None,
                "status": report.status,
            }
            pp("STAGE 3 RESULT: DataTree AVM", avm_data)
        else:
            error = avm_result.get("error", {})
            pp("STAGE 3 RESULT: DataTree AVM (no value)", {
                "success": False,
                "error_code": error.get("code"),
                "error_message": error.get("message"),
                "raw_response": avm_result.get("raw_response", "N/A"),
            })
    except Exception as e:
        print(f"  DataTree AVM error: {e}")
        import traceback; traceback.print_exc()

    # =========================================================================
    # STAGE 3b: RentCast Value Estimate (AVM Fallback)
    # =========================================================================
    from app.adapters.rentcast import rentcast_service

    if not avm_data:
        print("\n>>> STAGE 3b: RentCast Value Estimate (DataTree AVM unavailable)...")
        try:
            value_result = await rentcast_service.get_value_estimate(
                address=street, city=city, state=state, zip_code=zip_code,
            )
            if value_result:
                avm_data = {
                    "estimated_value": value_result["estimated_value"],
                    "value_low": value_result.get("value_low"),
                    "value_high": value_result.get("value_high"),
                    "confidence_score": None,
                    "confidence_level": "MEDIUM",
                    "status": "COMPLETED",
                    "source": "RentCast",
                    "property_details": {
                        "property_type": value_result.get("property_type"),
                        "bedrooms": value_result.get("bedrooms"),
                        "bathrooms": value_result.get("bathrooms"),
                        "square_feet": value_result.get("square_feet"),
                        "year_built": value_result.get("year_built"),
                        "last_sale_price": value_result.get("last_sale_price"),
                        "last_sale_date": value_result.get("last_sale_date"),
                    },
                }
                pp("STAGE 3b RESULT: RentCast Value Estimate", avm_data)
        except Exception as e:
            print(f"  RentCast value estimate error: {e}")

    # =========================================================================
    # STAGE 4: RentCast Rental Comps
    # =========================================================================
    print("\n>>> STAGE 4: RentCast - Fetching rental estimate & comps...")
    from app.adapters.rentcast import rentcast_service

    rental_data = None
    try:
        rental_result = await rentcast_service.get_rent_estimate(
            address=street,
            city=city,
            state=state,
            zip_code=zip_code,
            property_type=property_data.get("property_type"),
            bedrooms=property_data.get("bedrooms"),
            bathrooms=property_data.get("bathrooms"),
            square_feet=property_data.get("square_feet"),
            comp_count=5,
        )
        if rental_result:
            rental_data = {
                "rent_estimate": rental_result.rent_estimate,
                "rent_low": rental_result.rent_low,
                "rent_high": rental_result.rent_high,
                "comp_count": rental_result.comp_count,
                "comps": [
                    {
                        "address": c.address,
                        "rent": c.price,
                        "bedrooms": c.bedrooms,
                        "bathrooms": c.bathrooms,
                        "sqft": c.square_feet,
                        "distance_mi": round(c.distance, 2) if c.distance else None,
                        "correlation": round(c.correlation, 4) if c.correlation else None,
                    }
                    for c in rental_result.comps[:5]
                ],
            }
            pp("STAGE 4 RESULT: RentCast Rental Comps", rental_data)
        else:
            print("  RentCast returned no data")
    except Exception as e:
        print(f"  RentCast error: {e}")
        import traceback; traceback.print_exc()

    # =========================================================================
    # STAGE 4b: Recalculate DSCR with real rent estimate + AVM
    # =========================================================================
    if rental_data and rental_data.get("rent_estimate"):
        real_rent_cents = rental_data["rent_estimate"] * 100  # RentCast returns dollars
        real_value = avm_data["estimated_value"] * 100 if avm_data and avm_data.get("estimated_value") else 60000000
        real_annual_taxes = int(real_value * 0.012 / 100)  # ~1.2% of value for CA
        real_annual_insurance = int(real_value * 0.0035 / 100)  # 0.35% of value

        print("\n>>> STAGE 4b: Recalculate DSCR with real RentCast data...")
        try:
            dscr_input2 = DSCRCalculationInput(
                application_id="test",
                property_id="test",
                gross_monthly_rent=Money(real_rent_cents),
                vacancy_rate=0.05,
                annual_property_tax=Money(real_annual_taxes),
                annual_insurance=Money(real_annual_insurance),
                loan_amount=Money(loan_amount_cents),
                interest_rate=0.05,
                term_months=360,
            )
            dscr_result2 = dscr_calculator.calculate(dscr_input2)
            dscr_data = {
                "dscr_ratio": round(dscr_result2.dscr_ratio, 4),
                "meets_minimum_1.0": dscr_result2.dscr_ratio >= 1.0,
                "monthly_rent": real_rent_cents / 100,
                "monthly_noi": dscr_result2.noi.monthly.amount / 100,
                "monthly_pitia": dscr_result2.debt_service.total_pitia.amount / 100,
                "monthly_pi": dscr_result2.debt_service.principal_and_interest.amount / 100,
                "loan_amount": loan_amount_cents / 100,
                "interest_rate": "5.00%",
                "note": "Recalculated with RentCast rent estimate + AVM property value",
            }
            pp("STAGE 4b RESULT: DSCR Recalculated with Real Data", dscr_data)
        except Exception as e:
            print(f"  DSCR recalculation error: {e}")

    # =========================================================================
    # STAGE 5: Decision Engine (Rules + Pricing)
    # =========================================================================
    print("\n>>> STAGE 5: Decision Engine (Rules + Pricing)...")
    from app.services.decision import decision_service
    from app.services.rules import LoanData

    # Use AVM value if available, else PropertyReach estimate
    best_value = None
    if avm_data and avm_data.get("estimated_value"):
        best_value = avm_data["estimated_value"] * 100  # back to cents
    elif property_data.get("estimated_value"):
        best_value = property_data["estimated_value"]

    ltv = 75.0
    if best_value and best_value > 0:
        ltv = (loan_amount_cents / best_value) * 100

    try:
        loan_data_obj = LoanData(
            application_id="test-app-001",
            dscr=dscr_data.get("dscr_ratio", 0),
            ltv=min(ltv, 100.0),
            cltv=min(ltv, 100.0),
            credit_score=720,
            property_type=property_data.get("property_type", "SFR"),
            property_state=state,
            loan_amount=loan_amount_cents,
            loan_purpose=loan_purpose,
            occupancy_type="INVESTMENT",
            units=property_data.get("units", 1),
        )

        decision = decision_service.evaluate(loan_data_obj)

        decision_data = {
            "decision_type": decision.decision_type.value,
            "decision_reason": decision.decision_reason.value,
            "final_rate": decision.final_rate,
            "rules_passed": decision.rules_passed,
            "hard_stops": decision.hard_stops,
            "conditions_count": len(decision.conditions),
            "conditions": [str(c) for c in decision.conditions] if decision.conditions else [],
            "ltv_used": round(ltv, 2),
            "dscr_used": dscr_data.get("dscr_ratio", 0),
            "credit_score": 720,
        }
        pp("STAGE 5 RESULT: Decision Engine", decision_data)
    except Exception as e:
        print(f"  Decision engine error: {e}")
        import traceback; traceback.print_exc()
        decision = None

    # =========================================================================
    # STAGE 6: Rejection Check
    # =========================================================================
    print("\n>>> STAGE 6: Rejection Check...")
    rejection_reasons = []

    # Check underwater: AVM value < loan amount
    final_avm_cents = None
    if avm_data and avm_data.get("estimated_value"):
        final_avm_cents = int(avm_data["estimated_value"] * 100)
        if final_avm_cents < loan_amount_cents:
            rejection_reasons.append(
                f"UNDERWATER: AVM value ${final_avm_cents / 100:,.0f} < loan amount ${loan_amount_cents / 100:,.0f}"
            )

    # Check low DSCR: ratio < 1.0
    final_dscr = dscr_data.get("dscr_ratio", 0)
    if final_dscr < 1.0:
        rejection_reasons.append(
            f"LOW_DSCR: DSCR ratio {final_dscr:.4f} < minimum 1.0"
        )

    if rejection_reasons:
        pp("STAGE 6 RESULT: REJECTED", {
            "rejection_reasons": rejection_reasons,
            "note": "Lead would be rejected and stored in DB with denial reasons",
        })
    else:
        pp("STAGE 6 RESULT: PASSED", {
            "note": "Lead passes rejection checks — proceeds to decision engine",
        })

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n")
    pp("PIPELINE SUMMARY", {
        "property": f"{street}, {city}, {state} {zip_code}",
        "loan_amount": f"${loan_amount_cents/100:,.0f}",
        "loan_purpose": loan_purpose,
        "property_value_propertyreach": f"${property_data.get('estimated_value', 0)/100:,.0f}" if property_data.get("estimated_value") else "N/A",
        "property_value_avm": f"${avm_data['estimated_value']:,.0f}" if avm_data and avm_data.get("estimated_value") else "N/A",
        "rent_estimate_rentcast": f"${rental_data['rent_estimate']:,}/mo" if rental_data else "N/A",
        "dscr_ratio": dscr_data.get("dscr_ratio", "N/A"),
        "ltv": f"{ltv:.1f}%",
        "rejection_reasons": rejection_reasons if rejection_reasons else "NONE (passed)",
        "decision": decision.decision_type.value if decision else ("SKIPPED — rejected" if rejection_reasons else "N/A"),
        "rate": f"{decision.final_rate}%" if decision and decision.final_rate else "N/A",
    })


if __name__ == "__main__":
    asyncio.run(main())
