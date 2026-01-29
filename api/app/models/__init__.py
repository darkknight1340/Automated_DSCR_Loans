"""Pydantic models for DSCR Platform API."""

from app.models.user import User, UserRole
from app.models.lead import Lead, LeadStatus, LeadSource, LeadCreate, LeadUpdate
from app.models.application import (
    Application,
    ApplicationStatus,
    Milestone,
    Property,
    PropertyType,
    LoanTerms,
    LoanPurpose,
    OccupancyType,
    DSCRCalculation,
    DSCRTier,
)
from app.models.analytics import (
    FunnelStage,
    FunnelMetrics,
    ContactMethod,
    ContactMethodMetrics,
    PipelineMilestoneMetrics,
    SLABreach,
    PipelineMetrics,
    RiskBucket,
    StateDistribution,
    RiskDistribution,
)
from app.models.common import PaginatedResponse, ApiError

__all__ = [
    # User
    "User",
    "UserRole",
    # Lead
    "Lead",
    "LeadStatus",
    "LeadSource",
    "LeadCreate",
    "LeadUpdate",
    # Application
    "Application",
    "ApplicationStatus",
    "Milestone",
    "Property",
    "PropertyType",
    "LoanTerms",
    "LoanPurpose",
    "OccupancyType",
    "DSCRCalculation",
    "DSCRTier",
    # Analytics
    "FunnelStage",
    "FunnelMetrics",
    "ContactMethod",
    "ContactMethodMetrics",
    "PipelineMilestoneMetrics",
    "SLABreach",
    "PipelineMetrics",
    "RiskBucket",
    "StateDistribution",
    "RiskDistribution",
    # Common
    "PaginatedResponse",
    "ApiError",
]
