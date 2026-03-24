"""Analytics router — real pipeline metrics from DB."""

from typing import Any

from fastapi import APIRouter

router = APIRouter()


@router.get("/funnel")
async def get_funnel_metrics() -> dict[str, Any]:
    """Pipeline funnel: Leads → Applications → Decisions → Approved → Offers."""
    try:
        from app.db.connection import query_one

        leads = (await query_one("SELECT COUNT(*) as cnt FROM leads.leads"))["cnt"]
        applications = (await query_one("SELECT COUNT(*) as cnt FROM loans.applications"))["cnt"]
        properties = (await query_one("SELECT COUNT(*) as cnt FROM loans.properties"))["cnt"]
        decisions = (await query_one("SELECT COUNT(*) as cnt FROM decisioning.decisions"))["cnt"]
        approved = (await query_one(
            "SELECT COUNT(*) as cnt FROM decisioning.decisions WHERE decision_result = 'APPROVED'"
        ))["cnt"]
        referred = (await query_one(
            "SELECT COUNT(*) as cnt FROM decisioning.decisions WHERE decision_result = 'MANUAL_REVIEW'"
        ))["cnt"]
        denied = (await query_one(
            "SELECT COUNT(*) as cnt FROM decisioning.decisions WHERE decision_result = 'DENIED'"
        ))["cnt"]
        offers = (await query_one("SELECT COUNT(*) as cnt FROM leads.offers"))["cnt"]

        def rate(num: int, denom: int) -> float | None:
            return round(num / denom, 4) if denom > 0 else None

        stages = [
            {"stage": "Leads Ingested", "count": leads, "conversionRate": None},
            {"stage": "Applications Created", "count": applications, "conversionRate": rate(applications, leads)},
            {"stage": "Properties Analyzed", "count": properties, "conversionRate": rate(properties, applications)},
            {"stage": "Decisions Made", "count": decisions, "conversionRate": rate(decisions, properties)},
            {"stage": "Approved", "count": approved, "conversionRate": rate(approved, decisions)},
            {"stage": "Offers Sent", "count": offers, "conversionRate": rate(offers, max(approved, 1))},
        ]

        return {
            "stages": stages,
            "overallConversion": rate(offers, leads),
            "decisionBreakdown": {
                "approved": approved,
                "referred": referred,
                "denied": denied,
            },
        }
    except RuntimeError:
        return {
            "stages": [],
            "overallConversion": 0,
            "decisionBreakdown": {"approved": 0, "referred": 0, "denied": 0},
        }


@router.get("/pipeline")
async def get_pipeline_metrics() -> dict[str, Any]:
    """Pipeline volume and breakdown metrics."""
    try:
        from app.db.connection import query, query_one

        # Total volume
        vol_row = await query_one(
            "SELECT COALESCE(SUM(loan_amount), 0) as total FROM loans.applications"
        )
        total_volume = float(vol_row["total"]) if vol_row else 0

        # By loan purpose
        purpose_rows = await query(
            "SELECT loan_purpose, COUNT(*) as cnt, COALESCE(SUM(loan_amount), 0) as vol "
            "FROM loans.applications GROUP BY loan_purpose ORDER BY cnt DESC"
        )
        by_purpose = [
            {
                "purpose": r["loan_purpose"],
                "count": r["cnt"],
                "volume": float(r["vol"]),
            }
            for r in purpose_rows
        ]

        # By decision result
        decision_rows = await query(
            "SELECT decision_result, COUNT(*) as cnt "
            "FROM decisioning.decisions GROUP BY decision_result ORDER BY cnt DESC"
        )
        by_decision = [
            {"result": r["decision_result"], "count": r["cnt"]}
            for r in decision_rows
        ]

        # By application status
        status_rows = await query(
            "SELECT status, COUNT(*) as cnt FROM loans.applications GROUP BY status ORDER BY cnt DESC"
        )
        by_status = [
            {"status": r["status"], "count": r["cnt"]}
            for r in status_rows
        ]

        # Average LTV
        ltv_row = await query_one(
            "SELECT AVG(ltv_ratio) as avg_ltv FROM loans.applications WHERE ltv_ratio IS NOT NULL"
        )
        avg_ltv = round(float(ltv_row["avg_ltv"]) * 100, 1) if ltv_row and ltv_row["avg_ltv"] else None

        # DSCR distribution from analysis_data
        leads_with_dscr = await query(
            "SELECT analysis_data->'dscr'->>'ratio' as dscr "
            "FROM leads.leads WHERE analysis_data IS NOT NULL "
            "AND analysis_data->'dscr'->>'ratio' IS NOT NULL"
        )
        dscr_values = [float(r["dscr"]) for r in leads_with_dscr if r["dscr"]]

        return {
            "totalVolume": total_volume,
            "totalApplications": sum(r["cnt"] for r in status_rows) if status_rows else 0,
            "avgLTV": avg_ltv,
            "avgDSCR": round(sum(dscr_values) / len(dscr_values), 4) if dscr_values else None,
            "byPurpose": by_purpose,
            "byDecision": by_decision,
            "byStatus": by_status,
        }
    except RuntimeError:
        return {
            "totalVolume": 0,
            "totalApplications": 0,
            "avgLTV": None,
            "avgDSCR": None,
            "byPurpose": [],
            "byDecision": [],
            "byStatus": [],
        }
