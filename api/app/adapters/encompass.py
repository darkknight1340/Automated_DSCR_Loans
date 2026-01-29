"""
Encompass LOS Integration Adapter.

This module provides integration with Encompass Loan Origination System.
Currently implements a stub client for development; will be replaced with
real API calls when Encompass credentials are available.
"""

import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx


class EncompassClientInterface(ABC):
    """Interface for Encompass client implementations."""

    @abstractmethod
    async def create_loan(self, loan_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new loan in Encompass."""
        pass

    @abstractmethod
    async def get_loan(self, loan_guid: str) -> dict[str, Any]:
        """Get loan details from Encompass."""
        pass

    @abstractmethod
    async def update_loan(self, loan_guid: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update an existing loan."""
        pass

    @abstractmethod
    async def update_milestone(self, loan_guid: str, milestone: str) -> dict[str, Any]:
        """Update loan milestone."""
        pass

    @abstractmethod
    async def add_condition(
        self, loan_guid: str, condition: dict[str, Any]
    ) -> dict[str, Any]:
        """Add a condition to a loan."""
        pass


class EncompassStubClient(EncompassClientInterface):
    """
    Stub implementation of Encompass client for development.

    This client simulates Encompass API responses without making real API calls.
    Use this for local development and testing.
    """

    def __init__(self) -> None:
        self._loans: dict[str, dict[str, Any]] = {}
        self._loan_counter = 1000

    async def create_loan(self, loan_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new loan (stub)."""
        loan_guid = str(uuid4())
        loan_number = f"DSCR-2024-{self._loan_counter:04d}"
        self._loan_counter += 1

        loan = {
            "loan_guid": loan_guid,
            "loan_number": loan_number,
            "status": "Active",
            "milestone": "Started",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            **loan_data,
        }

        self._loans[loan_guid] = loan

        print(f"[Encompass Stub] Created loan: {loan_number} ({loan_guid})")

        return {
            "loan_guid": loan_guid,
            "loan_number": loan_number,
            "status": "Active",
        }

    async def get_loan(self, loan_guid: str) -> dict[str, Any]:
        """Get loan details (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")
        return loan

    async def update_loan(self, loan_guid: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update an existing loan (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")

        loan.update(updates)
        loan["updated_at"] = datetime.now(timezone.utc).isoformat()

        print(f"[Encompass Stub] Updated loan: {loan_guid}")

        return loan

    async def update_milestone(self, loan_guid: str, milestone: str) -> dict[str, Any]:
        """Update loan milestone (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")

        old_milestone = loan.get("milestone")
        loan["milestone"] = milestone
        loan["updated_at"] = datetime.now(timezone.utc).isoformat()

        print(f"[Encompass Stub] Milestone updated: {loan_guid} ({old_milestone} -> {milestone})")

        return {"loan_guid": loan_guid, "milestone": milestone}

    async def add_condition(
        self, loan_guid: str, condition: dict[str, Any]
    ) -> dict[str, Any]:
        """Add a condition to a loan (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")

        if "conditions" not in loan:
            loan["conditions"] = []

        condition_id = str(uuid4())
        condition_record = {
            "condition_id": condition_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            **condition,
        }

        loan["conditions"].append(condition_record)

        print(f"[Encompass Stub] Added condition to loan: {loan_guid}")

        return condition_record


class EncompassRealClient(EncompassClientInterface):
    """
    Real Encompass API client.

    Requires ENCOMPASS_CLIENT_ID, ENCOMPASS_CLIENT_SECRET, and ENCOMPASS_INSTANCE_ID
    environment variables to be set.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        instance_id: str,
        base_url: str = "https://api.elliemae.com",
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.instance_id = instance_id
        self.base_url = base_url
        self._access_token: str | None = None
        self._token_expires_at: datetime | None = None

    async def _get_access_token(self) -> str:
        """Get or refresh access token."""
        if self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at:
                return self._access_token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/oauth2/v1/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "lp",
                },
            )
            response.raise_for_status()
            data = response.json()

            self._access_token = data["access_token"]
            # Token expires in 'expires_in' seconds, refresh 5 minutes early
            expires_in = data.get("expires_in", 3600) - 300
            self._token_expires_at = datetime.now(timezone.utc) + \
                __import__("datetime").timedelta(seconds=expires_in)

            return self._access_token

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make authenticated request to Encompass API."""
        token = await self._get_access_token()

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=json,
            )
            response.raise_for_status()
            return response.json() if response.content else {}

    async def create_loan(self, loan_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new loan in Encompass."""
        return await self._request(
            "POST",
            f"/encompass/v3/loans?loanFolder=My Pipeline",
            json=loan_data,
        )

    async def get_loan(self, loan_guid: str) -> dict[str, Any]:
        """Get loan details from Encompass."""
        return await self._request("GET", f"/encompass/v3/loans/{loan_guid}")

    async def update_loan(self, loan_guid: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update an existing loan."""
        return await self._request(
            "PATCH",
            f"/encompass/v3/loans/{loan_guid}",
            json=updates,
        )

    async def update_milestone(self, loan_guid: str, milestone: str) -> dict[str, Any]:
        """Update loan milestone."""
        return await self._request(
            "PATCH",
            f"/encompass/v3/loans/{loan_guid}",
            json={"currentMilestone": milestone},
        )

    async def add_condition(
        self, loan_guid: str, condition: dict[str, Any]
    ) -> dict[str, Any]:
        """Add a condition to a loan."""
        return await self._request(
            "POST",
            f"/encompass/v3/loans/{loan_guid}/conditions",
            json=condition,
        )


class EncompassService:
    """
    High-level service for Encompass operations.

    Wraps the client and provides business-logic level methods.
    """

    def __init__(self, client: EncompassClientInterface) -> None:
        self.client = client

    async def create_loan(
        self,
        borrower_first_name: str,
        borrower_last_name: str,
        borrower_email: str,
        borrower_phone: str,
        property_address: str,
        property_city: str,
        property_state: str,
        property_zip: str,
        property_type: str,
        loan_amount_cents: int,
        interest_rate: float,
        loan_term_months: int,
        dscr: float,
    ) -> dict[str, Any]:
        """Create a new DSCR loan in Encompass."""
        loan_data = {
            "applications": [
                {
                    "borrower": {
                        "firstName": borrower_first_name,
                        "lastName": borrower_last_name,
                        "emailAddress": borrower_email,
                        "homePhone": borrower_phone,
                    }
                }
            ],
            "property": {
                "streetAddress": property_address,
                "city": property_city,
                "state": property_state,
                "postalCode": property_zip,
                "propertyType": property_type,
            },
            "loanAmount": loan_amount_cents / 100,
            "requestedInterestRate": interest_rate,
            "loanTermMonths": loan_term_months,
            "customFields": [
                {"fieldId": "CX.DSCR", "value": str(dscr)},
            ],
        }

        return await self.client.create_loan(loan_data)


def _create_encompass_service() -> EncompassService:
    """
    Factory function to create the appropriate Encompass service.

    Uses real client if credentials are available, otherwise stub.
    """
    client_id = os.getenv("ENCOMPASS_CLIENT_ID")
    client_secret = os.getenv("ENCOMPASS_CLIENT_SECRET")
    instance_id = os.getenv("ENCOMPASS_INSTANCE_ID")

    if client_id and client_secret and instance_id:
        print("Using real Encompass client")
        client = EncompassRealClient(client_id, client_secret, instance_id)
    else:
        print("Using Encompass stub client (no credentials configured)")
        client = EncompassStubClient()

    return EncompassService(client)


# Singleton service instance
encompass_service = _create_encompass_service()
