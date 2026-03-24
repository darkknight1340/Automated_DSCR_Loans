"""Decision repository."""

import json
from typing import Any
from uuid import uuid4

from app.db.connection import query_one


class DecisionRepository:

    async def create(
        self,
        *,
        application_id: str,
        decision_type: str = "PRE_APPROVAL",
        decision_result: str,
        summary: str,
        conditions_added: int = 0,
        exceptions_noted: dict | None = None,
        denial_reasons: dict | None = None,
    ) -> dict[str, Any]:
        # Map service decision types to DB enum values
        result_map = {
            "APPROVED": "APPROVED",
            "CONDITIONALLY_APPROVED": "APPROVED",
            "REFERRED": "MANUAL_REVIEW",
            "DECLINED": "DENIED",
            "SUSPENDED": "PENDING",
        }
        db_result = result_map.get(decision_result, "PENDING")

        row = await query_one(
            """
            INSERT INTO decisioning.decisions (
                application_id, decision_type, decision_result,
                summary, conditions_added, exceptions_noted, denial_reasons,
                decided_by, decision_authority
            ) VALUES (
                $1::uuid, $2, $3::decision_result,
                $4, $5, $6::jsonb, $7::jsonb,
                'SYSTEM', 'AUTO'
            )
            RETURNING *
            """,
            application_id, decision_type, db_result,
            summary, conditions_added,
            json.dumps(exceptions_noted) if exceptions_noted else None,
            json.dumps(denial_reasons) if denial_reasons else None,
        )
        return dict(row) if row else {}

    async def get_by_application_id(self, application_id: str) -> dict[str, Any] | None:
        row = await query_one(
            "SELECT * FROM decisioning.decisions WHERE application_id = $1::uuid ORDER BY decided_at DESC LIMIT 1",
            application_id,
        )
        return dict(row) if row else None
