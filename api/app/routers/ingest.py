"""
Ingest Router

Endpoints for ingesting leads from Excel/CSV files.
"""

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.ingest import ingest_service, IngestStatus, LeadProcessingStatus


router = APIRouter()


class IngestJobResponse(BaseModel):
    """Response for ingest job."""
    id: str
    filename: str
    status: IngestStatus
    total_leads: int
    processed_leads: int
    successful_leads: int
    failed_leads: int
    skipped_leads: int
    created_at: str
    completed_at: str | None = None
    error_message: str | None = None


class ProcessedLeadResponse(BaseModel):
    """Response for a processed lead."""
    lead_id: str
    row_number: int
    first_name: str
    last_name: str
    email: str
    status: LeadProcessingStatus
    dscr_ratio: float | None = None
    dscr_meets_minimum: bool = False
    avm_value: int | None = None
    offer_id: str | None = None
    offer_token: str | None = None
    offer_url: str | None = None
    error_message: str | None = None


class IngestJobDetailResponse(IngestJobResponse):
    """Detailed response including processed leads."""
    leads: list[ProcessedLeadResponse]


@router.post("/upload", response_model=IngestJobResponse)
async def upload_file(file: UploadFile = File(...)) -> IngestJobResponse:
    """
    Upload a CSV or Excel file to ingest leads.

    The file should contain columns for:
    - first_name (or firstname, first, fname)
    - last_name (or lastname, last, lname)
    - email (or email_address)
    - phone (optional)
    - property_address (optional)
    - property_city (optional)
    - property_state (optional)
    - property_zip (optional)
    - propertyreach_url (optional - URL with property details)
    - loan_amount (optional)

    The service will:
    1. Parse the file and extract leads
    2. Fetch property data from PropertyReach API
    3. Calculate DSCR for each lead
    4. Fetch AVM data for qualifying leads
    5. Generate offers for leads meeting criteria
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    filename = file.filename.lower()

    if filename.endswith(".csv"):
        content = await file.read()
        job = await ingest_service.ingest_csv(content, file.filename)
    elif filename.endswith((".xlsx", ".xls")):
        job = await ingest_service.ingest_excel(file.file, file.filename)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a CSV or Excel (.xlsx) file."
        )

    return IngestJobResponse(
        id=job.id,
        filename=job.filename,
        status=job.status,
        total_leads=job.total_leads,
        processed_leads=job.processed_leads,
        successful_leads=job.successful_leads,
        failed_leads=job.failed_leads,
        skipped_leads=job.skipped_leads,
        created_at=job.created_at.isoformat(),
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )


@router.get("/jobs/{job_id}", response_model=IngestJobDetailResponse)
async def get_job(job_id: str) -> IngestJobDetailResponse:
    """Get details of an ingest job including all processed leads."""
    job = ingest_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    leads = []
    for processed in job.leads:
        offer_url = None
        if processed.offer_token:
            offer_url = f"/offer/{processed.offer_token}"

        leads.append(ProcessedLeadResponse(
            lead_id=processed.lead_id,
            row_number=processed.parsed_lead.row_number,
            first_name=processed.parsed_lead.first_name,
            last_name=processed.parsed_lead.last_name,
            email=processed.parsed_lead.email,
            status=processed.status,
            dscr_ratio=processed.dscr_ratio,
            dscr_meets_minimum=processed.dscr_meets_minimum,
            avm_value=processed.avm_value,
            offer_id=processed.offer_id,
            offer_token=processed.offer_token,
            offer_url=offer_url,
            error_message=processed.error_message,
        ))

    return IngestJobDetailResponse(
        id=job.id,
        filename=job.filename,
        status=job.status,
        total_leads=job.total_leads,
        processed_leads=job.processed_leads,
        successful_leads=job.successful_leads,
        failed_leads=job.failed_leads,
        skipped_leads=job.skipped_leads,
        created_at=job.created_at.isoformat(),
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
        leads=leads,
    )


@router.get("/jobs", response_model=list[IngestJobResponse])
async def list_jobs() -> list[IngestJobResponse]:
    """List all ingest jobs."""
    jobs = list(ingest_service._jobs.values())
    return [
        IngestJobResponse(
            id=job.id,
            filename=job.filename,
            status=job.status,
            total_leads=job.total_leads,
            processed_leads=job.processed_leads,
            successful_leads=job.successful_leads,
            failed_leads=job.failed_leads,
            skipped_leads=job.skipped_leads,
            created_at=job.created_at.isoformat(),
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            error_message=job.error_message,
        )
        for job in jobs
    ]
