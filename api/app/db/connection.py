"""Database connection management."""

import os
from typing import Any

import asyncpg

# Global connection pool
_pool: asyncpg.Pool | None = None


def is_database_configured() -> bool:
    """Check if database URL is configured."""
    return bool(os.getenv("DATABASE_URL"))


async def init_db() -> None:
    """Initialize database connection pool."""
    global _pool

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not configured, using in-memory fallback")
        return

    try:
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
        print("Database connection pool initialized")
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        print("Falling back to in-memory storage")
        _pool = None


async def close_db() -> None:
    """Close database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        print("Database connection pool closed")


def get_db() -> asyncpg.Pool | None:
    """Get the database connection pool."""
    return _pool


async def query(sql: str, *args: Any) -> list[asyncpg.Record]:
    """Execute a query and return results."""
    if not _pool:
        raise RuntimeError("Database not initialized")

    async with _pool.acquire() as conn:
        return await conn.fetch(sql, *args)


async def query_one(sql: str, *args: Any) -> asyncpg.Record | None:
    """Execute a query and return a single result."""
    if not _pool:
        raise RuntimeError("Database not initialized")

    async with _pool.acquire() as conn:
        return await conn.fetchrow(sql, *args)


async def execute(sql: str, *args: Any) -> str:
    """Execute a query without returning results."""
    if not _pool:
        raise RuntimeError("Database not initialized")

    async with _pool.acquire() as conn:
        return await conn.execute(sql, *args)
