"""Borrower repository."""

from typing import Any

from app.db.connection import query_one


class BorrowerRepository:

    async def create(
        self,
        *,
        first_name: str,
        last_name: str,
        email: str | None = None,
        phone: str | None = None,
        borrower_type: str = "INDIVIDUAL",
    ) -> dict[str, Any]:
        row = await query_one(
            """
            INSERT INTO loans.borrowers (borrower_type, first_name, last_name, email, phone)
            VALUES ($1::borrower_type, $2, $3, $4, $5)
            RETURNING *
            """,
            borrower_type, first_name, last_name, email, phone,
        )
        return dict(row) if row else {}
