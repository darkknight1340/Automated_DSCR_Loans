"""
DataTree API Adapter

Integrates with First American's DataTree API for:
- AVM (Automated Valuation Model) reports
- Property reports (characteristics, mortgages, tax, owner info)
- Property search
- Address standardization

API Base: https://dtapiuat.datatree.com
Auth: JWT via POST /api/Login/AuthenticateClient
"""

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

import httpx

# Configure logging
logger = logging.getLogger("datatree")
logger.setLevel(logging.DEBUG)

if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s [DATATREE] %(levelname)s: %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class DataTreeConfig:
    """DataTree API configuration."""
    client_id: str
    client_secret: str
    base_url: str
    timeout: int


def get_config() -> DataTreeConfig | None:
    """Get DataTree configuration from environment."""
    client_id = os.getenv("DATATREE_CLIENT_ID")
    client_secret = os.getenv("DATATREE_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("DataTree API credentials not configured. Set DATATREE_CLIENT_ID and DATATREE_CLIENT_SECRET.")
        return None

    return DataTreeConfig(
        client_id=client_id,
        client_secret=client_secret,
        base_url=os.getenv("DATATREE_BASE_URL", "https://dtapiuat.datatree.com"),
        timeout=int(os.getenv("DATATREE_TIMEOUT", "30")),
    )


# =============================================================================
# Types
# =============================================================================

class AVMConfidence(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NO_VALUE = "NO_VALUE"


@dataclass
class Address:
    """Property address."""
    street: str
    city: str
    state: str
    zip_code: str
    unit: str | None = None
    county: str | None = None


@dataclass
class AVMReport:
    """AVM valuation report."""
    id: str
    vendor_name: str
    vendor_order_id: str
    status: str
    estimated_value: int | None  # cents
    confidence_score: float | None
    confidence_level: AVMConfidence | None
    value_low: int | None  # cents
    value_high: int | None  # cents
    order_date: datetime
    completed_date: datetime | None = None
    property_data: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class DataTreePropertyReport:
    """Comprehensive property report from DataTree."""
    # Property characteristics
    property_type: str | None = None
    year_built: int | None = None
    square_feet: int | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    lot_size_sqft: int | None = None
    units: int | None = None
    stories: int | None = None
    pool: bool = False
    garage_spaces: int | None = None

    # Valuation (in cents)
    estimated_value: int | None = None
    assessed_value: int | None = None
    land_value: int | None = None
    improvement_value: int | None = None

    # Tax (in cents)
    annual_taxes: int | None = None
    tax_year: int | None = None

    # Owner
    owner_names: list[str] | None = None
    owner_occupied: bool | None = None
    ownership_type: str | None = None
    mailing_address: dict[str, str] | None = None

    # Mortgages
    existing_loans: list[dict[str, Any]] | None = None
    total_loan_balance: int | None = None  # cents
    mortgage_count: int = 0

    # Equity
    estimated_equity: int | None = None  # cents
    ltv_ratio: float | None = None

    # APN
    apn: str | None = None

    # Raw response for debugging
    raw_data: dict[str, Any] | None = None


# =============================================================================
# Address Parsing Helper
# =============================================================================

def _parse_street_address(street: str, use_abbreviations: bool = False) -> dict[str, str]:
    """Parse a street address string into StreetNumber, StreetName, StreetType, StreetPostDirection.

    Args:
        street: The street address string
        use_abbreviations: If True, convert full street types to abbreviations (Street -> St)

    Examples:
        "261 28th Ave Se" -> StreetNumber=261, StreetName=28th, StreetType=Ave, StreetPostDirection=SE
        "123 Main Street" -> StreetNumber=123, StreetName=Main, StreetType=Street
        "456 N Oak Dr" -> StreetNumber=456, StreetPreDirection=N, StreetName=Oak, StreetType=Dr
    """
    street = street.strip()
    parts = street.split(None, 1)
    if len(parts) < 2:
        return {"StreetNumber": "", "StreetName": street}

    street_number = parts[0]
    remainder = parts[1]

    # Common street suffixes
    suffixes = {
        "ST", "STREET", "AVE", "AVENUE", "BLVD", "BOULEVARD",
        "DR", "DRIVE", "LN", "LANE", "CT", "COURT", "PL", "PLACE",
        "RD", "ROAD", "WAY", "CIR", "CIRCLE", "TRL", "TRAIL",
        "PKWY", "PARKWAY", "HWY", "HIGHWAY", "TER", "TERRACE",
    }

    # Mapping from full names to abbreviations (for retry logic)
    abbreviations = {
        "STREET": "St", "AVENUE": "Ave", "BOULEVARD": "Blvd",
        "DRIVE": "Dr", "LANE": "Ln", "COURT": "Ct", "PLACE": "Pl",
        "ROAD": "Rd", "CIRCLE": "Cir", "TRAIL": "Trl",
        "PARKWAY": "Pkwy", "HIGHWAY": "Hwy", "TERRACE": "Ter",
    }

    # Directional suffixes (post-direction, e.g., "Ave SE")
    directions = {"N", "S", "E", "W", "NE", "NW", "SE", "SW",
                  "NORTH", "SOUTH", "EAST", "WEST",
                  "NORTHEAST", "NORTHWEST", "SOUTHEAST", "SOUTHWEST"}

    # Normalize directions to abbreviations
    direction_abbrev = {
        "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
        "NORTHEAST": "NE", "NORTHWEST": "NW", "SOUTHEAST": "SE", "SOUTHWEST": "SW",
    }

    tokens = remainder.split()
    street_type = ""
    street_name = remainder
    post_direction = ""
    pre_direction = ""

    # Check for post-direction at the end (e.g., "28th Ave SE")
    if len(tokens) >= 2 and tokens[-1].upper().rstrip(".,") in directions:
        post_direction = tokens[-1].upper().rstrip(".,")
        # Normalize to abbreviation
        if post_direction in direction_abbrev:
            post_direction = direction_abbrev[post_direction]
        tokens = tokens[:-1]

    # Check for street type
    if tokens and tokens[-1].upper().rstrip(".,") in suffixes:
        street_type = tokens[-1].rstrip(".,")
        street_name = " ".join(tokens[:-1])

        # Convert to abbreviation if requested
        if use_abbreviations and street_type.upper() in abbreviations:
            street_type = abbreviations[street_type.upper()]
    else:
        street_name = " ".join(tokens)

    # Check for pre-direction at the start of street name (e.g., "N Oak", "W. Dudley")
    name_tokens = street_name.split()
    if name_tokens and name_tokens[0].upper().rstrip(".,") in directions:
        pre_direction = name_tokens[0].upper().rstrip(".,")
        if pre_direction in direction_abbrev:
            pre_direction = direction_abbrev[pre_direction]
        street_name = " ".join(name_tokens[1:])

    result = {"StreetNumber": street_number, "StreetName": street_name}
    if street_type:
        result["StreetType"] = street_type
    if pre_direction:
        result["StreetPreDirection"] = pre_direction
    if post_direction:
        result["StreetPostDirection"] = post_direction

    logger.debug(f"Parsed address: {result}")
    return result


# State FIPS code lookup
STATE_FIPS = {
    "AL": 1, "AK": 2, "AZ": 4, "AR": 5, "CA": 6, "CO": 8, "CT": 9,
    "DE": 10, "FL": 12, "GA": 13, "HI": 15, "ID": 16, "IL": 17,
    "IN": 18, "IA": 19, "KS": 20, "KY": 21, "LA": 22, "ME": 23,
    "MD": 24, "MA": 25, "MI": 26, "MN": 27, "MS": 28, "MO": 29,
    "MT": 30, "NE": 31, "NV": 32, "NH": 33, "NJ": 34, "NM": 35,
    "NY": 36, "NC": 37, "ND": 38, "OH": 39, "OK": 40, "OR": 41,
    "PA": 42, "RI": 44, "SC": 45, "SD": 46, "TN": 47, "TX": 48,
    "UT": 49, "VT": 50, "VA": 51, "WA": 53, "WV": 54, "WI": 55,
    "WY": 56, "DC": 11,
}


# =============================================================================
# DataTree Client (handles auth + API calls)
# =============================================================================

class DataTreeClient:
    """HTTP client with JWT token management for DataTree API."""

    def __init__(self, config: DataTreeConfig) -> None:
        self.config = config
        self._token: str | None = None
        self._token_expires: float = 0

    async def authenticate(self) -> str:
        """Authenticate with DataTree and get JWT token."""
        if self._token and time.time() < self._token_expires:
            return self._token

        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            response = await client.post(
                f"{self.config.base_url}/api/Login/AuthenticateClient",
                json={
                    "ClientId": self.config.client_id,
                    "ClientSecretKey": self.config.client_secret,
                },
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            data = response.json()

        # Extract token — response is a plain JWT string, or {"Token": "...", ...}
        if isinstance(data, str):
            token = data
        elif isinstance(data, dict):
            token = data.get("Token") or data.get("token") or data.get("access_token")
        else:
            token = None

        if not token:
            raise RuntimeError(f"No token in auth response: {type(data)}")

        self._token = token
        # Cache for 50 minutes (tokens typically last 60 min)
        self._token_expires = time.time() + 3000
        return token

    async def call_api(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        """Make authenticated API call."""
        token = await self.authenticate()

        logger.info("Calling DataTree API: %s", endpoint)
        logger.debug("Request body: %s", json.dumps(body, default=str)[:500])

        start_time = time.time()
        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            response = await client.post(
                f"{self.config.base_url}{endpoint}",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
            )
            elapsed = time.time() - start_time

            logger.debug("Response status: %d (%.2fs)", response.status_code, elapsed)

            if response.status_code != 200:
                error_text = response.text[:500]
                logger.error("API error %d: %s", response.status_code, error_text)
                # Include error details in exception message for retry logic
                raise httpx.HTTPStatusError(
                    f"{response.status_code} - {error_text}",
                    request=response.request,
                    response=response,
                )
            result = response.json()
            logger.debug("Response keys: %s", list(result.keys()) if isinstance(result, dict) else type(result))
            return result

    async def get_county_fips(self, zip_code: str) -> dict[str, int] | None:
        """Get StateFips and CountyFips from ZIP code."""
        try:
            data = await self.call_api("/api/Search/GetCountyFipsByZip", {
                "ZipCode": zip_code,
            })
            # Response: {"Data": {"CountyFips": "6019", "StateFips": "06", ...}}
            fips_data = data
            if isinstance(data, dict) and "Data" in data:
                fips_data = data["Data"]
            if isinstance(fips_data, list) and fips_data:
                fips_data = fips_data[0]

            if isinstance(fips_data, dict):
                state_fips = fips_data.get("StateFips") or fips_data.get("stateFips")
                county_fips = fips_data.get("CountyFips") or fips_data.get("countyFips")
                # Values may be strings like "06" or "6019" — convert to int
                return {
                    "StateFips": int(state_fips) if state_fips else None,
                    "CountyFips": int(county_fips) if county_fips else None,
                }
        except Exception as e:
            print(f"DataTree county FIPS lookup failed: {e}")
        return None


# =============================================================================
# DataTree AVM Vendor
# =============================================================================

class DataTreeAVMVendor:
    """DataTree AVM vendor — uses POST /api/Report/GetReport."""

    name = "DataTree"
    priority = 1

    def __init__(self) -> None:
        self.config = get_config()
        self._client: DataTreeClient | None = None

    def _get_client(self) -> DataTreeClient:
        if not self._client:
            if not self.config:
                raise RuntimeError("DataTree API not configured")
            self._client = DataTreeClient(self.config)
        return self._client

    def is_configured(self) -> bool:
        return self.config is not None

    async def order_avm(self, address: Address) -> dict[str, Any]:
        """Order an AVM report using ProcisionPremier product.

        If the API rejects the street type (e.g., "Street"), automatically
        retries with abbreviated form (e.g., "St").
        """
        order_id = str(uuid4())
        logger.info("Ordering AVM for: %s, %s, %s %s",
                   address.street, address.city, address.state, address.zip_code)

        if not self.is_configured():
            logger.warning("DataTree API not configured")
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "NOT_CONFIGURED", "message": "DataTree API not configured"},
            }

        try:
            client = self._get_client()

            # Get FIPS codes (only need to do this once)
            state_fips = STATE_FIPS.get(address.state.upper(), 0)
            county_fips = None
            if address.zip_code:
                fips = await client.get_county_fips(address.zip_code)
                if fips:
                    state_fips = fips.get("StateFips") or state_fips
                    county_fips = fips.get("CountyFips")

            # Try with original address first, then with abbreviated street type
            last_error = None
            for attempt, use_abbrev in enumerate([False, True]):
                # Parse street into components
                addr_parts = _parse_street_address(address.street, use_abbreviations=use_abbrev)
                logger.debug("Parsed address: %s", addr_parts)

                # Build address detail for DataTree API
                address_detail: dict[str, Any] = {
                    "StreetNumber": addr_parts["StreetNumber"],
                    "StreetName": addr_parts["StreetName"],
                    "City": address.city,
                    "ZipCode": address.zip_code,
                }
                if addr_parts.get("StreetType"):
                    address_detail["StreetType"] = addr_parts["StreetType"]
                if address.unit:
                    address_detail["UnitNumber"] = address.unit
                if state_fips:
                    address_detail["StateFips"] = state_fips
                if county_fips:
                    address_detail["CountyFips"] = county_fips

                # Request AVM report using ProcisionPremier (Procision is First American's AVM)
                body: dict[str, Any] = {
                    "ProductNames": ["ProcisionPremier"],
                    "SearchType": "ADDRESS",
                    "AddressDetail": address_detail,
                    "ReferenceId": order_id,
                }

                try:
                    response = await client.call_api("/api/Report/GetReport", body)
                    # Parse the response
                    return self._parse_avm_response(response, order_id)
                except Exception as e:
                    error_str = str(e)
                    last_error = e
                    # If this is a StreetTypes error and we haven't tried abbreviations yet
                    if "StreetTypes" in error_str and not use_abbrev:
                        logger.info("StreetType rejected for AVM, retrying with abbreviated form...")
                        continue
                    raise  # Re-raise other errors or if retry also failed

            # If we get here, both attempts failed
            raise last_error if last_error else RuntimeError("AVM request failed")

        except httpx.HTTPStatusError as e:
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": f"HTTP_{e.response.status_code}", "message": str(e)},
            }
        except Exception as e:
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "API_ERROR", "message": str(e)},
            }

    def _parse_avm_response(self, response: dict[str, Any], order_id: str) -> dict[str, Any]:
        """Parse DataTree ProcisionPremier response into our standard format.

        Response structure:
        {
            "Reports": [{
                "ReportStatus": "Ready",
                "Data": {
                    "ValuationSummary": {
                        "EstimatedValue": 1079000.0,
                        "EstimatedValueLow": 1012000.0,
                        "EstimatedValueHigh": 1150000.0,
                        "ConfidenceScore": 86,
                        "AVMStatusCode": "701",
                        "AVMStatusMessage": "Valuation Successful"
                    }
                }
            }]
        }
        """
        now = datetime.now(timezone.utc)

        # Check for top-level errors
        if response.get("Message") and "unauthorized" in response.get("Message", "").lower():
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "UNAUTHORIZED", "message": response.get("Message")},
            }

        # Extract from Reports array (new Procision format)
        reports = response.get("Reports", [])
        if not reports:
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "NO_REPORTS", "message": "No reports in response"},
                "raw_response": response,
            }

        report_data = reports[0].get("Data", {})
        report_status = reports[0].get("ReportStatus", "")

        if report_status != "Ready":
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "NOT_READY", "message": f"Report status: {report_status}"},
            }

        # Extract ValuationSummary from Procision response
        valuation = report_data.get("ValuationSummary", {})

        avm_value = valuation.get("EstimatedValue")
        avm_low = valuation.get("EstimatedValueLow")
        avm_high = valuation.get("EstimatedValueHigh")
        confidence = valuation.get("ConfidenceScore")
        avm_status = valuation.get("AVMStatusMessage", "")

        if not avm_value:
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "NO_VALUE", "message": f"No AVM value. Status: {avm_status}"},
                "raw_response": response,
            }

        # Convert to cents (values come as dollars)
        estimated_value_cents = int(float(avm_value) * 100)
        low_cents = int(float(avm_low) * 100) if avm_low else None
        high_cents = int(float(avm_high) * 100) if avm_high else None
        conf_score = float(confidence) if confidence else None
        conf_level = self._map_confidence_level(conf_score) if conf_score else AVMConfidence.MEDIUM

        report = AVMReport(
            id=str(uuid4()),
            vendor_name=self.name,
            vendor_order_id=order_id,
            status="COMPLETED",
            estimated_value=estimated_value_cents,
            confidence_score=conf_score,
            confidence_level=conf_level,
            value_low=low_cents,
            value_high=high_cents,
            order_date=now,
            completed_date=now,
            property_data=report_data,
        )

        logger.info("AVM result: $%s (confidence: %s)", f"{avm_value:,.0f}", conf_score)

        return {
            "success": True,
            "order_id": order_id,
            "report": report,
        }

    def _extract_value(self, data: dict[str, Any], keys: list[str]) -> Any:
        """Extract a value from dict trying multiple key names (case-insensitive)."""
        if not isinstance(data, dict):
            return None
        # Try exact match first
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        # Try case-insensitive
        lower_map = {k.lower(): v for k, v in data.items()}
        for key in keys:
            val = lower_map.get(key.lower())
            if val is not None:
                return val
        return None

    def _map_confidence_level(self, score: float) -> AVMConfidence:
        if score >= 80:
            return AVMConfidence.HIGH
        if score >= 60:
            return AVMConfidence.MEDIUM
        if score >= 40:
            return AVMConfidence.LOW
        return AVMConfidence.NO_VALUE


# =============================================================================
# DataTree Property Service
# =============================================================================

class DataTreePropertyService:
    """Property data service via DataTree API.

    Available products (CamelCase, no spaces):
    - PropertyDetailReport: Property characteristics, tax, owner info, sale history
    - OpenLienReport: Current mortgages/liens with balances
    - ProcisionPremier: AVM valuation with confidence score
    - SalesComparables: Comparable sales data
    - TotalViewReport: Comprehensive title and lien data
    """

    def __init__(self) -> None:
        self.config = get_config()
        self._client: DataTreeClient | None = None

    def _get_client(self) -> DataTreeClient:
        if not self._client:
            if not self.config:
                raise RuntimeError("DataTree API not configured")
            self._client = DataTreeClient(self.config)
        return self._client

    def is_configured(self) -> bool:
        return self.config is not None

    def _build_address_detail(
        self, address: Address, state_fips: int, county_fips: int | None,
        *, use_abbreviations: bool = False
    ) -> dict[str, Any]:
        """Build AddressDetail dict for DataTree API.

        Args:
            address: Property address
            state_fips: State FIPS code
            county_fips: County FIPS code
            use_abbreviations: If True, use abbreviated street types (St instead of Street)
        """
        addr_parts = _parse_street_address(address.street, use_abbreviations=use_abbreviations)

        # Normalize ZIP code: strip +4 extension (e.g., "93657-9345" → "93657")
        zip_code = address.zip_code.split("-")[0] if address.zip_code else ""

        address_detail: dict[str, Any] = {
            "StreetNumber": addr_parts.get("StreetNumber", ""),
            "StreetName": addr_parts.get("StreetName", address.street),
            "City": address.city,
            "ZipCode": zip_code,
        }
        if addr_parts.get("StreetType"):
            address_detail["StreetType"] = addr_parts["StreetType"]
        if addr_parts.get("StreetPreDirection"):
            address_detail["StreetPreDirection"] = addr_parts["StreetPreDirection"]
        if addr_parts.get("StreetPostDirection"):
            address_detail["StreetPostDirection"] = addr_parts["StreetPostDirection"]
        if address.unit:
            address_detail["UnitNumber"] = address.unit
        if state_fips:
            address_detail["StateFips"] = state_fips
        if county_fips:
            address_detail["CountyFips"] = county_fips

        return address_detail

    async def get_property_report(self, address: Address) -> DataTreePropertyReport | None:
        """
        Fetch comprehensive property report from DataTree.

        Uses PropertyDetailReport for property characteristics, tax, and owner info.
        Returns DataTreePropertyReport dataclass.
        """
        if not self.is_configured():
            logger.warning("DataTree API not configured")
            return None

        try:
            client = self._get_client()
            logger.info("Fetching property report for: %s, %s, %s %s",
                       address.street, address.city, address.state, address.zip_code)

            # Get FIPS codes
            state_fips = STATE_FIPS.get(address.state.upper(), 0)
            county_fips = None
            if address.zip_code:
                fips = await client.get_county_fips(address.zip_code)
                if fips:
                    state_fips = fips.get("StateFips") or state_fips
                    county_fips = fips.get("CountyFips")

            address_detail = self._build_address_detail(address, state_fips, county_fips)

            # Request PropertyDetailReport
            # IMPORTANT: SearchType must be "ADDRESS" string, ProductNames are CamelCase
            body: dict[str, Any] = {
                "ProductNames": ["PropertyDetailReport"],
                "SearchType": "ADDRESS",
                "AddressDetail": address_detail,
            }

            logger.debug("Requesting PropertyDetailReport")
            response = await client.call_api("/api/Report/GetReport", body)

            # Parse the response into our model
            return self._parse_property_report(response)

        except httpx.HTTPStatusError as e:
            logger.error("HTTP error %d: %s", e.response.status_code, e.response.text[:500])
            return None
        except Exception as e:
            logger.error("Property report failed: %s", str(e))
            return None

    def _parse_property_report(self, response: dict[str, Any]) -> DataTreePropertyReport:
        """Parse DataTree PropertyDetailReport response into DataTreePropertyReport.

        Response structure:
        {
            "Reports": [{
                "Data": {
                    "PropertyCharacteristics": {...},
                    "OwnerInformation": {...},
                    "TaxInformation": {...},
                    "SiteInformation": {...},
                    "LocationInformation": {...},
                    ...
                }
            }]
        }
        """
        logger.debug("Parsing property report response")

        # Extract data from Reports array
        reports = response.get("Reports", [])
        if not reports:
            logger.warning("No reports in response")
            return DataTreePropertyReport(raw_data=response)

        data = reports[0].get("Data", {})
        logger.debug("Report data sections: %s", list(data.keys()))

        # Extract from nested sections
        chars = data.get("PropertyCharacteristics", {})
        owner = data.get("OwnerInformation", {})
        tax = data.get("TaxInformation", {})
        site = data.get("SiteInformation", {})
        location = data.get("LocationInformation", {})
        subject = data.get("SubjectProperty", {})

        # Property characteristics (ensure int types for numeric fields)
        property_type = site.get("LandUse") or site.get("CountyUse")
        year_built = int(chars.get("YearBuilt")) if chars.get("YearBuilt") else None
        square_feet = int(chars.get("LivingArea") or chars.get("GrossArea") or 0) if (chars.get("LivingArea") or chars.get("GrossArea")) else None
        bedrooms = int(chars.get("Bedrooms")) if chars.get("Bedrooms") else None
        bathrooms = (chars.get("FullBath") or 0) + (chars.get("HalfBath") or 0) * 0.5
        lot_size = site.get("LotArea") or site.get("UsableLot")
        units = 1  # Default, would need different product for multi-unit
        stories = int(chars.get("NumberOfStories") or 1) if chars.get("NumberOfStories") else None
        pool = chars.get("Pool") not in (None, "", "None", "NO")
        garage = chars.get("GarageCapacity")

        # Tax/valuation (PropertyDetailReport has assessed, not AVM)
        assessed_value = int(tax.get("AssessedValue", 0) * 100) if tax.get("AssessedValue") else None
        land_value = int(tax.get("LandValue", 0) * 100) if tax.get("LandValue") else None
        improvement_value = int(tax.get("ImprovementValue", 0) * 100) if tax.get("ImprovementValue") else None
        annual_taxes = int(tax.get("PropertyTax", 0) * 100) if tax.get("PropertyTax") else None
        tax_year = tax.get("TaxYear") or tax.get("AssessedYear")

        # Owner info
        owner_names = []
        if owner.get("Owner1FullName"):
            owner_names.append(owner["Owner1FullName"])
        if owner.get("Owner2FullName"):
            owner_names.append(owner["Owner2FullName"])

        owner_occupied = owner.get("Occupancy") == "Owner Occupied"
        ownership_type = owner.get("OwnerVestingInfo", {}).get("VestingOwnershipRight")

        mailing = owner.get("MailingAddress", {})
        mailing_address = {
            "street": mailing.get("StreetAddress", ""),
            "city": mailing.get("City", ""),
            "state": mailing.get("State", ""),
            "zip": mailing.get("Zip9", ""),
        }

        # APN
        apn = location.get("APN") or subject.get("SitusAddress", {}).get("APN")

        report = DataTreePropertyReport(
            property_type=property_type,
            year_built=year_built,
            square_feet=square_feet,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            lot_size_sqft=lot_size,
            units=units,
            stories=stories,
            pool=pool,
            garage_spaces=garage,
            estimated_value=None,  # Use ProcisionPremier for AVM
            assessed_value=assessed_value,
            land_value=land_value,
            improvement_value=improvement_value,
            annual_taxes=annual_taxes,
            tax_year=tax_year,
            owner_names=owner_names,
            owner_occupied=owner_occupied,
            ownership_type=ownership_type,
            mailing_address=mailing_address,
            existing_loans=None,  # Use OpenLienReport for mortgages
            total_loan_balance=None,
            mortgage_count=0,
            estimated_equity=None,
            ltv_ratio=None,
            apn=apn,
            raw_data=response,
        )

        logger.info("Property report parsed: %s beds, %s baths, %s sqft, assessed=$%s",
                   bedrooms, bathrooms, square_feet,
                   f"{assessed_value / 100:,.0f}" if assessed_value else "N/A")

        return report

    async def get_open_liens(self, address: Address) -> dict[str, Any] | None:
        """Fetch open liens/mortgages for a property using OpenLienReport.

        Returns dict with:
        - combined_balance: Total estimated loan balance (cents)
        - combined_ltv: Combined loan-to-value percentage
        - liens: List of individual liens with details
        """
        if not self.is_configured():
            logger.warning("DataTree API not configured")
            return None

        try:
            client = self._get_client()
            logger.info("Fetching open liens for: %s, %s, %s %s",
                       address.street, address.city, address.state, address.zip_code)

            # Get FIPS codes
            state_fips = STATE_FIPS.get(address.state.upper(), 0)
            county_fips = None
            if address.zip_code:
                fips = await client.get_county_fips(address.zip_code)
                if fips:
                    state_fips = fips.get("StateFips") or state_fips
                    county_fips = fips.get("CountyFips")

            address_detail = self._build_address_detail(address, state_fips, county_fips)

            body: dict[str, Any] = {
                "ProductNames": ["OpenLienReport"],
                "SearchType": "ADDRESS",
                "AddressDetail": address_detail,
            }

            response = await client.call_api("/api/Report/GetReport", body)

            # Parse response
            reports = response.get("Reports", [])
            if not reports:
                return None

            data = reports[0].get("Data", {})
            open_liens = data.get("OpenLiens", {})
            transactions = data.get("Transactions", [])

            # Extract summary
            combined_balance = open_liens.get("CombinedEstimatedLoanBalance", 0)
            combined_ltv = open_liens.get("CombinedLoanToValuePercentage")

            # Parse individual liens from transactions
            liens = []
            for tx in transactions:
                if tx.get("Type") == 1:  # FINANCE type
                    lien = {
                        "position": tx.get("LienPosition"),
                        "lender": tx.get("Lender") or tx.get("SellerLender"),
                        "borrower": tx.get("Borrowers") or tx.get("BuyerBorrower"),
                        "original_amount": tx.get("LoanAmount"),
                        "loan_type": tx.get("MortgageLoanType"),
                        "term": tx.get("MortgageTerm"),
                        "rate_type": tx.get("MortageRateType"),
                        "interest_rate": float(tx.get("MortgageRate", 0)) if tx.get("MortgageRate") else None,
                        "doc_date": tx.get("DocDate"),
                        "recording_date": tx.get("TxDate"),
                        "doc_id": tx.get("DocId"),
                    }
                    liens.append(lien)

            logger.info("Found %d open liens, total balance: $%s, LTV: %s%%",
                       len(liens), f"{combined_balance:,.0f}", combined_ltv)

            return {
                "combined_balance_cents": int(combined_balance * 100),
                "combined_ltv": combined_ltv,
                "lien_count": len(liens),
                "liens": liens,
                "raw_data": data,
            }

        except Exception as e:
            logger.error("Open lien report failed: %s", str(e))
            return None

    async def get_full_property_data(self, address: Address) -> DataTreePropertyReport | None:
        """
        Fetch property details AND liens in a SINGLE API call.

        Requests both PropertyDetailReport and OpenLienReport together,
        then merges the results into one DataTreePropertyReport.

        This is more efficient than calling get_property_report() and
        get_open_liens() separately.

        If the API rejects the street type (e.g., "Street"), automatically
        retries with abbreviated form (e.g., "St").
        """
        if not self.is_configured():
            logger.warning("DataTree API not configured")
            return None

        try:
            client = self._get_client()
            logger.info("Fetching full property data for: %s, %s, %s %s",
                       address.street, address.city, address.state, address.zip_code)

            # Get FIPS codes
            state_fips = STATE_FIPS.get(address.state.upper(), 0)
            county_fips = None
            if address.zip_code:
                fips = await client.get_county_fips(address.zip_code)
                if fips:
                    state_fips = fips.get("StateFips") or state_fips
                    county_fips = fips.get("CountyFips")

            # Try with original address first, then with abbreviated street type
            for attempt, use_abbrev in enumerate([False, True]):
                address_detail = self._build_address_detail(
                    address, state_fips, county_fips, use_abbreviations=use_abbrev
                )

                # Request BOTH products in a single call
                body: dict[str, Any] = {
                    "ProductNames": ["PropertyDetailReport", "OpenLienReport"],
                    "SearchType": "ADDRESS",
                    "AddressDetail": address_detail,
                }

                logger.debug("Requesting PropertyDetailReport + OpenLienReport (combined)")
                try:
                    response = await client.call_api("/api/Report/GetReport", body)
                    break  # Success, exit retry loop
                except Exception as e:
                    error_str = str(e)
                    # If this is a StreetTypes error and we haven't tried abbreviations yet
                    if "StreetTypes" in error_str and not use_abbrev:
                        logger.info("StreetType rejected, retrying with abbreviated form...")
                        continue
                    raise  # Re-raise other errors or if retry also failed

            # Parse reports - there should be 2 reports in the response
            reports = response.get("Reports", [])
            if not reports:
                logger.warning("No reports in combined response")
                return DataTreePropertyReport(raw_data=response)

            # Find PropertyDetailReport and OpenLienReport in the response
            property_data = None
            lien_data = None

            for report in reports:
                data = report.get("Data", {})
                # PropertyDetailReport has PropertyCharacteristics
                if "PropertyCharacteristics" in data:
                    property_data = data
                # OpenLienReport has OpenLiens
                if "OpenLiens" in data:
                    lien_data = data

            # If we only got one report, it might have both
            if len(reports) == 1:
                data = reports[0].get("Data", {})
                if "PropertyCharacteristics" in data:
                    property_data = data
                if "OpenLiens" in data:
                    lien_data = data

            # Parse property characteristics from property_data
            result = self._parse_property_report_data(property_data or {})

            # Add lien data if we have it
            if lien_data:
                open_liens = lien_data.get("OpenLiens", {})
                transactions = lien_data.get("Transactions", [])

                combined_balance = open_liens.get("CombinedEstimatedLoanBalance", 0)
                combined_ltv = open_liens.get("CombinedLoanToValuePercentage")

                liens = []
                for tx in transactions:
                    if tx.get("Type") == 1:  # FINANCE type
                        lien = {
                            "position": tx.get("LienPosition"),
                            "lenderName": tx.get("Lender") or tx.get("SellerLender"),
                            "originalAmount": tx.get("LoanAmount"),
                            "estimatedBalance": tx.get("LoanAmount"),  # Use original as estimate
                            "loanType": tx.get("MortgageLoanType"),
                            "interestRate": float(tx.get("MortgageRate", 0)) if tx.get("MortgageRate") else None,
                            "recordingDate": tx.get("TxDate"),
                            "isActive": True,
                            "source": "DataTree",
                        }
                        liens.append(lien)

                result.existing_loans = liens
                result.total_loan_balance = int(combined_balance * 100)  # Convert to cents
                result.mortgage_count = len(liens)
                result.ltv_ratio = combined_ltv

                logger.info("Full property data: %s beds, %s baths, %s sqft, %d liens, balance=$%s",
                           result.bedrooms, result.bathrooms, result.square_feet,
                           result.mortgage_count, f"{combined_balance:,.0f}")
            else:
                logger.info("Full property data: %s beds, %s baths, %s sqft (no lien data)",
                           result.bedrooms, result.bathrooms, result.square_feet)

            return result

        except Exception as e:
            logger.error("Full property data fetch failed: %s", str(e))
            return None

    def _parse_property_report_data(self, data: dict[str, Any]) -> DataTreePropertyReport:
        """Parse property report data dict into DataTreePropertyReport."""
        chars = data.get("PropertyCharacteristics", {})
        owner = data.get("OwnerInformation", {})
        tax = data.get("TaxInformation", {})
        site = data.get("SiteInformation", {})
        location = data.get("LocationInformation", {})
        subject = data.get("SubjectProperty", {})

        # Property characteristics (ensure int types for numeric fields)
        property_type = site.get("LandUse") or site.get("CountyUse")
        year_built = int(chars.get("YearBuilt")) if chars.get("YearBuilt") else None
        square_feet = int(chars.get("LivingArea") or chars.get("GrossArea") or 0) if (chars.get("LivingArea") or chars.get("GrossArea")) else None
        bedrooms = int(chars.get("Bedrooms")) if chars.get("Bedrooms") else None
        bathrooms = (chars.get("FullBath") or 0) + (chars.get("HalfBath") or 0) * 0.5
        lot_size = site.get("LotArea") or site.get("UsableLot")
        units = 1
        stories = int(chars.get("NumberOfStories") or 1) if chars.get("NumberOfStories") else None
        pool = chars.get("Pool") not in (None, "", "None", "NO")
        garage = chars.get("GarageCapacity")

        # Tax/valuation
        assessed_value = int(tax.get("AssessedValue", 0) * 100) if tax.get("AssessedValue") else None
        land_value = int(tax.get("LandValue", 0) * 100) if tax.get("LandValue") else None
        improvement_value = int(tax.get("ImprovementValue", 0) * 100) if tax.get("ImprovementValue") else None
        annual_taxes = int(tax.get("PropertyTax", 0) * 100) if tax.get("PropertyTax") else None
        tax_year = tax.get("TaxYear") or tax.get("AssessedYear")

        # Owner info
        owner_names = []
        if owner.get("Owner1FullName"):
            owner_names.append(owner["Owner1FullName"])
        if owner.get("Owner2FullName"):
            owner_names.append(owner["Owner2FullName"])

        owner_occupied = owner.get("Occupancy") == "Owner Occupied"
        ownership_type = owner.get("OwnerVestingInfo", {}).get("VestingOwnershipRight")

        mailing = owner.get("MailingAddress", {})
        mailing_address = {
            "street": mailing.get("StreetAddress", ""),
            "city": mailing.get("City", ""),
            "state": mailing.get("State", ""),
            "zip": mailing.get("Zip9", ""),
        }

        # APN
        apn = location.get("APN") or subject.get("SitusAddress", {}).get("APN")

        return DataTreePropertyReport(
            property_type=property_type,
            year_built=year_built,
            square_feet=square_feet,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            lot_size_sqft=lot_size,
            units=units,
            stories=stories,
            pool=pool,
            garage_spaces=garage,
            estimated_value=None,  # Use ProcisionPremier for AVM
            assessed_value=assessed_value,
            land_value=land_value,
            improvement_value=improvement_value,
            annual_taxes=annual_taxes,
            tax_year=tax_year,
            owner_names=owner_names,
            owner_occupied=owner_occupied,
            ownership_type=ownership_type,
            mailing_address=mailing_address,
            apn=apn,
            raw_data=data,
        )

    def _extract(self, data: dict[str, Any], keys: list[str]) -> Any:
        """Extract a value trying multiple key names."""
        if not isinstance(data, dict):
            return None
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        # Try case-insensitive
        lower_map = {k.lower(): v for k, v in data.items()}
        for key in keys:
            val = lower_map.get(key.lower())
            if val is not None:
                return val
        return None

    def _extract_int(self, data: dict[str, Any], keys: list[str]) -> int | None:
        val = self._extract(data, keys)
        if val is None:
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return None

    def _extract_float(self, data: dict[str, Any], keys: list[str]) -> float | None:
        val = self._extract(data, keys)
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def _extract_cents(self, data: dict[str, Any], keys: list[str]) -> int | None:
        """Extract a dollar value and convert to cents."""
        val = self._extract_float(data, keys)
        if val is None:
            return None
        return int(val * 100)

    async def search_property(self, address: Address) -> dict[str, Any] | None:
        """Search for a property by address (basic search)."""
        if not self.is_configured():
            return None

        try:
            client = self._get_client()

            body = {
                "ProductName": "PropertySearch",
                "Filters": [
                    {"FilterName": "StreetAddress", "FilterOperator": "eq", "FilterValues": [address.street]},
                    {"FilterName": "City", "FilterOperator": "eq", "FilterValues": [address.city]},
                    {"FilterName": "State", "FilterOperator": "eq", "FilterValues": [address.state]},
                    {"FilterName": "ZipCode", "FilterOperator": "eq", "FilterValues": [address.zip_code]},
                ],
                "MaxReturn": 5,
                "CountOnly": False,
            }

            response = await client.call_api("/api/Search/PropertySearch", body)
            return response

        except Exception as e:
            logger.error("Property search failed: %s", str(e))
            return None


# Export singleton instances
datatree_avm = DataTreeAVMVendor()
datatree_property = DataTreePropertyService()
