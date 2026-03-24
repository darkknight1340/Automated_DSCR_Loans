"""Application repository."""

from typing import Any

from app.db.connection import query_one


class ApplicationRepository:

    async def create(
        self,
        *,
        borrower_id: str,
        property_id: str,
        lead_id: str | None = None,
        loan_purpose: str = "PURCHASE",
        loan_amount: float,
        loan_term_months: int = 360,
        estimated_value: float | None = None,
        ltv_ratio: float | None = None,
    ) -> dict[str, Any]:
        row = await query_one(
            """
            INSERT INTO loans.applications (
                borrower_id, property_id, lead_id,
                loan_purpose, loan_amount, loan_term_months,
                estimated_value, ltv_ratio, status
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid,
                $4::loan_purpose, $5, $6,
                $7, $8, 'PROSPECT'
            )
            RETURNING *
            """,
            borrower_id, property_id, lead_id,
            loan_purpose, loan_amount, loan_term_months,
            estimated_value, ltv_ratio,
        )
        return dict(row) if row else {}

    async def get_by_id(self, app_id: str) -> dict[str, Any] | None:
        row = await query_one("SELECT * FROM loans.applications WHERE id = $1::uuid", app_id)
        return dict(row) if row else None

    async def update_status(self, app_id: str, status: str) -> None:
        from app.db.connection import execute
        await execute(
            "UPDATE loans.applications SET status = $1::loan_status WHERE id = $2::uuid",
            status, app_id,
        )
