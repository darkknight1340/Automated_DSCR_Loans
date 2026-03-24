"""
PropertyReach API Adapter

Integrates with PropertyReach API for:
- Property details (assessor data, characteristics)
- Owner information
- Mortgage/loan data
- Equity analysis
- Estimated rent and value

API: GET https://api.propertyreach.com/v1/property
Auth: x-api-key header
Docs: https://docs.propertyreach.com/operations/Property%20Details
"""

import os
from dataclasses import dataclass, field
from typing import Any

import httpx


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class PropertyReachConfig:
    api_key: str
    base_url: str
    timeout: int


def get_config() -> PropertyReachConfig | None:
    api_key = os.getenv("PROPERTYREACH_API_KEY")
    if not api_key or api_key == "demo":
        print("PropertyReach API key not configured. Set PROPERTYREACH_API_KEY for real data.")
        return None
    return PropertyReachConfig(
        api_key=api_key,
        base_url=os.getenv("PROPERTYREACH_BASE_URL", "https://api.propertyreach.com/v1"),
        timeout=int(os.getenv("PROPERTYREACH_TIMEOUT", "30")),
    )


# =============================================================================
# Types (kept for downstream compatibility with ingest.py)
# =============================================================================

@dataclass
class PropertyReachAddress:
    """Address for PropertyReach API."""
    street: str
    city: str
    state: str
    zip: str


@dataclass
class PropertyCharacteristics:
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
    assessed_value: int  # cents
    land_value: int
    improvement_value: int
    tax_year: int
    annual_taxes: int


@dataclass
class MarketValue:
    estimated_value: int  # cents
    value_low: int
    value_high: int
    price_per_sqft: int
    last_updated: str


@dataclass
class PropertyReachProperty:
    id: str
    address: dict[str, str]
    apn: str
    characteristics: PropertyCharacteristics
    assessment: Assessment
    market_value: MarketValue


@dataclass
class OwnerContact:
    """Individual owner with contact details."""
    name: str
    owner_type: str  # 'Individual', 'Entity', etc.
    owner_number: int  # 1 = primary, 2 = secondary, etc.
    first_name: str = ""
    last_name: str = ""
    phones: list[dict[str, str]] = field(default_factory=list)  # [{number, type, carrier}]
    emails: list[str] = field(default_factory=list)
    deceased: bool = False


@dataclass
class PropertyReachOwner:
    names: list[str]
    owner_occupied: bool
    mailing_address: dict[str, str]
    ownership_months: int = 0
    ownership_type: str = ""  # 'Multiple', 'Individual', etc.
    contacts: list[OwnerContact] = field(default_factory=list)


@dataclass
class PropertyReachMortgage:
    position: int
    lender_name: str
    original_amount: int  # cents
    current_balance: int | None
    recording_date: str
    interest_rate: float | None
    monthly_payment: int | None
    loan_type: str
    loan_term_months: int = 0
    due_date: str = ""
    is_active: bool = True
    loan_flags: str = ""
    document_number: str = ""


@dataclass
class PropertyReachEquity:
    estimated_value: int  # cents
    total_mortgage_balance: int
    estimated_equity: int
    equity_percent: float
    ltv_ratio: float


@dataclass
class PropertyReachSTRAnalysis:
    is_short_term_rental: bool = False
    estimated_monthly_revenue: int | None = None


@dataclass
class PropertyReachFullReport:
    property: PropertyReachProperty
    owner: PropertyReachOwner
    mortgages: list[PropertyReachMortgage]
    equity: PropertyReachEquity
    str_analysis: PropertyReachSTRAnalysis | None = None
    estimated_rent: int = 0  # dollars/month from API
    raw_data: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# PropertyReach API Client
# =============================================================================

class PropertyReachAdapter:

    def __init__(self) -> None:
        self.config = get_config()

    def is_configured(self) -> bool:
        return self.config is not None

    async def get_property_report(
        self, address: PropertyReachAddress
    ) -> PropertyReachFullReport | None:
        """Get comprehensive property report by address."""
        if not self.is_configured():
            print("PropertyReach not configured, returning None")
            return None

        try:
            data = await self._fetch_property(address)
            if not data:
                return None
            return self._parse_report(data)
        except Exception as e:
            print(f"PropertyReach property report failed: {e}")
            return None

    async def _fetch_property(self, address: PropertyReachAddress) -> dict[str, Any] | None:
        """Call GET /property with address query params."""
        if not self.config:
            raise RuntimeError("PropertyReach API not configured")

        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            response = await client.get(
                f"{self.config.base_url}/property",
                params={
                    "streetAddress": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zipCode": address.zip,
                },
                headers={"x-api-key": self.config.api_key},
            )
            response.raise_for_status()
            data = response.json()

        meta = data.get("meta", {})
        if meta.get("hits", 0) == 0:
            print(f"PropertyReach: {meta.get('message', 'No property found')}")
            return None

        return data.get("property", {})

    def _parse_report(self, p: dict[str, Any]) -> PropertyReachFullReport:
        """Parse flat property response into structured report."""

        # Property type mapping
        prop_type = p.get("propertyType", "Single Family")
        prop_type_mapped = self._map_property_type(prop_type)

        # Characteristics
        characteristics = PropertyCharacteristics(
            property_type=prop_type_mapped,
            property_use=p.get("landUse", ""),
            year_built=p.get("yearBuilt", 0),
            square_feet=p.get("livingSquareFeet") or p.get("squareFeet", 0),
            lot_size_sqft=p.get("lotSquareFeet", 0),
            bedrooms=p.get("bedrooms", 0),
            bathrooms=p.get("bathrooms", 0),
            stories=p.get("stories", 1),
            units=p.get("units", 1),
            pool=p.get("pool", False),
            garage=bool(p.get("garageType")),
            garage_spaces=p.get("parkingSpaces", 0),
        )

        # Assessment — use latest from taxAssessments if available
        tax_assessments = p.get("taxAssessments", [])
        latest_tax = tax_assessments[0] if tax_assessments else {}

        assessment = Assessment(
            assessed_value=int((latest_tax.get("assessedValue") or p.get("assessedValue", 0)) * 100),
            land_value=int((latest_tax.get("landValue") or p.get("assessedLandValue", 0)) * 100),
            improvement_value=int((latest_tax.get("improvementValue") or p.get("assessedImprovementValue", 0)) * 100),
            tax_year=latest_tax.get("year") or p.get("taxYear", 0),
            annual_taxes=int((latest_tax.get("taxAmount") or p.get("taxAmount", 0)) * 100),
        )

        # Market value
        estimated_value = p.get("estimatedValue", 0)
        one_year_value = p.get("oneYearValue", 0)
        five_year_value = p.get("fiveYearValue", 0)
        price_per_sqft = p.get("pricePerSquareFoot") or p.get("listing", {}).get("pricePerSquareFoot", 0)

        market_value = MarketValue(
            estimated_value=int(estimated_value * 100),
            value_low=int(five_year_value * 100) if five_year_value else int(estimated_value * 0.85 * 100),
            value_high=int(one_year_value * 100) if one_year_value else int(estimated_value * 1.15 * 100),
            price_per_sqft=int((price_per_sqft or 0) * 100),
            last_updated=p.get("updateDate", ""),
        )

        # Property object
        prop = PropertyReachProperty(
            id=str(p.get("id", "")),
            address={
                "street": p.get("streetAddress", ""),
                "city": p.get("city", ""),
                "state": p.get("state", ""),
                "zip": p.get("zip", ""),
            },
            apn=p.get("apn", ""),
            characteristics=characteristics,
            assessment=assessment,
            market_value=market_value,
        )

        # Owner — build contacts list from all available sources
        owner_names = p.get("ownerNames", "").split("\n") if p.get("ownerNames") else []
        contacts: list[OwnerContact] = []

        # Owner 1 from top-level fields
        if p.get("owner1Name"):
            contacts.append(OwnerContact(
                name=p["owner1Name"],
                owner_type=p.get("owner1Type", "Individual"),
                owner_number=1,
                first_name=p.get("owner1FirstName", ""),
                last_name=p.get("owner1LastName", ""),
            ))

        # Owner 2 from top-level fields
        if p.get("owner2Name"):
            contacts.append(OwnerContact(
                name=p["owner2Name"],
                owner_type=p.get("owner2Type", "Individual"),
                owner_number=2,
                first_name=p.get("owner2FirstName", ""),
                last_name=p.get("owner2LastName", ""),
            ))

        # Enrich with phone/email from contacts array (skip-traced data)
        for contact in p.get("contacts", []):
            owner_num = contact.get("owner", contact.get("seq", 0))
            phones = [
                {"number": ph.get("phone", ""), "type": ph.get("type", ""), "carrier": ph.get("carrier", "")}
                for ph in contact.get("phones", [])
            ]
            emails = [e.get("email", "") for e in contact.get("emails", []) if e.get("email")]
            # Try to match to existing contact by owner number
            matched = False
            for c in contacts:
                if c.owner_number == owner_num:
                    c.phones = phones
                    c.emails = emails
                    c.deceased = contact.get("deceased", False)
                    matched = True
                    break
            if not matched:
                contacts.append(OwnerContact(
                    name=contact.get("name", ""),
                    owner_type=contact.get("type", ""),
                    owner_number=owner_num,
                    phones=phones,
                    emails=emails,
                    deceased=contact.get("deceased", False),
                ))

        owner = PropertyReachOwner(
            names=owner_names,
            owner_occupied=p.get("ownerOccupied", False),
            mailing_address={
                "address": p.get("mailingStreetAddress", ""),
                "city": p.get("mailingCity", ""),
                "state": p.get("mailingState", ""),
                "zip": p.get("mailingZip", ""),
            },
            ownership_months=p.get("ownershipMonths", 0),
            ownership_type=p.get("ownershipType", ""),
            contacts=contacts,
        )

        # Mortgages from openLoans (active loans only)
        mortgages = []
        for i, loan in enumerate(p.get("openLoans", []), start=1):
            mortgages.append(PropertyReachMortgage(
                position=i,
                lender_name=loan.get("lenderName", ""),
                original_amount=int(loan.get("amount", 0) * 100),
                current_balance=int(loan.get("estimatedBalance", 0) * 100) if loan.get("estimatedBalance") else None,
                recording_date=loan.get("recordingDate", ""),
                interest_rate=loan.get("rate"),
                monthly_payment=int(loan.get("estimatedPayment", 0) * 100) if loan.get("estimatedPayment") else None,
                loan_type=loan.get("loanType", ""),
                loan_term_months=loan.get("term", 0),
                due_date=loan.get("dueDate", ""),
                is_active=loan.get("active", True),
                loan_flags=loan.get("loanFlags", ""),
                document_number=loan.get("documentNumber", ""),
            ))

        # Equity
        loan_balance = int(p.get("loanBalance", 0) * 100)
        est_equity = int(p.get("estimatedEquity", 0) * 100)
        equity = PropertyReachEquity(
            estimated_value=int(estimated_value * 100),
            total_mortgage_balance=loan_balance,
            estimated_equity=est_equity,
            equity_percent=p.get("estimatedEquityRatio", 0),
            ltv_ratio=p.get("loanToValueRatio", 0),
        )

        # STR (PropertyReach doesn't have STR detection in this endpoint)
        str_analysis = PropertyReachSTRAnalysis(is_short_term_rental=False)

        return PropertyReachFullReport(
            property=prop,
            owner=owner,
            mortgages=mortgages,
            equity=equity,
            str_analysis=str_analysis,
            estimated_rent=p.get("estimatedRentAmount", 0),
            raw_data=p,
        )

    def _map_property_type(self, prop_type: str) -> str:
        """Map PropertyReach property types to our internal types."""
        normalized = prop_type.upper()
        if "SINGLE" in normalized or "SFR" in normalized:
            return "SFR"
        if "CONDO" in normalized:
            return "CONDO"
        if "TOWN" in normalized:
            return "TOWNHOUSE"
        if "MULTI" in normalized or "DUPLEX" in normalized or "TRIPLEX" in normalized or "QUAD" in normalized:
            return "2_4_UNIT"
        if "APART" in normalized:
            return "MULTIFAMILY"
        return "SFR"


# Export singleton instance
property_reach = PropertyReachAdapter()
