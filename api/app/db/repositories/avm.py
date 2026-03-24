"""AVM report repository."""

import json
from typing import Any
from uuid import uuid4

from app.db.connection import query_one


class AVMRepository:

    async def create(
        self,
        *,
        property_id: str,
        application_id: str | None = None,
        vendor: str = "DATATREE",
        product_type: str = "PROCISION_POWER",
        value_estimated: float | None = None,
        value_low: float | None = None,
        value_high: float | None = None,
        confidence_score: float | None = None,
        confidence_level: str | None = None,
        status: str = "RECEIVED",
        report_data: dict | None = None,
    ) -> dict[str, Any]:
        order_id = f"avm-{uuid4().hex[:12]}"
        row = await query_one(
            """
            INSERT INTO enrichment.avm_reports (
                property_id, application_id, order_id, vendor, product_type,
                value_estimated, value_low, value_high,
                confidence_score, confidence_level, status, report_data,
                received_at
            ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11, $12::jsonb,
                NOW()
            )
            RETURNING *
            """,
            property_id, application_id, order_id, vendor, product_type,
            value_estimated, value_low, value_high,
            confidence_score, confidence_level, status,
            json.dumps(report_data) if report_data else None,
        )
        return dict(row) if row else {}
