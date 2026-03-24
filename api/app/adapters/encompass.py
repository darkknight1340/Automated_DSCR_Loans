"""
Encompass LOS Integration Adapter.

This module provides integration with Encompass Loan Origination System.
Uses password-grant OAuth2 authentication with the Encompass API.
"""

import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import httpx


logger = logging.getLogger(__name__)


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
    async def get_loan_by_number(self, loan_number: str) -> dict[str, Any] | None:
        """Get loan by loan number (e.g., '999-040048')."""
        pass

    @abstractmethod
    async def search_loans(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """Search loans using pipeline API."""
        pass

    @abstractmethod
    async def read_fields(self, loan_guid: str, field_ids: list[str]) -> dict[str, Any]:
        """Read specific field values from a loan."""
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
        self._loans_by_number: dict[str, str] = {}  # loan_number -> loan_guid
        self._loan_counter = 1000

    async def create_loan(self, loan_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new loan (stub)."""
        loan_guid = str(uuid4())
        loan_number = f"999-{self._loan_counter:06d}"
        self._loan_counter += 1

        loan = {
            "id": loan_guid,
            "loanIdNumber": loan_number,
            "loanNumber": loan_number,
            "status": "Active",
            "milestone": "Started",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            **loan_data,
        }

        self._loans[loan_guid] = loan
        self._loans_by_number[loan_number] = loan_guid

        logger.info(f"[Encompass Stub] Created loan: {loan_number} ({loan_guid})")

        return {
            "id": loan_guid,
            "loanIdNumber": loan_number,
            "status": "Active",
        }

    async def get_loan(self, loan_guid: str) -> dict[str, Any]:
        """Get loan details (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")
        return loan

    async def get_loan_by_number(self, loan_number: str) -> dict[str, Any] | None:
        """Get loan by loan number (stub)."""
        loan_guid = self._loans_by_number.get(loan_number)
        if not loan_guid:
            return None
        return self._loans.get(loan_guid)

    async def search_loans(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """Search loans (stub)."""
        # Simple stub - returns all loans
        return [
            {"loanGuid": guid, "fields": {"Loan.LoanNumber": loan["loanIdNumber"]}}
            for guid, loan in self._loans.items()
        ]

    async def read_fields(self, loan_guid: str, field_ids: list[str]) -> dict[str, Any]:
        """Read specific field values (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")
        # Return empty values for all requested fields
        return {field_id: None for field_id in field_ids}

    async def update_loan(self, loan_guid: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update an existing loan (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")

        loan.update(updates)
        loan["updated_at"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"[Encompass Stub] Updated loan: {loan_guid}")

        return loan

    async def update_milestone(self, loan_guid: str, milestone: str) -> dict[str, Any]:
        """Update loan milestone (stub)."""
        loan = self._loans.get(loan_guid)
        if not loan:
            raise ValueError(f"Loan not found: {loan_guid}")

        old_milestone = loan.get("milestone")
        loan["milestone"] = milestone
        loan["updated_at"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"[Encompass Stub] Milestone updated: {loan_guid} ({old_milestone} -> {milestone})")

        return {"loanGuid": loan_guid, "milestone": milestone}

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

        logger.info(f"[Encompass Stub] Added condition to loan: {loan_guid}")

        return condition_record


class EncompassRealClient(EncompassClientInterface):
    """
    Real Encompass API client.

    Uses password-grant OAuth2 authentication.
    Requires environment variables:
    - ENCOMPASS_USERNAME
    - ENCOMPASS_PASSWORD
    - ENCOMPASS_CLIENT_ID
    - ENCOMPASS_CLIENT_SECRET
    - ENCOMPASS_BASE_URL (optional, defaults to https://api.elliemae.com)
    - ENCOMPASS_LOAN_FOLDER (optional, defaults to Prospects)
    """

    def __init__(
        self,
        username: str,
        password: str,
        client_id: str,
        client_secret: str,
        scope: str = "lp",
        base_url: str = "https://api.elliemae.com",
        loan_folder: str = "Prospects",
    ) -> None:
        self.username = username
        self.password = password
        self.client_id = client_id
        self.client_secret = client_secret
        self.scope = scope
        self.base_url = base_url
        self.loan_folder = loan_folder
        self.host = base_url.replace("https://", "").replace("http://", "")
        self._access_token: str | None = None
        self._token_expires_at: datetime | None = None

    async def _get_access_token(self) -> str:
        """Get or refresh access token using password grant."""
        if self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at:
                return self._access_token

        logger.info("Requesting access token from Encompass API")

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/oauth2/v1/token",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Host": self.host,
                },
                data={
                    "grant_type": "password",
                    "username": self.username,
                    "password": self.password,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": self.scope,
                },
            )
            response.raise_for_status()
            data = response.json()

            self._access_token = data.get("access_token")
            if not self._access_token:
                raise ValueError("Access token not found in OAuth2 response")

            # Token expires in 'expires_in' seconds, refresh 1 minute early
            expires_in = data.get("expires_in", 1800)
            self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)

            logger.info("Successfully obtained Encompass access token")
            return self._access_token

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | list[Any] | None = None,
        params: dict[str, str] | None = None,
        timeout: int = 60,
    ) -> dict[str, Any] | list[Any]:
        """Make authenticated request to Encompass API."""
        token = await self._get_access_token()

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Host": self.host,
                },
                json=json,
                params=params,
            )

            if response.status_code >= 400:
                logger.error(f"Encompass API error: {response.status_code} - {response.text}")
            response.raise_for_status()

            if response.status_code == 204 or not response.content:
                return {"status": "ok", "status_code": response.status_code}

            return response.json()

    async def create_loan(self, loan_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new loan in Encompass."""
        result = await self._request(
            "POST",
            f"/encompass/v3/loans",
            json=loan_data,
            params={"loanFolder": self.loan_folder, "view": "entity"},
        )
        return result  # type: ignore

    async def get_loan(self, loan_guid: str) -> dict[str, Any]:
        """Get loan details from Encompass by GUID."""
        logger.info(f"Getting loan details for GUID: {loan_guid}")
        result = await self._request("GET", f"/encompass/v3/loans/{loan_guid}")
        return result  # type: ignore

    async def get_loan_by_number(self, loan_number: str) -> dict[str, Any] | None:
        """
        Get loan by loan number (e.g., '999-040048').

        Searches using the pipeline API and returns the full loan if found.
        """
        logger.info(f"Searching for loan by number: {loan_number}")

        # Search using pipeline API
        search_payload = {
            "filter": {
                "terms": [
                    {
                        "canonicalName": "Loan.LoanNumber",
                        "value": loan_number,
                        "matchType": "exact",
                    }
                ]
            },
            "fields": ["Loan.LoanFolder"],
        }

        results = await self._request(
            "POST",
            "/encompass/v3/loans/pipeline",
            json=search_payload,
        )

        if not results or not isinstance(results, list) or len(results) == 0:
            logger.info(f"No loan found with number: {loan_number}")
            return None

        # Get the full loan details
        loan_guid = results[0].get("loanGuid")
        if not loan_guid:
            return None

        return await self.get_loan(loan_guid)

    async def search_loans(
        self,
        filters: dict[str, Any],
        use_v1: bool = False,
    ) -> list[dict[str, Any]]:
        """
        Search loans using the pipeline API.

        Args:
            filters: Dictionary with search criteria. Supports:
                - borrower_ssn: Search by borrower SSN
                - loan_number: Search by loan number
                - borrower_name: Search by borrower name
                - custom_terms: List of raw filter terms
            use_v1: Use V1 API instead of V3 (may have different permissions)
        """
        terms = []

        if "borrower_ssn" in filters:
            terms.append({
                "canonicalName": "Loan.BorrowerSSN",
                "value": filters["borrower_ssn"],
                "matchType": "exact",
            })

        if "loan_number" in filters:
            terms.append({
                "canonicalName": "Loan.LoanNumber",
                "value": filters["loan_number"],
                "matchType": "exact",
            })

        if "borrower_name" in filters:
            terms.append({
                "canonicalName": "Loan.BorrowerName",
                "value": filters["borrower_name"],
                "matchType": "contains",
            })

        if "custom_terms" in filters:
            terms.extend(filters["custom_terms"])

        search_payload = {
            "filter": {"terms": terms} if terms else {},
            "fields": filters.get("fields", ["Loan.LoanFolder", "Loan.LoanNumber"]),
        }

        # Try V1 or V3 pipeline
        api_version = "v1" if use_v1 else "v3"

        results = await self._request(
            "POST",
            f"/encompass/{api_version}/loans/pipeline",
            json=search_payload,
        )

        return results if isinstance(results, list) else []

    async def read_fields(self, loan_guid: str, field_ids: list[str]) -> dict[str, Any]:
        """
        Read specific Encompass field values from a loan.

        Args:
            loan_guid: The loan GUID
            field_ids: List of Encompass field IDs (e.g., ["1014", "364", "Log.MS.CurrentMilestone"])

        Returns:
            Dictionary mapping field_id -> value
        """
        logger.info(f"Reading {len(field_ids)} fields from loan {loan_guid}")

        result = await self._request(
            "POST",
            f"/encompass/v3/loans/{loan_guid}/fieldReader",
            json=field_ids,
            params={"invalidFieldBehavior": "Include"},
        )

        return result  # type: ignore

    async def update_fields(self, loan_guid: str, fields: dict[str, Any]) -> dict[str, Any]:
        """
        Update specific Encompass field values on a loan.

        Args:
            loan_guid: The loan GUID
            fields: Dictionary mapping field_id -> value
        """
        if not fields:
            raise ValueError("fields must be a non-empty mapping")

        payload = [{"id": field_id, "value": value} for field_id, value in fields.items()]

        logger.info(f"Updating {len(payload)} fields on loan {loan_guid}")

        result = await self._request(
            "POST",
            f"/encompass/v3/loans/{loan_guid}/fieldWriter",
            json=payload,
        )

        return result  # type: ignore

    async def update_loan(self, loan_guid: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update an existing loan."""
        result = await self._request(
            "PATCH",
            f"/encompass/v3/loans/{loan_guid}",
            json=updates,
        )
        return result  # type: ignore

    async def update_milestone(self, loan_guid: str, milestone: str) -> dict[str, Any]:
        """Update loan milestone."""
        result = await self._request(
            "PATCH",
            f"/encompass/v3/loans/{loan_guid}",
            json={"currentMilestone": milestone},
        )
        return result  # type: ignore

    async def add_condition(
        self, loan_guid: str, condition: dict[str, Any]
    ) -> dict[str, Any]:
        """Add a condition to a loan."""
        result = await self._request(
            "POST",
            f"/encompass/v3/loans/{loan_guid}/conditions",
            json=condition,
        )
        return result  # type: ignore

    async def get_current_milestone(self, loan_guid: str) -> str | None:
        """Get the current milestone of a loan."""
        result = await self.read_fields(loan_guid, ["Log.MS.CurrentMilestone"])
        value = result.get("Log.MS.CurrentMilestone")
        return value if value and str(value).strip() else None


class EncompassService:
    """
    High-level service for Encompass operations.

    Wraps the client and provides business-logic level methods.
    """

    def __init__(self, client: EncompassClientInterface) -> None:
        self.client = client

    async def get_loan(self, loan_guid: str) -> dict[str, Any]:
        """Get loan by GUID."""
        return await self.client.get_loan(loan_guid)

    async def get_loan_by_number(self, loan_number: str) -> dict[str, Any] | None:
        """Get loan by loan number."""
        return await self.client.get_loan_by_number(loan_number)

    async def search_loans(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """Search loans."""
        return await self.client.search_loans(filters)

    async def read_fields(self, loan_guid: str, field_ids: list[str]) -> dict[str, Any]:
        """Read specific fields from a loan."""
        return await self.client.read_fields(loan_guid, field_ids)

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


def _create_encompass_client() -> EncompassClientInterface:
    """
    Factory function to create the appropriate Encompass client.

    Uses real client if credentials are available, otherwise stub.
    """
    username = os.getenv("ENCOMPASS_USERNAME")
    password = os.getenv("ENCOMPASS_PASSWORD")
    client_id = os.getenv("ENCOMPASS_CLIENT_ID")
    client_secret = os.getenv("ENCOMPASS_CLIENT_SECRET")

    if username and password and client_id and client_secret:
        logger.info("Using real Encompass client")
        return EncompassRealClient(
            username=username,
            password=password,
            client_id=client_id,
            client_secret=client_secret,
            scope=os.getenv("ENCOMPASS_SCOPE", "lp"),
            base_url=os.getenv("ENCOMPASS_BASE_URL", "https://api.elliemae.com"),
            loan_folder=os.getenv("ENCOMPASS_LOAN_FOLDER", "Prospects"),
        )
    else:
        logger.info("Using Encompass stub client (no credentials configured)")
        return EncompassStubClient()


def _create_encompass_service() -> EncompassService:
    """Create the Encompass service with appropriate client."""
    client = _create_encompass_client()
    return EncompassService(client)


# Singleton instances
encompass_client = _create_encompass_client()
encompass_service = _create_encompass_service()
