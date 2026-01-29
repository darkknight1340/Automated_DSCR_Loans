# Repository Structure & Service Interfaces

## Monorepo Structure

```
dscr-platform/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # CI pipeline
│   │   ├── cd-staging.yml            # Deploy to staging
│   │   ├── cd-production.yml         # Deploy to production
│   │   └── security-scan.yml         # Security scanning
│   └── CODEOWNERS
│
├── apps/
│   ├── api/                          # Main API service
│   │   ├── src/
│   │   │   ├── routes/               # API routes
│   │   │   ├── middleware/           # Express middleware
│   │   │   ├── controllers/          # Request handlers
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── worker/                       # Background job processor
│   │   ├── src/
│   │   │   ├── jobs/                 # Job handlers
│   │   │   ├── queues/               # Queue definitions
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── encompass-sync/               # Encompass sync service
│   │   ├── src/
│   │   │   ├── sync/                 # Sync logic
│   │   │   ├── webhooks/             # Webhook handlers
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── lo-portal/                    # LO web application
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── uw-workbench/                 # UW web application
│       ├── src/
│       ├── public/
│       ├── package.json
│       └── Dockerfile
│
├── packages/
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── domain/               # Domain models
│   │   │   ├── api/                  # API request/response types
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── core/                         # Core business logic
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── lead/
│   │   │   │   ├── application/
│   │   │   │   ├── borrower/
│   │   │   │   ├── property/
│   │   │   │   ├── dscr/
│   │   │   │   ├── credit/
│   │   │   │   ├── avm/
│   │   │   │   ├── rules/
│   │   │   │   ├── pricing/
│   │   │   │   ├── conditions/
│   │   │   │   ├── documents/
│   │   │   │   ├── workflow/
│   │   │   │   └── decision/
│   │   │   ├── repositories/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── encompass/                    # Encompass integration
│   │   ├── src/
│   │   │   ├── client/               # API client
│   │   │   ├── adapter/              # Field mapping
│   │   │   ├── milestone/            # Milestone management
│   │   │   ├── condition/            # Condition management
│   │   │   ├── services/             # Service proxies
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── integrations/                 # External integrations
│   │   ├── src/
│   │   │   ├── credit/               # Credit vendors
│   │   │   ├── avm/                  # AVM vendors
│   │   │   ├── verification/         # Verification vendors
│   │   │   ├── title/                # Title companies
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── database/                     # Database layer
│   │   ├── src/
│   │   │   ├── repositories/
│   │   │   ├── migrations/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── queue/                        # Queue abstractions
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── cache/                        # Cache abstractions
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── audit/                        # Audit logging
│   │   ├── src/
│   │   └── package.json
│   │
│   └── utils/                        # Shared utilities
│       ├── src/
│       │   ├── crypto/               # Encryption utilities
│       │   ├── validation/           # Validators
│       │   ├── formatting/           # Formatters
│       │   └── index.ts
│       └── package.json
│
├── infrastructure/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── vpc/
│   │   │   ├── eks/
│   │   │   ├── rds/
│   │   │   ├── redis/
│   │   │   └── s3/
│   │   ├── environments/
│   │   │   ├── staging/
│   │   │   └── production/
│   │   └── main.tf
│   │
│   ├── kubernetes/
│   │   ├── base/
│   │   │   ├── deployments/
│   │   │   ├── services/
│   │   │   ├── configmaps/
│   │   │   └── secrets/
│   │   └── overlays/
│   │       ├── staging/
│   │       └── production/
│   │
│   └── docker/
│       └── docker-compose.yml        # Local development
│
├── db/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_add_indexes.sql
│       └── ...
│
├── docs/
│   ├── 01-SYSTEM-OVERVIEW.md
│   ├── 02-HIGH-LEVEL-ARCHITECTURE.md
│   ├── 03-ENCOMPASS-INTEGRATION.md
│   ├── 04-DOMAIN-MODEL.md
│   ├── ...
│   └── api/
│       └── openapi.yaml
│
├── examples/
│   ├── payloads/
│   │   ├── lead-intake.json
│   │   ├── avm-report.json
│   │   ├── credit-pull.json
│   │   └── ...
│   ├── rules/
│   │   └── dscr-eligibility-rules.json
│   └── pricing/
│       └── dscr-pricing-card.json
│
├── tests/
│   ├── unit/
│   │   ├── dscr/
│   │   ├── rules/
│   │   ├── pricing/
│   │   └── ...
│   ├── integration/
│   │   ├── encompass/
│   │   ├── credit/
│   │   └── ...
│   └── e2e/
│       └── flows/
│
├── scripts/
│   ├── setup-local.sh
│   ├── run-migrations.sh
│   └── seed-data.sh
│
├── package.json                      # Root package.json (workspaces)
├── pnpm-workspace.yaml              # PNPM workspace config
├── tsconfig.base.json               # Base TypeScript config
├── .eslintrc.js                     # ESLint config
├── .prettierrc                      # Prettier config
└── README.md
```

## Service Interfaces

### API Service (OpenAPI Endpoints)

```yaml
openapi: 3.0.3
info:
  title: DSCR Platform API
  version: 1.0.0

paths:
  # Lead Management
  /api/v1/leads:
    post:
      summary: Create new lead
      tags: [Leads]
    get:
      summary: List leads
      tags: [Leads]

  /api/v1/leads/{leadId}:
    get:
      summary: Get lead by ID
      tags: [Leads]
    patch:
      summary: Update lead
      tags: [Leads]

  /api/v1/leads/{leadId}/score:
    post:
      summary: Score/re-score lead
      tags: [Leads]

  /api/v1/leads/{leadId}/convert:
    post:
      summary: Convert lead to application
      tags: [Leads]

  # Applications
  /api/v1/applications:
    post:
      summary: Create application
      tags: [Applications]
    get:
      summary: List applications
      tags: [Applications]

  /api/v1/applications/{applicationId}:
    get:
      summary: Get application
      tags: [Applications]
    patch:
      summary: Update application
      tags: [Applications]

  /api/v1/applications/{applicationId}/dscr:
    post:
      summary: Calculate DSCR
      tags: [DSCR]
    get:
      summary: Get latest DSCR calculation
      tags: [DSCR]

  /api/v1/applications/{applicationId}/eligibility:
    post:
      summary: Evaluate eligibility
      tags: [Rules]
    get:
      summary: Get latest eligibility evaluation
      tags: [Rules]

  /api/v1/applications/{applicationId}/pricing:
    post:
      summary: Calculate pricing
      tags: [Pricing]
    get:
      summary: Get latest pricing calculation
      tags: [Pricing]

  /api/v1/applications/{applicationId}/pricing/lock:
    post:
      summary: Lock rate
      tags: [Pricing]

  /api/v1/applications/{applicationId}/conditions:
    get:
      summary: List conditions
      tags: [Conditions]
    post:
      summary: Add condition
      tags: [Conditions]

  /api/v1/applications/{applicationId}/conditions/{conditionId}:
    patch:
      summary: Update condition
      tags: [Conditions]

  /api/v1/applications/{applicationId}/conditions/{conditionId}/clear:
    post:
      summary: Clear condition
      tags: [Conditions]

  /api/v1/applications/{applicationId}/decision:
    post:
      summary: Generate decision
      tags: [Decision]
    get:
      summary: Get latest decision
      tags: [Decision]

  /api/v1/applications/{applicationId}/documents:
    get:
      summary: List documents
      tags: [Documents]
    post:
      summary: Upload document
      tags: [Documents]

  # Credit
  /api/v1/applications/{applicationId}/credit:
    post:
      summary: Order credit report
      tags: [Credit]
    get:
      summary: Get credit reports
      tags: [Credit]

  # AVM
  /api/v1/applications/{applicationId}/avm:
    post:
      summary: Order AVM
      tags: [AVM]
    get:
      summary: Get AVM reports
      tags: [AVM]

  # Rules Administration
  /api/v1/admin/rules:
    get:
      summary: List rule versions
      tags: [Admin]
    post:
      summary: Create rule version
      tags: [Admin]

  /api/v1/admin/rules/{ruleVersionId}/activate:
    post:
      summary: Activate rule version
      tags: [Admin]

  # Pricing Administration
  /api/v1/admin/pricing-cards:
    get:
      summary: List pricing cards
      tags: [Admin]
    post:
      summary: Create pricing card
      tags: [Admin]

  /api/v1/admin/pricing-cards/{cardId}/activate:
    post:
      summary: Activate pricing card
      tags: [Admin]

  # Encompass Sync
  /api/v1/encompass/webhook:
    post:
      summary: Encompass webhook handler
      tags: [Encompass]

  /api/v1/applications/{applicationId}/encompass/sync:
    post:
      summary: Force sync to Encompass
      tags: [Encompass]
```

### Internal Service Interfaces

#### Lead Service

```typescript
interface ILeadService {
  createLead(request: LeadCreateRequest): Promise<Lead>;
  getLead(id: string): Promise<Lead | null>;
  updateLead(id: string, updates: Partial<Lead>): Promise<Lead>;
  scoreLead(id: string): Promise<LeadScoringResult>;
  qualifyLead(id: string, notes?: string): Promise<Lead>;
  convertLead(id: string): Promise<LeadConversionResult>;
  listLeads(filters: LeadFilters, pagination: Pagination): Promise<PaginatedResponse<Lead>>;
}
```

#### Application Service

```typescript
interface IApplicationService {
  createApplication(request: ApplicationCreateRequest): Promise<Application>;
  getApplication(id: string): Promise<Application | null>;
  updateApplication(id: string, updates: Partial<Application>): Promise<Application>;
  submitApplication(id: string): Promise<Application>;
  listApplications(filters: ApplicationFilters, pagination: Pagination): Promise<PaginatedResponse<Application>>;
}
```

#### DSCR Service

```typescript
interface IDSCRService {
  calculate(input: DSCRCalculationInput): Promise<DSCRCalculationResult>;
  calculateScenarios(input: DSCRCalculationInput): Promise<DSCRScenario[]>;
  calculateRequiredRent(input: Omit<DSCRCalculationInput, 'grossMonthlyRent'>, targetDSCR: number): Promise<Money>;
  calculateMaxLoanAmount(input: Omit<DSCRCalculationInput, 'loanAmount'>, targetDSCR: number): Promise<Money>;
}
```

#### Rules Service

```typescript
interface IRulesService {
  evaluate(ruleSetName: string, context: RuleContext, options: EvaluationOptions): Promise<RuleEvaluation>;
  getActiveRuleVersion(ruleSetName: string): Promise<RuleVersion | null>;
  createRuleVersion(ruleVersion: Omit<RuleVersion, 'id' | 'createdAt'>): Promise<RuleVersion>;
  activateRuleVersion(id: string): Promise<void>;
  generateExplanation(evaluation: RuleEvaluation): string;
}
```

#### Pricing Service

```typescript
interface IPricingService {
  calculatePricing(input: PricingInput): Promise<PricingResult>;
  lockRate(request: RateLockRequest): Promise<RateLockResult>;
  validateLock(calculationId: string): Promise<LockValidation>;
  getActivePricingCard(productType: string): Promise<PricingCard | null>;
  createPricingCard(card: Omit<PricingCard, 'id' | 'createdAt'>): Promise<PricingCard>;
  activatePricingCard(id: string): Promise<void>;
}
```

#### Condition Service

```typescript
interface IConditionService {
  createCondition(request: ConditionCreateRequest): Promise<Condition>;
  getCondition(id: string): Promise<Condition | null>;
  listConditions(applicationId: string, filters?: ConditionFilters): Promise<Condition[]>;
  clearCondition(id: string, request: ClearConditionRequest): Promise<Condition>;
  reopenCondition(id: string, reason: string): Promise<Condition>;
  evaluateAutoClear(applicationId: string): Promise<ClearResult[]>;
}
```

#### Encompass Adapter

```typescript
interface IEncompassAdapter {
  createOrGetLoan(application: Application, borrower: Borrower, property: Property): Promise<EncompassLink>;
  syncToEncompass(applicationId: string, data: Record<string, unknown>): Promise<void>;
  syncFromEncompass(encompassLoanGuid: string): Promise<Record<string, unknown>>;
  evaluateMilestoneAdvancement(applicationId: string): Promise<MilestoneAdvanceResult>;
  advanceMilestone(applicationId: string, milestone: string, reason: string): Promise<void>;
  addCondition(applicationId: string, condition: ConditionDef): Promise<EncompassCondition>;
  clearCondition(applicationId: string, conditionId: string, notes: string, clearedBy: string): Promise<void>;
}
```

#### Credit Service

```typescript
interface ICreditService {
  orderCredit(request: CreditOrderRequest): Promise<CreditOrderResult>;
  getCreditReport(id: string): Promise<CreditReport | null>;
  getCreditReportsForApplication(applicationId: string): Promise<CreditReport[]>;
  processCallback(callbackData: CreditCallbackData): Promise<void>;
}
```

#### AVM Service

```typescript
interface IAVMService {
  orderAVM(request: AVMOrderRequest): Promise<AVMOrderResult>;
  getAVMReport(id: string): Promise<AVMReport | null>;
  getAVMReportsForProperty(propertyId: string): Promise<AVMReport[]>;
  processCallback(callbackData: AVMCallbackData): Promise<void>;
}
```

#### Document Service

```typescript
interface IDocumentService {
  uploadDocument(request: DocumentUploadRequest): Promise<Document>;
  getDocument(id: string): Promise<Document | null>;
  listDocuments(applicationId: string, filters?: DocumentFilters): Promise<Document[]>;
  classifyDocument(id: string): Promise<ClassificationResult>;
  verifyDocument(id: string, verifiedBy: string): Promise<Document>;
  syncToEncompass(documentId: string): Promise<void>;
}
```

#### Decision Service

```typescript
interface IDecisionService {
  generateDecision(applicationId: string, type: DecisionType): Promise<Decision>;
  getDecision(id: string): Promise<Decision | null>;
  getLatestDecision(applicationId: string): Promise<Decision | null>;
  generateExplanation(decision: Decision): Promise<DecisionExplanation>;
  overrideDecision(id: string, request: OverrideRequest): Promise<Decision>;
}
```

#### Audit Service

```typescript
interface IAuditService {
  log(event: AuditEventInput): Promise<void>;
  logDataAccess(access: DataAccessInput): Promise<void>;
  getAuditTrail(applicationId: string, filters?: AuditFilters): Promise<AuditEvent[]>;
}
```

### Event Bus Interface

```typescript
interface IEventBus {
  emit(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}

type EventHandler = (event: DomainEvent) => Promise<void>;
```

### Queue Interface

```typescript
interface IQueue<T> {
  add(job: T, options?: JobOptions): Promise<string>;
  process(handler: JobHandler<T>): void;
  getJob(jobId: string): Promise<Job<T> | null>;
  removeJob(jobId: string): Promise<void>;
}

type JobHandler<T> = (job: Job<T>) => Promise<void>;
```

### Cache Interface

```typescript
interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```
