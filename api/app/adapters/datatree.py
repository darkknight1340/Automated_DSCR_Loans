"""
DataTree API Adapter

Integrates with First American's DataTree/Digital Gateway API for:
- AVM (Automated Valuation Model)
- Property data
- Ownership information

API Documentation: https://developer.firstam.io/api/docs
Authentication: App ID + App Key headers
"""

import os
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

import httpx


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class DataTreeConfig:
    """DataTree API configuration."""
    app_id: str
    app_key: str
    base_url: str
    timeout: int


def get_config() -> DataTreeConfig | None:
    """Get DataTree configuration from environment."""
    app_id = os.getenv("DATATREE_APP_ID")
    app_key = os.getenv("DATATREE_APP_KEY")

    if not app_id or not app_key or app_id == "demo" or app_key == "demo":
        print("DataTree API credentials not configured. Set DATATREE_APP_ID and DATATREE_APP_KEY for real data.")
        return None

    return DataTreeConfig(
        app_id=app_id,
        app_key=app_key,
        base_url=os.getenv("DATATREE_BASE_URL", "https://api.firstam.io"),
        timeout=int(os.getenv("DATATREE_TIMEOUT", "30000")),
    )


# =============================================================================
# Types
# =============================================================================

class AVMConfidence(str, Enum):
    """AVM confidence levels."""
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
class AVMComparable:
    """Comparable sale for AVM."""
    address: str
    distance: float
    sale_date: datetime
    sale_price: int  # cents
    square_feet: int | None = None
    price_per_sqft: int | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    similarity: float = 0.0


@dataclass
class PropertyCharacteristics:
    """Property characteristics."""
    property_type: str
    year_built: int | None = None
    square_feet: int | None = None
    lot_size: int | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    stories: int | None = None


@dataclass
class AVMReport:
    """AVM valuation report."""
    id: str
    vendor_name: str
    vendor_order_id: str
    vendor_product_code: str
    order_date: datetime
    completed_date: datetime | None
    status: str
    estimated_value: int | None  # cents
    confidence_score: float | None
    confidence_level: AVMConfidence | None
    value_low: int | None
    value_high: int | None
    value_range: int | None
    property_characteristics: PropertyCharacteristics | None = None
    last_sale_date: datetime | None = None
    last_sale_price: int | None = None
    comparables: list[AVMComparable] | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class DataTreePropertyResponse:
    """Property details response from DataTree."""
    apn: str
    address: dict[str, str]
    characteristics: dict[str, Any]
    ownership: dict[str, Any] | None = None
    assessment: dict[str, Any] | None = None
    mortgages: list[dict[str, Any]] | None = None


# =============================================================================
# DataTree AVM Vendor
# =============================================================================

class DataTreeAVMVendor:
    """DataTree AVM vendor implementation."""

    name = "DataTree"
    product_code = "PROCISION_POWER"
    priority = 1

    def __init__(self) -> None:
        self.config = get_config()

    def is_configured(self) -> bool:
        """Check if DataTree is configured."""
        return self.config is not None

    async def order_avm(self, address: Address) -> dict[str, Any]:
        """Order an AVM report for a property."""
        order_id = str(uuid4())

        if not self.is_configured():
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "NOT_CONFIGURED", "message": "DataTree API not configured"},
            }

        try:
            response = await self._call_api("/valuation/avm", {
                "address": {
                    "streetAddress": f"{address.street}{f' {address.unit}' if address.unit else ''}",
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip_code,
                },
                "productType": "PROCISION_POWER",
            })

            if response.get("status") == "ERROR" or response.get("error"):
                return {
                    "success": False,
                    "order_id": order_id,
                    "error": response.get("error") or {"code": "UNKNOWN", "message": "AVM request failed"},
                }

            if response.get("status") == "NO_VALUE" or not response.get("avm"):
                return {
                    "success": False,
                    "order_id": order_id,
                    "error": {"code": "NO_VALUE", "message": "No AVM value available for this property"},
                }

            avm_data = response["avm"]
            confidence_level = self._map_confidence_level(avm_data.get("confidenceScore", 0))

            property_chars = None
            if response.get("property"):
                prop = response["property"]
                property_chars = PropertyCharacteristics(
                    property_type=self._map_property_type(prop.get("propertyType", "SFR")),
                    year_built=prop.get("yearBuilt"),
                    square_feet=prop.get("squareFeet"),
                    lot_size=prop.get("lotSize"),
                    bedrooms=prop.get("bedrooms"),
                    bathrooms=prop.get("bathrooms"),
                    stories=prop.get("stories"),
                )

            comparables = None
            if response.get("comparables"):
                comparables = [
                    AVMComparable(
                        address=comp["address"],
                        distance=comp["distance"],
                        sale_date=datetime.fromisoformat(comp["saleDate"]),
                        sale_price=int(comp["salePrice"] * 100),
                        square_feet=comp.get("squareFeet"),
                        bedrooms=comp.get("bedrooms"),
                        bathrooms=comp.get("bathrooms"),
                        similarity=comp.get("similarity", 0),
                    )
                    for comp in response["comparables"]
                ]

            report = AVMReport(
                id=str(uuid4()),
                vendor_name=self.name,
                vendor_order_id=response.get("orderId", order_id),
                vendor_product_code=self.product_code,
                order_date=datetime.utcnow(),
                completed_date=datetime.utcnow(),
                status="COMPLETED",
                estimated_value=int(avm_data["estimatedValue"] * 100),
                confidence_score=avm_data.get("confidenceScore"),
                confidence_level=confidence_level,
                value_low=int(avm_data["valueLow"] * 100),
                value_high=int(avm_data["valueHigh"] * 100),
                value_range=int((avm_data["valueHigh"] - avm_data["valueLow"]) * 100),
                property_characteristics=property_chars,
                last_sale_date=datetime.fromisoformat(response["saleHistory"]["lastSaleDate"]) if response.get("saleHistory") else None,
                last_sale_price=int(response["saleHistory"]["lastSalePrice"] * 100) if response.get("saleHistory") else None,
                comparables=comparables,
            )

            return {
                "success": True,
                "order_id": report.vendor_order_id,
                "report": report,
            }

        except Exception as e:
            return {
                "success": False,
                "order_id": order_id,
                "error": {"code": "API_ERROR", "message": str(e)},
            }

    async def _call_api(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        """Make API call to DataTree."""
        if not self.config:
            raise RuntimeError("DataTree API not configured")

        async with httpx.AsyncClient(timeout=self.config.timeout / 1000) as client:
            response = await client.post(
                f"{self.config.base_url}{endpoint}",
                headers={
                    "Content-Type": "application/json",
                    "X-App-Id": self.config.app_id,
                    "X-App-Key": self.config.app_key,
                },
                json=body,
            )
            response.raise_for_status()
            return response.json()

    def _map_confidence_level(self, score: float) -> AVMConfidence:
        """Map confidence score to level."""
        if score >= 80:
            return AVMConfidence.HIGH
        if score >= 60:
            return AVMConfidence.MEDIUM
        if score >= 40:
            return AVMConfidence.LOW
        return AVMConfidence.NO_VALUE

    def _map_property_type(self, prop_type: str) -> str:
        """Map property type string to standard type."""
        normalized = prop_type.upper()
        if "CONDO" in normalized:
            return "CONDO"
        if "TOWN" in normalized:
            return "TOWNHOUSE"
        if "MULTI" in normalized or "PLEX" in normalized:
            return "MULTIFAMILY"
        if "DUPLEX" in normalized or "TRIPLEX" in normalized or "QUAD" in normalized:
            return "2_4_UNIT"
        return "SFR"


# =============================================================================
# DataTree Property Service
# =============================================================================

class DataTreePropertyService:
    """DataTree property data service."""

    def __init__(self) -> None:
        self.config = get_config()

    def is_configured(self) -> bool:
        """Check if configured."""
        return self.config is not None

    async def get_property_data(self, address: Address) -> DataTreePropertyResponse | None:
        """Get property details from DataTree."""
        if not self.is_configured():
            print("DataTree not configured, returning None")
            return None

        try:
            response = await self._call_api("/property/details", {
                "address": {
                    "streetAddress": f"{address.street}{f' {address.unit}' if address.unit else ''}",
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip_code,
                },
                "includeOwnership": True,
                "includeAssessment": True,
                "includeMortgage": True,
            })

            return DataTreePropertyResponse(
                apn=response.get("property", {}).get("apn", ""),
                address=response.get("property", {}).get("address", {}),
                characteristics=response.get("property", {}).get("characteristics", {}),
                ownership=response.get("ownership"),
                assessment=response.get("assessment"),
                mortgages=response.get("mortgages"),
            )
        except Exception as e:
            print(f"DataTree property lookup failed: {e}")
            return None

    async def _call_api(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        """Make API call to DataTree."""
        if not self.config:
            raise RuntimeError("DataTree API not configured")

        async with httpx.AsyncClient(timeout=self.config.timeout / 1000) as client:
            response = await client.post(
                f"{self.config.base_url}{endpoint}",
                headers={
                    "Content-Type": "application/json",
                    "X-App-Id": self.config.app_id,
                    "X-App-Key": self.config.app_key,
                },
                json=body,
            )
            response.raise_for_status()
            return response.json()


# Export singleton instances
datatree_avm = DataTreeAVMVendor()
datatree_property = DataTreePropertyService()
