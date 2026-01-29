# DSCR Loan Platform API

FastAPI backend for the DSCR Loan Automation Platform.

## Requirements

- Python 3.11+
- pip or uv for package management

## Setup

1. Create a virtual environment:

```bash
cd api
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -e .
# Or with dev dependencies:
pip install -e ".[dev]"
```

3. Copy the environment file:

```bash
cp .env.example .env
```

4. (Optional) Configure environment variables in `.env`:
   - `DATABASE_URL`: PostgreSQL connection string (uses in-memory storage if not set)
   - `ENCOMPASS_CLIENT_ID`, `ENCOMPASS_CLIENT_SECRET`, `ENCOMPASS_INSTANCE_ID`: Encompass LOS credentials (uses stub if not set)

## Running the Server

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Endpoints

### Leads
- `GET /api/v1/leads` - List leads with pagination and filtering
- `GET /api/v1/leads/{id}` - Get lead by ID
- `POST /api/v1/leads` - Create a new lead
- `PATCH /api/v1/leads/{id}` - Update a lead
- `DELETE /api/v1/leads/{id}` - Delete a lead

### Applications
- `GET /api/v1/applications` - List applications
- `GET /api/v1/applications/{id}` - Get application by ID
- `POST /api/v1/applications` - Create an application
- `PATCH /api/v1/applications/{id}/milestone` - Update milestone

### Analytics
- `GET /api/v1/analytics/funnel` - Funnel conversion metrics
- `GET /api/v1/analytics/contact-methods` - Conversion by contact method
- `GET /api/v1/analytics/pipeline` - Pipeline metrics by milestone

### Offers
- `GET /api/v1/offers/{token}` - Get offer details by token
- `POST /api/v1/offers/verify` - Verify offer and push to Encompass

## Project Structure

```
api/
├── app/
│   ├── adapters/          # External service integrations
│   │   └── encompass.py   # Encompass LOS client
│   ├── db/                # Database layer
│   │   └── connection.py  # PostgreSQL connection
│   ├── models/            # Pydantic models
│   │   ├── user.py
│   │   ├── lead.py
│   │   ├── application.py
│   │   ├── analytics.py
│   │   └── common.py
│   ├── routers/           # API routes
│   │   ├── leads.py
│   │   ├── applications.py
│   │   ├── analytics.py
│   │   └── offers.py
│   ├── services/          # Business logic
│   └── main.py            # FastAPI app
├── pyproject.toml         # Dependencies
└── README.md
```
