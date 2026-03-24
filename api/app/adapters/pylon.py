"""
Pylon AVM Adapter

DEPRECATED: This adapter is no longer used in the main pipeline.
The Pylon sandbox API returns null for AVM values, making it unusable.
This file is kept for reference but is not imported anywhere.

To re-enable Pylon:
1. Get production credentials from Pylon support
2. Update PYLON_* environment variables
3. Import and call pylon_avm in ingest.py _fetch_avm()

Original description:
Integrates with Pylon's GraphQL API for AVM (Automated Valuation Model) via Clear Capital.

Flow:
1. Authenticate via OAuth2 client credentials
2. Create a deal (container for loan)
3. Create a loan on the deal
4. Configure subject property with address
5. Query for avmEstimatedValue (may need polling)

API Base: https://sandbox.pylon.mortgage/graphql
Auth: https://auth.pylon.mortgage/oauth/token
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx

# Configure logging
logger = logging.getLogger("pylon")
logger.setLevel(logging.DEBUG)

# Add console handler if not already present
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s [PYLON] %(levelname)s: %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class PylonConfig:
    """Pylon API configuration."""
    auth_domain: str
    client_id: str
    client_secret: str
    audience: str
    graphql_url: str
    timeout: int = 30


def get_pylon_config() -> PylonConfig | None:
    """Get Pylon configuration from environment."""
    client_id = os.getenv("PYLON_CLIENT_ID")
    client_secret = os.getenv("PYLON_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("Pylon API credentials not configured. Set PYLON_CLIENT_ID and PYLON_CLIENT_SECRET.")
        return None

    return PylonConfig(
        auth_domain=os.getenv("PYLON_AUTH_DOMAIN", "https://auth.pylon.mortgage"),
        client_id=client_id,
        client_secret=client_secret,
        audience=os.getenv("PYLON_AUDIENCE", "https://sandbox.pylon.mortgage"),
        graphql_url=os.getenv("PYLON_GRAPHQL_URL", "https://sandbox.pylon.mortgage/graphql"),
        timeout=int(os.getenv("PYLON_TIMEOUT", "30")),
    )


# =============================================================================
# GraphQL Queries and Mutations
# =============================================================================

# Pylon uses namespaced mutations: { deal { create { ... } } }

CREATE_DEAL = """
mutation {
  deal {
    create {
      deal {
        id
      }
    }
  }
}
"""

CREATE_LOAN = """
mutation CreateLoan($input: CreateLoanInput!) {
  loan {
    create(input: $input) {
      loan {
        id
      }
    }
  }
}
"""

GET_LOAN_SUBJECT_PROPERTY = """
query GetLoanSubjectProperty($id: ID!) {
  loan(id: $id) {
    id
    subjectProperty {
      id
      avmEstimatedValue
      avmProvider
    }
  }
}
"""

ATTACH_ADDRESS_TO_SUBJECT_PROPERTY = """
mutation AttachAddressToSubjectProperty($input: AttachSubjectPropertyAddressInput!) {
  subjectProperty {
    attachAddress(input: $input) {
      subjectProperty {
        id
        avmEstimatedValue
        avmProvider
      }
    }
  }
}
"""

GET_SUBJECT_PROPERTY = """
query GetSubjectProperty($id: ID!) {
  subjectProperty(id: $id) {
    id
    avmEstimatedValue
    avmProvider
  }
}
"""


# =============================================================================
# Pylon GraphQL Client
# =============================================================================

class PylonClient:
    """GraphQL client with OAuth2 token management for Pylon API."""

    def __init__(self, config: PylonConfig) -> None:
        self.config = config
        self._token: str | None = None
        self._token_expires: float = 0

    async def authenticate(self) -> str:
        """Authenticate with Pylon OAuth2 and get access token."""
        if self._token and time.time() < self._token_expires:
            logger.debug("Using cached token (expires in %d seconds)", int(self._token_expires - time.time()))
            return self._token

        auth_url = f"{self.config.auth_domain}/oauth/token"
        logger.info("Authenticating with Pylon at %s", auth_url)
        logger.debug("Client ID: %s...", self.config.client_id[:10])
        logger.debug("Audience: %s", self.config.audience)

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.post(
                    auth_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret,
                        "audience": self.config.audience,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                logger.debug("Auth response status: %d", response.status_code)

                if response.status_code != 200:
                    logger.error("Auth failed: %s", response.text[:500])
                    response.raise_for_status()

                data = response.json()
                logger.debug("Auth response keys: %s", list(data.keys()))

        except httpx.HTTPStatusError as e:
            logger.error("Auth HTTP error: %s", str(e))
            raise
        except Exception as e:
            logger.error("Auth exception: %s", str(e))
            raise

        token = data.get("access_token")
        expires_in = data.get("expires_in", 3600)

        if not token:
            logger.error("No access_token in response: %s", data)
            raise RuntimeError(f"No access_token in auth response: {data}")

        self._token = token
        self._token_expires = time.time() + expires_in - 300
        logger.info("Successfully authenticated, token expires in %d seconds", expires_in)
        return token

    async def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute a GraphQL query/mutation."""
        token = await self.authenticate()

        # Extract operation name for logging
        op_name = "unknown"
        if "mutation" in query.lower():
            op_name = "mutation"
            # Try to extract specific mutation name
            import re
            match = re.search(r'{\s*(\w+)\s*{', query)
            if match:
                op_name = f"mutation.{match.group(1)}"
        elif "query" in query.lower():
            op_name = "query"

        logger.info("Executing GraphQL %s", op_name)
        logger.debug("Query: %s", query[:200].replace('\n', ' '))
        if variables:
            logger.debug("Variables: %s", json.dumps(variables, default=str)[:500])

        try:
            start_time = time.time()
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.post(
                    self.config.graphql_url,
                    json={
                        "query": query,
                        "variables": variables or {},
                    },
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {token}",
                    },
                )
                elapsed = time.time() - start_time

                logger.debug("Response status: %d (%.2fs)", response.status_code, elapsed)

                if response.status_code != 200:
                    logger.error("GraphQL HTTP error %d: %s", response.status_code, response.text[:1000])
                    response.raise_for_status()

                result = response.json()

        except httpx.HTTPStatusError as e:
            logger.error("GraphQL HTTP error: %s", str(e))
            raise
        except Exception as e:
            logger.error("GraphQL exception: %s", str(e))
            raise

        # Check for GraphQL errors
        if "errors" in result and result["errors"]:
            for error in result["errors"]:
                logger.error("GraphQL error: %s", json.dumps(error, default=str))
                if "extensions" in error:
                    logger.error("  Error extensions: %s", json.dumps(error["extensions"], default=str))
                if "path" in error:
                    logger.error("  Error path: %s", error["path"])
            error_messages = [e.get("message", str(e)) for e in result["errors"]]
            raise RuntimeError(f"GraphQL errors: {'; '.join(error_messages)}")

        logger.debug("GraphQL response data keys: %s", list(result.get("data", {}).keys()) if result.get("data") else "None")
        return result.get("data", {})


# =============================================================================
# Pylon AVM Service
# =============================================================================

@dataclass
class PylonAddress:
    """Property address for Pylon."""
    street: str
    city: str
    state: str
    zip_code: str


@dataclass
class PylonAVMResult:
    """AVM result from Pylon."""
    estimated_value: int | None  # cents
    confidence: str
    deal_id: str
    loan_id: str
    property_id: str | None


class PylonAVMService:
    """Pylon AVM service - creates deal/loan/property and fetches AVM."""

    name = "Pylon"

    def __init__(self) -> None:
        self.config = get_pylon_config()
        self._client: PylonClient | None = None

    def _get_client(self) -> PylonClient:
        if not self._client:
            if not self.config:
                raise RuntimeError("Pylon API not configured")
            self._client = PylonClient(self.config)
        return self._client

    def is_configured(self) -> bool:
        return self.config is not None

    async def get_avm(self, address: PylonAddress, loan_amount: int = 40000000) -> dict[str, Any]:
        """
        Get AVM for a property address.

        This creates a temporary deal/loan in Pylon, configures the subject property,
        and queries for the AVM estimated value.

        Args:
            address: Property address
            loan_amount: Loan amount in cents (default $400k)

        Returns:
            Dict with success, value (cents), confidence, etc.
        """
        order_id = str(uuid4())
        logger.info("=" * 60)
        logger.info("Starting Pylon AVM request: %s", order_id)
        logger.info("Address: %s, %s, %s %s", address.street, address.city, address.state, address.zip_code)
        logger.info("Loan amount: $%s", f"{loan_amount / 100:,.0f}")

        if not self.is_configured():
            logger.warning("Pylon API not configured")
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "NOT_CONFIGURED", "message": "Pylon API not configured"},
            }

        try:
            client = self._get_client()

            # Step 1: Create a deal (no input required in Pylon's API)
            logger.info("Step 1: Creating deal...")
            try:
                deal_result = await client.query(CREATE_DEAL)
                logger.debug("Deal result: %s", json.dumps(deal_result, default=str)[:500])
            except Exception as e:
                logger.error("Step 1 FAILED - Create deal error: %s", str(e))
                raise

            # Pylon uses namespaced response: { deal: { create: { deal: { id } } } }
            deal_id = deal_result.get("deal", {}).get("create", {}).get("deal", {}).get("id")

            if not deal_id:
                logger.error("Step 1 FAILED - No deal ID in response: %s", deal_result)
                return {
                    "success": False,
                    "order_id": order_id,
                    "error": {"code": "CREATE_DEAL_FAILED", "message": f"Failed to create deal: {deal_result}"},
                }
            logger.info("Step 1 SUCCESS - Deal ID: %s", deal_id)

            # Step 2: Create a loan on the deal
            # Pylon CreateLoanInput fields: dealId, loanPurpose, purchasePrice, refinanceCashOutProceeds, closingDate, loanTermYears
            logger.info("Step 2: Creating loan...")
            loan_amount_dollars = int(loan_amount / 100)  # Pylon uses dollars as integers
            try:
                loan_result = await client.query(CREATE_LOAN, {
                    "input": {
                        "dealId": deal_id,
                        "loanPurpose": "REFINANCE",  # Valid: PURCHASE or REFINANCE
                        "purchasePrice": loan_amount_dollars,  # Property value approximation
                    }
                })
                logger.debug("Loan result: %s", json.dumps(loan_result, default=str)[:500])
            except Exception as e:
                logger.error("Step 2 FAILED - Create loan error: %s", str(e))
                raise

            # Pylon uses namespaced response: { loan: { create: { loan: { id } } } }
            loan_id = loan_result.get("loan", {}).get("create", {}).get("loan", {}).get("id")

            if not loan_id:
                logger.error("Step 2 FAILED - No loan ID in response: %s", loan_result)
                return {
                    "success": False,
                    "order_id": order_id,
                    "error": {"code": "CREATE_LOAN_FAILED", "message": f"Failed to create loan: {loan_result}"},
                }
            logger.info("Step 2 SUCCESS - Loan ID: %s", loan_id)

            # Step 3: Query loan to get auto-created subject property
            logger.info("Step 3: Querying loan for subject property...")
            try:
                loan_query_result = await client.query(GET_LOAN_SUBJECT_PROPERTY, {"id": loan_id})
                logger.debug("Loan query result: %s", json.dumps(loan_query_result, default=str)[:500])
            except Exception as e:
                logger.error("Step 3 FAILED - Query loan error: %s", str(e))
                raise

            # Response: { loan: { id, subjectProperty: { id, avmEstimatedValue, ... } } }
            loan_data = loan_query_result.get("loan", {})
            subject_property = loan_data.get("subjectProperty", {})
            property_id = subject_property.get("id") if subject_property else None

            if not property_id:
                logger.error("Step 3 FAILED - No subject property on loan: %s", loan_query_result)
                return {
                    "success": False,
                    "order_id": order_id,
                    "error": {"code": "NO_SUBJECT_PROPERTY", "message": f"No subject property found on loan: {loan_query_result}"},
                }
            logger.info("Step 3 SUCCESS - Subject Property ID: %s", property_id)

            # Step 4: Attach address to subject property
            logger.info("Step 4: Attaching address to subject property...")
            try:
                attach_result = await client.query(ATTACH_ADDRESS_TO_SUBJECT_PROPERTY, {
                    "input": {
                        "id": property_id,
                        "line": address.street,
                        "city": address.city,
                        "zipCode": address.zip_code,
                    }
                })
                logger.debug("Attach address result: %s", json.dumps(attach_result, default=str)[:500])
            except Exception as e:
                logger.error("Step 4 FAILED - Attach address error: %s", str(e))
                raise

            # Try to get AVM from attach response
            attached_property = attach_result.get("subjectProperty", {}).get("attachAddress", {}).get("subjectProperty", {})
            avm_value = attached_property.get("avmEstimatedValue")
            logger.info("Step 4 SUCCESS - AVM from attach: %s", avm_value)

            # Step 5: If AVM not immediately available, poll for it
            if avm_value is None:
                logger.info("Step 5: AVM not immediately available, polling...")
                avm_value = await self._poll_for_avm(client, property_id, max_attempts=5, delay_seconds=3)
            else:
                logger.info("Step 5: Skipped (AVM already available)")

            if avm_value is None:
                logger.warning("AVM value not available after polling")
                return {
                    "success": False,
                    "order_id": order_id,
                    "deal_id": deal_id,
                    "loan_id": loan_id,
                    "error": {"code": "NO_AVM_VALUE", "message": "AVM value not available"},
                }

            # Convert to cents
            avm_value_cents = int(float(avm_value) * 100)
            logger.info("SUCCESS - AVM value: $%s", f"{avm_value_cents / 100:,.0f}")
            logger.info("=" * 60)

            return {
                "success": True,
                "order_id": order_id,
                "deal_id": deal_id,
                "loan_id": loan_id,
                "property_id": property_id,
                "value": avm_value_cents,
                "confidence": "MEDIUM",  # Pylon doesn't provide confidence, default to MEDIUM
                "vendor": self.name,
            }

        except httpx.HTTPStatusError as e:
            error_body = ""
            try:
                error_body = e.response.text[:500]
            except Exception:
                pass
            logger.error("HTTP error %d: %s", e.response.status_code, error_body)
            return {
                "success": False,
                "order_id": order_id,
                "error": {
                    "code": f"HTTP_{e.response.status_code}",
                    "message": f"{str(e)} - {error_body}",
                },
            }
        except Exception as e:
            logger.error("Unexpected error: %s", str(e), exc_info=True)
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "API_ERROR", "message": str(e)},
            }

    async def _poll_for_avm(
        self,
        client: PylonClient,
        property_id: str,
        max_attempts: int = 5,
        delay_seconds: float = 3,
    ) -> float | None:
        """Poll for AVM value with retries."""
        logger.info("Polling for AVM (max %d attempts, %ds delay)", max_attempts, delay_seconds)

        for attempt in range(max_attempts):
            if attempt > 0:
                logger.debug("Waiting %ds before retry...", delay_seconds)
                await asyncio.sleep(delay_seconds)

            logger.debug("Poll attempt %d/%d for property %s", attempt + 1, max_attempts, property_id)

            try:
                result = await client.query(GET_SUBJECT_PROPERTY, {"id": property_id})
                subject_property = result.get("subjectProperty", {})
                avm_value = subject_property.get("avmEstimatedValue")

                logger.debug("Poll result - AVM: %s", avm_value)

                if avm_value is not None:
                    logger.info("Poll SUCCESS - AVM value: $%s", f"{avm_value:,.0f}")
                    return avm_value

            except Exception as e:
                logger.warning("Poll attempt %d failed: %s", attempt + 1, str(e))

        logger.warning("Poll FAILED - No AVM after %d attempts", max_attempts)
        return None


# =============================================================================
# Export singleton
# =============================================================================

pylon_avm = PylonAVMService()
