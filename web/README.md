# DSCR Platform Web Dashboard

Next.js 14 dashboard for DSCR loan funnel analytics, lead tracking, and pipeline management.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: shadcn/ui + Tailwind CSS + Radix UI
- **Charts**: Recharts
- **Data Fetching**: TanStack Query (React Query)
- **Tables**: TanStack Table
- **Auth**: Firebase Authentication

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Environment Variables

Create `.env.local`:

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# Firebase Configuration (JSON string)
NEXT_PUBLIC_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"..."}
```

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── layout.tsx            # Sidebar + header layout
│   │   ├── page.tsx              # Dashboard home
│   │   ├── analytics/
│   │   │   ├── page.tsx          # Funnel analytics
│   │   │   ├── pipeline/page.tsx # Pipeline volume & aging
│   │   │   └── risk/page.tsx     # DSCR/LTV distribution
│   │   ├── leads/
│   │   │   ├── page.tsx          # Lead list
│   │   │   └── [id]/page.tsx     # Lead detail
│   │   └── applications/
│   │       ├── page.tsx          # Application pipeline
│   │       └── [id]/page.tsx     # Application detail
│   └── layout.tsx                # Root layout
│
├── components/
│   ├── analytics/                # Analytics components
│   │   ├── FunnelChart.tsx       # Visual conversion funnel
│   │   ├── ConversionMetrics.tsx # Stage-to-stage KPIs
│   │   ├── MarketingMetrics.tsx  # UTM & campaign attribution
│   │   ├── PipelineAging.tsx     # Days-in-stage analysis
│   │   └── DSCRDistribution.tsx  # Risk distribution charts
│   │
│   ├── leads/                    # Lead management components
│   │   ├── LeadTable.tsx         # Sortable/filterable lead list
│   │   └── LeadScoreIndicator.tsx # Color-coded score badge
│   │
│   ├── applications/             # Application components
│   │   ├── ApplicationTable.tsx  # Pipeline table view
│   │   ├── MilestoneTracker.tsx  # Visual progress indicator
│   │   └── DSCRGauge.tsx         # DSCR ratio visualization
│   │
│   ├── shared/                   # Common components
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── Header.tsx            # Top header with user menu
│   │   └── StatusBadge.tsx       # Status indicator badges
│   │
│   └── ui/                       # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── table.tsx
│       └── ...
│
├── lib/
│   ├── api-client.ts             # API wrapper with auth
│   ├── firebase.ts               # Firebase configuration
│   ├── auth-context.tsx          # Auth context provider
│   ├── providers.tsx             # App providers (Query, Auth)
│   └── utils.ts                  # Utility functions
│
└── types/
    └── index.ts                  # Shared TypeScript types
```

## Pages

### Dashboard Home (`/`)
Overview with key metrics and recent activity.

### Analytics (`/analytics`)
Funnel conversion visualization with marketing attribution:
- Lead → Contacted → Qualified → Application → Pre-Approved → Funded
- UTM source/medium breakdown
- Email and web conversion metrics

### Pipeline (`/analytics/pipeline`)
Real-time pipeline volume and aging analysis:
- Pipeline by milestone (count and $ volume)
- Days-in-stage analysis
- SLA breach monitoring
- Velocity trends

### Risk Distribution (`/analytics/risk`)
Portfolio risk metrics:
- DSCR ratio histogram
- LTV distribution
- Credit score tiers
- Geographic concentration

### Leads (`/leads`)
Lead management for loan officers:
- Sortable/filterable table
- Lead score visualization (0-100)
- Quick actions (Contact, Qualify, Disqualify)
- Activity timeline

### Applications (`/applications`)
Loan pipeline management:
- Milestone progress tracking
- DSCR/LTV quick view
- Condition count badges
- Filter by status, LO, date range

### Application Detail (`/applications/[id]`)
Complete loan view with tabs:
- Summary: Key metrics, decision status
- DSCR: Calculation breakdown
- Documents: Checklist with upload
- Conditions: PTD/PTC/PTF tracking
- Workflow: Milestone history

## Components

### Analytics Components

| Component | Description |
|-----------|-------------|
| `FunnelChart` | Visual funnel with counts and percentages |
| `ConversionMetrics` | KPI cards for stage-to-stage conversion |
| `MarketingMetrics` | UTM breakdown, email/web metrics |
| `PipelineAging` | Days-in-stage heatmap and SLA status |
| `DSCRDistribution` | DSCR/LTV/Credit histograms |

### Application Components

| Component | Description |
|-----------|-------------|
| `ApplicationTable` | Pipeline table with filters |
| `MilestoneTracker` | Visual step progress indicator |
| `DSCRGauge` | Radial gauge for DSCR ratio |

### Lead Components

| Component | Description |
|-----------|-------------|
| `LeadTable` | TanStack Table with sorting/filtering |
| `LeadScoreIndicator` | Color-coded score badge (red/yellow/green) |

## API Integration

The dashboard connects to the backend API at `NEXT_PUBLIC_API_URL`. All requests include Firebase ID tokens for authentication.

### Key Endpoints Used

```typescript
// Analytics
GET /api/v1/analytics/funnel
GET /api/v1/analytics/marketing
GET /api/v1/analytics/pipeline
GET /api/v1/analytics/risk-distribution

// Leads
GET /api/v1/leads
GET /api/v1/leads/:id
POST /api/v1/leads
PATCH /api/v1/leads/:id

// Applications
GET /api/v1/applications
GET /api/v1/applications/:id
GET /api/v1/applications/:id/dscr
GET /api/v1/applications/:id/documents
GET /api/v1/applications/:id/conditions
```

## Authentication

Firebase Authentication handles user sessions:

```tsx
import { useAuth } from '@/lib/auth-context';

function MyComponent() {
  const { user, loading, signIn, signOut, getToken } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <LoginForm />;

  return <Dashboard />;
}
```

Protected routes redirect to login when unauthenticated.

## Adding shadcn/ui Components

```bash
# Add a new component
npx shadcn@latest add [component-name]

# Examples
npx shadcn@latest add dialog
npx shadcn@latest add form
npx shadcn@latest add toast
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Docker

Build the container:

```bash
docker build -f ../infra/docker/Dockerfile.frontend -t dscr-frontend ..
```

The Dockerfile uses standalone output mode for optimized container size.

## Deployment

Deployed to Google Cloud Run via Cloud Build:

```bash
# From project root
gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENV=dev
```

See [Infrastructure README](../infra/README.md) for full deployment guide.

## User Roles

| Role | Primary Views |
|------|---------------|
| Loan Officers | My Leads, My Pipeline, Lead Detail |
| Processors | Task Queue, Document Checklist, Conditions |
| Management | Funnel Analytics, Pipeline Dashboard, LO Performance |
