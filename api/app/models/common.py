"""Common models for API responses."""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Pagination(BaseModel):
    """Pagination metadata."""

    page: int
    page_size: int
    total_count: int
    total_pages: int


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated API response."""

    data: list[T]
    pagination: Pagination


class ApiError(BaseModel):
    """API error response."""

    code: str
    message: str
    details: dict[str, Any] | None = None
