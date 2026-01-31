"""
Lead Ingest Service

Ingests leads from Excel/CSV/Google Sheets and runs the full pipeline:
1. Parse file and extract leads
2. Save leads to database
3. Fetch property details from PropertyReach
4. Calculate DSCR
5. If DSCR qualifies, fetch AVM data
6. Generate loan offer
"""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, BinaryIO
from uuid import uuid4
from urllib.parse import urlparse, parse_qs

from app.adapters.propertyreach import property_reach, PropertyReachAddress
from app.adapters.datatree import datatree_avm, Address
from app.services.dscr import dscr_calculator, DSCRCalculationInput, Money


class IngestStatus(str, Enum):
    """Status of ingest job."""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"


class LeadProcessingStatus(str, Enum):
    """Status of individual lead processing."""
    PENDING = "PENDING"
    PROPERTY_FETCHED = "PROPERTY_FETCHED"
    DSCR_CALCULATED = "DSCR_CALCULATED"
    AVM_FETCHED = "AVM_FETCHED"
    OFFER_CREATED = "OFFER_CREATED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass
class ParsedLead:
    """Lead parsed from file."""
    row_number: int
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    property_address: str | None = None
    property_city: str | None = None
    property_state: str | None = None
    property_zip: str | None = None
    propertyreach_url: str | None = None
    loan_amount: int | None = None  # cents
    raw_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProcessedLead:
    """Lead after processing through pipeline."""
    lead_id: str
    parsed_lead: ParsedLead
    status: LeadProcessingStatus

    # Property data
    property_data: dict[str, Any] | None = None

    # DSCR results
    dscr_ratio: float | None = None
    dscr_meets_minimum: bool = False
    monthly_rent: int | None = None
    monthly_pitia: int | None = None

    # AVM results
    avm_value: int | None = None
    avm_confidence: str | None = None

    # Offer
    offer_id: str | None = None
    offer_token: str | None = None

    # Errors
    error_message: str | None = None

    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: datetime | None = None


@dataclass
class IngestJob:
    """Ingest job tracking."""
    id: str
    filename: str
    status: IngestStatus
    total_leads: int = 0
    processed_leads: int = 0
    successful_leads: int = 0
    failed_leads: int = 0
    skipped_leads: int = 0
    leads: list[ProcessedLead] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    error_message: str | None = None


@dataclass
class IngestConfig:
    """Configuration for ingest pipeline."""
    min_dscr: float = 1.0  # Minimum DSCR to qualify for offer
    min_credit_score: int = 660
    max_ltv: float = 80.0
    default_interest_rate: float = 7.25  # Default rate for DSCR calc
    default_loan_term_months: int = 360
    default_vacancy_rate: float = 0.05
    skip_avm_on_low_dscr: bool = True  # Don't fetch AVM if DSCR too low
    create_offers: bool = True  # Create offers for qualifying leads


class IngestService:
    """Service for ingesting leads from files."""

    # Column name mappings (lowercase)
    COLUMN_MAPPINGS = {
        "first_name": ["first_name", "firstname", "first", "fname", "borrower_first"],
        "last_name": ["last_name", "lastname", "last", "lname", "borrower_last"],
        "email": ["email", "email_address", "borrower_email", "e-mail"],
        "phone": ["phone", "phone_number", "mobile", "cell", "telephone", "borrower_phone"],
        "property_address": ["property_address", "address", "street", "street_address", "property_street"],
        "property_city": ["property_city", "city"],
        "property_state": ["property_state", "state"],
        "property_zip": ["property_zip", "zip", "zipcode", "zip_code", "postal_code"],
        "propertyreach_url": ["propertyreach_url", "propertyreach", "property_url", "pr_url", "property_link"],
        "loan_amount": ["loan_amount", "amount", "loan_amt", "requested_amount"],
    }

    def __init__(self, config: IngestConfig | None = None) -> None:
        self.config = config or IngestConfig()
        self._jobs: dict[str, IngestJob] = {}

    async def ingest_csv(
        self,
        file_content: bytes | str,
        filename: str = "upload.csv",
    ) -> IngestJob:
        """Ingest leads from CSV content."""
        job = IngestJob(
            id=str(uuid4()),
            filename=filename,
            status=IngestStatus.PROCESSING,
        )
        self._jobs[job.id] = job

        try:
            # Parse CSV
            if isinstance(file_content, bytes):
                file_content = file_content.decode("utf-8")

            leads = self._parse_csv(file_content)
            job.total_leads = len(leads)

            # Process each lead
            for parsed_lead in leads:
                processed = await self._process_lead(parsed_lead)
                job.leads.append(processed)
                job.processed_leads += 1

                if processed.status == LeadProcessingStatus.OFFER_CREATED:
                    job.successful_leads += 1
                elif processed.status == LeadProcessingStatus.FAILED:
                    job.failed_leads += 1
                elif processed.status == LeadProcessingStatus.SKIPPED:
                    job.skipped_leads += 1

            job.status = IngestStatus.COMPLETED if job.failed_leads == 0 else IngestStatus.PARTIAL
            job.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            job.status = IngestStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)

        return job

    async def ingest_excel(
        self,
        file: BinaryIO,
        filename: str = "upload.xlsx",
    ) -> IngestJob:
        """Ingest leads from Excel file."""
        try:
            import openpyxl
        except ImportError:
            raise ImportError("openpyxl is required for Excel files. Run: pip install openpyxl")

        job = IngestJob(
            id=str(uuid4()),
            filename=filename,
            status=IngestStatus.PROCESSING,
        )
        self._jobs[job.id] = job

        try:
            # Parse Excel
            workbook = openpyxl.load_workbook(file, read_only=True)
            sheet = workbook.active

            leads = self._parse_excel_sheet(sheet)
            job.total_leads = len(leads)

            # Process each lead
            for parsed_lead in leads:
                processed = await self._process_lead(parsed_lead)
                job.leads.append(processed)
                job.processed_leads += 1

                if processed.status == LeadProcessingStatus.OFFER_CREATED:
                    job.successful_leads += 1
                elif processed.status == LeadProcessingStatus.FAILED:
                    job.failed_leads += 1
                elif processed.status == LeadProcessingStatus.SKIPPED:
                    job.skipped_leads += 1

            job.status = IngestStatus.COMPLETED if job.failed_leads == 0 else IngestStatus.PARTIAL
            job.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            job.status = IngestStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)

        return job

    def get_job(self, job_id: str) -> IngestJob | None:
        """Get ingest job by ID."""
        return self._jobs.get(job_id)

    def _parse_csv(self, content: str) -> list[ParsedLead]:
        """Parse CSV content into leads."""
        leads = []
        reader = csv.DictReader(io.StringIO(content))

        # Map columns
        column_map = self._map_columns(reader.fieldnames or [])

        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is 1)
            lead = self._row_to_lead(row_num, row, column_map)
            if lead:
                leads.append(lead)

        return leads

    def _parse_excel_sheet(self, sheet: Any) -> list[ParsedLead]:
        """Parse Excel sheet into leads."""
        leads = []
        rows = list(sheet.iter_rows(values_only=True))

        if not rows:
            return leads

        # First row is header
        headers = [str(cell).strip().lower() if cell else "" for cell in rows[0]]
        column_map = self._map_columns(headers)

        for row_num, row in enumerate(rows[1:], start=2):
            row_dict = {headers[i]: row[i] for i in range(len(headers)) if i < len(row)}
            lead = self._row_to_lead(row_num, row_dict, column_map)
            if lead:
                leads.append(lead)

        return leads

    def _map_columns(self, headers: list[str]) -> dict[str, str]:
        """Map file columns to expected fields."""
        column_map = {}
        headers_lower = [h.lower().strip() if h else "" for h in headers]

        for field, aliases in self.COLUMN_MAPPINGS.items():
            for alias in aliases:
                if alias in headers_lower:
                    # Find the original header name
                    idx = headers_lower.index(alias)
                    column_map[field] = headers[idx] if idx < len(headers) else alias
                    break

        return column_map

    def _row_to_lead(
        self,
        row_num: int,
        row: dict[str, Any],
        column_map: dict[str, str],
    ) -> ParsedLead | None:
        """Convert row to ParsedLead."""
        def get_value(field: str) -> str | None:
            col = column_map.get(field)
            if col and col in row:
                val = row[col]
                return str(val).strip() if val else None
            # Also try lowercase
            col_lower = col.lower() if col else None
            if col_lower and col_lower in row:
                val = row[col_lower]
                return str(val).strip() if val else None
            return None

        first_name = get_value("first_name")
        last_name = get_value("last_name")
        email = get_value("email")

        # Skip rows without required fields
        if not first_name or not last_name or not email:
            return None

        # Parse loan amount
        loan_amount = None
        loan_amt_str = get_value("loan_amount")
        if loan_amt_str:
            try:
                # Remove $, commas, etc
                cleaned = re.sub(r"[^\d.]", "", loan_amt_str)
                loan_amount = int(float(cleaned) * 100)  # Convert to cents
            except ValueError:
                pass

        return ParsedLead(
            row_number=row_num,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=get_value("phone"),
            property_address=get_value("property_address"),
            property_city=get_value("property_city"),
            property_state=get_value("property_state"),
            property_zip=get_value("property_zip"),
            propertyreach_url=get_value("propertyreach_url"),
            loan_amount=loan_amount,
            raw_data=dict(row),
        )

    async def _process_lead(self, parsed_lead: ParsedLead) -> ProcessedLead:
        """Process a single lead through the full pipeline."""
        processed = ProcessedLead(
            lead_id=str(uuid4()),
            parsed_lead=parsed_lead,
            status=LeadProcessingStatus.PENDING,
        )

        try:
            # Step 1: Get property address (from URL or direct fields)
            address = self._extract_address(parsed_lead)
            if not address:
                processed.status = LeadProcessingStatus.SKIPPED
                processed.error_message = "No property address available"
                return processed

            # Step 2: Fetch property data from PropertyReach
            property_data = await self._fetch_property_data(address)
            if property_data:
                processed.property_data = property_data
                processed.status = LeadProcessingStatus.PROPERTY_FETCHED
            else:
                # Continue even without property data - use defaults
                processed.property_data = self._create_default_property_data(address)

            # Step 3: Calculate DSCR
            dscr_result = await self._calculate_dscr(parsed_lead, processed.property_data)
            if dscr_result:
                processed.dscr_ratio = dscr_result["dscr"]
                processed.dscr_meets_minimum = dscr_result["meets_minimum"]
                processed.monthly_rent = dscr_result["monthly_rent"]
                processed.monthly_pitia = dscr_result["monthly_pitia"]
                processed.status = LeadProcessingStatus.DSCR_CALCULATED

            # Step 4: If DSCR qualifies, fetch AVM
            if processed.dscr_meets_minimum or not self.config.skip_avm_on_low_dscr:
                avm_result = await self._fetch_avm(address)
                if avm_result:
                    processed.avm_value = avm_result["value"]
                    processed.avm_confidence = avm_result["confidence"]
                    processed.status = LeadProcessingStatus.AVM_FETCHED

            # Step 5: Create offer if qualifying
            if self.config.create_offers and processed.dscr_meets_minimum:
                offer = self._create_offer(parsed_lead, processed)
                processed.offer_id = offer["id"]
                processed.offer_token = offer["token"]
                processed.status = LeadProcessingStatus.OFFER_CREATED
            elif not processed.dscr_meets_minimum:
                processed.status = LeadProcessingStatus.SKIPPED
                processed.error_message = f"DSCR {processed.dscr_ratio:.2f} below minimum {self.config.min_dscr}"

            processed.processed_at = datetime.now(timezone.utc)

        except Exception as e:
            processed.status = LeadProcessingStatus.FAILED
            processed.error_message = str(e)
            processed.processed_at = datetime.now(timezone.utc)

        return processed

    def _extract_address(self, lead: ParsedLead) -> PropertyReachAddress | None:
        """Extract address from lead data or PropertyReach URL."""
        # Try PropertyReach URL first
        if lead.propertyreach_url:
            address = self._parse_propertyreach_url(lead.propertyreach_url)
            if address:
                return address

        # Fall back to direct address fields
        if lead.property_address and lead.property_city and lead.property_state and lead.property_zip:
            return PropertyReachAddress(
                street=lead.property_address,
                city=lead.property_city,
                state=lead.property_state,
                zip=lead.property_zip,
            )

        return None

    def _parse_propertyreach_url(self, url: str) -> PropertyReachAddress | None:
        """Parse PropertyReach URL to extract address."""
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            # PropertyReach URL format varies, try common patterns
            # Example: https://propertyreach.com/property?address=123+Main+St&city=Austin&state=TX&zip=78701
            street = params.get("address", params.get("street", [None]))[0]
            city = params.get("city", [None])[0]
            state = params.get("state", [None])[0]
            zip_code = params.get("zip", params.get("zipcode", [None]))[0]

            if street and city and state and zip_code:
                return PropertyReachAddress(
                    street=street.replace("+", " "),
                    city=city.replace("+", " "),
                    state=state,
                    zip=zip_code,
                )

            # Try parsing from path
            # Example: https://propertyreach.com/property/123-main-st-austin-tx-78701
            path_parts = parsed.path.strip("/").split("/")
            if len(path_parts) >= 2 and path_parts[0] == "property":
                # This would need more sophisticated parsing
                pass

        except Exception:
            pass

        return None

    async def _fetch_property_data(
        self, address: PropertyReachAddress
    ) -> dict[str, Any] | None:
        """Fetch property data from PropertyReach."""
        try:
            report = await property_reach.get_property_report(address)
            if report:
                return {
                    "property_type": report.property.characteristics.property_type,
                    "year_built": report.property.characteristics.year_built,
                    "square_feet": report.property.characteristics.square_feet,
                    "bedrooms": report.property.characteristics.bedrooms,
                    "bathrooms": report.property.characteristics.bathrooms,
                    "units": report.property.characteristics.units,
                    "assessed_value": report.property.assessment.assessed_value,
                    "annual_taxes": report.property.assessment.annual_taxes,
                    "estimated_value": report.property.market_value.estimated_value,
                    "monthly_rent_estimate": int(report.property.market_value.estimated_value * 0.008 / 100),  # 0.8% rule
                    "is_str": report.str_analysis.is_short_term_rental if report.str_analysis else False,
                    "str_monthly_revenue": report.str_analysis.estimated_monthly_revenue if report.str_analysis else None,
                    "owner_names": report.owner.names,
                    "owner_occupied": report.owner.owner_occupied,
                    "mortgages": len(report.mortgages),
                    "equity": report.equity.estimated_equity,
                    "ltv": report.equity.ltv_ratio,
                }
        except Exception as e:
            print(f"PropertyReach fetch failed: {e}")
        return None

    def _create_default_property_data(
        self, address: PropertyReachAddress
    ) -> dict[str, Any]:
        """Create default property data when API unavailable."""
        return {
            "property_type": "SFR",
            "address": {
                "street": address.street,
                "city": address.city,
                "state": address.state,
                "zip": address.zip,
            },
        }

    async def _calculate_dscr(
        self,
        lead: ParsedLead,
        property_data: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        """Calculate DSCR for the lead."""
        try:
            # Get loan amount
            loan_amount = lead.loan_amount
            if not loan_amount and property_data:
                # Estimate as 75% of property value
                est_value = property_data.get("estimated_value", 0)
                loan_amount = int(est_value * 0.75)

            if not loan_amount:
                loan_amount = 45000000  # Default $450K

            # Get rent estimate
            monthly_rent = 0
            if property_data:
                if property_data.get("is_str") and property_data.get("str_monthly_revenue"):
                    monthly_rent = property_data["str_monthly_revenue"]
                else:
                    monthly_rent = property_data.get("monthly_rent_estimate", 0)

            if not monthly_rent:
                monthly_rent = 350000  # Default $3,500

            # Get taxes and insurance
            annual_taxes = property_data.get("annual_taxes", 720000) if property_data else 720000  # Default $7,200
            est_value = property_data.get("estimated_value", 60000000) if property_data else 60000000
            annual_insurance = int(est_value * 0.0035)  # 0.35% of value

            # Calculate DSCR
            input_data = DSCRCalculationInput(
                application_id="ingest",
                property_id="ingest",
                gross_monthly_rent=Money(monthly_rent),
                vacancy_rate=self.config.default_vacancy_rate,
                annual_property_tax=Money(annual_taxes),
                annual_insurance=Money(annual_insurance),
                loan_amount=Money(loan_amount),
                interest_rate=self.config.default_interest_rate / 100,
                term_months=self.config.default_loan_term_months,
            )

            result = dscr_calculator.calculate(input_data)

            return {
                "dscr": round(result.dscr_ratio, 2),
                "meets_minimum": result.dscr_ratio >= self.config.min_dscr,
                "monthly_rent": monthly_rent,
                "monthly_pitia": result.debt_service.total_pitia.amount,
                "monthly_noi": result.noi.monthly.amount,
            }

        except Exception as e:
            print(f"DSCR calculation failed: {e}")
            return None

    async def _fetch_avm(self, address: PropertyReachAddress) -> dict[str, Any] | None:
        """Fetch AVM data."""
        try:
            dt_address = Address(
                street=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
            )
            result = await datatree_avm.order_avm(dt_address)

            if result.get("success") and result.get("report"):
                report = result["report"]
                return {
                    "value": report.estimated_value,
                    "confidence": report.confidence_level.value if report.confidence_level else None,
                    "value_low": report.value_low,
                    "value_high": report.value_high,
                }
        except Exception as e:
            print(f"AVM fetch failed: {e}")
        return None

    def _create_offer(
        self,
        lead: ParsedLead,
        processed: ProcessedLead,
    ) -> dict[str, str]:
        """Create an offer for a qualifying lead."""
        offer_id = str(uuid4())
        offer_token = f"offer_{uuid4().hex[:12]}"

        # In production, this would save to database
        # For now, return the offer details
        return {
            "id": offer_id,
            "token": offer_token,
            "url": f"/offer/{offer_token}",
        }


# Export singleton
ingest_service = IngestService()
