"""User models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr


class UserRole(str, Enum):
    """User roles in the system."""

    LOAN_OFFICER = "LOAN_OFFICER"
    PROCESSOR = "PROCESSOR"
    UNDERWRITER = "UNDERWRITER"
    CLOSER = "CLOSER"
    POST_CLOSER = "POST_CLOSER"
    MANAGER = "MANAGER"
    ADMIN = "ADMIN"


class User(BaseModel):
    """User model."""

    id: str
    email: EmailStr
    first_name: str
    last_name: str
    role: UserRole
    avatar_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
