"""
Clear Capital Property Analytics API Adapter

Premium data provider for AVM, rental estimates, and comparables.
Used for verification when DSCR > 0.75.

API Base: https://api.integ.clearcapital.com/property-analytics-api (integration)
          https://api.clearcapital.com/property-analytics-api (production)
Auth: API Key (x-api-key header)

API Spec: https://api.integ.clearcapital.com/api/property-analytics-api
"""

import os
from dataclasses import dataclass, field

import httpx

from app.adapters.base import AVMResult, RentEstimateResult

import logging

logger = logging.getLogger("clear_capital")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)


@dataclass
class ClearCapitalConfig:
    api_key: str
    base_url: str
    timeout: int = 30


@dataclass
class RentalComp:
    """A rental comparable property."""
    address: str
    city: str | None = None
    state: str | None = None
    zipcode: str | None = None
    rent: int = 0  # Monthly rent in dollars
    bedrooms: int | None = None
    bathrooms: float | None = None
    sqft: int | None = None
    distance: float | None = None  # Miles from subject
    status: str | None = None  # SALE, LEASE, etc.
    days_on_market: int | None = None


@dataclass
class SalesComp:
    """A sales comparable property."""
    address: str
    city: str | None = None
    state: str | None = None
    zipcode: str | None = None
    sale_price: int = 0  # Sale price in dollars
    sale_date: str | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    sqft: int | None = None
    distance: float | None = None  # Miles from subject


@dataclass
class PropertyAnalyticsResult:
    """Combined result from Property Analytics API."""
    avm: AVMResult | None = None
    rental_avm: AVMResult | None = None  # Rental estimate as AVMResult
    rent_estimate: RentEstimateResult | None = None
    rental_comps: list[RentalComp] = field(default_factory=list)
    sales_comps: list[SalesComp] = field(default_factory=list)
    annual_taxes: int | None = None  # Annual property taxes in dollars
    order_id: str | None = None
    raw_data: dict | None = None


class ClearCapitalService:
    """Client for Clear Capital Property Analytics API."""

    def __init__(self) -> None:
        self.config = self._get_config()

    def _get_config(self) -> ClearCapitalConfig | None:
        api_key = os.getenv("CLEAR_CAPITAL_API_KEY")
        if not api_key:
            return None
        return ClearCapitalConfig(
            api_key=api_key,
            base_url=os.getenv(
                "CLEAR_CAPITAL_BASE_URL",
                "https://api.integ.clearcapital.com/property-analytics-api"
            ),
            timeout=int(os.getenv("CLEAR_CAPITAL_TIMEOUT", "30")),
        )

    def is_configured(self) -> bool:
        """Check if Clear Capital credentials are configured."""
        return self.config is not None

    async def get_property_analytics(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
        include_avm: bool = True,
        include_rental_avm: bool = True,
        include_rental_comps: bool = True,
        include_sales_comps: bool = True,
        include_tax_history: bool = True,
        max_comps: int = 10,
    ) -> PropertyAnalyticsResult | None:
        """
        Get comprehensive property analytics including AVM, rental data, and tax info.

        Args:
            street: Street address
            city: City name
            state: Two-letter state code
            zip_code: 5-digit ZIP code
            include_avm: Include property AVM (sale value)
            include_rental_avm: Include rental AVM (rent estimate)
            include_rental_comps: Include rental comparables
            include_sales_comps: Include sales comparables
            include_tax_history: Include tax history
            max_comps: Maximum comps to return (default 10)

        Returns:
            PropertyAnalyticsResult with all requested data, or None if failed
        """
        if not self.config:
            return None

        # Build order request - address fields are at top level per API spec
        order_request = {
            "address": street,
            "city": city,
            "state": state,
            "zip": zip_code,
        }

        # Add requested components
        if include_avm:
            order_request["clearAvm"] = {"include": True}

        if include_rental_avm:
            order_request["rentalAvm"] = {"include": True}

        if include_rental_comps:
            order_request["rentalComparables"] = {
                "include": True,
                "request": {
                    "maxComparablesReturned": max_comps,
                    "listingTypes": ["LEASE"],
                },
            }

        if include_sales_comps:
            order_request["salesComparables"] = {
                "include": True,
                "request": {
                    "maxComparablesReturned": max_comps,
                },
            }

        if include_tax_history:
            order_request["taxHistory"] = {"include": True}

        # Log the request
        components = []
        if include_avm:
            components.append("ClearAVM")
        if include_rental_avm:
            components.append("RentalAVM")
        if include_rental_comps:
            components.append("RentalComps")
        if include_sales_comps:
            components.append("SalesComps")
        if include_tax_history:
            components.append("TaxHistory")
        logger.info(f"[CLEAR_CAPITAL] Requesting: {', '.join(components)} for {street}, {city}, {state} {zip_code}")
        logger.debug(f"[CLEAR_CAPITAL] Request body: {order_request}")

        try:
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                logger.debug(f"[CLEAR_CAPITAL] POST {self.config.base_url}/orders")
                resp = await client.post(
                    f"{self.config.base_url}/orders",
                    json=order_request,
                    headers={
                        "x-api-key": self.config.api_key,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                )

                logger.debug(f"[CLEAR_CAPITAL] Response status: {resp.status_code}")

                # Handle specific errors
                if resp.status_code == 401:
                    logger.error("[CLEAR_CAPITAL] ✗ API key is missing or invalid")
                    return None
                if resp.status_code == 403:
                    logger.error("[CLEAR_CAPITAL] ✗ Forbidden - subscription restricting access")
                    return None
                if resp.status_code == 404:
                    logger.warning(f"[CLEAR_CAPITAL] ✗ Property not found - {street}, {city}, {state}")
                    return None
                if resp.status_code == 429:
                    retry_after = resp.headers.get("Retry-After", "unknown")
                    logger.warning(f"[CLEAR_CAPITAL] ✗ Rate limited, retry after {retry_after}s")
                    return None

                resp.raise_for_status()
                data = resp.json()

            logger.info(f"[CLEAR_CAPITAL] ✓ Order created: {data.get('orderId', 'N/A')}")
            logger.debug(f"[CLEAR_CAPITAL] Response keys: {list(data.keys())}")

            # Log what we received
            if "rentalAvm" in data:
                rental_avm = data.get("rentalAvm", {}).get("result", {})
                logger.debug(f"[CLEAR_CAPITAL] RentalAVM result: marketValue={rental_avm.get('marketValue')}")
            if "rentalComparables" in data:
                comps = data.get("rentalComparables", {}).get("result", {}).get("comparables", [])
                logger.debug(f"[CLEAR_CAPITAL] RentalComps: {len(comps)} comparables")
            # Log the actual rent values from comps
            for i, comp in enumerate(comps):
                rent = comp.get("statusPrice") or comp.get("rent", 0)
                logger.debug(f"[CLEAR_CAPITAL]   Comp {i+1}: ${rent}/mo")
            return self._parse_order_response(data)

        except httpx.TimeoutException:
            logger.error(f"Clear Capital: Request timeout for {street}, {city}, {state}")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Clear Capital error ({e.response.status_code}): {e.response.text[:200]}"
            )
            return None
        except Exception as e:
            logger.error(f"Clear Capital failed: {e}")
            return None

    def _parse_order_response(self, data: dict) -> PropertyAnalyticsResult:
        """Parse the Property Analytics API order response."""
        result = PropertyAnalyticsResult(
            order_id=data.get("orderId"),
            raw_data=data,
        )

        # Parse property AVM (clearAvm)
        clear_avm = data.get("clearAvm", {})
        avm_result = clear_avm.get("result")
        if avm_result:
            result.avm = self._parse_avm_result(avm_result, "ClearCapital:ClearAVM")

        # Parse rental AVM
        rental_avm = data.get("rentalAvm", {})
        rental_avm_result = rental_avm.get("result")
        if rental_avm_result:
            # Rental AVM returns monthly rent as marketValue
            result.rental_avm = self._parse_avm_result(rental_avm_result, "ClearCapital:RentalAVM")

            # Also create RentEstimateResult for compatibility
            market_value = rental_avm_result.get("marketValue")
            if market_value:
                result.rent_estimate = RentEstimateResult(
                    estimate=market_value,  # Already in dollars/month
                    low=rental_avm_result.get("lowValue"),
                    high=rental_avm_result.get("highValue"),
                    source="ClearCapital:RentalAVM",
                    raw_data=rental_avm_result,
                )

        # Parse rental comparables
        rental_comps = data.get("rentalComparables", {})
        rental_comps_result = rental_comps.get("result")
        if rental_comps_result:
            result.rental_comps = self._parse_rental_comps(rental_comps_result)

            # Update rent estimate with comp count if we have it
            if result.rent_estimate:
                result.rent_estimate.comp_count = len(result.rental_comps)
                # Convert comps to dict format for compatibility
                result.rent_estimate.comps = [
                    {
                        "address": c.address,
                        "city": c.city,
                        "state": c.state,
                        "rent": c.rent,
                        "bedrooms": c.bedrooms,
                        "bathrooms": c.bathrooms,
                        "sqft": c.sqft,
                        "distance": c.distance,
                    }
                    for c in result.rental_comps
                ]

        # Parse sales comparables
        sales_comps = data.get("salesComparables", {})
        sales_comps_result = sales_comps.get("result")
        if sales_comps_result:
            result.sales_comps = self._parse_sales_comps(sales_comps_result)
            logger.debug(f"[CLEAR_CAPITAL] SalesComps: {len(result.sales_comps)} comparables")

        # Parse tax history
        tax_history = data.get("taxHistory", {})
        tax_result = tax_history.get("result") if isinstance(tax_history, dict) else None
        if tax_result:
            # Result might be a list of tax records or a dict with taxRecords key
            tax_records = tax_result if isinstance(tax_result, list) else tax_result.get("taxRecords", [])
            if tax_records and isinstance(tax_records, list):
                try:
                    # Sort by year descending and get the most recent
                    latest_tax = max(tax_records, key=lambda x: x.get("assessedYear", 0) if isinstance(x, dict) else 0, default={})
                    if isinstance(latest_tax, dict):
                        tax_amount = latest_tax.get("taxAmount")
                        if tax_amount:
                            result.annual_taxes = int(tax_amount)
                            logger.debug(f"[CLEAR_CAPITAL] TaxHistory: ${result.annual_taxes:,}/yr")
                except Exception as e:
                    logger.debug(f"[CLEAR_CAPITAL] TaxHistory parsing error: {e}")

        # Log summary
        avm_val = result.avm.value // 100 if result.avm else None
        rent_val = result.rent_estimate.estimate if result.rent_estimate else None
        tax_str = f", Taxes=${result.annual_taxes:,}/yr" if result.annual_taxes else ""
        if avm_val:
            logger.info(
                f"[CLEAR_CAPITAL] Summary: AVM=${avm_val:,}, Rent=${rent_val or 'N/A'}/mo, "
                f"{len(result.sales_comps)} sales comps, {len(result.rental_comps)} rental comps{tax_str}"
            )
        else:
            logger.info(f"[CLEAR_CAPITAL] Order {result.order_id} completed (no AVM)")

        return result

    def _parse_avm_result(self, avm_data: dict, source: str) -> AVMResult:
        """Parse an AVM result from the API response."""
        market_value = avm_data.get("marketValue", 0)
        low_value = avm_data.get("lowValue")
        high_value = avm_data.get("highValue")

        # Confidence from confidenceScore (H/M/L) or calculate from FSD
        confidence = avm_data.get("confidenceScore")
        fsd = avm_data.get("forecastStdDev")

        if not confidence and fsd is not None:
            if fsd < 0.13:
                confidence = "HIGH"
            elif fsd < 0.21:
                confidence = "MEDIUM"
            else:
                confidence = "LOW"

        # Map single letter to full word
        confidence_map = {"H": "HIGH", "M": "MEDIUM", "L": "LOW"}
        confidence = confidence_map.get(confidence, confidence) or "MEDIUM"

        return AVMResult(
            value=int(market_value * 100),  # Convert to cents
            value_low=int(low_value * 100) if low_value else None,
            value_high=int(high_value * 100) if high_value else None,
            confidence=confidence,
            source=source,
            raw_data=avm_data,
        )

    def _parse_rental_comps(self, comps_data: dict) -> list[RentalComp]:
        """Parse rental comparables from the API response."""
        comps = []

        for comp in comps_data.get("comparables", []):
            # Get address components
            address = comp.get("propertyCompleteAddress") or comp.get("streetAddress", "")

            # Get rent from statusPrice (for leases)
            rent = comp.get("statusPrice", 0)

            comps.append(RentalComp(
                address=address,
                city=comp.get("city"),
                state=comp.get("state"),
                zipcode=comp.get("zipcode"),
                rent=rent,
                bedrooms=comp.get("bedCount"),
                bathrooms=comp.get("totalBathCount"),
                sqft=comp.get("grossLivingArea"),
                distance=comp.get("distanceToSubject"),
                status=comp.get("status"),
                days_on_market=comp.get("daysOnMarket"),
            ))

        return comps

    def _parse_sales_comps(self, comps_data: dict) -> list[SalesComp]:
        """Parse sales comparables from the API response."""
        comps = []

        for comp in comps_data.get("comparables", []):
            address = comp.get("propertyCompleteAddress") or comp.get("streetAddress", "")
            sale_price = comp.get("statusPrice") or comp.get("salePrice", 0)

            comps.append(SalesComp(
                address=address,
                city=comp.get("city"),
                state=comp.get("state"),
                zipcode=comp.get("zipcode"),
                sale_price=sale_price,
                sale_date=comp.get("statusDate") or comp.get("saleDate"),
                bedrooms=comp.get("bedCount"),
                bathrooms=comp.get("totalBathCount"),
                sqft=comp.get("grossLivingArea"),
                distance=comp.get("distanceToSubject"),
            ))

        return comps

    # Convenience methods for backward compatibility

    async def get_avm(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
    ) -> AVMResult | None:
        """Get property AVM only."""
        result = await self.get_property_analytics(
            street, city, state, zip_code,
            include_avm=True,
            include_rental_avm=False,
            include_rental_comps=False,
        )
        return result.avm if result else None

    async def get_rent_estimate(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
        include_comps: bool = True,
    ) -> RentEstimateResult | None:
        """Get rental AVM and comparables."""
        result = await self.get_property_analytics(
            street, city, state, zip_code,
            include_avm=False,
            include_rental_avm=True,
            include_rental_comps=include_comps,
        )
        return result.rent_estimate if result else None

    async def get_avm_and_rent(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
    ) -> tuple[AVMResult | None, RentEstimateResult | None]:
        """Get both AVM and rental estimate in one call."""
        result = await self.get_property_analytics(
            street, city, state, zip_code,
            include_avm=True,
            include_rental_avm=True,
            include_rental_comps=True,
        )
        if not result:
            return None, None
        return result.avm, result.rent_estimate


# Singleton instance
clear_capital_service = ClearCapitalService()
