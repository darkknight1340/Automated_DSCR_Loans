"""Lead repository."""

import json
from typing import Any

from app.db.connection import query, query_one, execute


class LeadRepository:

    async def create(
        self,
        *,
        first_name: str,
        last_name: str,
        email: str,
        phone: str | None = None,
        property_address: str | None = None,
        property_city: str | None = None,
        property_state: str | None = None,
        property_zip: str | None = None,
        requested_amount: float | None = None,
    ) -> dict[str, Any]:
        row = await query_one(
            """
            INSERT INTO leads.leads (
                first_name, last_name, email, phone,
                property_address, property_city, property_state, property_zip,
                requested_amount, status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'NEW')
            RETURNING *
            """,
            first_name, last_name, email, phone,
            property_address, property_city, property_state, property_zip,
            requested_amount,
        )
        return dict(row) if row else {}

    async def get_by_id(self, lead_id: str) -> dict[str, Any] | None:
        row = await query_one("SELECT * FROM leads.leads WHERE id = $1::uuid", lead_id)
        return dict(row) if row else None

    async def list_all(
        self, *, limit: int = 20, offset: int = 0, status: str | None = None
    ) -> list[dict[str, Any]]:
        if status:
            rows = await query(
                "SELECT * FROM leads.leads WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
                status, limit, offset,
            )
        else:
            rows = await query(
                "SELECT * FROM leads.leads ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                limit, offset,
            )
        return [dict(r) for r in rows]

    async def count(self, *, status: str | None = None) -> int:
        if status:
            row = await query_one(
                "SELECT COUNT(*) as cnt FROM leads.leads WHERE status = $1",
                status,
            )
        else:
            row = await query_one("SELECT COUNT(*) as cnt FROM leads.leads")
        return row["cnt"] if row else 0

    async def update_status(self, lead_id: str, status: str) -> None:
        await execute(
            "UPDATE leads.leads SET status = $1 WHERE id = $2::uuid",
            status, lead_id,
        )

    async def update_analysis(self, lead_id: str, analysis: dict) -> None:
        """Store analysis data JSONB on the lead record."""
        await execute(
            "UPDATE leads.leads SET analysis_data = $1::jsonb WHERE id = $2::uuid",
            json.dumps(analysis, default=str), lead_id,
        )

    async def merge_analysis(self, lead_id: str, data: dict) -> None:
        """Merge additional data into existing analysis_data JSONB."""
        await execute(
            """
            UPDATE leads.leads
            SET analysis_data = COALESCE(analysis_data, '{}'::jsonb) || $1::jsonb
            WHERE id = $2::uuid
            """,
            json.dumps(data, default=str), lead_id,
        )

    async def get_lead_detail(self, lead_id: str) -> dict[str, Any] | None:
        """Get enriched lead detail with property, decision, and offer data."""
        row = await query_one(
            """
            SELECT
                l.*,
                a.id AS app_id,
                a.loan_amount AS app_loan_amount,
                a.status AS app_status,
                a.ltv_ratio,
                a.loan_purpose,
                p.id AS prop_id,
                p.address AS prop_address,
                p.city AS prop_city,
                p.state AS prop_state,
                p.zip AS prop_zip,
                p.property_type AS prop_type,
                p.year_built,
                p.square_feet,
                p.bedrooms,
                p.bathrooms,
                p.units,
                p.stories,
                p.pool,
                p.garage_spaces,
                p.estimated_value AS prop_value,
                p.assessed_value AS prop_assessed,
                p.annual_taxes,
                p.market_monthly_rent,
                p.owner_info,
                p.existing_loans,
                d.decision_result,
                d.summary AS decision_summary,
                d.denial_reasons,
                d.decided_at,
                o.token AS offer_token,
                o.status AS offer_status,
                avm.value_estimated AS avm_value,
                avm.confidence_level AS avm_confidence
            FROM leads.leads l
            LEFT JOIN loans.applications a ON a.lead_id = l.id
            LEFT JOIN loans.properties p ON a.property_id = p.id
            LEFT JOIN decisioning.decisions d ON d.application_id = a.id
            LEFT JOIN leads.offers o ON o.lead_id = l.id
            LEFT JOIN enrichment.avm_reports avm ON avm.application_id = a.id
            WHERE l.id = $1::uuid
            ORDER BY d.decided_at DESC NULLS LAST, o.created_at DESC NULLS LAST
            LIMIT 1
            """,
            lead_id,
        )
        return dict(row) if row else None
