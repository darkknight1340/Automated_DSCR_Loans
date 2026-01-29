"""Analytics models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from app.models.application import Milestone


class FunnelStage(BaseModel):
    """Single stage in the conversion funnel."""

    stage: str
    count: int
    conversion_rate: float | None = None
    previous_stage: str | None = None


class FunnelPeriod(BaseModel):
    """Time period for funnel metrics."""

    from_date: datetime
    to_date: datetime


class FunnelMetrics(BaseModel):
    """Funnel analytics metrics."""

    stages: list[FunnelStage]
    overall_conversion: float
    period: FunnelPeriod


class ContactMethod(str, Enum):
    """Contact method types."""

    EMAIL = "email"
    PHYSICAL_MAIL = "physical_mail"
    VOICE_CALL = "voice_call"
    TEXT = "text"


class ContactMethodMetrics(BaseModel):
    """Conversion metrics by contact method."""

    method: ContactMethod
    label: str
    contacted: int
    converted: int
    conversion_rate: float


class PipelineMilestoneMetrics(BaseModel):
    """Pipeline metrics for a single milestone."""

    milestone: Milestone
    count: int
    volume_cents: int
    avg_days_in_stage: float


class SLABreach(BaseModel):
    """SLA breach record."""

    application_id: str
    loan_number: str | None = None
    milestone: Milestone
    days_in_stage: float
    sla_hours: int
    breached_at: datetime


class PipelineMetrics(BaseModel):
    """Full pipeline metrics."""

    by_milestone: list[PipelineMilestoneMetrics]
    sla_breaches: list[SLABreach]
    total_volume_cents: int
    total_count: int


class RiskBucket(BaseModel):
    """Risk distribution bucket."""

    range: str
    count: int
    min: float
    max: float


class StateDistribution(BaseModel):
    """Geographic distribution by state."""

    state: str
    count: int
    volume_cents: int


class RiskDistribution(BaseModel):
    """Full risk distribution metrics."""

    dscr: dict[str, list[RiskBucket]]
    ltv: dict[str, list[RiskBucket]]
    credit_score: dict[str, list[RiskBucket]]
    by_state: list[StateDistribution]


class VelocityMetrics(BaseModel):
    """Pipeline velocity metrics."""

    period: str
    avg_days_lead_to_fund: float
    count: int
