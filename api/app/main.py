"""DSCR Loan Automation Platform - FastAPI Backend"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import analytics, applications, leads, offers, property, valuation
from app.db.connection import init_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup/shutdown."""
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title="DSCR Loan Platform API",
    description="API for DSCR loan automation, lead management, and pipeline analytics",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(leads.router, prefix="/api/v1/leads", tags=["Leads"])
app.include_router(applications.router, prefix="/api/v1/applications", tags=["Applications"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(offers.router, prefix="/api/v1/offers", tags=["Offers"])
app.include_router(property.router, prefix="/api/v1/property", tags=["Property"])
app.include_router(valuation.router, prefix="/api/v1/valuation", tags=["Valuation"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "dscr-api"}
