"""Lead models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field

from app.models.user import User


class LeadStatus(str, Enum):
    """Lead status in the funnel."""

    NEW = "NEW"
    CONTACTED = "CONTACTED"
    QUALIFIED = "QUALIFIED"
    NURTURING = "NURTURING"
    APPLICATION_STARTED = "APPLICATION_STARTED"
    CONVERTED = "CONVERTED"
    DISQUALIFIED = "DISQUALIFIED"
    DEAD = "DEAD"


class LeadSource(str, Enum):
    """Lead acquisition source."""

    WEBSITE = "WEBSITE"
    REFERRAL = "REFERRAL"
    BROKER = "BROKER"
    PAID_AD = "PAID_AD"
    ORGANIC = "ORGANIC"
    PARTNER = "PARTNER"
    OTHER = "OTHER"


class LeadBase(BaseModel):
    """Base lead fields."""

    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    source: LeadSource = LeadSource.WEBSITE
    property_address: str | None = None
    property_state: str | None = None
    estimated_loan_amount: int | None = None  # cents
    estimated_property_value: int | None = None  # cents
    estimated_dscr: float | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    notes: str | None = None


class LeadCreate(LeadBase):
    """Fields for creating a new lead."""

    pass


class LeadUpdate(BaseModel):
    """Fields for updating a lead."""

    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    status: LeadStatus | None = None
    source: LeadSource | None = None
    score: int | None = Field(None, ge=0, le=100)
    assigned_lo_id: str | None = None
    property_address: str | None = None
    property_state: str | None = None
    estimated_loan_amount: int | None = None
    estimated_property_value: int | None = None
    estimated_dscr: float | None = None
    notes: str | None = None


class Lead(LeadBase):
    """Full lead model."""

    id: str
    status: LeadStatus = LeadStatus.NEW
    score: int = Field(default=0, ge=0, le=100)
    assigned_lo_id: str | None = None
    assigned_lo: User | None = None
    last_contacted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
