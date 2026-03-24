"""Property repository."""

import json
from typing import Any

from app.db.connection import query_one


class PropertyRepository:

    async def create(
        self,
        *,
        address: str,
        city: str,
        state: str,
        zip_code: str,
        property_type: str = "SFR",
        year_built: int | None = None,
        square_feet: int | None = None,
        lot_size_sqft: int | None = None,
        bedrooms: int | None = None,
        bathrooms: float | None = None,
        stories: int | None = None,
        units: int = 1,
        pool: bool = False,
        garage_spaces: int | None = None,
        current_monthly_rent: float | None = None,
        market_monthly_rent: float | None = None,
        is_short_term_rental: bool = False,
        estimated_value: float | None = None,
        assessed_value: float | None = None,
        annual_taxes: float | None = None,
        estimated_equity: float | None = None,
        lot_acres: float | None = None,
        owner_info: list[dict] | None = None,
        existing_loans: list[dict] | None = None,
    ) -> dict[str, Any]:
        row = await query_one(
            """
            INSERT INTO loans.properties (
                address, city, state, zip, property_type,
                year_built, square_feet, lot_size_sqft, bedrooms, bathrooms,
                stories, units, pool, garage_spaces,
                current_monthly_rent, market_monthly_rent, is_short_term_rental,
                estimated_value, assessed_value, annual_taxes, estimated_equity,
                lot_acres, owner_info, existing_loans,
                occupancy_type
            ) VALUES (
                $1, $2, $3, $4, $5::property_type,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14,
                $15, $16, $17,
                $18, $19, $20, $21,
                $22, $23::jsonb, $24::jsonb,
                'INVESTMENT'
            )
            RETURNING *
            """,
            address, city, state, zip_code, property_type,
            year_built, square_feet, lot_size_sqft, bedrooms, bathrooms,
            stories, units, pool, garage_spaces,
            current_monthly_rent, market_monthly_rent, is_short_term_rental,
            estimated_value, assessed_value, annual_taxes, estimated_equity,
            lot_acres,
            json.dumps(owner_info) if owner_info else None,
            json.dumps(existing_loans) if existing_loans else None,
        )
        return dict(row) if row else {}

    async def get_by_id(self, property_id: str) -> dict[str, Any] | None:
        row = await query_one("SELECT * FROM loans.properties WHERE id = $1::uuid", property_id)
        return dict(row) if row else None
