# DSCR Refinance Automation Platform - System Overview

## Executive Summary

This platform automates DSCR (Debt Service Coverage Ratio) refinance loans for investment properties, from lead intake through post-close investor delivery. **Encompass is the authoritative System of Record (LOS)**; this platform serves as the automation, orchestration, decisioning, and intelligence layer.

## System Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DSCR AUTOMATION PLATFORM                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Lead &    │  │  Decisioning│  │ Orchestration│  │  Analytics  │        │
│  │    CRM      │  │   Engine    │  │    Engine   │  │  & Audit    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                   │                                        │
│                          ┌───────┴───────┐                                 │
│                          │  Encompass    │                                 │
│                          │  Integration  │                                 │
│                          │    Layer      │                                 │
│                          └───────┬───────┘                                 │
└──────────────────────────────────┼─────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    │    ICE ENCOMPASS (LOS)      │
                    │    System of Record         │
                    │                             │
                    └─────────────────────────────┘
```

## Core Principles

### 1. Encompass-Centric Design
- All loan-critical data persists in Encompass
- Platform maintains operational/analytical shadow state
- Bidirectional sync with conflict resolution favoring Encompass
- Every automated decision is traceable to Encompass fields

### 2. Automation with Human Override
- Automate 80%+ of routine decisioning
- Human-in-the-loop for exceptions and final underwriting
- Clear escalation paths
- Full audit trail of human interventions

### 3. Regulatory-Ready
- Every decision explainable
- Every rule versioned
- Every data point sourced
- Fair lending compliance built-in

### 4. Scale-Ready Architecture
- Start with 100 loans/month
- Scale to 10,000 loans/month without redesign
- Horizontal scaling at every tier
- Event-driven, eventually consistent

## DSCR Loan Product Overview

### What is a DSCR Loan?
- Business-purpose loan for investment properties
- Qualification based on property cash flow, not borrower income
- DSCR = Property NOI / Annual Debt Service
- Typical thresholds: 1.0x minimum, 1.25x preferred

### Borrower Types
1. **Individual Investors** - Personal guarantee required
2. **LLCs/Corps** - Entity veil with personal guarantor(s)
3. **Trusts** - With identified trustees as guarantors

### Property Types
- Single-family rentals (SFR)
- 2-4 unit residential
- 5+ unit multifamily (up to product limits)
- Short-term rentals (STR) with special DSCR calc

## Loan Lifecycle Stages

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  LEAD   │──▶│ INTAKE  │──▶│ ENRICH  │──▶│ QUALIFY │──▶│ PRICE   │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                                                             │
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐        │
│  POST   │◀──│  FUND   │◀──│  CLOSE  │◀──│UNDERWRITE│◀──────┘
│ CLOSE   │   │         │   │         │   │         │
└─────────┘   └─────────┘   └─────────┘   └─────────┘
```

### Stage Definitions

| Stage | System | Encompass State | Key Activities |
|-------|--------|-----------------|----------------|
| Lead | Platform CRM | None | Capture, dedupe, qualify |
| Intake | Platform | Loan created | Application data collection |
| Enrich | Platform → Encompass | Fields populated | Credit, AVM, entity verification |
| Qualify | Platform | Custom fields set | DSCR calc, eligibility rules |
| Price | Platform → Encompass | Pricing fields set | Rate/fee determination |
| Pre-Approval | Both | Milestone: Pre-Approved | Conditional approval issued |
| Processing | Encompass primary | Milestone: Processing | Docs, conditions, verification |
| Underwriting | Both | Milestone: Submitted to UW | Human review, final decision |
| Closing | Encompass primary | Milestone: Clear to Close | Docs out, closing scheduled |
| Funding | Encompass | Milestone: Funded | Wire, recording |
| Post-Close | Both | Milestone: Completion | QC, investor delivery |

## Key Integration Points

### External Services (Orchestrated by Platform)
- **Credit**: Experian, Equifax, TransUnion via credit vendors
- **Valuation**: CoreLogic, HouseCanary, Black Knight for AVM; AMC for appraisals
- **Verification**: Plaid (bank), Argyle (employment), various for entity
- **Compliance**: MISMO, NMLS, sanctions screening
- **Title/Escrow**: Various title companies via API
- **Insurance**: Hazard, flood verification
- **Investor**: Delivery to secondary market

### Encompass Services (Native Integration)
- Encompass Credit Service
- Encompass Appraisal Service
- Encompass Closing Service
- Encompass eClose
- Custom plugins for DSCR-specific workflows

## Data Flow Architecture

```
External World                    Platform                         Encompass
─────────────────────────────────────────────────────────────────────────────

Borrower App    ──POST──▶  Lead Service    ──webhook──▶  Loan Created
                               │                              │
Credit Bureau   ◀──pull──  Credit Service  ──write──▶   Credit Fields
                               │                              │
AVM Provider    ◀──request─ Valuation Svc  ──write──▶   AVM CX.* Fields
                               │                              │
                          Rules Engine     ──write──▶   Eligibility Fields
                               │                              │
                          Pricing Engine   ──write──▶   Pricing Fields
                               │                              │
                          Decision Engine  ──write──▶   Decision + Conditions
                               │                              │
LO/UW Portal    ◀──read──  Workbench       ◀──read───   Loan Data
                               │                              │
                          [Human Review]   ──write──▶   Override/Approval
                               │                              │
Title Company   ◀──order── Closing Svc     ◀──notify──  Milestone: CTC
                               │                              │
Warehouse Bank  ◀──fund──  Funding Svc     ◀──notify──  Milestone: Fund
                               │                              │
Investor        ◀──deliver─ Post-Close     ──write──▶   Investor Fields
```

## Technology Stack

### Core Platform
- **Language**: TypeScript (Node.js runtime)
- **API Framework**: Fastify with OpenAPI
- **Database**: PostgreSQL 15+ with TimescaleDB extension
- **Cache**: Redis Cluster
- **Queue**: BullMQ (Redis-backed)
- **Search**: Elasticsearch (audit logs, docs)

### Encompass Integration
- **SDK**: Encompass SDK for .NET (via service wrapper)
- **API**: Encompass REST API v3
- **Webhooks**: Encompass webhook subscriptions
- **Custom**: Input Form Builder plugins

### Infrastructure
- **Container**: Docker/Kubernetes
- **Cloud**: AWS (primary) with DR in separate region
- **Secrets**: HashiCorp Vault
- **Monitoring**: Datadog + PagerDuty
- **Logging**: Structured JSON → ELK stack

## Security Model

### Data Classification
- **PII**: SSN, DOB, financial data → encrypted at rest + in transit
- **PHI**: None expected
- **Confidential**: Loan terms, pricing → access controlled
- **Internal**: Operational data → standard controls

### Access Control
- Role-based (RBAC) for platform
- Encompass personas synced to platform roles
- MFA required for all human users
- API keys with scoped permissions for services

### Audit Requirements
- Every data access logged
- Every decision recorded with inputs
- Every human action attributed
- 7-year retention minimum

## Reliability Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Availability | 99.9% | Monthly uptime |
| Loan Create Latency | < 5s | P95 |
| Decision Latency | < 2s | P95 |
| Data Loss | Zero | RPO = 0 |
| Recovery Time | < 1 hour | RTO |
| Encompass Sync Lag | < 30s | P95 |

## Success Metrics

### Operational
- **Time to Decision**: Lead → Pre-Approval < 4 hours (auto-qualified)
- **Touch Rate**: < 20% of loans require human pre-UW intervention
- **Error Rate**: < 0.1% of loans with data quality issues
- **Sync Failures**: < 0.01% of Encompass writes fail

### Business
- **Conversion**: Lead → Funded > 15%
- **Cycle Time**: Application → Funded < 21 days
- **Cost per Loan**: < $2,000 fully loaded
- **Customer Satisfaction**: NPS > 50
