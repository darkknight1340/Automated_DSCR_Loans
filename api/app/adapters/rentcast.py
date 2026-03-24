"""
RentCast API Adapter

Fetches rental estimates and comparable rental listings.

API Base: https://api.rentcast.io/v1
Auth: X-Api-Key header
Docs: https://developers.rentcast.io/reference/rent-estimate-long-term
"""

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

from app.adapters.base import AVMResult

logger = logging.getLogger("rentcast")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)


@dataclass
class RentCastConfig:
    api_key: str
    base_url: str
    timeout: int


def get_config() -> RentCastConfig | None:
    api_key = os.getenv("RENTCAST_API_KEY")
    if not api_key:
        print("RentCast API key not configured. Set RENTCAST_API_KEY.")
        return None
    return RentCastConfig(
        api_key=api_key,
        base_url=os.getenv("RENTCAST_BASE_URL", "https://api.rentcast.io/v1"),
        timeout=int(os.getenv("RENTCAST_TIMEOUT", "30")),
    )


@dataclass
class RentalComp:
    """A comparable rental listing."""
    address: str
    city: str
    state: str
    zip_code: str
    property_type: str | None
    bedrooms: int | None
    bathrooms: float | None
    square_feet: int | None
    price: int | None  # monthly rent in dollars
    distance: float | None  # miles
    correlation: float | None
    listed_date: str | None
    days_on_market: int | None


@dataclass
class RentEstimateResult:
    """Rent estimate with comparable listings."""
    rent_estimate: int  # dollars/month
    rent_low: int
    rent_high: int
    comp_count: int
    comps: list[RentalComp]
    raw_data: dict[str, Any] | None = None


class RentCastService:
    """Client for RentCast rental estimate API."""

    def __init__(self) -> None:
        self.config = get_config()

    def is_configured(self) -> bool:
        return self.config is not None

    async def get_rent_estimate(
        self,
        *,
        address: str,
        city: str,
        state: str,
        zip_code: str,
        property_type: str | None = None,
        bedrooms: int | None = None,
        bathrooms: float | None = None,
        square_feet: int | None = None,
        comp_count: int = 5,
    ) -> RentEstimateResult | None:
        """
        Get rent estimate and comparable rentals for a property.

        Args:
            address: Street address (e.g. "123 Main St")
            city: City name
            state: Two-letter state code
            zip_code: ZIP code
            property_type: One of: Single Family, Condo, Townhouse, etc.
            bedrooms: Number of bedrooms
            bathrooms: Number of bathrooms
            square_feet: Living area in sq ft
            comp_count: Number of comps to return (5-25, default 5)
        """
        if not self.config:
            return None

        # Build full address string as required by the API
        full_address = f"{address}, {city}, {state}, {zip_code}"

        params: dict[str, Any] = {
            "address": full_address,
            "compCount": min(max(comp_count, 5), 25),
        }

        # Map our property types to RentCast types
        if property_type:
            rc_type = self._map_property_type(property_type)
            if rc_type:
                params["propertyType"] = rc_type

        if bedrooms is not None:
            params["bedrooms"] = bedrooms
        if bathrooms is not None:
            params["bathrooms"] = bathrooms
        if square_feet is not None:
            params["squareFootage"] = square_feet

        logger.debug(f"[RENTCAST] Fetching rent estimate for {full_address}")
        logger.debug(f"[RENTCAST] Params: {params}")

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.get(
                    f"{self.config.base_url}/avm/rent/long-term",
                    params=params,
                    headers={
                        "X-Api-Key": self.config.api_key,
                        "Accept": "application/json",
                    },
                )
                logger.debug(f"[RENTCAST] Response status: {response.status_code}")
                response.raise_for_status()
                data = response.json()

            result = self._parse_response(data)
            logger.info(
                f"[RENTCAST] ✓ Rent estimate: ${result.rent_estimate:,}/mo "
                f"(range: ${result.rent_low:,}-${result.rent_high:,}, comps: {result.comp_count})"
            )
            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"[RENTCAST] ✗ API error ({e.response.status_code}): {e.response.text[:200]}")
            return None
        except Exception as e:
            logger.error(f"[RENTCAST] ✗ Fetch failed: {e}")
            return None

    def _parse_response(self, data: dict[str, Any]) -> RentEstimateResult:
        """Parse RentCast API response."""
        comps = []
        for comp in data.get("comparables", []):
            comps.append(RentalComp(
                address=comp.get("formattedAddress") or comp.get("addressLine1", ""),
                city=comp.get("city", ""),
                state=comp.get("state", ""),
                zip_code=comp.get("zipCode", ""),
                property_type=comp.get("propertyType"),
                bedrooms=comp.get("bedrooms"),
                bathrooms=comp.get("bathrooms"),
                square_feet=comp.get("squareFootage"),
                price=comp.get("price"),
                distance=comp.get("distance"),
                correlation=comp.get("correlation"),
                listed_date=comp.get("listedDate"),
                days_on_market=comp.get("daysOnMarket"),
            ))

        return RentEstimateResult(
            rent_estimate=data.get("rent", 0),
            rent_low=data.get("rentRangeLow", 0),
            rent_high=data.get("rentRangeHigh", 0),
            comp_count=len(comps),
            comps=comps,
            raw_data=data,
        )

    async def get_value_estimate(
        self,
        *,
        address: str,
        city: str,
        state: str,
        zip_code: str,
        property_type: str | None = None,
        bedrooms: int | None = None,
        bathrooms: float | None = None,
        square_feet: int | None = None,
    ) -> AVMResult | None:
        """
        Get property value estimate (AVM).

        Returns standardized AVMResult with value in cents.
        """
        if not self.config:
            return None

        full_address = f"{address}, {city}, {state}, {zip_code}"
        params: dict[str, Any] = {"address": full_address}

        if property_type:
            rc_type = self._map_property_type(property_type)
            if rc_type:
                params["propertyType"] = rc_type
        if bedrooms is not None:
            params["bedrooms"] = bedrooms
        if bathrooms is not None:
            params["bathrooms"] = bathrooms
        if square_feet is not None:
            params["squareFootage"] = square_feet

        logger.debug(f"[RENTCAST] Fetching value estimate for {full_address}")
        logger.debug(f"[RENTCAST] Params: {params}")

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.get(
                    f"{self.config.base_url}/avm/value",
                    params=params,
                    headers={
                        "X-Api-Key": self.config.api_key,
                        "Accept": "application/json",
                    },
                )
                logger.debug(f"[RENTCAST] Response status: {response.status_code}")
                response.raise_for_status()
                data = response.json()

            price = data.get("price")
            if not price:
                logger.warning(f"[RENTCAST] ✗ No price in response")
                return None

            result = AVMResult(
                value=int(price * 100),  # Convert to cents
                value_low=int(data["priceRangeLow"] * 100) if data.get("priceRangeLow") else None,
                value_high=int(data["priceRangeHigh"] * 100) if data.get("priceRangeHigh") else None,
                confidence="MEDIUM",
                source="RentCast",
                raw_data=data,
            )
            logger.info(
                f"[RENTCAST] ✓ Value estimate: ${price:,.0f} "
                f"(range: ${data.get('priceRangeLow', 0):,.0f}-${data.get('priceRangeHigh', 0):,.0f})"
            )
            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"[RENTCAST] ✗ API error ({e.response.status_code}): {e.response.text[:200]}")
            return None
        except Exception as e:
            logger.error(f"[RENTCAST] ✗ Value estimate failed: {e}")
            return None

    def _map_property_type(self, prop_type: str) -> str | None:
        """Map internal property types to RentCast types."""
        mapping = {
            "SFR": "Single Family",
            "CONDO": "Condo",
            "TOWNHOUSE": "Townhouse",
            "2_4_UNIT": "Multi-Family",
            "MULTIFAMILY": "Multi-Family",
            "MIXED_USE": "Multi-Family",
        }
        return mapping.get(prop_type.upper())


# Export singleton
rentcast_service = RentCastService()
