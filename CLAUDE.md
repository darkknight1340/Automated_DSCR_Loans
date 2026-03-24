# DSCR Loan Automation Platform

## Overview
Automated DSCR (Debt Service Coverage Ratio) loan origination pipeline. Ingests leads from CSV/Excel, enriches with property data from multiple APIs, calculates DSCR, runs decisioning rules/pricing, and generates loan offers.

## Tech Stack
- **Backend**: Python 3.12 / FastAPI (async)
- **Database**: PostgreSQL 16 via Docker Compose, raw SQL with asyncpg (no ORM)
- **Frontend**: Next.js (in `/web`, connects to API at localhost:8000)
- **Package manager**: pip with venv at `/api/.venv`

## Project Structure
```
/api                          # FastAPI backend
  /app
    /adapters                 # External API clients
      propertyreach.py        # PropertyReach — property details, owner, equity
      datatree.py             # DataTree (First American) — AVM reports
      rentcast.py             # RentCast — rental estimates, comps, value estimates
      encompass.py            # Encompass LOS integration (stub)
    /services                 # Business logic
      ingest.py               # Full pipeline: parse leads → enrich → DSCR → decision → offer
      dscr.py                 # DSCR calculation engine
      rules.py                # Eligibility rules engine
      pricing.py              # Rate pricing with adders
      decision.py             # Decision engine (rules + pricing combined)
      valuation.py            # Valuation orchestration
    /routers                  # FastAPI route handlers
      ingest.py               # POST /api/v1/ingest/upload
      offers.py               # GET /api/v1/offers/{token}
      leads.py, applications.py, analytics.py, property.py, valuation.py
    /db
      connection.py           # asyncpg pool (init_db/close_db/query/query_one/execute)
      /repositories           # Data access layer (thin classes, raw SQL)
        leads.py, borrowers.py, properties.py, applications.py
        avm.py, decisions.py, offers.py, api_responses.py
    /models                   # Pydantic models (request/response)
    main.py                   # FastAPI app with lifespan, CORS, router registration
  .env                        # Environment variables (API keys, DB URL, pipeline config)
  test_pipeline.py            # End-to-end pipeline test script
/db
  /migrations                 # SQL migrations (run via Docker initdb.d)
    001_initial_schema.sql    # All schemas: leads, loans, enrichment, decisioning, etc.
    002_offers_table.sql      # leads.offers table
    003_api_responses.sql     # enrichment.api_responses table
/web                          # Next.js frontend
/docker-compose.yml           # PostgreSQL 16 Alpine
```

## Database Schemas
- `leads` — lead_sources, leads, lead_activities, offers
- `loans` — borrowers, guarantors, properties, rent_rolls, applications
- `enrichment` — credit_reports, avm_reports, appraisals, api_responses
- `decisioning` — rule_versions, rule_evaluations, pricing_cards, pricing_calculations, conditions, decisions
- `workflow` — workflow_definitions, workflow_instances, workflow_tasks, milestone_history
- `documents` — document_types, document_registry, document_versions
- `audit` — audit_events (partitioned), data_access_log

## Money Convention
- **Python**: cents as `int` (e.g. `45000000` = $450,000)
- **Database**: `DECIMAL` dollars (e.g. `450000.00`)
- **API responses to frontend**: dollars (converted at offer write time)
- Convert: divide by 100 on DB write, multiply by 100 on DB read

## Key Pipeline Flow (ingest.py)
1. Parse CSV/Excel → extract leads with address
2. Fetch property data from **PropertyReach** API
3. Persist property to DB
4. Calculate **DSCR** (rent vs PITIA)
5. Compute **LTV** (loan amount / property value)
6. Fetch **AVM** (DataTree primary → RentCast fallback)
7. Fetch **rental comps** from RentCast
8. Persist lead, borrower, application to DB
9. Run **decision engine** (eligibility rules + pricing)
10. If approved → create **offer** → persist to DB

All raw API responses are stored in `enrichment.api_responses` for reference.

## External APIs

### PropertyReach
- **Endpoint**: `GET https://api.propertyreach.com/v1/property`
- **Auth**: `x-api-key` header
- **Params**: `streetAddress`, `city`, `state`, `zipCode` (camelCase)
- **Returns**: Property details, owner contacts, mortgages/loans, equity, estimated rent, tax assessments
- **Owner data pulled**: All owners (owner1Name, owner2Name, contacts array with phones/emails), mailing address, ownerOccupied, ownershipMonths
- **Loan data pulled**: openLoans array — rate, estimatedBalance, estimatedPayment, lenderName, loanType, term, dueDate, recordingDate, loanFlags
- **Stored in DB**: `loans.properties.owner_info` (JSONB array), `loans.properties.existing_loans` (JSONB array), plus scalar columns for estimated_value, assessed_value, annual_taxes, estimated_equity, lot_acres, pool, garage_spaces

### RentCast
- **Rent estimate**: `GET https://api.rentcast.io/v1/avm/rent/long-term`
- **Value estimate**: `GET https://api.rentcast.io/v1/avm/value`
- **Auth**: `X-Api-Key` header
- **Params**: `address` (full string), `compCount`, `propertyType`, `bedrooms`, `bathrooms`, `squareFootage`

### DataTree (First American)
- **Auth**: `POST /api/Login/AuthenticateClient` with `{ClientId, ClientSecretKey}` → returns JWT string
- **AVM**: `POST /api/Report/GetReport` with JWT Bearer token
- **Base URL**: `https://dtapiuat.datatree.com` (UAT)
- **Note**: UAT account currently has no products enabled — needs DataTree support to activate

## Runtime Configuration (environment variables)
```
DEFAULT_INTEREST_RATE=5.0      # Base rate assumption (%)
DEFAULT_CREDIT_SCORE=720       # FICO score assumption
MIN_DSCR=1.0                   # Minimum DSCR to qualify
MAX_LTV=80.0                   # Maximum LTV ratio (%)
```

## Running Locally
```bash
# Start Postgres
docker compose up -d

# Start API server
cd api
source .venv/bin/activate
uvicorn app.main:app --reload

# Run pipeline test
python test_pipeline.py
```

## Common Commands
```bash
# Apply new migration manually
docker compose exec postgres psql -U dscr_user -d dscr_loans -f /docker-entrypoint-initdb.d/003_api_responses.sql

# Check DB tables
docker compose exec postgres psql -U dscr_user -d dscr_loans -c "\dt enrichment.*"

# Test ingest via curl
curl -X POST http://localhost:8000/api/v1/ingest/upload -F "file=@test.csv"

# View offer
curl http://localhost:8000/api/v1/offers/{token}
```

## SQL Enum Values (must match exactly)
- `property_type`: SFR, CONDO, TOWNHOUSE, 2_4_UNIT, MULTIFAMILY, MIXED_USE
- `loan_purpose`: PURCHASE, RATE_TERM_REFI, CASH_OUT_REFI
- `occupancy_type`: INVESTMENT, SECOND_HOME
- `decision_result`: APPROVED, DENIED, PENDING, EXCEPTION, MANUAL_REVIEW
- `loan_status`: PROSPECT, APPLICATION, PROCESSING, UNDERWRITING, APPROVED, DENIED, SUSPENDED, WITHDRAWN, CLOSING, FUNDED, POST_CLOSE, SOLD

## Encompass Integration

### Authentication (Password Grant OAuth2)
- **Token endpoint**: `POST https://api.elliemae.com/oauth2/v1/token`
- **Grant type**: `password` (not client_credentials)
- **Credentials** (in `/api/.env`):
  ```
  ENCOMPASS_USERNAME=ardacredit@encompass:BE799877
  ENCOMPASS_PASSWORD=8v!eDWHXuZMm#6wLBW
  ENCOMPASS_CLIENT_ID=fog2uje
  ENCOMPASS_CLIENT_SECRET=uhbvE*tubm3w^sHn4&kQOq5lPkvY6CUqym5m4AcA3AR6&drMzhtaRBE2KH&*XEqQ
  ENCOMPASS_SCOPE=lp
  ENCOMPASS_BASE_URL=https://api.elliemae.com
  ```

### Key Methods (`app/adapters/encompass.py`)
- `get_loan(loan_guid)` - Get full loan data by GUID
- `get_loan_by_number(loan_number)` - Search by loan number
- `read_fields(loan_guid, field_ids)` - Read specific Encompass field values
- `update_fields(loan_guid, fields)` - Update field values
- `get_current_milestone(loan_guid)` - Get loan milestone

### Common Encompass Field IDs
| Field ID | Description |
|----------|-------------|
| 364 | Loan number |
| 1109 | Loan amount |
| 1014 | Interest rate |
| 11, 12, 14, 15 | Property address (street, city, state, zip) |
| 1821 | Appraised value |
| 912 | Monthly P&I |
| 1405 | Monthly taxes |
| 230 | Monthly insurance |
| 736 | Total PITIA |
| CX.DSCR | DSCR ratio |
| Log.MS.CurrentMilestone | Current milestone |
| 1869 | Vesting name |
| 1041 | Property type |
| 18 | Year built |

## Pipeline Validation System

### Purpose
Validates our DSCR pipeline against Encompass "golden dataset" to ensure data quality for Non-QM refinancing targeting.

### How It Works
1. **Pull Encompass data** - Loan terms, PITIA, DSCR, borrower info
2. **Create lead in DB** - Persist address as a lead
3. **Run full pipeline** - PropertyReach/DataTree → RentCast → DSCR calculation
4. **Compare results** - Match/mismatch for each data category
5. **Store validation** - Results saved in `analysis_data.encompassValidation`

### Validation Categories
| Category | Comparison | Match Criteria |
|----------|------------|----------------|
| DSCR | Encompass vs Pipeline | Within 0.1 difference |
| Owner | Vesting name vs DataTree owner | Name parts overlap |
| AVM | Appraised vs Pipeline AVM | Within 15% |
| Rent | Implied rent vs RentCast | Within 10% |
| Property | Sqft, beds, baths, year | Each field matches |
| Liens | Loan balance vs DataTree mortgages | Within 10% |

### API Endpoint
```bash
# Validate a loan (creates lead, runs pipeline, returns comparison)
curl http://localhost:8000/api/v1/validate/{loan_guid}

# Example
curl http://localhost:8000/api/v1/validate/6c2ce013-55b5-4225-a5f7-eba070db2b0b
```

### Frontend Pages
- `/validation` - Enter Encompass GUID, run validation, see results
- `/leads/{id}/loan` - Full loan analysis with Encompass Validation card

### Key Files
- `app/routers/validation.py` - Validation API endpoints
- `app/adapters/encompass.py` - Encompass API client
- `web/src/app/(dashboard)/validation/page.tsx` - Validation input page
- `web/src/app/(dashboard)/leads/[id]/loan/page.tsx` - Loan detail with validation display

## DSCR Calculation Settings

### Standard Rate
All DSCR calculations use **4.99% interest rate** (configurable in `ingest.py`):
```python
STANDARD_INTEREST_RATE = 0.0499  # 4.99%
default_interest_rate: float = 4.99  # in IngestConfig
```

### Max Loan Calculation (for new leads without explicit amount)
When no loan amount is provided, the pipeline calculates max approvable:
1. Get rent estimate from RentCast
2. Max PITIA = Rent / MIN_DSCR (where MIN_DSCR = 1.0)
3. Max P&I = Max PITIA - taxes - insurance
4. Back-calculate max loan from P&I at 4.99%
5. Cap at 75% LTV based on AVM

### DSCR Formulas
- **Simple DSCR**: `Rent / PITIA` (used for Encompass comparison)
- **NOI DSCR**: `(Rent × (1-vacancy) × (1-mgmt)) / PITIA` (our pipeline method)

## Test Loan for Validation
```
Loan GUID: 6c2ce013-55b5-4225-a5f7-eba070db2b0b
Loan ID: 960-109843
Borrower: Jerome Muniken
Property: 1731 O St, Heyburn, ID 83336
Encompass DSCR: 1.00
Pipeline DSCR: 1.03 (3.1% difference - MATCH)
```
