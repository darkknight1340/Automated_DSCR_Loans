"""Analytics router."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query

from app.models.analytics import (
    FunnelStage,
    FunnelMetrics,
    FunnelPeriod,
    ContactMethod,
    ContactMethodMetrics,
    PipelineMilestoneMetrics,
    PipelineMetrics,
)
from app.models.application import Milestone

router = APIRouter()


@router.get("/funnel", response_model=FunnelMetrics)
async def get_funnel_metrics(
    period: str = Query("30d", pattern="^(7d|30d|90d|ytd)$"),
) -> FunnelMetrics:
    """Get funnel conversion metrics."""
    now = datetime.now(timezone.utc)

    # Calculate period dates
    if period == "7d":
        from_date = now - timedelta(days=7)
    elif period == "30d":
        from_date = now - timedelta(days=30)
    elif period == "90d":
        from_date = now - timedelta(days=90)
    else:  # ytd
        from_date = datetime(now.year, 1, 1, tzinfo=timezone.utc)

    # Mock funnel data matching frontend stages
    stages = [
        FunnelStage(stage="Leads", count=500, conversion_rate=None),
        FunnelStage(
            stage="Leads Verified/Qualified",
            count=320,
            conversion_rate=0.64,
            previous_stage="Leads",
        ),
        FunnelStage(
            stage="Contacted",
            count=240,
            conversion_rate=0.75,
            previous_stage="Leads Verified/Qualified",
        ),
        FunnelStage(
            stage="Reached Landing Page",
            count=180,
            conversion_rate=0.75,
            previous_stage="Contacted",
        ),
        FunnelStage(
            stage="Verified Information",
            count=95,
            conversion_rate=0.53,
            previous_stage="Reached Landing Page",
        ),
        FunnelStage(
            stage="Funded",
            count=45,
            conversion_rate=0.47,
            previous_stage="Verified Information",
        ),
    ]

    return FunnelMetrics(
        stages=stages,
        overall_conversion=45 / 500,  # Funded / Leads
        period=FunnelPeriod(from_date=from_date, to_date=now),
    )


@router.get("/contact-methods", response_model=list[ContactMethodMetrics])
async def get_contact_method_metrics(
    period: str = Query("30d", pattern="^(7d|30d|90d|ytd)$"),
) -> list[ContactMethodMetrics]:
    """Get conversion metrics by contact method."""
    return [
        ContactMethodMetrics(
            method=ContactMethod.EMAIL,
            label="Email",
            contacted=1250,
            converted=125,
            conversion_rate=0.10,
        ),
        ContactMethodMetrics(
            method=ContactMethod.VOICE_CALL,
            label="Voice Call",
            contacted=480,
            converted=96,
            conversion_rate=0.20,
        ),
        ContactMethodMetrics(
            method=ContactMethod.TEXT,
            label="Text/SMS",
            contacted=890,
            converted=133,
            conversion_rate=0.15,
        ),
        ContactMethodMetrics(
            method=ContactMethod.PHYSICAL_MAIL,
            label="Physical Mail",
            contacted=320,
            converted=22,
            conversion_rate=0.07,
        ),
    ]


@router.get("/pipeline", response_model=PipelineMetrics)
async def get_pipeline_metrics(
    period: str = Query("30d", pattern="^(7d|30d|90d|ytd)$"),
) -> PipelineMetrics:
    """Get pipeline metrics by milestone."""
    by_milestone = [
        PipelineMilestoneMetrics(
            milestone=Milestone.LEADS,
            count=500,
            volume_cents=1750000000,
            avg_days_in_stage=0,
        ),
        PipelineMilestoneMetrics(
            milestone=Milestone.LEADS_VERIFIED,
            count=320,
            volume_cents=1120000000,
            avg_days_in_stage=1.2,
        ),
        PipelineMilestoneMetrics(
            milestone=Milestone.CONTACTED,
            count=240,
            volume_cents=840000000,
            avg_days_in_stage=2.5,
        ),
        PipelineMilestoneMetrics(
            milestone=Milestone.REACHED_LANDING,
            count=180,
            volume_cents=630000000,
            avg_days_in_stage=1.8,
        ),
        PipelineMilestoneMetrics(
            milestone=Milestone.VERIFIED_INFO,
            count=95,
            volume_cents=332500000,
            avg_days_in_stage=3.2,
        ),
        PipelineMilestoneMetrics(
            milestone=Milestone.FUNDED,
            count=45,
            volume_cents=157500000,
            avg_days_in_stage=5.5,
        ),
    ]

    total_volume = sum(m.volume_cents for m in by_milestone)
    total_count = sum(m.count for m in by_milestone)

    return PipelineMetrics(
        by_milestone=by_milestone,
        sla_breaches=[],
        total_volume_cents=total_volume,
        total_count=total_count,
    )
