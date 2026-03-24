"""Offer repository."""

import json
from typing import Any

from app.db.connection import query, query_one, execute


class OfferRepository:

    async def create(
        self,
        *,
        token: str,
        lead_id: str | None = None,
        application_id: str | None = None,
        borrower_data: dict,
        property_data: dict,
        dscr_data: dict,
        loan_data: dict,
        decision_data: dict | None = None,
    ) -> dict[str, Any]:
        row = await query_one(
            """
            INSERT INTO leads.offers (
                token, lead_id, application_id,
                borrower_data, property_data, dscr_data, loan_data, decision_data,
                status
            ) VALUES (
                $1, $2::uuid, $3::uuid,
                $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb,
                'PENDING'
            )
            RETURNING *
            """,
            token, lead_id, application_id,
            json.dumps(borrower_data), json.dumps(property_data),
            json.dumps(dscr_data), json.dumps(loan_data),
            json.dumps(decision_data) if decision_data else None,
        )
        return dict(row) if row else {}

    async def get_by_token(self, token: str) -> dict[str, Any] | None:
        row = await query_one(
            "SELECT * FROM leads.offers WHERE token = $1",
            token,
        )
        return dict(row) if row else None

    async def list_all(self, *, limit: int = 50) -> list[dict[str, Any]]:
        rows = await query(
            "SELECT * FROM leads.offers ORDER BY created_at DESC LIMIT $1",
            limit,
        )
        return [dict(r) for r in rows]

    async def update_status(self, token: str, status: str) -> None:
        await execute(
            "UPDATE leads.offers SET status = $1, verified_at = NOW() WHERE token = $2",
            status, token,
        )
