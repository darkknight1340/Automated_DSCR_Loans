#!/usr/bin/env python3
"""
Fix corrupted dscr data in leads table.

This script:
1. Finds leads with missing dscr fields (ratio, monthlyRent, monthlyPITIA)
2. Recalculates dscr from existing stored property/rent data
3. Merges pitiBreakdown properly
4. Deletes duplicate entries (keeps newest per property address)
"""

import asyncio
import json
import os
import sys

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env file
from dotenv import load_dotenv
load_dotenv()

from app.db.connection import query, execute, init_db, close_db


async def get_leads_with_corrupted_dscr():
    """Find leads where dscr is missing ratio/monthlyRent but has pitiBreakdown."""
    rows = await query("""
        SELECT
            id,
            email,
            property_address,
            property_city,
            property_state,
            analysis_data,
            created_at
        FROM leads.leads
        WHERE analysis_data IS NOT NULL
          AND analysis_data->'dscr' IS NOT NULL
          AND analysis_data->'dscr'->'pitiBreakdown' IS NOT NULL
          AND (
              analysis_data->'dscr'->'ratio' IS NULL
              OR analysis_data->'dscr'->'monthlyRent' IS NULL
          )
        ORDER BY created_at DESC
    """)
    return [dict(r) for r in rows]


def extract_data_from_analysis(analysis_data: dict) -> tuple[dict, dict]:
    """Extract property and rent data from analysis_data."""
    # Get rent from encompassValidation.rentComparison.pipelineRent
    enc_validation = analysis_data.get("encompassValidation", {})
    rent_comparison = enc_validation.get("rentComparison", {})
    rent_estimate = rent_comparison.get("pipelineRent", 0)

    # If no rent in validation, try other sources
    if not rent_estimate:
        rent_data = analysis_data.get("rent", {})
        rent_estimate = rent_data.get("estimate", 0)

    rent_data = {"rent_estimate": rent_estimate}

    # Property data (we mainly need this for reference, PITI comes from pitiBreakdown)
    prop_data = {"estimated_value": 0}

    return prop_data, rent_data


def calculate_dscr_fields(prop_data: dict, rent_data: dict, existing_piti: dict) -> dict:
    """Calculate dscr fields from property and rent data."""
    if not prop_data or not rent_data:
        return None

    # Get rent estimate
    monthly_rent = rent_data.get("rent_estimate") or 0
    if not monthly_rent:
        return None

    # Get PITIA from existing breakdown or calculate
    if existing_piti and existing_piti.get("total"):
        monthly_pitia = existing_piti["total"]
    else:
        # Calculate from components
        pi = existing_piti.get("principal_interest", 0) or 0
        taxes = existing_piti.get("taxes", 0) or 0
        insurance = existing_piti.get("insurance", 0) or 0
        monthly_pitia = pi + taxes + insurance

    if monthly_pitia <= 0:
        return None

    # Calculate DSCR ratio
    ratio = monthly_rent / monthly_pitia

    # Simple DSCR (same as ratio for simple method)
    simple_dscr = ratio

    # NOI method (conservative: 5% vacancy, 8% management)
    vacancy_rate = 0.05
    management_rate = 0.08
    effective_rent = monthly_rent * (1 - vacancy_rate)
    noi = effective_rent * (1 - management_rate)
    noi_dscr = noi / monthly_pitia if monthly_pitia > 0 else 0

    return {
        "ratio": round(ratio, 4),
        "simpleDscr": round(simple_dscr, 4),
        "noiDscr": round(noi_dscr, 4),
        "monthlyRent": round(monthly_rent, 2),
        "monthlyPITIA": round(monthly_pitia, 2),
        "meetsMinimum": ratio >= 1.0,
    }


async def fix_lead_dscr(lead_id: str, analysis_data) -> bool:
    """Fix dscr data for a single lead."""
    # Parse analysis_data if it's a string
    if isinstance(analysis_data, str):
        analysis_data = json.loads(analysis_data)

    # Extract data from analysis_data itself
    prop_data, rent_data = extract_data_from_analysis(analysis_data)

    if not rent_data.get("rent_estimate"):
        print(f"  No rent data found for {lead_id}")
        return False

    # Get existing pitiBreakdown
    existing_dscr = analysis_data.get("dscr", {})
    existing_piti = existing_dscr.get("pitiBreakdown", {})

    # Calculate new dscr fields
    new_dscr_fields = calculate_dscr_fields(prop_data, rent_data, existing_piti)

    if not new_dscr_fields:
        print(f"  Could not calculate dscr for {lead_id}")
        return False

    # Merge with existing (preserve pitiBreakdown)
    merged_dscr = {**new_dscr_fields, "pitiBreakdown": existing_piti}

    # Update analysis_data
    analysis_data["dscr"] = merged_dscr

    # Write back to DB
    await execute(
        "UPDATE leads.leads SET analysis_data = $1::jsonb WHERE id = $2::uuid",
        json.dumps(analysis_data, default=str),
        lead_id
    )

    print(f"  Fixed: ratio={new_dscr_fields['ratio']:.4f}, rent=${new_dscr_fields['monthlyRent']:.0f}, pitia=${new_dscr_fields['monthlyPITIA']:.0f}")
    return True


async def delete_duplicates():
    """Delete duplicate leads, keeping the newest per property address."""
    # Find duplicates
    duplicates = await query("""
        WITH ranked AS (
            SELECT
                id,
                property_address,
                property_city,
                property_state,
                created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY property_address, property_city, property_state
                    ORDER BY created_at DESC
                ) as rn
            FROM leads.leads
            WHERE property_address IS NOT NULL
        )
        SELECT id, property_address, property_city, property_state, created_at
        FROM ranked
        WHERE rn > 1
        ORDER BY property_address, created_at DESC
    """)

    if not duplicates:
        print("\nNo duplicate entries found.")
        return 0

    print(f"\nFound {len(duplicates)} duplicate entries to delete:")
    for dup in duplicates:
        print(f"  - {dup['property_address']}, {dup['property_city']} (created: {dup['created_at']})")

    # Delete them
    ids_to_delete = [str(d['id']) for d in duplicates]

    # Delete related records first (foreign key constraints)
    for lead_id in ids_to_delete:
        # Delete offers
        await execute("DELETE FROM leads.offers WHERE lead_id = $1::uuid", lead_id)

        # Get application IDs
        apps = await query("SELECT id FROM loans.applications WHERE lead_id = $1::uuid", lead_id)
        for app in apps:
            app_id = str(app['id'])
            # Delete decisions
            await execute("DELETE FROM decisioning.decisions WHERE application_id = $1::uuid", app_id)
            # Delete AVM reports
            await execute("DELETE FROM enrichment.avm_reports WHERE application_id = $1::uuid", app_id)

        # Delete applications (this will cascade to properties if set up)
        await execute("DELETE FROM loans.applications WHERE lead_id = $1::uuid", lead_id)

        # Finally delete the lead
        await execute("DELETE FROM leads.leads WHERE id = $1::uuid", lead_id)

    print(f"\nDeleted {len(ids_to_delete)} duplicate entries.")
    return len(ids_to_delete)


async def main():
    print("=" * 60)
    print("DSCR Data Fix Script")
    print("=" * 60)

    # Initialize DB pool
    await init_db()

    try:
        # Step 1: Fix corrupted dscr data
        print("\n[1] Finding leads with corrupted dscr data...")
        corrupted = await get_leads_with_corrupted_dscr()

        if not corrupted:
            print("No corrupted dscr data found.")
        else:
            print(f"Found {len(corrupted)} leads with corrupted dscr data:")
            fixed = 0
            for lead in corrupted:
                print(f"\n- {lead['property_address']}, {lead['property_city']} ({lead['id']})")
                if await fix_lead_dscr(str(lead['id']), lead['analysis_data']):
                    fixed += 1

            print(f"\n[1] Fixed {fixed}/{len(corrupted)} leads.")

        # Step 2: Delete duplicates
        print("\n[2] Checking for duplicate entries...")
        deleted = await delete_duplicates()

        print("\n" + "=" * 60)
        print("DONE")
        print("=" * 60)

    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
