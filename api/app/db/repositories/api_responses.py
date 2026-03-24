"""API response repository — stores raw API responses for reference."""

import json
from typing import Any

from app.db.connection import query_one, query


class APIResponseRepository:

    async def create(
        self,
        *,
        provider: str,
        endpoint: str,
        request_params: dict | None = None,
        response_data: dict,
        http_status: int | None = None,
        property_id: str | None = None,
        application_id: str | None = None,
        lead_id: str | None = None,
    ) -> dict[str, Any]:
        row = await query_one(
            """
            INSERT INTO enrichment.api_responses (
                provider, endpoint, request_params, response_data,
                http_status, property_id, application_id, lead_id
            ) VALUES (
                $1, $2, $3::jsonb, $4::jsonb,
                $5, $6::uuid, $7::uuid, $8::uuid
            )
            RETURNING *
            """,
            provider, endpoint,
            json.dumps(request_params) if request_params else None,
            json.dumps(response_data),
            http_status,
            property_id, application_id, lead_id,
        )
        return dict(row) if row else {}

    async def get_by_property(
        self, property_id: str, provider: str | None = None
    ) -> list[dict[str, Any]]:
        if provider:
            rows = await query(
                "SELECT * FROM enrichment.api_responses WHERE property_id = $1::uuid AND provider = $2 ORDER BY created_at DESC",
                property_id, provider,
            )
        else:
            rows = await query(
                "SELECT * FROM enrichment.api_responses WHERE property_id = $1::uuid ORDER BY created_at DESC",
                property_id,
            )
        return [dict(r) for r in rows]
