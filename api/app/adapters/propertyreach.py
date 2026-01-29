"""
PropertyReach API Adapter

Integrates with PropertyReach API for:
- Property details (assessor data, characteristics)
- Owner information (skip trace)
- Mortgage/loan data
- Short-term rental (STR) detection

API Documentation: https://www.propertyreach.com/property-api
Data sources: County recordings, Assessor, Deed and Mortgage, Pre-Foreclosure
"""

import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import math

import httpx


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class PropertyReachConfig:
    """PropertyReach API configuration."""
    api_key: str
    base_url: str
    timeout: int


def get_config() -> PropertyReachConfig | None:
    """Get PropertyReach configuration from environment."""
    api_key = os.getenv("PROPERTYREACH_API_KEY")

    if not api_key or api_key == "demo":
        print("PropertyReach API key not configured. Set PROPERTYREACH_API_KEY for real data.")
        return None

    return PropertyReachConfig(
        api_key=api_key,
        base_url=os.getenv("PROPERTYREACH_BASE_URL", "https://api.propertyreach.com/v1"),
        timeout=int(os.getenv("PROPERTYREACH_TIMEOUT", "30000")),
    )


# =============================================================================
# Types
# =============================================================================

class OwnerType(str, Enum):
    """Owner entity type."""
    INDIVIDUAL = "INDIVIDUAL"
    CORPORATION = "CORPORATION"
    TRUST = "TRUST"
    LLC = "LLC"
    OTHER = "OTHER"


class InterestRateType(str, Enum):
    """Mortgage interest rate type."""
    FIXED = "FIXED"
    ARM = "ARM"
    INTEREST_ONLY = "INTEREST_ONLY"


class PhoneType(str, Enum):
    """Phone number type."""
    MOBILE = "MOBILE"
    LANDLINE = "LANDLINE"
    VOIP = "VOIP"


class STRPlatform(str, Enum):
    """Short-term rental platform."""
    AIRBNB = "AIRBNB"
    VRBO = "VRBO"
    BOOKING = "BOOKING"
    OTHER = "OTHER"


@dataclass
class PropertyReachAddress:
    """Address for PropertyReach API."""
    street: str
    city: str
    state: str
    zip: str


@dataclass
class PropertyCharacteristics:
    """Property physical characteristics."""
    property_type: str
    property_use: str
    year_built: int
    square_feet: int
    lot_size_sqft: int
    bedrooms: int
    bathrooms: float
    stories: int
    units: int
    pool: bool = False
    garage: bool = False
    garage_spaces: int = 0


@dataclass
class Assessment:
    """Property tax assessment."""
    assessed_value: int  # cents
    land_value: int
    improvement_value: int
    tax_year: int
    annual_taxes: int


@dataclass
class MarketValue:
    """Estimated market value."""
    estimated_value: int  # cents
    value_low: int
    value_high: int
    price_per_sqft: int
    last_updated: str


@dataclass
class SaleHistoryEntry:
    """Property sale history entry."""
    sale_date: str
    sale_price: int  # cents
    sale_type: str
    document_number: str
    grantee: str
    grantor: str


@dataclass
class PropertyReachProperty:
    """Full property details."""
    id: str
    address: dict[str, str]
    apn: str
    characteristics: PropertyCharacteristics
    assessment: Assessment
    market_value: MarketValue
    sale_history: list[SaleHistoryEntry] = field(default_factory=list)


@dataclass
class PhoneNumber:
    """Contact phone number."""
    number: str
    type: PhoneType
    verified: bool


@dataclass
class ContactInfo:
    """Owner contact information."""
    emails: list[str] = field(default_factory=list)
    phones: list[PhoneNumber] = field(default_factory=list)


@dataclass
class Demographics:
    """Owner demographics."""
    age: int | None = None
    length_of_residence: int | None = None
    household_income: str | None = None


@dataclass
class PropertyReachOwner:
    """Property owner information."""
    names: list[str]
    owner_type: OwnerType
    owner_occupied: bool
    vesting_type: str
    mailing_address: dict[str, str]
    contact: ContactInfo | None = None
    demographics: Demographics | None = None


@dataclass
class PropertyReachMortgage:
    """Mortgage/lien information."""
    position: int
    lender_name: str
    original_amount: int  # cents
    current_balance: int | None
    recording_date: str
    maturity_date: str | None
    loan_type: str
    interest_rate_type: InterestRateType
    interest_rate: float | None
    monthly_payment: int | None
    deed_type: str
    document_number: str


@dataclass
class PropertyReachEquity:
    """Equity analysis."""
    estimated_value: int  # cents
    total_mortgage_balance: int
    estimated_equity: int
    equity_percent: float
    ltv_ratio: float


@dataclass
class STRPlatformData:
    """STR platform listing data."""
    platform: STRPlatform
    listing_url: str | None
    nightly_avg_rate: int  # cents
    nightly_min_rate: int
    nightly_max_rate: int
    avg_occupancy_rate: float
    peak_season_rate: float
    off_season_rate: float
    review_count: int
    avg_rating: float
    last_active: str


@dataclass
class STRMarketComp:
    """STR market comparable."""
    address: str
    nightly_rate: int  # cents
    occupancy_rate: float
    monthly_revenue: int


@dataclass
class PropertyReachSTRAnalysis:
    """Short-term rental analysis."""
    is_short_term_rental: bool
    confidence: float
    platforms: list[STRPlatformData] = field(default_factory=list)
    estimated_annual_revenue: int | None = None  # cents
    estimated_monthly_revenue: int | None = None
    market_comps: list[STRMarketComp] | None = None


@dataclass
class PreForeclosure:
    """Pre-foreclosure status."""
    status: str
    filing_date: str
    auction_date: str | None
    default_amount: int | None  # cents


@dataclass
class PropertyReachFullReport:
    """Complete property report."""
    property: PropertyReachProperty
    owner: PropertyReachOwner
    mortgages: list[PropertyReachMortgage]
    equity: PropertyReachEquity
    str_analysis: PropertyReachSTRAnalysis | None = None
    pre_foreclosure: PreForeclosure | None = None
    last_updated: str = ""


@dataclass
class DSCRInputs:
    """DSCR calculation inputs from PropertyReach data."""
    gross_monthly_rent: int  # cents
    monthly_taxes: int
    monthly_insurance: int
    monthly_hoa: int
    is_str: bool
    str_monthly_revenue: int | None
    estimated_pitia: int
    estimated_dscr: float


# =============================================================================
# PropertyReach API Client
# =============================================================================

class PropertyReachAdapter:
    """PropertyReach API client."""

    def __init__(self) -> None:
        self.config = get_config()

    def is_configured(self) -> bool:
        """Check if configured."""
        return self.config is not None

    async def get_property_report(
        self, address: PropertyReachAddress
    ) -> PropertyReachFullReport | None:
        """Get comprehensive property report by address."""
        if not self.is_configured():
            print("PropertyReach not configured, returning None")
            return None

        try:
            response = await self._call_api("/property/report", {
                "address": {
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                },
                "include": ["owner", "mortgages", "equity", "str_analysis", "pre_foreclosure"],
            })
            return self._parse_full_report(response)
        except Exception as e:
            print(f"PropertyReach property report failed: {e}")
            return None

    async def get_property_details(
        self, address: PropertyReachAddress
    ) -> PropertyReachProperty | None:
        """Get property details only."""
        try:
            response = await self._call_api("/property/details", {
                "address": {
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                },
            })
            return self._parse_property(response)
        except Exception as e:
            print(f"PropertyReach property details failed: {e}")
            return None

    async def get_owner_info(
        self, address: PropertyReachAddress, skip_trace: bool = False
    ) -> PropertyReachOwner | None:
        """Get owner information with optional skip trace."""
        try:
            response = await self._call_api("/property/owner", {
                "address": {
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                },
                "skipTrace": skip_trace,
            })
            return self._parse_owner(response)
        except Exception as e:
            print(f"PropertyReach owner lookup failed: {e}")
            return None

    async def get_mortgages(
        self, address: PropertyReachAddress
    ) -> list[PropertyReachMortgage]:
        """Get mortgage/loan information."""
        try:
            response = await self._call_api("/property/mortgages", {
                "address": {
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                },
            })
            return [self._parse_mortgage(m) for m in response.get("mortgages", [])]
        except Exception as e:
            print(f"PropertyReach mortgage lookup failed: {e}")
            return []

    async def get_equity_analysis(
        self, address: PropertyReachAddress
    ) -> PropertyReachEquity | None:
        """Get equity analysis."""
        try:
            response = await self._call_api("/property/equity", {
                "address": {
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                },
            })
            return self._parse_equity(response)
        except Exception as e:
            print(f"PropertyReach equity analysis failed: {e}")
            return None

    async def detect_str(
        self, address: PropertyReachAddress
    ) -> PropertyReachSTRAnalysis | None:
        """Detect if property is a short-term rental."""
        try:
            response = await self._call_api("/property/str-analysis", {
                "address": {
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                },
            })
            return self._parse_str_analysis(response)
        except Exception as e:
            print(f"PropertyReach STR detection failed: {e}")
            return None

    async def compute_dscr_inputs(
        self,
        address: PropertyReachAddress,
        loan_amount: int,  # cents
        interest_rate: float,
        term_months: int,
    ) -> DSCRInputs | None:
        """Compute DSCR inputs combining PropertyReach data with loan terms."""
        try:
            report = await self.get_property_report(address)
            if not report:
                return None

            str_data = report.str_analysis

            # Calculate monthly P&I
            monthly_rate = interest_rate / 100 / 12
            num_payments = term_months
            loan_dollars = loan_amount / 100

            if monthly_rate > 0:
                factor = math.pow(1 + monthly_rate, num_payments)
                monthly_pi = loan_dollars * (monthly_rate * factor) / (factor - 1)
            else:
                monthly_pi = loan_dollars / num_payments

            # Get expenses
            monthly_taxes = report.property.assessment.annual_taxes // 12
            estimated_value = report.property.market_value.estimated_value / 100
            monthly_insurance = int((estimated_value * 0.0035) / 12 * 100)  # ~0.35% annual
            monthly_hoa = 0  # Would need HOA data source

            estimated_pitia = int(monthly_pi * 100) + monthly_taxes + monthly_insurance + monthly_hoa

            # Determine gross rent
            if str_data and str_data.is_short_term_rental and str_data.estimated_monthly_revenue:
                gross_monthly_rent = str_data.estimated_monthly_revenue
            else:
                # Estimate long-term rent as ~0.8% of value per month
                gross_monthly_rent = int(estimated_value * 0.008 * 100)

            estimated_dscr = gross_monthly_rent / estimated_pitia if estimated_pitia > 0 else 0

            return DSCRInputs(
                gross_monthly_rent=gross_monthly_rent,
                monthly_taxes=monthly_taxes,
                monthly_insurance=monthly_insurance,
                monthly_hoa=monthly_hoa,
                is_str=str_data.is_short_term_rental if str_data else False,
                str_monthly_revenue=str_data.estimated_monthly_revenue if str_data else None,
                estimated_pitia=estimated_pitia,
                estimated_dscr=round(estimated_dscr, 2),
            )
        except Exception as e:
            print(f"DSCR computation failed: {e}")
            return None

    async def _call_api(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        """Make API call to PropertyReach."""
        if not self.config:
            raise RuntimeError("PropertyReach API not configured")

        async with httpx.AsyncClient(timeout=self.config.timeout / 1000) as client:
            response = await client.post(
                f"{self.config.base_url}{endpoint}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.config.api_key}",
                },
                json=body,
            )
            response.raise_for_status()
            return response.json()

    def _parse_full_report(self, data: dict[str, Any]) -> PropertyReachFullReport:
        """Parse full report response."""
        return PropertyReachFullReport(
            property=self._parse_property(data.get("property", {})),
            owner=self._parse_owner(data.get("owner", {})),
            mortgages=[self._parse_mortgage(m) for m in data.get("mortgages", [])],
            equity=self._parse_equity(data.get("equity", {})),
            str_analysis=self._parse_str_analysis(data.get("strAnalysis")) if data.get("strAnalysis") else None,
            pre_foreclosure=self._parse_pre_foreclosure(data.get("preForeclosure")) if data.get("preForeclosure") else None,
            last_updated=data.get("lastUpdated", ""),
        )

    def _parse_property(self, data: dict[str, Any]) -> PropertyReachProperty:
        """Parse property data."""
        chars = data.get("characteristics", {})
        assessment = data.get("assessment", {})
        market = data.get("marketValue", {})

        return PropertyReachProperty(
            id=data.get("id", ""),
            address=data.get("address", {}),
            apn=data.get("apn", ""),
            characteristics=PropertyCharacteristics(
                property_type=chars.get("propertyType", "SFR"),
                property_use=chars.get("propertyUse", ""),
                year_built=chars.get("yearBuilt", 0),
                square_feet=chars.get("squareFeet", 0),
                lot_size_sqft=chars.get("lotSizeSqft", 0),
                bedrooms=chars.get("bedrooms", 0),
                bathrooms=chars.get("bathrooms", 0),
                stories=chars.get("stories", 1),
                units=chars.get("units", 1),
                pool=chars.get("pool", False),
                garage=chars.get("garage", False),
                garage_spaces=chars.get("garageSpaces", 0),
            ),
            assessment=Assessment(
                assessed_value=int(assessment.get("assessedValue", 0) * 100),
                land_value=int(assessment.get("landValue", 0) * 100),
                improvement_value=int(assessment.get("improvementValue", 0) * 100),
                tax_year=assessment.get("taxYear", 0),
                annual_taxes=int(assessment.get("annualTaxes", 0) * 100),
            ),
            market_value=MarketValue(
                estimated_value=int(market.get("estimatedValue", 0) * 100),
                value_low=int(market.get("valueLow", 0) * 100),
                value_high=int(market.get("valueHigh", 0) * 100),
                price_per_sqft=int(market.get("pricePerSqFt", 0) * 100),
                last_updated=market.get("lastUpdated", ""),
            ),
            sale_history=[
                SaleHistoryEntry(
                    sale_date=s.get("saleDate", ""),
                    sale_price=int(s.get("salePrice", 0) * 100),
                    sale_type=s.get("saleType", ""),
                    document_number=s.get("documentNumber", ""),
                    grantee=s.get("grantee", ""),
                    grantor=s.get("grantor", ""),
                )
                for s in data.get("saleHistory", [])
            ],
        )

    def _parse_owner(self, data: dict[str, Any]) -> PropertyReachOwner:
        """Parse owner data."""
        contact_data = data.get("contact")
        contact = None
        if contact_data:
            contact = ContactInfo(
                emails=contact_data.get("emails", []),
                phones=[
                    PhoneNumber(
                        number=p.get("number", ""),
                        type=PhoneType(p.get("type", "LANDLINE")),
                        verified=p.get("verified", False),
                    )
                    for p in contact_data.get("phones", [])
                ],
            )

        demographics_data = data.get("demographics")
        demographics = None
        if demographics_data:
            demographics = Demographics(
                age=demographics_data.get("age"),
                length_of_residence=demographics_data.get("lengthOfResidence"),
                household_income=demographics_data.get("householdIncome"),
            )

        return PropertyReachOwner(
            names=data.get("names", []),
            owner_type=OwnerType(data.get("ownerType", "INDIVIDUAL")),
            owner_occupied=data.get("ownerOccupied", False),
            vesting_type=data.get("vestingType", ""),
            mailing_address=data.get("mailingAddress", {}),
            contact=contact,
            demographics=demographics,
        )

    def _parse_mortgage(self, data: dict[str, Any]) -> PropertyReachMortgage:
        """Parse mortgage data."""
        return PropertyReachMortgage(
            position=data.get("position", 1),
            lender_name=data.get("lenderName", ""),
            original_amount=int(data.get("originalAmount", 0) * 100),
            current_balance=int(data.get("currentBalance", 0) * 100) if data.get("currentBalance") else None,
            recording_date=data.get("recordingDate", ""),
            maturity_date=data.get("maturityDate"),
            loan_type=data.get("loanType", ""),
            interest_rate_type=InterestRateType(data.get("interestRateType", "FIXED")),
            interest_rate=data.get("interestRate"),
            monthly_payment=int(data.get("monthlyPayment", 0) * 100) if data.get("monthlyPayment") else None,
            deed_type=data.get("deedType", ""),
            document_number=data.get("documentNumber", ""),
        )

    def _parse_equity(self, data: dict[str, Any]) -> PropertyReachEquity:
        """Parse equity data."""
        return PropertyReachEquity(
            estimated_value=int(data.get("estimatedValue", 0) * 100),
            total_mortgage_balance=int(data.get("totalMortgageBalance", 0) * 100),
            estimated_equity=int(data.get("estimatedEquity", 0) * 100),
            equity_percent=data.get("equityPercent", 0),
            ltv_ratio=data.get("ltvRatio", 0),
        )

    def _parse_str_analysis(self, data: dict[str, Any] | None) -> PropertyReachSTRAnalysis | None:
        """Parse STR analysis data."""
        if not data:
            return None

        platforms = []
        for p in data.get("platforms", []):
            nightly = p.get("nightly", {})
            occupancy = p.get("occupancy", {})
            reviews = p.get("reviews", {})
            platforms.append(STRPlatformData(
                platform=STRPlatform(p.get("platform", "OTHER")),
                listing_url=p.get("listingUrl"),
                nightly_avg_rate=int(nightly.get("avgRate", 0) * 100),
                nightly_min_rate=int(nightly.get("minRate", 0) * 100),
                nightly_max_rate=int(nightly.get("maxRate", 0) * 100),
                avg_occupancy_rate=occupancy.get("avgRate", 0),
                peak_season_rate=occupancy.get("peakSeasonRate", 0),
                off_season_rate=occupancy.get("offSeasonRate", 0),
                review_count=reviews.get("count", 0),
                avg_rating=reviews.get("avgRating", 0),
                last_active=p.get("lastActive", ""),
            ))

        market_comps = None
        if data.get("marketComps"):
            market_comps = [
                STRMarketComp(
                    address=c.get("address", ""),
                    nightly_rate=int(c.get("nightlyRate", 0) * 100),
                    occupancy_rate=c.get("occupancyRate", 0),
                    monthly_revenue=int(c.get("monthlyRevenue", 0) * 100),
                )
                for c in data["marketComps"]
            ]

        return PropertyReachSTRAnalysis(
            is_short_term_rental=data.get("isShortTermRental", False),
            confidence=data.get("confidence", 0),
            platforms=platforms,
            estimated_annual_revenue=int(data.get("estimatedAnnualRevenue", 0) * 100) if data.get("estimatedAnnualRevenue") else None,
            estimated_monthly_revenue=int(data.get("estimatedMonthlyRevenue", 0) * 100) if data.get("estimatedMonthlyRevenue") else None,
            market_comps=market_comps,
        )

    def _parse_pre_foreclosure(self, data: dict[str, Any] | None) -> PreForeclosure | None:
        """Parse pre-foreclosure data."""
        if not data:
            return None
        return PreForeclosure(
            status=data.get("status", ""),
            filing_date=data.get("filingDate", ""),
            auction_date=data.get("auctionDate"),
            default_amount=int(data.get("defaultAmount", 0) * 100) if data.get("defaultAmount") else None,
        )


# Export singleton instance
property_reach = PropertyReachAdapter()
