"""
Workflow Engine

Manages loan lifecycle and milestone transitions for DSCR loans.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any
from uuid import uuid4


class Milestone(str, Enum):
    """Loan milestones."""
    # Funnel stages
    LEADS = "LEADS"
    LEADS_VERIFIED = "LEADS_VERIFIED"
    CONTACTED = "CONTACTED"
    REACHED_LANDING = "REACHED_LANDING"
    VERIFIED_INFO = "VERIFIED_INFO"
    # Pipeline stages
    STARTED = "STARTED"
    APPLICATION = "APPLICATION"
    PRE_APPROVED = "PRE_APPROVED"
    PROCESSING = "PROCESSING"
    SUBMITTED = "SUBMITTED"
    CONDITIONALLY_APPROVED = "CONDITIONALLY_APPROVED"
    APPROVED = "APPROVED"
    DOCS_OUT = "DOCS_OUT"
    DOCS_BACK = "DOCS_BACK"
    CLEAR_TO_CLOSE = "CLEAR_TO_CLOSE"
    CLOSING = "CLOSING"
    FUNDED = "FUNDED"
    COMPLETION = "COMPLETION"
    # Terminal states
    DENIED = "DENIED"
    WITHDRAWN = "WITHDRAWN"


class TaskStatus(str, Enum):
    """Task status."""
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    CANCELLED = "CANCELLED"


class TaskPriority(str, Enum):
    """Task priority."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


@dataclass
class Task:
    """Workflow task."""
    id: str
    application_id: str
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    assigned_role: str
    assigned_user_id: str | None = None
    due_at: datetime | None = None
    sla_hours: int | None = None
    completed_at: datetime | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class MilestoneTransition:
    """Record of milestone transition."""
    id: str
    application_id: str
    from_milestone: Milestone | None
    to_milestone: Milestone
    transitioned_at: datetime
    transitioned_by: str
    reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowState:
    """Current workflow state for an application."""
    application_id: str
    current_milestone: Milestone
    entered_milestone_at: datetime
    days_in_milestone: float
    pending_tasks: list[Task]
    completed_tasks: list[Task]
    sla_status: str  # ON_TRACK, AT_RISK, BREACHED
    next_milestones: list[Milestone]
    blockers: list[str]


# SLA hours by milestone
MILESTONE_SLA = {
    Milestone.STARTED: 24,
    Milestone.APPLICATION: 48,
    Milestone.PRE_APPROVED: 24,
    Milestone.PROCESSING: 72,
    Milestone.SUBMITTED: 48,
    Milestone.CONDITIONALLY_APPROVED: 24,
    Milestone.APPROVED: 24,
    Milestone.DOCS_OUT: 48,
    Milestone.DOCS_BACK: 24,
    Milestone.CLEAR_TO_CLOSE: 24,
    Milestone.CLOSING: 48,
}

# Valid milestone transitions
VALID_TRANSITIONS = {
    Milestone.LEADS: [Milestone.LEADS_VERIFIED, Milestone.WITHDRAWN],
    Milestone.LEADS_VERIFIED: [Milestone.CONTACTED, Milestone.WITHDRAWN],
    Milestone.CONTACTED: [Milestone.REACHED_LANDING, Milestone.WITHDRAWN],
    Milestone.REACHED_LANDING: [Milestone.VERIFIED_INFO, Milestone.WITHDRAWN],
    Milestone.VERIFIED_INFO: [Milestone.STARTED, Milestone.FUNDED, Milestone.WITHDRAWN],
    Milestone.STARTED: [Milestone.APPLICATION, Milestone.WITHDRAWN],
    Milestone.APPLICATION: [Milestone.PRE_APPROVED, Milestone.DENIED, Milestone.WITHDRAWN],
    Milestone.PRE_APPROVED: [Milestone.PROCESSING, Milestone.DENIED, Milestone.WITHDRAWN],
    Milestone.PROCESSING: [Milestone.SUBMITTED, Milestone.DENIED, Milestone.WITHDRAWN],
    Milestone.SUBMITTED: [Milestone.CONDITIONALLY_APPROVED, Milestone.DENIED, Milestone.WITHDRAWN],
    Milestone.CONDITIONALLY_APPROVED: [Milestone.APPROVED, Milestone.DENIED, Milestone.WITHDRAWN],
    Milestone.APPROVED: [Milestone.DOCS_OUT, Milestone.WITHDRAWN],
    Milestone.DOCS_OUT: [Milestone.DOCS_BACK, Milestone.WITHDRAWN],
    Milestone.DOCS_BACK: [Milestone.CLEAR_TO_CLOSE, Milestone.WITHDRAWN],
    Milestone.CLEAR_TO_CLOSE: [Milestone.CLOSING, Milestone.WITHDRAWN],
    Milestone.CLOSING: [Milestone.FUNDED, Milestone.WITHDRAWN],
    Milestone.FUNDED: [Milestone.COMPLETION],
}

# Tasks generated at each milestone
MILESTONE_TASKS = {
    Milestone.STARTED: [
        ("Verify borrower identity", "PROCESSOR", 24),
        ("Order credit report", "PROCESSOR", 4),
        ("Collect income documentation", "PROCESSOR", 48),
    ],
    Milestone.APPLICATION: [
        ("Review application completeness", "PROCESSOR", 24),
        ("Order AVM", "PROCESSOR", 4),
        ("Calculate DSCR", "PROCESSOR", 8),
    ],
    Milestone.PRE_APPROVED: [
        ("Order appraisal", "PROCESSOR", 24),
        ("Order title", "PROCESSOR", 24),
        ("Send pre-approval letter", "LOAN_OFFICER", 4),
    ],
    Milestone.PROCESSING: [
        ("Review appraisal", "UNDERWRITER", 24),
        ("Verify rent schedule", "PROCESSOR", 24),
        ("Clear conditions", "PROCESSOR", 72),
    ],
    Milestone.CONDITIONALLY_APPROVED: [
        ("Review conditions", "UNDERWRITER", 24),
        ("Verify condition clearance", "UNDERWRITER", 24),
    ],
    Milestone.APPROVED: [
        ("Prepare closing disclosure", "CLOSER", 24),
        ("Schedule closing", "CLOSER", 48),
    ],
    Milestone.DOCS_OUT: [
        ("Send documents for signing", "CLOSER", 24),
        ("Confirm signing appointment", "CLOSER", 24),
    ],
    Milestone.CLEAR_TO_CLOSE: [
        ("Final review", "CLOSER", 8),
        ("Wire funds", "CLOSER", 24),
    ],
}


class WorkflowEngine:
    """Workflow management engine."""

    def __init__(self) -> None:
        # In-memory storage for demo
        self._transitions: dict[str, list[MilestoneTransition]] = {}
        self._tasks: dict[str, list[Task]] = {}

    def get_state(self, application_id: str, current_milestone: Milestone) -> WorkflowState:
        """Get current workflow state."""
        transitions = self._transitions.get(application_id, [])
        tasks = self._tasks.get(application_id, [])

        # Find when we entered current milestone
        entered_at = datetime.utcnow()
        for t in reversed(transitions):
            if t.to_milestone == current_milestone:
                entered_at = t.transitioned_at
                break

        days_in_milestone = (datetime.utcnow() - entered_at).total_seconds() / 86400

        # Get SLA status
        sla_hours = MILESTONE_SLA.get(current_milestone, 48)
        if days_in_milestone * 24 > sla_hours:
            sla_status = "BREACHED"
        elif days_in_milestone * 24 > sla_hours * 0.75:
            sla_status = "AT_RISK"
        else:
            sla_status = "ON_TRACK"

        # Get pending/completed tasks
        pending_tasks = [t for t in tasks if t.status in [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]]
        completed_tasks = [t for t in tasks if t.status == TaskStatus.COMPLETED]

        # Get valid next milestones
        next_milestones = VALID_TRANSITIONS.get(current_milestone, [])

        # Identify blockers
        blockers = []
        if pending_tasks:
            blockers.append(f"{len(pending_tasks)} pending tasks")

        return WorkflowState(
            application_id=application_id,
            current_milestone=current_milestone,
            entered_milestone_at=entered_at,
            days_in_milestone=round(days_in_milestone, 2),
            pending_tasks=pending_tasks,
            completed_tasks=completed_tasks,
            sla_status=sla_status,
            next_milestones=next_milestones,
            blockers=blockers,
        )

    def transition(
        self,
        application_id: str,
        from_milestone: Milestone | None,
        to_milestone: Milestone,
        transitioned_by: str,
        reason: str | None = None,
    ) -> MilestoneTransition:
        """Record a milestone transition."""
        # Validate transition
        if from_milestone:
            valid_next = VALID_TRANSITIONS.get(from_milestone, [])
            if to_milestone not in valid_next:
                raise ValueError(f"Invalid transition from {from_milestone} to {to_milestone}")

        transition = MilestoneTransition(
            id=str(uuid4()),
            application_id=application_id,
            from_milestone=from_milestone,
            to_milestone=to_milestone,
            transitioned_at=datetime.utcnow(),
            transitioned_by=transitioned_by,
            reason=reason,
        )

        # Store transition
        if application_id not in self._transitions:
            self._transitions[application_id] = []
        self._transitions[application_id].append(transition)

        # Generate tasks for new milestone
        self._generate_milestone_tasks(application_id, to_milestone)

        return transition

    def _generate_milestone_tasks(self, application_id: str, milestone: Milestone) -> None:
        """Generate tasks for a milestone."""
        task_templates = MILESTONE_TASKS.get(milestone, [])

        if application_id not in self._tasks:
            self._tasks[application_id] = []

        for title, role, sla_hours in task_templates:
            task = Task(
                id=str(uuid4()),
                application_id=application_id,
                title=title,
                description=f"Task for {milestone.value} milestone",
                status=TaskStatus.PENDING,
                priority=TaskPriority.MEDIUM,
                assigned_role=role,
                sla_hours=sla_hours,
                due_at=datetime.utcnow() + timedelta(hours=sla_hours),
            )
            self._tasks[application_id].append(task)

    def complete_task(self, application_id: str, task_id: str) -> Task | None:
        """Mark a task as complete."""
        tasks = self._tasks.get(application_id, [])
        for task in tasks:
            if task.id == task_id:
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()
                return task
        return None

    def get_tasks(self, application_id: str) -> list[Task]:
        """Get all tasks for an application."""
        return self._tasks.get(application_id, [])


# Export singleton
workflow_engine = WorkflowEngine()
