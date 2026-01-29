# DSCR Refinance Automation Platform

Automated DSCR (Debt Service Coverage Ratio) loan origination platform for investment properties. From lead capture through funding, with real-time analytics and Encompass LOS integration.

## Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │           Web Dashboard                  │
                                    │    (Next.js + shadcn/ui + Tailwind)     │
                                    └────────────────────┬────────────────────┘
                                                         │
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Cloud Run (API)                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │    Lead      │  │   Credit     │  │  Valuation   │  │   Decision   │                 │
│  │   Service    │  │   Service    │  │   Service    │  │   Service    │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Workflow   │  │   Document   │  │   Closing    │  │  Analytics   │                 │
│  │    Engine    │  │   Service    │  │   Service    │  │   Service    │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Neon Postgres  │  │  Upstash Redis  │  │  Cloud Storage  │  │    Pub/Sub      │
│   (Database)    │  │    (Cache)      │  │   (Documents)   │  │   (Events)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │    Encompass    │
                          │   (LOS - SoR)   │
                          └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Google Cloud SDK
- Terraform 1.5+

### Local Development

```bash
# Clone repository
git clone https://github.com/your-org/Automated_DSCR_Loans.git
cd Automated_DSCR_Loans

# Install API dependencies
cd src && npm install

# Install web dependencies
cd ../web && npm install

# Start development servers
npm run dev          # Frontend on :3000
cd ../src && npm run dev  # API on :3001
```

### Deploy to GCP

```bash
# Initial setup (run once)
./infra/scripts/setup.sh

# Deploy infrastructure
cd infra/terraform
terraform apply -var-file=environments/dev/terraform.tfvars

# Deploy application
gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENV=dev
```

## Project Structure

```
.
├── src/                      # Backend API
│   ├── services/
│   │   ├── analytics/        # Funnel & pipeline analytics
│   │   ├── audit/            # Audit trail & compliance
│   │   ├── borrower/         # Borrower management
│   │   ├── closing/          # Closing coordination
│   │   ├── credit/           # Credit pulls & scoring
│   │   ├── decision/         # Automated decisioning
│   │   ├── document/         # Document management
│   │   ├── dscr/             # DSCR calculations
│   │   ├── encompass/        # Encompass LOS integration
│   │   ├── lead/             # Lead capture & management
│   │   ├── postclose/        # Post-close & investor delivery
│   │   ├── pricing/          # Rate & fee engine
│   │   ├── rules/            # Business rules engine
│   │   ├── valuation/        # Property valuation & AVM
│   │   └── workflow/         # Milestone & task orchestration
│   └── types/                # Shared TypeScript types
│
├── web/                      # Frontend Dashboard
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   │   ├── analytics/    # Funnel & pipeline analytics
│   │   │   ├── applications/ # Loan application management
│   │   │   ├── leads/        # Lead management
│   │   │   └── tasks/        # Task queue
│   │   ├── components/       # React components
│   │   │   ├── analytics/    # Charts & metrics
│   │   │   ├── applications/ # Application components
│   │   │   ├── leads/        # Lead components
│   │   │   ├── shared/       # Layout & common components
│   │   │   └── ui/           # shadcn/ui components
│   │   └── lib/              # Utilities & API client
│   └── public/               # Static assets
│
├── infra/                    # Infrastructure as Code
│   ├── terraform/            # GCP resources
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── environments/
│   │       ├── dev/
│   │       └── prod/
│   ├── docker/               # Container definitions
│   │   ├── Dockerfile.api
│   │   └── Dockerfile.frontend
│   └── scripts/              # Setup scripts
│
├── docs/                     # Documentation
│   ├── 01-SYSTEM-OVERVIEW.md
│   ├── 02-HIGH-LEVEL-ARCHITECTURE.md
│   ├── 03-ENCOMPASS-INTEGRATION.md
│   ├── 04-DOMAIN-MODEL.md
│   └── api/                  # OpenAPI specs
│
├── tests/                    # Integration tests
├── db/                       # Database migrations
└── cloudbuild.yaml           # CI/CD pipeline
```

## Core Features

### Lead Management
- Lead capture from multiple sources
- Automated scoring and prioritization
- Deduplication and data enrichment
- Assignment and routing

### DSCR Calculation
- Automated income/expense analysis
- Property NOI calculation
- Multiple DSCR scenarios (actual, market, pro-forma)
- LTV/CLTV computation

### Automated Decisioning
- Rules-based eligibility checks
- Credit score analysis
- Property type validation
- Risk-based pricing

### Pipeline Analytics
- Funnel conversion metrics
- Pipeline aging analysis
- Marketing attribution
- LO performance tracking

### Workflow Orchestration
- Milestone-based processing
- SLA monitoring
- Condition tracking
- Task assignment

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript |
| UI Components | shadcn/ui, Tailwind CSS, Radix UI |
| Charts | Recharts |
| Data Fetching | TanStack Query |
| Tables | TanStack Table |
| Backend | Node.js, TypeScript, Fastify |
| Database | Neon (Serverless Postgres) |
| Cache | Upstash Redis |
| Auth | Firebase Authentication |
| Storage | Google Cloud Storage |
| Events | Google Pub/Sub |
| Hosting | Google Cloud Run |
| CI/CD | Google Cloud Build |
| IaC | Terraform |

## API Documentation

OpenAPI specification available at `docs/api/openapi.yaml`.

Key endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/leads` | List leads with filters |
| `POST /api/v1/leads` | Create new lead |
| `GET /api/v1/applications` | List loan applications |
| `GET /api/v1/applications/:id` | Get application details |
| `GET /api/v1/analytics/funnel` | Funnel conversion metrics |
| `GET /api/v1/analytics/pipeline` | Pipeline volume & aging |
| `GET /api/v1/analytics/marketing` | Marketing attribution |

## Environment Variables

### API Service

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string |
| `REDIS_URL` | Upstash Redis connection string |
| `FIREBASE_CONFIG` | Firebase admin SDK config |
| `GCP_PROJECT_ID` | GCP project ID |
| `ENCOMPASS_CLIENT_ID` | Encompass API client ID |
| `ENCOMPASS_CLIENT_SECRET` | Encompass API secret |

### Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_FIREBASE_CONFIG` | Firebase client config |

## Cost Estimates (GCP)

| Service | Monthly Cost |
|---------|-------------|
| Cloud Run (Frontend + API) | $20-50 |
| Neon Postgres | $0-25 |
| Firebase Auth | $0 (free tier) |
| Upstash Redis | $0-10 |
| Cloud Storage | $1-5 |
| Pub/Sub | $1-5 |
| **Total** | **$22-95/mo** |

*Costs scale with usage. Cloud Run scales to zero when idle.*

## Documentation

| Document | Description |
|----------|-------------|
| [System Overview](docs/01-SYSTEM-OVERVIEW.md) | Executive summary and philosophy |
| [Architecture](docs/02-HIGH-LEVEL-ARCHITECTURE.md) | Detailed architecture |
| [Encompass Integration](docs/03-ENCOMPASS-INTEGRATION.md) | LOS integration details |
| [Domain Model](docs/04-DOMAIN-MODEL.md) | Data models and relationships |
| [Infrastructure](infra/README.md) | GCP deployment guide |

## Development

### Running Tests

```bash
cd tests && npm test
```

### Linting

```bash
# Frontend
cd web && npm run lint

# Backend
cd src && npm run lint
```

### Building

```bash
# Frontend
cd web && npm run build

# Backend
cd src && npm run build
```

## License

Proprietary. All rights reserved.
