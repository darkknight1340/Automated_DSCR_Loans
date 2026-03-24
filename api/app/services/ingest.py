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
from app.adapters.datatree import datatree_avm, datatree_property, Address as DataTreeAddress
from app.adapters.rentcast import rentcast_service
from app.adapters.encompass import encompass_client
from app.adapters.base import AVMResult, RentEstimateResult, VerificationResult, DataSources
from app.adapters.clear_capital import clear_capital_service, PropertyAnalyticsResult
from app.adapters.zillow_scraper import zillow_scraper
from app.adapters.redfin_scraper import redfin_scraper
from app.services.dscr import dscr_calculator, DSCRCalculationInput, Money
from app.services.decision import decision_service, DecisionType
from app.services.rules import LoanData
from app.services.pricing import PricingInput

import logging
logger = logging.getLogger("pipeline")
logger.setLevel(logging.DEBUG)
# Ensure logs are visible in console
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)


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

    # DSCR results (both methods)
    dscr_ratio: float | None = None  # NOI method (conservative)
    simple_dscr_ratio: float | None = None  # Simple Rent/PITIA (like Encompass)
    dscr_meets_minimum: bool = False
    monthly_rent: int | None = None
    monthly_pitia: int | None = None

    # AVM results
    avm_value: int | None = None
    avm_confidence: str | None = None
    avm_source: str | None = None  # "DataTree", "RentCast", "ClearCapital", etc.

    # Rental comps
    rent_estimate: int | None = None  # dollars/month
    rental_comps: list[dict[str, Any]] | None = None

    # Offer
    offer_id: str | None = None
    offer_token: str | None = None

    # Errors
    error_message: str | None = None

    # Source attribution (new)
    data_sources: DataSources | None = None

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
    """Configuration for ingest pipeline. Reads from env vars at init for runtime flexibility."""
    min_dscr: float = 1.0  # Minimum DSCR to qualify for offer
    min_credit_score: int = 660
    max_ltv: float = 80.0
    default_interest_rate: float = 4.99  # Standard rate for all DSCR calculations (%)
    default_loan_term_months: int = 360
    default_vacancy_rate: float = 0.05
    default_credit_score: int = 720  # FICO score assumption
    create_offers: bool = True  # Create offers for qualifying leads

    # Clear Capital premium verification thresholds
    # Only call Clear Capital when ALL conditions are met:
    # 1. DSCR > premium_dscr_threshold (deal looks promising)
    # 2. LTV > premium_ltv_threshold (higher risk, worth verifying)
    # 3. AVM and rent are confirmed by Zillow/Redfin (pre-validated)
    premium_dscr_threshold: float = 0.75  # Min DSCR to trigger premium verification
    premium_ltv_threshold: float = 80.0  # Max LTV for premium verification (skip if above)
    require_scrape_verification: bool = False  # Don't require Zillow/Redfin confirmation

    def __post_init__(self) -> None:
        """Override defaults from environment variables if set."""
        import os
        if v := os.getenv("DEFAULT_INTEREST_RATE"):
            self.default_interest_rate = float(v)
        if v := os.getenv("DEFAULT_CREDIT_SCORE"):
            self.default_credit_score = int(v)
        if v := os.getenv("MIN_DSCR"):
            self.min_dscr = float(v)
        if v := os.getenv("MAX_LTV"):
            self.max_ltv = float(v)
        if v := os.getenv("PREMIUM_DSCR_THRESHOLD"):
            self.premium_dscr_threshold = float(v)
        if v := os.getenv("PREMIUM_LTV_THRESHOLD"):
            self.premium_ltv_threshold = float(v)
        if v := os.getenv("REQUIRE_SCRAPE_VERIFICATION"):
            self.require_scrape_verification = v.lower() in ("true", "1", "yes")


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

    # Standard rate for all DSCR calculations
    STANDARD_INTEREST_RATE = 0.0499  # 4.99%
    STANDARD_TERM_MONTHS = 360  # 30 years
    MIN_DSCR = 1.0  # Minimum DSCR for approval

    def _determine_loan_amount(
        self, property_data: dict[str, Any] | None, rent_estimate: float = 0, avm_value: int = 0
    ) -> tuple[int, str]:
        """Calculate maximum approvable loan amount under DSCR guidelines.

        Returns (loan_amount_cents, loan_purpose).

        Logic:
        1. Start with rent estimate
        2. Calculate max PITIA where DSCR >= 1.0 (rent / PITIA >= 1.0, so max PITIA = rent)
        3. Deduct taxes + insurance from PITIA to get max P&I
        4. Back-calculate max loan from P&I using 4.99% rate
        5. Cap at 75% LTV based on AVM/property value
        """
        import math

        # Get property value for LTV cap
        property_value_cents = avm_value or (property_data.get("estimated_value", 0) if property_data else 0)
        property_value_dollars = property_value_cents / 100 if property_value_cents else 0

        # Estimate monthly taxes and insurance from property data
        annual_taxes = 0
        annual_insurance = 0
        if property_data:
            # Use actual tax data if available, else estimate 1.25% of value
            annual_taxes = property_data.get("annual_taxes", 0) or (property_value_dollars * 0.0125)
            # Estimate insurance at 0.5% of value
            annual_insurance = property_value_dollars * 0.005

        monthly_taxes = annual_taxes / 12
        monthly_insurance = annual_insurance / 12
        monthly_ti = monthly_taxes + monthly_insurance

        # Calculate max loan based on DSCR
        max_loan_dscr = 0
        if rent_estimate > 0:
            # Max PITIA = rent / MIN_DSCR
            max_pitia = rent_estimate / self.MIN_DSCR
            # Max P&I = max PITIA - taxes - insurance
            max_pi = max_pitia - monthly_ti

            if max_pi > 0:
                # Back-calculate loan amount from P&I
                # P&I = L * [r(1+r)^n] / [(1+r)^n - 1]
                r = self.STANDARD_INTEREST_RATE / 12  # Monthly rate
                n = self.STANDARD_TERM_MONTHS
                factor = (r * math.pow(1 + r, n)) / (math.pow(1 + r, n) - 1)
                max_loan_dscr = max_pi / factor

        # Calculate max loan based on 75% LTV
        max_loan_ltv = property_value_dollars * 0.75 if property_value_dollars > 0 else 0

        # Use the lower of DSCR-based or LTV-based max
        if max_loan_dscr > 0 and max_loan_ltv > 0:
            max_loan = min(max_loan_dscr, max_loan_ltv)
            loan_purpose = "CASH_OUT_REFI" if max_loan == max_loan_ltv else "RATE_TERM_REFI"
        elif max_loan_dscr > 0:
            max_loan = max_loan_dscr
            loan_purpose = "RATE_TERM_REFI"
        elif max_loan_ltv > 0:
            max_loan = max_loan_ltv
            loan_purpose = "CASH_OUT_REFI"
        else:
            # Fallback: use existing loan balance if available
            if property_data:
                existing_loans = property_data.get("existing_loans", [])
                active_loans = [ln for ln in existing_loans if ln.get("isActive") is not False]
                if active_loans:
                    total_balance = sum(ln.get("estimatedBalance") or 0 for ln in active_loans)
                    if total_balance > 0:
                        return int(total_balance * 100), "RATE_TERM_REFI"
            # Ultimate fallback
            return 25000000, "PURCHASE"  # $250K default

        return int(max_loan * 100), loan_purpose

    async def _process_lead(
        self,
        parsed_lead: ParsedLead,
        *,
        prefetched_property_data: dict[str, Any] | None = None,
    ) -> ProcessedLead:
        """Process a single lead through the full pipeline.

        Args:
            parsed_lead: The parsed lead data
            prefetched_property_data: Optional pre-fetched property data (e.g., from DataTree).
                If provided, skips property fetching and uses this data directly.
        """
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

            propertyreach_raw = None

            # Step 2: Fetch property data (or use prefetched data)
            if prefetched_property_data:
                # Use pre-fetched data (e.g., from validation endpoint)
                processed.property_data = prefetched_property_data
                processed.status = LeadProcessingStatus.PROPERTY_FETCHED
            else:
                # Fetch from PropertyReach (or DataTree as fallback)
                property_data, propertyreach_raw = await self._fetch_property_data(address)
                if property_data:
                    processed.property_data = property_data
                    processed.status = LeadProcessingStatus.PROPERTY_FETCHED
                else:
                    # PropertyReach failed, try DataTree for property details
                    datatree_property_data = await self._fetch_property_from_datatree(address)
                    if datatree_property_data:
                        processed.property_data = datatree_property_data
                        processed.status = LeadProcessingStatus.PROPERTY_FETCHED
                    else:
                        processed.property_data = self._create_default_property_data(address)

            # Step 3: Persist property to DB
            property_db_id = await self._persist_property(address, processed.property_data)

            # Step 3b: Store PropertyReach raw response
            if propertyreach_raw:
                await self._store_api_response(
                    provider="PROPERTYREACH",
                    endpoint="/property",
                    request_params={
                        "streetAddress": address.street,
                        "city": address.city,
                        "state": address.state,
                        "zipCode": address.zip,
                    },
                    response_data=propertyreach_raw,
                    http_status=200,
                    property_id=property_db_id,
                )

            # Step 3c: Fetch liens from DataTree if not already in property data
            existing_loans = processed.property_data.get("existing_loans", []) if processed.property_data else []
            if not existing_loans and not prefetched_property_data:
                # Only fetch if we don't have prefetched data (which already includes liens)
                datatree_liens = await self._fetch_liens_from_datatree(address, property_db_id)
                if datatree_liens:
                    if processed.property_data:
                        processed.property_data["existing_loans"] = datatree_liens
                        processed.property_data["mortgage_count"] = len(datatree_liens)
                        processed.property_data["total_loan_balance"] = sum(
                            ln.get("estimatedBalance") or ln.get("originalAmount") or 0
                            for ln in datatree_liens
                        )

            # Initialize data sources tracking
            sources = DataSources()
            # Property data comes from DataTree (PropertyReach not used)
            sources.property_source = processed.property_data.get("source", "DataTree") if processed.property_data else "DataTree"
            processed.data_sources = sources

            addr_str = f"{address.street}, {address.city}, {address.state} {address.zip}"
            logger.info(f"{'='*60}")
            logger.info(f"[PIPELINE] Processing: {addr_str}")
            logger.info(f"{'='*60}")

            # Step 4: Fetch AVM with fallback chain (RentCast -> DataTree -> PropertyReach)
            logger.info(f"[STEP 4] Fetching AVM (fallback chain: RentCast -> DataTree -> PropertyReach)")
            property_value = processed.property_data.get("estimated_value", 0) if processed.property_data else 0
            avm_result = await self._fetch_avm_with_fallback(address, processed.property_data)
            if avm_result:
                processed.avm_value = avm_result.value
                processed.avm_confidence = avm_result.confidence
                processed.avm_source = avm_result.source
                sources.avm_source = avm_result.source
                processed.status = LeadProcessingStatus.AVM_FETCHED
                property_value = avm_result.value
                logger.info(
                    f"[STEP 4] ✓ AVM Result: ${avm_result.value / 100:,.0f} "
                    f"(confidence: {avm_result.confidence}, source: {avm_result.source})"
                )
            else:
                logger.warning(f"[STEP 4] ✗ AVM fetch failed - no result from any source")

            # Step 5: Fetch rent with fallback chain (RentCast -> PropertyReach -> Zillow)
            logger.info(f"[STEP 5] Fetching rent estimate (fallback chain: RentCast -> PropertyReach -> Zillow)")
            rent_result = await self._fetch_rent_with_fallback(
                address, processed.property_data, property_db_id=property_db_id
            )
            rent_estimate = 0
            if rent_result:
                processed.rent_estimate = rent_result.estimate
                processed.rental_comps = rent_result.comps
                sources.rent_source = rent_result.source
                rent_estimate = rent_result.estimate or 0
                logger.info(
                    f"[STEP 5] ✓ Rent Result: ${rent_result.estimate:,}/mo "
                    f"(comps: {rent_result.comp_count}, source: {rent_result.source})"
                )
            else:
                logger.warning(f"[STEP 5] ✗ Rent fetch failed - no result from any source")

            # Step 5b: Run parallel verification against Zillow/Redfin
            logger.info(f"[STEP 5b] Running parallel verification (Zillow + Redfin)")
            if avm_result and rent_result:
                avm_verifications, rent_verifications = await self._run_parallel_verification(
                    address, avm_result.value, rent_result.estimate
                )
                sources.avm_verified_by = avm_verifications
                sources.rent_verified_by = rent_verifications

                # Log verification results
                for v in avm_verifications:
                    if v.error:
                        logger.info(f"[STEP 5b] AVM verification ({v.source}): ERROR - {v.error}")
                    else:
                        match_str = "✓ MATCH" if v.match else "✗ NO MATCH"
                        logger.info(
                            f"[STEP 5b] AVM verification ({v.source}): {match_str} "
                            f"(found: ${v.found_value / 100 if v.found_value else 0:,.0f}, diff: {v.diff_pct}%)"
                        )
                for v in rent_verifications:
                    if v.error:
                        logger.info(f"[STEP 5b] Rent verification ({v.source}): ERROR - {v.error}")
                    else:
                        match_str = "✓ MATCH" if v.match else "✗ NO MATCH"
                        logger.info(
                            f"[STEP 5b] Rent verification ({v.source}): {match_str} "
                            f"(found: ${v.found_value if v.found_value else 0:,}/mo, diff: {v.diff_pct}%)"
                        )
            else:
                logger.info(f"[STEP 5b] Skipping verification - missing AVM or rent data")

            # Step 6: Determine loan amount
            # Priority: DataTree lien balance > calculated max (no Encompass)
            logger.info(f"[STEP 6] Determining loan amount")
            datatree_lien_balance = processed.property_data.get("total_loan_balance", 0) if processed.property_data else 0
            loan_amount_source = "Calculated"

            if datatree_lien_balance and datatree_lien_balance > 0:
                # Use DataTree lien balance (actual liens on property)
                loan_amount_cents = int(datatree_lien_balance)
                loan_purpose = "RATE_TERM_REFI"
                loan_amount_source = "DataTree Liens"
                logger.info(f"[STEP 6] Using DataTree lien balance: ${loan_amount_cents / 100:,.0f}")
            else:
                loan_amount_cents, loan_purpose = self._determine_loan_amount(
                    processed.property_data,
                    rent_estimate=rent_estimate,
                    avm_value=property_value,
                )
                loan_amount_source = "Calculated (Max Approvable)"
                logger.info(f"[STEP 6] Calculated loan amount: ${loan_amount_cents / 100:,.0f} ({loan_purpose})")

            # Step 7: Calculate DSCR with the determined loan amount
            logger.info(f"[STEP 7] Calculating DSCR")
            rentcast_monthly_cents = rent_estimate * 100 if rent_estimate else 0
            dscr_result = await self._calculate_dscr_with_amount(
                loan_amount_cents, processed.property_data,
                override_rent_cents=rentcast_monthly_cents if rentcast_monthly_cents else None,
                override_value_cents=property_value if property_value else None,
            )
            if dscr_result:
                processed.dscr_ratio = dscr_result["dscr"]  # NOI method
                processed.monthly_rent = dscr_result["monthly_rent"]
                processed.monthly_pitia = dscr_result["monthly_pitia"]

                # Calculate simple DSCR (Rent / PITIA) - matches Encompass method
                if processed.monthly_pitia and processed.monthly_pitia > 0:
                    processed.simple_dscr_ratio = round(
                        processed.monthly_rent / processed.monthly_pitia, 4
                    )
                    # Use simple DSCR for approval decision (matches Encompass)
                    processed.dscr_meets_minimum = processed.simple_dscr_ratio >= self.config.min_dscr
                else:
                    processed.simple_dscr_ratio = processed.dscr_ratio
                    processed.dscr_meets_minimum = dscr_result["meets_minimum"]

                processed.status = LeadProcessingStatus.DSCR_CALCULATED
                logger.info(
                    f"[STEP 7] ✓ DSCR Result: NOI={processed.dscr_ratio:.4f}, Simple={processed.simple_dscr_ratio:.4f}"
                )
                logger.info(
                    f"[STEP 7]   Monthly Rent: ${processed.monthly_rent:,} | Monthly PITIA: ${processed.monthly_pitia:,}"
                )
                logger.info(
                    f"[STEP 7]   Meets minimum ({self.config.min_dscr}): {'YES' if processed.dscr_meets_minimum else 'NO'}"
                )
            else:
                logger.warning(f"[STEP 7] ✗ DSCR calculation failed")

            # Compute LTV early (needed for Step 7b premium verification check)
            if property_value and property_value > 0:
                ltv = (loan_amount_cents / property_value) * 100
            else:
                ltv = 75.0  # Default assumption

            # Step 7b: Fetch premium AVM from Clear Capital if deal qualifies
            # Triggers when: DSCR > threshold AND LTV > threshold
            logger.info(f"[STEP 7b] Evaluating Clear Capital premium verification")
            simple_dscr_for_check = processed.simple_dscr_ratio or processed.dscr_ratio or 0
            avm_verifications = sources.avm_verified_by or []
            rent_verifications = sources.rent_verified_by or []

            # Log the evaluation criteria
            dscr_ok = simple_dscr_for_check > self.config.premium_dscr_threshold
            ltv_ok = ltv < self.config.premium_ltv_threshold  # LTV must be below max
            logger.info(f"[STEP 7b] Evaluation criteria:")
            logger.info(f"[STEP 7b]   DSCR: {simple_dscr_for_check:.2f} {'>' if dscr_ok else '<='} {self.config.premium_dscr_threshold} {'✓' if dscr_ok else '✗'}")
            logger.info(f"[STEP 7b]   LTV: {ltv:.1f}% {'<' if ltv_ok else '>='} {self.config.premium_ltv_threshold}% {'✓' if ltv_ok else '✗'}")

            if avm_result:
                premium_data = await self._fetch_premium_data_if_needed(
                    address=address,
                    dscr=simple_dscr_for_check,
                    ltv=ltv,
                    primary_avm=avm_result,
                    avm_verifications=avm_verifications,
                    rent_verifications=rent_verifications,
                )
                if premium_data and premium_data.avm:
                    premium_avm = premium_data.avm
                    sources.premium_avm = premium_avm
                    logger.info(
                        f"[STEP 7b] ✓ Clear Capital AVM: ${premium_avm.value / 100:,.0f} "
                        f"(confidence: {premium_avm.confidence}, source: {premium_avm.source})"
                    )

                    # Check for significant divergence (>10%)
                    divergence = abs(premium_avm.value - avm_result.value) / avm_result.value
                    logger.info(f"[STEP 7b] Divergence from primary AVM: {divergence * 100:.1f}%")
                    if divergence > 0.10:
                        # Use conservative (lower) value for final decision
                        final_avm_value = min(premium_avm.value, avm_result.value)
                        if final_avm_value != avm_result.value:
                            logger.warning(
                                f"[STEP 7b] ⚠ Using LOWER AVM (${final_avm_value / 100:,.0f}) due to "
                                f"Clear Capital divergence ({divergence * 100:.1f}% > 10%)"
                            )
                            property_value = final_avm_value
                        else:
                            logger.info(f"[STEP 7b] Primary AVM is lower, keeping ${avm_result.value / 100:,.0f}")
                    else:
                        logger.info(f"[STEP 7b] AVM values are within 10% tolerance - no adjustment needed")

                    # Track if we need to recalculate DSCR
                    recalc_dscr = False
                    final_rent = rent_estimate
                    final_monthly_taxes = processed.monthly_pitia // 100 if processed.monthly_pitia else 0  # Will update if CC has taxes

                    # Use Clear Capital tax data if available
                    if premium_data.annual_taxes:
                        cc_monthly_taxes = premium_data.annual_taxes / 12
                        logger.info(f"[STEP 7b] ✓ Clear Capital Taxes: ${premium_data.annual_taxes:,}/yr (${cc_monthly_taxes:.0f}/mo)")
                        sources.taxes_source = "ClearCapital:TaxHistory"
                        recalc_dscr = True

                    # Use Clear Capital rental data if available
                    if premium_data.rent_estimate:
                        cc_rent = premium_data.rent_estimate.estimate
                        logger.info(
                            f"[STEP 7b] ✓ Clear Capital Rent: ${cc_rent:,}/mo "
                            f"({len(premium_data.rental_comps)} comps)"
                        )
                        # Compare with RentCast rent and use conservative value
                        if rent_estimate:
                            rent_divergence = abs(cc_rent - rent_estimate) / rent_estimate if rent_estimate else 0
                            if rent_divergence > 0.15:
                                # Use conservative (lower) rent for DSCR
                                final_rent = min(cc_rent, rent_estimate)
                                logger.warning(
                                    f"[STEP 7b] ⚠ Rent divergence {rent_divergence * 100:.1f}% > 15%, "
                                    f"using LOWER rent (${final_rent:,}/mo)"
                                )
                                sources.rent_source = "Conservative (RentCast vs ClearCapital)"
                            else:
                                logger.info(f"[STEP 7b] Rent values within 15% tolerance")
                        else:
                            # No RentCast rent, use Clear Capital
                            final_rent = cc_rent
                            sources.rent_source = "ClearCapital:RentalAVM"
                            logger.info(f"[STEP 7b] Using Clear Capital rent (no RentCast data)")
                        recalc_dscr = True

                    # Recalculate DSCR with updated rent and/or taxes from Clear Capital
                    if recalc_dscr and final_rent and processed.monthly_pitia:
                        # If we have Clear Capital taxes, recalculate PITIA
                        if premium_data.annual_taxes:
                            # Get current PITIA components
                            # PITIA = P&I + Taxes + Insurance
                            # We'll substitute the taxes portion
                            old_monthly_pitia = processed.monthly_pitia / 100

                            # Estimate current taxes from PITIA (rough estimate)
                            # Better: recalculate from loan terms
                            cc_monthly_taxes = premium_data.annual_taxes / 12

                            # Recalculate PITIA with Clear Capital taxes
                            # For now, log the tax source but keep existing PITIA
                            # (full recalc would need P&I breakdown)
                            logger.info(f"[STEP 7b] Clear Capital taxes: ${cc_monthly_taxes:.0f}/mo")

                        processed.monthly_rent = int(final_rent * 100)  # Store in cents
                        old_dscr = processed.simple_dscr_ratio
                        processed.simple_dscr_ratio = round(final_rent / (processed.monthly_pitia / 100), 4)
                        processed.dscr_meets_minimum = processed.simple_dscr_ratio >= self.config.min_dscr

                        if old_dscr != processed.simple_dscr_ratio:
                            logger.info(
                                f"[STEP 7b] ✓ DSCR recalculated: {old_dscr:.4f} → {processed.simple_dscr_ratio:.4f} "
                                f"(rent: ${final_rent:,}/mo)"
                            )
                else:
                    logger.info(f"[STEP 7b] Clear Capital not called (conditions not met or not configured)")

            # Step 8: LTV already computed above (before Step 7b)
            # Recalculate if property_value changed due to premium AVM divergence
            if property_value and property_value > 0:
                ltv = (loan_amount_cents / property_value) * 100

            # Step 9: Persist lead, borrower, application to DB
            lead_db_id, borrower_db_id, app_db_id = await self._persist_lead_records(
                parsed_lead, address, property_db_id,
                loan_amount_cents=loan_amount_cents,
                estimated_value=property_value,
                ltv=ltv,
                loan_purpose=loan_purpose,
            )
            processed.lead_id = lead_db_id

            # Step 8b: Persist AVM to DB
            if processed.avm_value:
                await self._persist_avm(
                    property_db_id, app_db_id,
                    processed.avm_value, processed.avm_confidence,
                )

            # Step 9: Check for rejection (underwater or low DSCR)
            rejection_reasons: list[str] = []
            if processed.avm_value and processed.avm_value > 0:
                if processed.avm_value < loan_amount_cents:
                    rejection_reasons.append(
                        f"UNDERWATER: AVM value ${processed.avm_value / 100:,.0f} "
                        f"< loan amount ${loan_amount_cents / 100:,.0f}"
                    )
            # Use simple DSCR for approval decision (matches Encompass method)
            simple_dscr = processed.simple_dscr_ratio or processed.dscr_ratio
            if simple_dscr is not None and simple_dscr < self.config.min_dscr:
                rejection_reasons.append(
                    f"LOW_DSCR: Simple DSCR {simple_dscr:.4f} "
                    f"< minimum {self.config.min_dscr}"
                )

            decision_result = None
            if rejection_reasons:
                # Persist rejection decision
                await self._persist_rejection(app_db_id, rejection_reasons)
                processed.status = LeadProcessingStatus.SKIPPED
                processed.error_message = "; ".join(rejection_reasons)

                # Store analysis data even for rejections
                await self._persist_analysis(
                    lead_db_id, processed, loan_amount_cents, loan_purpose,
                    address, loan_amount_source=loan_amount_source,
                    rejection_reasons=rejection_reasons,
                )
            else:
                # Step 10: Run decision engine (rules + pricing)
                if processed.dscr_ratio is not None:
                    property_type = processed.property_data.get("property_type", "SFR") if processed.property_data else "SFR"

                    # Check if owner mailing address matches property address
                    owner_address_matches = self._check_owner_address_matches(
                        property_address=address,
                        property_data=processed.property_data,
                    )

                    loan_data = LoanData(
                        application_id=app_db_id,
                        dscr=processed.dscr_ratio,
                        ltv=min(ltv, 100.0),
                        cltv=min(ltv, 100.0),
                        credit_score=self.config.default_credit_score,
                        property_type=property_type,
                        property_state=address.state,
                        loan_amount=loan_amount_cents,
                        loan_purpose=loan_purpose,
                        occupancy_type="INVESTMENT",
                        units=processed.property_data.get("units", 1) if processed.property_data else 1,
                        owner_address_matches_property=owner_address_matches,
                    )
                    decision_result = decision_service.evaluate(loan_data)
                    await self._persist_decision(app_db_id, decision_result)

                # Step 11: Create offer if approved
                is_approved = decision_result and decision_result.decision_type in (
                    DecisionType.APPROVED, DecisionType.CONDITIONALLY_APPROVED
                )
                if self.config.create_offers and is_approved:
                    offer = await self._create_offer(
                        parsed_lead, processed,
                        lead_db_id, app_db_id, decision_result,
                        loan_amount_cents=loan_amount_cents,
                        loan_purpose=loan_purpose,
                    )
                    processed.offer_id = offer["id"]
                    processed.offer_token = offer["token"]
                    processed.status = LeadProcessingStatus.OFFER_CREATED
                elif decision_result and not is_approved:
                    processed.status = LeadProcessingStatus.SKIPPED
                    processed.error_message = f"Decision: {decision_result.decision_type.value}"

                # Store analysis data for all processed leads
                await self._persist_analysis(
                    lead_db_id, processed, loan_amount_cents, loan_purpose,
                    address, loan_amount_source=loan_amount_source,
                    decision_result=decision_result,
                )

            # Step 12: Run Encompass validation if GUID is available
            encompass_guid = parsed_lead.raw_data.get("encompass_guid")
            if encompass_guid:
                await self._run_encompass_validation(
                    lead_db_id, processed, encompass_guid, address
                )

            processed.processed_at = datetime.now(timezone.utc)

            # ============ PIPELINE SUMMARY ============
            logger.info(f"{'='*60}")
            logger.info(f"[SUMMARY] Pipeline Complete: {addr_str}")
            logger.info(f"{'='*60}")
            logger.info(f"[SUMMARY] Status: {processed.status.value}")
            logger.info(f"[SUMMARY] Data Sources:")
            logger.info(f"[SUMMARY]   Property: {sources.property_source}")
            logger.info(f"[SUMMARY]   AVM: {sources.avm_source} (${processed.avm_value / 100 if processed.avm_value else 0:,.0f})")
            logger.info(f"[SUMMARY]   Rent: {sources.rent_source} (${processed.rent_estimate or 0:,}/mo)")

            # Verification summary
            avm_verified = any(v.match for v in (sources.avm_verified_by or []) if not v.error)
            rent_verified = any(v.match for v in (sources.rent_verified_by or []) if not v.error)
            logger.info(f"[SUMMARY] Verification:")
            logger.info(f"[SUMMARY]   AVM verified: {'YES' if avm_verified else 'NO'}")
            logger.info(f"[SUMMARY]   Rent verified: {'YES' if rent_verified else 'NO'}")

            # Premium AVM
            if sources.premium_avm:
                logger.info(f"[SUMMARY]   Premium AVM: {sources.premium_avm.source} (${sources.premium_avm.value / 100:,.0f})")
            else:
                logger.info(f"[SUMMARY]   Premium AVM: Not triggered")

            # DSCR/LTV
            logger.info(f"[SUMMARY] Metrics:")
            logger.info(f"[SUMMARY]   DSCR (Simple): {processed.simple_dscr_ratio or 0:.4f}")
            logger.info(f"[SUMMARY]   DSCR (NOI): {processed.dscr_ratio or 0:.4f}")
            logger.info(f"[SUMMARY]   LTV: {ltv:.1f}%")
            logger.info(f"[SUMMARY]   Loan Amount: ${loan_amount_cents / 100:,.0f}")

            # Decision
            if processed.error_message:
                logger.info(f"[SUMMARY] Decision: REJECTED - {processed.error_message}")
            elif processed.dscr_meets_minimum:
                logger.info(f"[SUMMARY] Decision: APPROVED (DSCR >= {self.config.min_dscr})")
            else:
                logger.info(f"[SUMMARY] Decision: PENDING REVIEW")
            logger.info(f"{'='*60}")

        except Exception as e:
            logger.error(f"[PIPELINE] ✗ FAILED: {e}")
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

    def _check_owner_address_matches(
        self,
        property_address: PropertyReachAddress,
        property_data: dict | None,
    ) -> bool:
        """Check if owner mailing address matches property address.

        Returns True if addresses appear to match (potential owner-occupied).
        """
        if not property_data:
            return False

        # Get mailing address from property data
        mailing = property_data.get("mailing_address") or {}
        mailing_street = (mailing.get("street") or "").upper().strip()
        mailing_zip = (mailing.get("zip") or mailing.get("zip_code") or "").strip()[:5]

        if not mailing_street:
            return False

        # Normalize property address
        prop_street = property_address.street.upper().strip()
        prop_zip = property_address.zip.strip()[:5]

        # Simple comparison: check if street and zip match
        # Remove common variations (AVE/AVENUE, ST/STREET, etc.)
        def normalize_street(s: str) -> str:
            s = s.replace(".", "").replace(",", "")
            replacements = [
                ("AVENUE", "AVE"), ("STREET", "ST"), ("DRIVE", "DR"),
                ("ROAD", "RD"), ("LANE", "LN"), ("COURT", "CT"),
                ("PLACE", "PL"), ("BOULEVARD", "BLVD"), ("CIRCLE", "CIR"),
            ]
            for old, new in replacements:
                s = s.replace(old, new)
            return " ".join(s.split())  # Normalize whitespace

        prop_normalized = normalize_street(prop_street)
        mailing_normalized = normalize_street(mailing_street)

        # Match if street and zip are the same
        return prop_normalized == mailing_normalized and prop_zip == mailing_zip

    async def _store_api_response(
        self,
        *,
        provider: str,
        endpoint: str,
        request_params: dict | None = None,
        response_data: dict,
        http_status: int | None = None,
        property_id: str | None = None,
        lead_id: str | None = None,
    ) -> None:
        """Persist raw API response to DB for reference."""
        try:
            from app.db.repositories import api_response_repo
            await api_response_repo.create(
                provider=provider,
                endpoint=endpoint,
                request_params=request_params,
                response_data=response_data,
                http_status=http_status,
                property_id=property_id,
                lead_id=lead_id,
            )
        except RuntimeError:
            pass  # DB not configured

    async def _fetch_property_data(
        self, address: PropertyReachAddress
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Fetch property data from PropertyReach. Returns (parsed_data, raw_response)."""
        try:
            report = await property_reach.get_property_report(address)
            if report:
                raw = report.raw_data or {}

                # Build owner contacts list
                owner_contacts = []
                for c in report.owner.contacts:
                    owner_contacts.append({
                        "name": c.name,
                        "ownerType": c.owner_type,
                        "ownerNumber": c.owner_number,
                        "firstName": c.first_name,
                        "lastName": c.last_name,
                        "phones": c.phones,
                        "emails": c.emails,
                        "deceased": c.deceased,
                    })

                # Build existing loans list
                existing_loans = []
                for m in report.mortgages:
                    existing_loans.append({
                        "position": m.position,
                        "lenderName": m.lender_name,
                        "originalAmount": m.original_amount / 100,  # dollars
                        "estimatedBalance": m.current_balance / 100 if m.current_balance else None,
                        "interestRate": m.interest_rate,
                        "estimatedPayment": m.monthly_payment / 100 if m.monthly_payment else None,
                        "loanType": m.loan_type,
                        "termMonths": m.loan_term_months,
                        "recordingDate": m.recording_date,
                        "dueDate": m.due_date,
                        "isActive": m.is_active,
                        "loanFlags": m.loan_flags,
                        "documentNumber": m.document_number,
                    })

                return {
                    "property_type": report.property.characteristics.property_type,
                    "year_built": report.property.characteristics.year_built,
                    "square_feet": report.property.characteristics.square_feet,
                    "lot_size_sqft": report.property.characteristics.lot_size_sqft,
                    "lot_acres": raw.get("lotAcres"),
                    "bedrooms": report.property.characteristics.bedrooms,
                    "bathrooms": report.property.characteristics.bathrooms,
                    "stories": report.property.characteristics.stories,
                    "units": report.property.characteristics.units,
                    "pool": report.property.characteristics.pool,
                    "garage_spaces": report.property.characteristics.garage_spaces,
                    "assessed_value": report.property.assessment.assessed_value,
                    "annual_taxes": report.property.assessment.annual_taxes,
                    "estimated_value": report.property.market_value.estimated_value,
                    "estimated_equity": report.equity.estimated_equity,
                    "monthly_rent_estimate": report.estimated_rent * 100 if report.estimated_rent else int(report.property.market_value.estimated_value * 0.008),
                    "is_str": report.str_analysis.is_short_term_rental if report.str_analysis else False,
                    "str_monthly_revenue": report.str_analysis.estimated_monthly_revenue if report.str_analysis else None,
                    # Owner info
                    "owner_names": report.owner.names,
                    "owner_occupied": report.owner.owner_occupied,
                    "ownership_months": report.owner.ownership_months,
                    "ownership_type": report.owner.ownership_type,
                    "mailing_address": report.owner.mailing_address,
                    "owner_contacts": owner_contacts,
                    # Loan info
                    "mortgage_count": len(report.mortgages),
                    "existing_loans": existing_loans,
                    "total_loan_balance": report.equity.total_mortgage_balance,
                    "equity": report.equity.estimated_equity,
                    "ltv": report.equity.ltv_ratio,
                    "source": "PropertyReach",
                }, raw
        except Exception as e:
            print(f"PropertyReach fetch failed: {e}")
        return None, None

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

    async def _calculate_dscr_with_amount(
        self,
        loan_amount_cents: int,
        property_data: dict[str, Any] | None,
        *,
        override_rent_cents: int | None = None,
        override_value_cents: int | None = None,
    ) -> dict[str, Any] | None:
        """Calculate DSCR with a specific loan amount."""
        try:
            # Get rent estimate
            monthly_rent = override_rent_cents or 0
            if not monthly_rent and property_data:
                if property_data.get("is_str") and property_data.get("str_monthly_revenue"):
                    monthly_rent = property_data["str_monthly_revenue"]
                else:
                    monthly_rent = property_data.get("monthly_rent_estimate", 0)

            if not monthly_rent:
                monthly_rent = 350000  # Default $3,500

            # Get taxes and insurance
            annual_taxes = property_data.get("annual_taxes", 720000) if property_data else 720000
            est_value = override_value_cents or (property_data.get("estimated_value", 60000000) if property_data else 60000000)
            annual_insurance = int(est_value * 0.0035)  # 0.35% of value

            input_data = DSCRCalculationInput(
                application_id="ingest",
                property_id="ingest",
                gross_monthly_rent=Money(monthly_rent),
                vacancy_rate=self.config.default_vacancy_rate,
                annual_property_tax=Money(annual_taxes),
                annual_insurance=Money(annual_insurance),
                loan_amount=Money(loan_amount_cents),
                interest_rate=self.config.default_interest_rate / 100,
                term_months=self.config.default_loan_term_months,
            )

            result = dscr_calculator.calculate(input_data)

            return {
                "dscr": round(result.dscr_ratio, 4),
                "meets_minimum": result.dscr_ratio >= self.config.min_dscr,
                "monthly_rent": monthly_rent,
                "monthly_pitia": result.debt_service.total_pitia.amount,
                "monthly_noi": result.noi.monthly.amount,
            }

        except Exception as e:
            print(f"DSCR calculation failed: {e}")
            return None

    async def _fetch_avm(self, address: PropertyReachAddress, loan_amount_cents: int = 40000000) -> dict[str, Any] | None:
        """Fetch AVM data from DataTree (primary).

        Note: DataTree requires specific products to be enabled on the account.
        If DataTree fails, falls back to RentCast in the caller.

        Pylon has been removed - their sandbox API returns null for AVM values.
        """
        # Try DataTree AVM
        # Note: Requires "Property AVM" product enabled on DataTree account
        try:
            dt_address = DataTreeAddress(
                street=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
            )
            result = await datatree_avm.order_avm(dt_address)

            if result.get("success") and result.get("report"):
                report = result["report"]
                if report.estimated_value:
                    print(f"DataTree AVM: ${report.estimated_value / 100:,.0f}")
                    return {
                        "value": report.estimated_value,
                        "confidence": report.confidence_level.value if report.confidence_level else None,
                        "value_low": report.value_low,
                        "value_high": report.value_high,
                        "source": "DataTree",
                    }
                else:
                    print("DataTree AVM: No value in response")
            else:
                error_msg = result.get("error", {}).get("message", "Unknown error")
                # Don't spam logs with "unauthorized product" since that's expected until account is configured
                if "unauthorized" not in error_msg.lower():
                    print(f"DataTree AVM failed: {error_msg}")
        except Exception as e:
            print(f"DataTree AVM error: {e}")

        return None

    async def _fetch_rentcast_value(
        self, address: PropertyReachAddress, property_data: dict[str, Any] | None,
        *, property_db_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Fallback AVM via RentCast value estimate."""
        try:
            result = await rentcast_service.get_value_estimate(
                address=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
                property_type=property_data.get("property_type") if property_data else None,
                bedrooms=property_data.get("bedrooms") if property_data else None,
                bathrooms=property_data.get("bathrooms") if property_data else None,
                square_feet=property_data.get("square_feet") if property_data else None,
            )
            if result and result.get("estimated_value"):
                # Store raw response
                raw = result.pop("_raw", result)
                await self._store_api_response(
                    provider="RENTCAST",
                    endpoint="/avm/value",
                    request_params={"address": f"{address.street}, {address.city}, {address.state}, {address.zip}"},
                    response_data=raw,
                    http_status=200,
                    property_id=property_db_id,
                )
                value_cents = int(result["estimated_value"] * 100)
                return {
                    "value": value_cents,
                    "confidence": "MEDIUM",
                    "value_low": int(result["value_low"] * 100) if result.get("value_low") else None,
                    "value_high": int(result["value_high"] * 100) if result.get("value_high") else None,
                    "source": "RentCast",
                }
        except Exception as e:
            print(f"RentCast value estimate failed: {e}")
        return None

    async def _fetch_avm_with_fallback(
        self,
        address: PropertyReachAddress,
        property_data: dict[str, Any] | None,
    ) -> AVMResult | None:
        """
        AVM fallback chain: RentCast -> DataTree -> PropertyReach assessed value.

        Returns standardized AVMResult with source attribution.
        """
        logger.debug(f"[AVM] Starting fallback chain for {address.street}")

        # Try RentCast first (now returns AVMResult directly)
        logger.debug(f"[AVM] Trying RentCast...")
        result = await rentcast_service.get_value_estimate(
            address=address.street,
            city=address.city,
            state=address.state,
            zip_code=address.zip,
            property_type=property_data.get("property_type") if property_data else None,
            bedrooms=property_data.get("bedrooms") if property_data else None,
            bathrooms=property_data.get("bathrooms") if property_data else None,
            square_feet=property_data.get("square_feet") if property_data else None,
        )
        if result:
            logger.info(f"[AVM] ✓ RentCast: ${result.value / 100:,.0f} (confidence: {result.confidence})")
            return result
        logger.debug(f"[AVM] ✗ RentCast returned no result")

        # Fallback to DataTree
        logger.debug(f"[AVM] Trying DataTree (fallback 1)...")
        dt_result = await self._fetch_avm(address, loan_amount_cents=25000000)
        if dt_result and dt_result.get("value"):
            logger.info(f"[AVM] ✓ DataTree (fallback): ${dt_result['value'] / 100:,.0f}")
            return AVMResult(
                value=dt_result["value"],
                value_low=dt_result.get("value_low"),
                value_high=dt_result.get("value_high"),
                confidence=dt_result.get("confidence"),
                source="DataTree",
            )
        logger.debug(f"[AVM] ✗ DataTree returned no result")

        # Final fallback: PropertyReach assessed value
        logger.debug(f"[AVM] Trying PropertyReach assessed value (fallback 2)...")
        if property_data and property_data.get("assessed_value"):
            assessed = property_data["assessed_value"]
            logger.info(f"[AVM] ✓ PropertyReach assessed (fallback): ${assessed / 100:,.0f}")
            return AVMResult(
                value=assessed,
                confidence="LOW",
                source="PropertyReach (assessed)",
            )

        return None

    async def _fetch_rent_with_fallback(
        self,
        address: PropertyReachAddress,
        property_data: dict[str, Any] | None,
        property_db_id: str | None = None,
    ) -> RentEstimateResult | None:
        """
        Rent fallback chain: RentCast -> PropertyReach estimate -> Zillow scrape.

        Returns standardized RentEstimateResult with source attribution.
        """
        logger.debug(f"[RENT] Starting fallback chain for {address.street}")

        # Try RentCast first
        logger.debug(f"[RENT] Trying RentCast...")
        result = await rentcast_service.get_rent_estimate(
            address=address.street,
            city=address.city,
            state=address.state,
            zip_code=address.zip,
            property_type=property_data.get("property_type") if property_data else None,
            bedrooms=property_data.get("bedrooms") if property_data else None,
            bathrooms=property_data.get("bathrooms") if property_data else None,
            square_feet=property_data.get("square_feet") if property_data else None,
            comp_count=5,
        )
        if result:
            comps = [
                {
                    "address": c.address,
                    "city": c.city,
                    "state": c.state,
                    "zip": c.zip_code,
                    "rent": c.price,
                    "bedrooms": c.bedrooms,
                    "bathrooms": c.bathrooms,
                    "squareFeet": c.square_feet,
                    "distance": round(c.distance, 2) if c.distance else None,
                }
                for c in result.comps[:5]
            ]
            logger.info(f"[RENT] ✓ RentCast: ${result.rent_estimate:,}/mo (range: ${result.rent_low or 0:,}-${result.rent_high or 0:,}, comps: {result.comp_count})")
            return RentEstimateResult(
                estimate=result.rent_estimate,
                low=result.rent_low,
                high=result.rent_high,
                comp_count=result.comp_count,
                comps=comps,
                source="RentCast",
                raw_data=result.raw_data,
            )
        logger.debug(f"[RENT] ✗ RentCast returned no result")

        # Fallback to PropertyReach estimate
        logger.debug(f"[RENT] Trying PropertyReach (fallback 1)...")
        if property_data and property_data.get("monthly_rent_estimate"):
            rent = int(property_data["monthly_rent_estimate"] / 100)
            logger.info(f"[RENT] ✓ PropertyReach (fallback): ${rent:,}/mo")
            return RentEstimateResult(
                estimate=rent,
                source="PropertyReach",
            )
        logger.debug(f"[RENT] ✗ PropertyReach has no rent estimate")

        # Final fallback: Zillow scrape
        logger.debug(f"[RENT] Trying Zillow scrape (fallback 2)...")
        try:
            v = await zillow_scraper.verify_rent(
                address.street, address.city, address.state, address.zip, 0
            )
            if v.found_value:
                logger.info(f"[RENT] ✓ Zillow scrape (fallback): ${v.found_value:,}/mo")
                return RentEstimateResult(
                    estimate=v.found_value,
                    source="Zillow",
                )
            logger.debug(f"[RENT] ✗ Zillow scrape found no value")
        except Exception as e:
            logger.warning(f"[RENT] ✗ Zillow rent fallback failed: {e}")

        logger.warning(f"[RENT] All fallbacks exhausted - no rent estimate available")
        return None

    async def _run_parallel_verification(
        self,
        address: PropertyReachAddress,
        avm_value: int,  # cents
        rent_estimate: int,  # dollars
    ) -> tuple[list[VerificationResult], list[VerificationResult]]:
        """
        Run Zillow/Redfin verification in parallel.

        Returns (avm_verifications, rent_verifications).
        """
        import asyncio

        logger.debug(f"[VERIFY] Starting parallel verification (Zillow + Redfin)")
        logger.debug(f"[VERIFY] Expected AVM: ${avm_value / 100:,.0f} | Expected Rent: ${rent_estimate:,}/mo")

        # Build verification tasks
        tasks = [
            zillow_scraper.verify_value(
                address.street, address.city, address.state, address.zip, avm_value
            ),
            zillow_scraper.verify_rent(
                address.street, address.city, address.state, address.zip, rent_estimate
            ),
            redfin_scraper.verify_value(
                address.street, address.city, address.state, address.zip, avm_value
            ),
            redfin_scraper.verify_rent(
                address.street, address.city, address.state, address.zip, rent_estimate
            ),
        ]

        task_names = ["Zillow AVM", "Zillow Rent", "Redfin AVM", "Redfin Rent"]

        # Run all verification tasks in parallel
        logger.debug(f"[VERIFY] Running 4 verification tasks in parallel...")
        results = await asyncio.gather(*tasks, return_exceptions=True)

        avm_verifications: list[VerificationResult] = []
        rent_verifications: list[VerificationResult] = []

        # Parse results: tasks 0 and 2 are AVM, tasks 1 and 3 are rent
        for i, result in enumerate(results):
            task_name = task_names[i]
            if isinstance(result, VerificationResult):
                if i in (0, 2):  # AVM verification (Zillow AVM, Redfin AVM)
                    avm_verifications.append(result)
                    if result.error:
                        logger.debug(f"[VERIFY] {task_name}: ERROR - {result.error}")
                    elif result.found_value:
                        match_icon = "✓" if result.match else "✗"
                        logger.debug(
                            f"[VERIFY] {task_name}: {match_icon} ${result.found_value / 100:,.0f} "
                            f"(diff: {result.diff_pct:+.1f}%, match: {result.match})"
                        )
                    else:
                        logger.debug(f"[VERIFY] {task_name}: No value found")
                else:  # Rent verification (Zillow rent, Redfin rent)
                    rent_verifications.append(result)
                    if result.error:
                        logger.debug(f"[VERIFY] {task_name}: ERROR - {result.error}")
                    elif result.found_value:
                        match_icon = "✓" if result.match else "✗"
                        logger.debug(
                            f"[VERIFY] {task_name}: {match_icon} ${result.found_value:,}/mo "
                            f"(diff: {result.diff_pct:+.1f}%, match: {result.match})"
                        )
                    else:
                        logger.debug(f"[VERIFY] {task_name}: No value found")
            elif isinstance(result, Exception):
                logger.warning(f"[VERIFY] {task_name}: EXCEPTION - {result}")

        # Summary
        avm_matches = sum(1 for v in avm_verifications if v.match and not v.error)
        rent_matches = sum(1 for v in rent_verifications if v.match and not v.error)
        logger.debug(f"[VERIFY] Summary: AVM verified by {avm_matches}/2 sources, Rent verified by {rent_matches}/2 sources")

        return avm_verifications, rent_verifications

    async def _fetch_premium_data_if_needed(
        self,
        address: PropertyReachAddress,
        dscr: float,
        ltv: float,
        primary_avm: AVMResult,
        avm_verifications: list[VerificationResult],
        rent_verifications: list[VerificationResult],
    ) -> PropertyAnalyticsResult | None:
        """
        Fetch premium AVM + rental data from Clear Capital when deal is promising.

        Triggers premium verification when ALL conditions are met:
        1. DSCR > config.premium_dscr_threshold (default 0.75)
        2. LTV < config.premium_ltv_threshold (default 80%)

        This saves cost by only calling Clear Capital for deals that:
        - Look promising based on RentCast data (DSCR > 0.75)
        - Are within approvable LTV range (< 80%)

        Returns PropertyAnalyticsResult with AVM + rental data, or None if not needed.
        """
        # Check DSCR threshold
        if dscr <= self.config.premium_dscr_threshold:
            logger.debug(f"DSCR {dscr:.2f} <= {self.config.premium_dscr_threshold}, skipping Clear Capital")
            return None

        # Check LTV threshold - skip if LTV is too high (loan would be rejected anyway)
        if ltv >= self.config.premium_ltv_threshold:
            logger.debug(f"LTV {ltv:.1f}% >= {self.config.premium_ltv_threshold}%, skipping Clear Capital (too high)")
            return None

        # Check scrape verification requirement
        if self.config.require_scrape_verification:
            avm_verified = any(v.match for v in avm_verifications if not v.error)
            rent_verified = any(v.match for v in rent_verifications if not v.error)

            if not avm_verified:
                logger.debug("AVM not verified by Zillow/Redfin, skipping Clear Capital")
                return None
            if not rent_verified:
                logger.debug("Rent not verified by Zillow/Redfin, skipping Clear Capital")
                return None

            logger.info(
                f"Deal pre-verified (DSCR={dscr:.2f}, LTV={ltv:.1f}%, "
                f"AVM verified, rent verified) - calling Clear Capital"
            )

        if not clear_capital_service.is_configured():
            logger.debug("Clear Capital not configured, skipping")
            return None

        # Call Clear Capital Property Analytics API for AVM + Rental data
        premium_result = await clear_capital_service.get_property_analytics(
            address.street, address.city, address.state, address.zip,
            include_avm=True,
            include_rental_avm=True,
            include_rental_comps=True,
        )

        if not premium_result:
            logger.warning("Clear Capital request failed")
            return None

        # Log AVM result
        if premium_result.avm:
            divergence = abs(premium_result.avm.value - primary_avm.value) / primary_avm.value
            if divergence > 0.10:
                logger.info(
                    f"Clear Capital AVM diverges {divergence * 100:.1f}% from primary "
                    f"(${premium_result.avm.value / 100:,.0f} vs ${primary_avm.value / 100:,.0f})"
                )

        # Log rental result
        if premium_result.rent_estimate:
            logger.info(
                f"[CLEAR_CAPITAL] ✓ Rent estimate: ${premium_result.rent_estimate.estimate:,}/mo "
                f"({len(premium_result.rental_comps)} comps)"
            )

        return premium_result

    async def _fetch_property_from_datatree(
        self, address: PropertyReachAddress,
    ) -> dict[str, Any] | None:
        """Fetch property data AND liens from DataTree in a SINGLE API call.

        Uses get_full_property_data() to fetch PropertyDetailReport + OpenLienReport together.
        """
        try:
            dt_address = DataTreeAddress(
                street=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
            )
            # Use combined method to get property + liens in one call
            report = await datatree_property.get_full_property_data(dt_address)

            if report:
                lien_info = ""
                if report.existing_loans:
                    lien_info = f", {report.mortgage_count} liens (${report.total_loan_balance / 100 if report.total_loan_balance else 0:,.0f})"
                print(f"DataTree property: {report.square_feet} sqft, {report.bedrooms} bed, {report.bathrooms} bath, taxes ${report.annual_taxes / 100 if report.annual_taxes else 0:,.0f}/yr{lien_info}")
                return {
                    "property_type": report.property_type or "SFR",
                    "year_built": report.year_built,
                    "square_feet": report.square_feet,
                    "bedrooms": report.bedrooms,
                    "bathrooms": report.bathrooms,
                    "units": report.units or 1,
                    "assessed_value": report.assessed_value,
                    "annual_taxes": report.annual_taxes,
                    "estimated_value": report.estimated_value,
                    "owner_names": report.owner_names or [],
                    "mailing_address": report.mailing_address,
                    "existing_loans": report.existing_loans or [],
                    "total_loan_balance": report.total_loan_balance,
                    "mortgage_count": report.mortgage_count,
                    "source": "DataTree",
                }
        except Exception as e:
            print(f"DataTree property fetch failed: {e}")
        return None

    async def _fetch_liens_from_datatree(
        self, address: PropertyReachAddress, property_db_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch open liens from DataTree when PropertyReach doesn't provide them."""
        try:
            dt_address = DataTreeAddress(
                street=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
            )
            result = await datatree_property.get_open_liens(dt_address)

            if result and result.get("liens"):
                liens = result["liens"]
                print(f"DataTree liens: Found {len(liens)} liens, total ${result.get('combined_balance_cents', 0) / 100:,.0f}")

                # Store raw response
                if result.get("raw_data") and property_db_id:
                    await self._store_api_response(
                        provider="DATATREE",
                        endpoint="/api/Report/GetReport:OpenLienReport",
                        request_params={
                            "streetAddress": address.street,
                            "city": address.city,
                            "state": address.state,
                            "zipCode": address.zip,
                        },
                        response_data=result["raw_data"],
                        http_status=200,
                        property_id=property_db_id,
                    )

                # Convert to standard format matching PropertyReach existing_loans
                existing_loans = []
                for lien in liens:
                    existing_loans.append({
                        "position": lien.get("position"),
                        "lenderName": lien.get("lender"),
                        "originalAmount": lien.get("original_amount"),
                        "estimatedBalance": lien.get("original_amount"),  # DataTree doesn't have current balance
                        "interestRate": lien.get("interest_rate"),
                        "loanType": lien.get("loan_type"),
                        "termMonths": lien.get("term"),
                        "recordingDate": lien.get("recording_date"),
                        "isActive": True,
                        "loanFlags": [],
                        "documentNumber": lien.get("doc_id"),
                        "source": "DataTree",
                    })
                return existing_loans
            else:
                print("DataTree liens: No liens found or API returned empty")
        except Exception as e:
            print(f"DataTree liens fetch failed: {e}")
        return []

    def _calculate_piti_breakdown(
        self,
        processed: ProcessedLead,
        loan_amount_cents: int = 0,
        interest_rate: float | None = None,
        loan_amount_source: str = "Unknown",
    ) -> dict[str, Any]:
        """Calculate PITI breakdown using forward loan calculation.

        P&I calculated from loan terms (amount, rate, 30yr term).
        Taxes from DataTree, Insurance estimated at 0.35% of property value.
        """
        if not processed.property_data:
            return {
                "principalInterest": None,
                "taxes": None,
                "insurance": None,
                "total": None,
            }

        # Use provided rate or default
        rate = interest_rate if interest_rate is not None else self.config.default_interest_rate
        loan_amount = loan_amount_cents / 100  # Convert to dollars
        loan_term_years = 30

        # Get property value for insurance estimate
        property_value_cents = (
            processed.avm_value or
            processed.property_data.get("estimated_value") or
            processed.property_data.get("assessed_value") or
            0
        )
        property_value = property_value_cents / 100

        # Calculate P&I from loan terms (forward calculation)
        if loan_amount and rate:
            monthly_rate = rate / 100 / 12
            num_payments = loan_term_years * 12
            if monthly_rate > 0:
                monthly_pi = loan_amount * (monthly_rate * (1 + monthly_rate) ** num_payments) / ((1 + monthly_rate) ** num_payments - 1)
            else:
                monthly_pi = loan_amount / num_payments
        else:
            monthly_pi = 0

        # Monthly taxes from DataTree
        annual_taxes_cents = processed.property_data.get("annual_taxes") or 0
        annual_taxes = annual_taxes_cents / 100
        monthly_taxes = annual_taxes / 12

        # Annual insurance: 0.35% of property value
        annual_insurance = property_value * 0.0035
        monthly_insurance = annual_insurance / 12

        # Total PITIA
        monthly_pitia = monthly_pi + monthly_taxes + monthly_insurance

        if not loan_amount:
            return {
                "principalInterest": None,
                "taxes": None,
                "insurance": None,
                "total": None,
            }

        return {
            "principalInterest": round(monthly_pi, 2),
            "principalInterestCalc": f"${loan_amount:,.0f} @ {rate}% (fixed) for {loan_term_years}yr",
            "taxes": round(monthly_taxes, 2),
            "taxesCalc": f"${annual_taxes:,.0f}/yr ÷ 12",
            "insurance": round(monthly_insurance, 2),
            "insuranceCalc": f"0.35% × ${property_value:,.0f} ÷ 12",
            "total": round(monthly_pitia, 2),
            "loanAmount": loan_amount,
            "interestRate": rate,
            "loanSource": loan_amount_source,
        }

    async def _fetch_rental_comps(
        self, address: PropertyReachAddress, property_data: dict[str, Any] | None,
        *, property_db_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Fetch rental comps from RentCast."""
        try:
            result = await rentcast_service.get_rent_estimate(
                address=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
                property_type=property_data.get("property_type") if property_data else None,
                bedrooms=property_data.get("bedrooms") if property_data else None,
                bathrooms=property_data.get("bathrooms") if property_data else None,
                square_feet=property_data.get("square_feet") if property_data else None,
                comp_count=5,
            )
            if result:
                # Store raw response
                if result.raw_data:
                    await self._store_api_response(
                        provider="RENTCAST",
                        endpoint="/avm/rent/long-term",
                        request_params={"address": f"{address.street}, {address.city}, {address.state}, {address.zip}"},
                        response_data=result.raw_data,
                        http_status=200,
                        property_id=property_db_id,
                    )
                comps = [
                    {
                        "address": c.address,
                        "city": c.city,
                        "state": c.state,
                        "zip": c.zip_code,
                        "rent": c.price,
                        "bedrooms": c.bedrooms,
                        "bathrooms": c.bathrooms,
                        "squareFeet": c.square_feet,
                        "distance": round(c.distance, 2) if c.distance else None,
                        "correlation": round(c.correlation, 4) if c.correlation else None,
                    }
                    for c in result.comps[:3]  # Top 3 comps
                ]
                return {
                    "rent_estimate": result.rent_estimate,
                    "rent_low": result.rent_low,
                    "rent_high": result.rent_high,
                    "comps": comps,
                }
        except Exception as e:
            print(f"RentCast fetch failed: {e}")
        return None

    async def _persist_property(
        self, address: PropertyReachAddress, property_data: dict[str, Any]
    ) -> str:
        """Persist property to DB. Returns property DB id."""
        try:
            from app.db.repositories import property_repo
            prop_type = property_data.get("property_type", "SFR")
            # Normalize property type to match SQL enum
            valid_types = {"SFR", "CONDO", "TOWNHOUSE", "2_4_UNIT", "MULTIFAMILY", "MIXED_USE"}
            if prop_type not in valid_types:
                prop_type = "SFR"

            # Build owner_info JSONB — include mailing address on each contact
            owner_contacts = property_data.get("owner_contacts", [])
            mailing = property_data.get("mailing_address", {})
            owner_info = []
            for oc in owner_contacts:
                entry = dict(oc)
                entry["mailingAddress"] = mailing
                entry["ownerOccupied"] = property_data.get("owner_occupied", False)
                entry["ownershipMonths"] = property_data.get("ownership_months", 0)
                owner_info.append(entry)

            row = await property_repo.create(
                address=address.street,
                city=address.city,
                state=address.state,
                zip_code=address.zip,
                property_type=prop_type,
                year_built=property_data.get("year_built"),
                square_feet=property_data.get("square_feet"),
                lot_size_sqft=property_data.get("lot_size_sqft"),
                bedrooms=property_data.get("bedrooms"),
                bathrooms=property_data.get("bathrooms"),
                stories=property_data.get("stories"),
                units=property_data.get("units", 1),
                pool=property_data.get("pool", False),
                garage_spaces=property_data.get("garage_spaces"),
                market_monthly_rent=property_data.get("monthly_rent_estimate", 0) / 100 if property_data.get("monthly_rent_estimate") else None,
                is_short_term_rental=property_data.get("is_str", False),
                estimated_value=property_data.get("estimated_value", 0) / 100 if property_data.get("estimated_value") else None,
                assessed_value=property_data.get("assessed_value", 0) / 100 if property_data.get("assessed_value") else None,
                annual_taxes=property_data.get("annual_taxes", 0) / 100 if property_data.get("annual_taxes") else None,
                estimated_equity=property_data.get("estimated_equity", 0) / 100 if property_data.get("estimated_equity") else None,
                lot_acres=property_data.get("lot_acres"),
                owner_info=owner_info if owner_info else None,
                existing_loans=property_data.get("existing_loans") if property_data.get("existing_loans") else None,
            )
            return str(row["id"])
        except RuntimeError:
            return str(uuid4())

    async def _persist_lead_records(
        self,
        lead: ParsedLead,
        address: PropertyReachAddress,
        property_db_id: str,
        *,
        loan_amount_cents: int,
        estimated_value: int | float,
        ltv: float,
        loan_purpose: str = "PURCHASE",
    ) -> tuple[str, str, str]:
        """Persist lead, borrower, and application. Returns (lead_id, borrower_id, app_id)."""
        try:
            from app.db.repositories import lead_repo, borrower_repo, application_repo

            lead_row = await lead_repo.create(
                first_name=lead.first_name,
                last_name=lead.last_name,
                email=lead.email,
                phone=lead.phone,
                property_address=address.street,
                property_city=address.city,
                property_state=address.state,
                property_zip=address.zip,
                requested_amount=loan_amount_cents / 100,
            )
            lead_id = str(lead_row["id"])

            borrower_row = await borrower_repo.create(
                first_name=lead.first_name,
                last_name=lead.last_name,
                email=lead.email,
                phone=lead.phone,
            )
            borrower_id = str(borrower_row["id"])

            # Map loan purpose to DB enum
            db_loan_purpose = {
                "PURCHASE": "PURCHASE",
                "RATE_TERM_REFI": "RATE_TERM_REFI",
                "CASH_OUT_REFI": "CASH_OUT_REFI",
            }.get(loan_purpose, "PURCHASE")

            app_row = await application_repo.create(
                borrower_id=borrower_id,
                property_id=property_db_id,
                lead_id=lead_id,
                loan_purpose=db_loan_purpose,
                loan_amount=loan_amount_cents / 100,
                estimated_value=estimated_value / 100 if estimated_value else None,
                ltv_ratio=round(ltv / 100, 4) if ltv else None,
            )
            app_id = str(app_row["id"])

            return lead_id, borrower_id, app_id
        except RuntimeError:
            return str(uuid4()), str(uuid4()), str(uuid4())

    async def _persist_avm(
        self,
        property_db_id: str,
        app_db_id: str,
        avm_value: int,
        avm_confidence: str | None,
    ) -> None:
        """Persist AVM report to DB."""
        try:
            from app.db.repositories import avm_repo
            await avm_repo.create(
                property_id=property_db_id,
                application_id=app_db_id,
                value_estimated=avm_value / 100 if avm_value else None,
                confidence_level=avm_confidence,
                status="RECEIVED",
            )
        except RuntimeError:
            pass

    async def _persist_rejection(
        self, app_db_id: str, reasons: list[str]
    ) -> None:
        """Persist rejection decision to DB."""
        try:
            from app.db.repositories import decision_repo
            await decision_repo.create(
                application_id=app_db_id,
                decision_type="PRE_APPROVAL",
                decision_result="DECLINED",
                summary=f"REJECTED: {'; '.join(reasons)}",
                denial_reasons={"reasons": reasons},
            )
        except RuntimeError:
            pass

    async def _persist_analysis(
        self,
        lead_db_id: str,
        processed: ProcessedLead,
        loan_amount_cents: int,
        loan_purpose: str,
        address: PropertyReachAddress,
        *,
        loan_amount_source: str = "Unknown",
        decision_result: Any = None,
        rejection_reasons: list[str] | None = None,
    ) -> None:
        """Persist full analysis data to lead record for dashboard display."""
        try:
            import json
            from app.db.repositories import lead_repo

            analysis = {
                "property": {
                    "address": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip": address.zip,
                    "type": processed.property_data.get("property_type") if processed.property_data else None,
                    "yearBuilt": processed.property_data.get("year_built") if processed.property_data else None,
                    "squareFeet": processed.property_data.get("square_feet") if processed.property_data else None,
                    "bedrooms": processed.property_data.get("bedrooms") if processed.property_data else None,
                    "bathrooms": processed.property_data.get("bathrooms") if processed.property_data else None,
                    "units": processed.property_data.get("units") if processed.property_data else None,
                    "pool": processed.property_data.get("pool") if processed.property_data else None,
                    "garageSpaces": processed.property_data.get("garage_spaces") if processed.property_data else None,
                    "estimatedValue": (processed.property_data.get("estimated_value") or 0) / 100 if processed.property_data else None,
                    "assessedValue": (processed.property_data.get("assessed_value") or 0) / 100 if processed.property_data else None,
                    "annualTaxes": (processed.property_data.get("annual_taxes") or 0) / 100 if processed.property_data else None,
                },
                "ownerInfo": processed.property_data.get("owner_contacts", []) if processed.property_data else [],
                "existingLoans": processed.property_data.get("existing_loans", []) if processed.property_data else [],
                "dscr": {
                    "ratio": processed.dscr_ratio,  # NOI method (conservative)
                    "simpleDscr": processed.simple_dscr_ratio,  # Simple Rent/PITIA (like Encompass)
                    "meetsMinimum": processed.dscr_meets_minimum,
                    "monthlyRent": (processed.monthly_rent or 0) / 100,
                    "monthlyPITIA": (processed.monthly_pitia or 0) / 100,
                    "pitiBreakdown": self._calculate_piti_breakdown(processed, loan_amount_cents, loan_amount_source=loan_amount_source),
                },
                "avm": {
                    "value": (processed.avm_value or 0) / 100,
                    "confidence": processed.avm_confidence,
                    "source": processed.avm_source,  # "DataTree", "RentCast", "ClearCapital", etc.
                    "verifiedBy": [v.source for v in (processed.data_sources.avm_verified_by if processed.data_sources else []) if v.match],
                    "verification": processed.data_sources.get_avm_verification_dict() if processed.data_sources else {},
                    "premiumAvm": {
                        "source": processed.data_sources.premium_avm.source,
                        "value": processed.data_sources.premium_avm.value / 100,
                        "confidence": processed.data_sources.premium_avm.confidence,
                    } if processed.data_sources and processed.data_sources.premium_avm else None,
                },
                "rent": {
                    "estimate": processed.rent_estimate,
                    "source": processed.data_sources.rent_source if processed.data_sources else None,
                    "verifiedBy": [v.source for v in (processed.data_sources.rent_verified_by if processed.data_sources else []) if v.match],
                    "verification": processed.data_sources.get_rent_verification_dict() if processed.data_sources else {},
                },
                "rentEstimate": processed.rent_estimate,
                "rentalComps": processed.rental_comps,
                "loanAmount": loan_amount_cents / 100,
                "loanPurpose": loan_purpose,
                "dataSources": processed.data_sources.to_dict() if processed.data_sources else {},
                "decision": {
                    "result": decision_result.decision_type.value if decision_result else ("DECLINED" if rejection_reasons else None),
                    "reason": decision_result.decision_reason.value if decision_result else ("REJECTED" if rejection_reasons else None),
                    "rejectionReasons": rejection_reasons,
                    "finalRate": decision_result.final_rate if decision_result else None,
                    "conditions": len(decision_result.conditions) if decision_result else 0,
                },
                "offerToken": processed.offer_token,
            }

            await lead_repo.update_analysis(lead_db_id, analysis)
        except RuntimeError:
            pass

    async def _run_encompass_validation(
        self,
        lead_db_id: str,
        processed: ProcessedLead,
        encompass_guid: str,
        address: PropertyReachAddress,
    ) -> None:
        """Run Encompass validation comparison and store results.

        Pulls loan data from Encompass API and compares with pipeline results.
        """
        try:
            import json
            from app.db.repositories import lead_repo

            # Pull Encompass data
            loan = await encompass_client.get_loan(encompass_guid)
            fields = await encompass_client.read_fields(encompass_guid, [
                "364", "1109", "1014", "353", "CX.DSCR", "Log.MS.CurrentMilestone",
                "912", "1405", "230", "736", "1005", "1821", "136",
                "1869", "37", "16", "18", "URLA.X198", "1974", "URLA.X202",
            ])

            def parse_num(val, default=0.0):
                if val is None:
                    return default
                try:
                    return float(str(val).replace(",", ""))
                except:
                    return default

            borrower = loan.get("applications", [{}])[0].get("borrower", {})
            pi = parse_num(fields.get("912"))
            taxes = parse_num(fields.get("1405"))
            insurance = parse_num(fields.get("230"))
            total_pitia = pi + taxes + insurance
            enc_dscr = parse_num(fields.get("CX.DSCR"))
            implied_rent = enc_dscr * total_pitia if enc_dscr > 0 else 0

            # Pipeline values
            rent_estimate = processed.rent_estimate or (processed.monthly_rent / 100 if processed.monthly_rent else 0)
            pipeline_dscr = rent_estimate / total_pitia if total_pitia > 0 else 0
            pipeline_avm = (processed.avm_value / 100) if processed.avm_value else 0

            # Comparisons
            dscr_diff = pipeline_dscr - enc_dscr
            dscr_match = abs(dscr_diff) < 0.1
            rent_diff = rent_estimate - implied_rent
            rent_match = abs(rent_diff / implied_rent * 100) < 10 if implied_rent else True

            enc_avm = parse_num(fields.get("1821")) or parse_num(fields.get("136"))
            avm_diff_pct = ((pipeline_avm - enc_avm) / enc_avm * 100) if enc_avm else 0
            avm_match = abs(avm_diff_pct) < 15

            # Build validation data
            validation_data = {
                "encompassValidation": {
                    "loanId": fields.get("364") or loan.get("loanIdNumber", ""),
                    "loanGuid": encompass_guid,
                    "milestone": fields.get("Log.MS.CurrentMilestone") or "",
                    "loanAmount": parse_num(fields.get("1109")),
                    "interestRate": parse_num(fields.get("1014")),
                    "ltv": parse_num(fields.get("353")),
                    "monthlyPI": pi,
                    "monthlyTaxes": taxes,
                    "monthlyInsurance": insurance,
                    "totalPITIA": total_pitia,
                    "encompassDSCR": enc_dscr,
                    "pipelineDSCR": round(pipeline_dscr, 4),
                    "dscrDiff": round(dscr_diff, 4),
                    "dscrMatch": dscr_match,
                    "rentComparison": {
                        "encompassImpliedRent": round(implied_rent, 0),
                        "pipelineRent": rent_estimate,
                        "diff": round(rent_diff, 0),
                        "match": rent_match,
                    },
                    "avmComparison": {
                        "encompassValue": enc_avm,
                        "pipelineValue": pipeline_avm,
                        "diffPct": round(avm_diff_pct, 1),
                        "match": avm_match,
                    },
                    "summary": {
                        "dscrMatch": dscr_match,
                        "rentMatch": rent_match,
                        "avmMatch": avm_match,
                        "allMatch": dscr_match and rent_match and avm_match,
                    },
                },
            }

            # Merge with existing analysis
            await lead_repo.merge_analysis(lead_db_id, validation_data)
            logger.info(f"Encompass validation stored for lead {lead_db_id}")

        except Exception as e:
            logger.warning(f"Encompass validation failed for {encompass_guid}: {e}")

    async def _persist_decision(self, app_db_id: str, decision_result: Any) -> None:
        """Persist decision to DB."""
        try:
            from app.db.repositories import decision_repo
            await decision_repo.create(
                application_id=app_db_id,
                decision_type="PRE_APPROVAL",
                decision_result=decision_result.decision_type.value,
                summary=f"{decision_result.decision_type.value}: {decision_result.decision_reason.value}",
                conditions_added=len(decision_result.conditions),
            )
        except RuntimeError:
            pass

    async def _create_offer(
        self,
        lead: ParsedLead,
        processed: ProcessedLead,
        lead_db_id: str,
        app_db_id: str,
        decision_result: Any,
        *,
        loan_amount_cents: int = 45000000,
        loan_purpose: str = "PURCHASE",
    ) -> dict[str, str]:
        """Create an offer for a qualifying lead and persist to DB."""
        offer_token = f"offer_{uuid4().hex[:12]}"

        # Build offer data in camelCase with dollar amounts for frontend
        loan_amount_dollars = loan_amount_cents / 100
        monthly_rent_dollars = (processed.monthly_rent or 0) / 100
        monthly_pitia_dollars = (processed.monthly_pitia or 0) / 100
        avm_dollars = (processed.avm_value or 0) / 100
        property_value_dollars = (processed.property_data.get("estimated_value") or 0) / 100 if processed.property_data else 0
        final_rate = decision_result.final_rate if decision_result and decision_result.final_rate else self.config.default_interest_rate

        borrower_data = {
            "firstName": lead.first_name,
            "lastName": lead.last_name,
            "email": lead.email,
            "phone": lead.phone or "",
        }
        property_data = {
            "address": processed.property_data.get("address", {}).get("street", "") if isinstance(processed.property_data.get("address"), dict) else lead.property_address or "",
            "city": lead.property_city or "",
            "state": lead.property_state or "",
            "zip": lead.property_zip or "",
            "type": processed.property_data.get("property_type", "SFR") if processed.property_data else "SFR",
            "yearBuilt": processed.property_data.get("year_built") if processed.property_data else None,
            "squareFeet": processed.property_data.get("square_feet") if processed.property_data else None,
            "bedrooms": processed.property_data.get("bedrooms") if processed.property_data else None,
            "bathrooms": processed.property_data.get("bathrooms") if processed.property_data else None,
            "appraisedValue": avm_dollars or property_value_dollars,
        }
        dscr_data: dict[str, Any] = {
            "monthlyRent": monthly_rent_dollars,
            "monthlyPITI": monthly_pitia_dollars,
            "dscrRatio": processed.dscr_ratio,  # NOI method
            "simpleDscrRatio": processed.simple_dscr_ratio,  # Simple Rent/PITIA
        }
        if processed.rent_estimate:
            dscr_data["rentEstimate"] = processed.rent_estimate
        if processed.rental_comps:
            dscr_data["rentalComps"] = processed.rental_comps
        loan_data = {
            "amount": loan_amount_dollars,
            "rate": final_rate,
            "term": 30,
            "monthlyPI": monthly_pitia_dollars,
            "ltv": round((loan_amount_dollars / (avm_dollars or property_value_dollars or loan_amount_dollars)) * 100, 1),
        }
        decision_data_json = {
            "decisionType": decision_result.decision_type.value if decision_result else None,
            "finalRate": final_rate,
            "conditions": len(decision_result.conditions) if decision_result else 0,
        }

        # Persist to DB
        offer_id = str(uuid4())
        try:
            from app.db.repositories import offer_repo
            row = await offer_repo.create(
                token=offer_token,
                lead_id=lead_db_id,
                application_id=app_db_id,
                borrower_data=borrower_data,
                property_data=property_data,
                dscr_data=dscr_data,
                loan_data=loan_data,
                decision_data=decision_data_json,
            )
            offer_id = str(row["id"])
        except RuntimeError:
            pass

        return {
            "id": offer_id,
            "token": offer_token,
            "url": f"/offer/{offer_token}",
        }


# Export singleton
ingest_service = IngestService()
