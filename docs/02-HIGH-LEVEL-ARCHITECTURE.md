# High-Level Architecture

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    API GATEWAY                                          │
│                         (Kong / AWS API Gateway + WAF)                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│   │ Rate     │  │ Auth     │  │ Request  │  │ Routing  │  │ Response │               │
│   │ Limiting │  │ (JWT)    │  │ Validate │  │          │  │ Transform│               │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘               │
└─────────────────────────────────────┬───────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│    PUBLIC     │           │   INTERNAL    │           │  ENCOMPASS    │
│    SERVICES   │           │   SERVICES    │           │   ADAPTER     │
├───────────────┤           ├───────────────┤           ├───────────────┤
│ lead-intake   │           │ rules-engine  │           │ loan-sync     │
│ borrower-app  │           │ pricing-engine│           │ field-mapper  │
│ lo-portal     │           │ decision-svc  │           │ milestone-mgr │
│ uw-workbench  │           │ workflow-orch │           │ condition-mgr │
│ doc-portal    │           │ audit-service │           │ service-proxy │
└───────┬───────┘           └───────┬───────┘           └───────┬───────┘
        │                           │                           │
        └───────────────────────────┴───────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ PostgreSQL│   │   Redis   │   │   S3/Blob │
            │ (Primary) │   │ (Cache/Q) │   │ (Docs)    │
            └───────────┘   └───────────┘   └───────────┘
```

## Domain Services Detail

### 1. Lead & CRM Domain
```
┌─────────────────────────────────────────────────────────────┐
│                    LEAD DOMAIN                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Lead Intake │  │ Lead        │  │ Lead        │         │
│  │ API         │  │ Scoring     │  │ Assignment  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
│                   ┌──────┴──────┐                           │
│                   │ Lead Store  │                           │
│                   │ (pre-LOS)   │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### 2. Loan Origination Domain
```
┌─────────────────────────────────────────────────────────────┐
│                  ORIGINATION DOMAIN                         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Application │  │ Borrower    │  │ Property    │         │
│  │ Service     │  │ Service     │  │ Service     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐         │
│  │ Entity      │  │ Guarantor   │  │ Rent Roll   │         │
│  │ Service     │  │ Service     │  │ Service     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              │   Loan Aggregate      │                      │
│              │   (Platform State)    │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### 3. Enrichment Domain
```
┌─────────────────────────────────────────────────────────────┐
│                  ENRICHMENT DOMAIN                          │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Credit      │  │ AVM/        │  │ Entity      │         │
│  │ Service     │  │ Appraisal   │  │ Verify      │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐         │
│  │ Bank        │  │ Title       │  │ Insurance   │         │
│  │ Verify      │  │ Search      │  │ Verify      │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              │  Enrichment Results   │                      │
│              │  (written to ENC)     │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### 4. Decisioning Domain
```
┌─────────────────────────────────────────────────────────────┐
│                  DECISIONING DOMAIN                         │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              RULES ENGINE                        │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │       │
│  │  │Eligibil-│  │Condition│  │Exception│         │       │
│  │  │ity Rules│  │Generator│  │ Router  │         │       │
│  │  └─────────┘  └─────────┘  └─────────┘         │       │
│  └─────────────────────┬───────────────────────────┘       │
│                        │                                    │
│  ┌─────────────────────┴───────────────────────────┐       │
│  │              PRICING ENGINE                      │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │       │
│  │  │Rate Card│  │ Adder   │  │Lock Desk│         │       │
│  │  │ Lookup  │  │ Engine  │  │         │         │       │
│  │  └─────────┘  └─────────┘  └─────────┘         │       │
│  └─────────────────────┬───────────────────────────┘       │
│                        │                                    │
│  ┌─────────────────────┴───────────────────────────┐       │
│  │              DECISION AGGREGATOR                 │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │       │
│  │  │ Scoring │  │Explainer│  │ Output  │         │       │
│  │  │         │  │         │  │ Builder │         │       │
│  │  └─────────┘  └─────────┘  └─────────┘         │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 5. Workflow Domain
```
┌─────────────────────────────────────────────────────────────┐
│                   WORKFLOW DOMAIN                           │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │           WORKFLOW ORCHESTRATOR                  │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │       │
│  │  │ State   │  │ Task    │  │ Event   │         │       │
│  │  │ Machine │  │ Queue   │  │ Router  │         │       │
│  │  └─────────┘  └─────────┘  └─────────┘         │       │
│  └─────────────────────┬───────────────────────────┘       │
│                        │                                    │
│  ┌─────────────────────┴───────────────────────────┐       │
│  │              MILESTONE MANAGER                   │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │       │
│  │  │ Auto-   │  │ Manual  │  │ Rollback│         │       │
│  │  │ Advance │  │ Advance │  │ Handler │         │       │
│  │  └─────────┘  └─────────┘  └─────────┘         │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## External Service Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICE ADAPTERS                            │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   CREDIT     │  │  VALUATION   │  │ VERIFICATION │                  │
│  │   ADAPTERS   │  │  ADAPTERS    │  │   ADAPTERS   │                  │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤                  │
│  │ • Experian   │  │ • CoreLogic  │  │ • Plaid      │                  │
│  │ • Equifax    │  │ • HouseCanary│  │ • Argyle     │                  │
│  │ • TransUnion │  │ • Black Knight│ │ • Truework   │                  │
│  │ • Meridian   │  │ • Clear Cap  │  │ • Finicity   │                  │
│  │   Link       │  │   (AMC)      │  │              │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   TITLE &    │  │  INSURANCE   │  │  COMPLIANCE  │                  │
│  │   ESCROW     │  │   ADAPTERS   │  │   ADAPTERS   │                  │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤                  │
│  │ • Qualia     │  │ • Hazard     │  │ • OFAC/SDN   │                  │
│  │ • Snapdocs   │  │   (multiple) │  │ • NMLS       │                  │
│  │ • Notarize   │  │ • Flood      │  │ • LoanSafe   │                  │
│  │              │  │   (CoreLogic)│  │              │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Event-Driven Architecture

### Event Flow
```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EVENT BUS (Kafka/Redis Streams)                 │
│                                                                         │
│  Topics:                                                                │
│  ├── loan.created                                                       │
│  ├── loan.updated                                                       │
│  ├── loan.milestone.changed                                             │
│  ├── credit.ordered                                                     │
│  ├── credit.received                                                    │
│  ├── avm.ordered                                                        │
│  ├── avm.received                                                       │
│  ├── eligibility.evaluated                                              │
│  ├── pricing.calculated                                                 │
│  ├── condition.added                                                    │
│  ├── condition.cleared                                                  │
│  ├── decision.made                                                      │
│  ├── document.received                                                  │
│  ├── document.classified                                                │
│  └── encompass.sync.{success|failure}                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Event Schema (Example)
```json
{
  "event_id": "evt_01HXYZ...",
  "event_type": "loan.milestone.changed",
  "aggregate_type": "loan",
  "aggregate_id": "loan_01HXYZ...",
  "encompass_loan_guid": "abc-123-...",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": 1,
  "payload": {
    "previous_milestone": "Processing",
    "new_milestone": "Submitted",
    "changed_by": "system",
    "trigger": "auto_advance"
  },
  "metadata": {
    "correlation_id": "corr_01HXYZ...",
    "causation_id": "evt_01HXYZ_prev...",
    "source_service": "milestone-manager"
  }
}
```

## Data Store Architecture

### PostgreSQL Schema Organization
```
├── schema: public
│   └── (Avoid - use domain schemas)
│
├── schema: leads
│   ├── leads
│   ├── lead_sources
│   ├── lead_scores
│   └── lead_assignments
│
├── schema: loans
│   ├── applications
│   ├── borrowers
│   ├── entities
│   ├── guarantors
│   ├── properties
│   ├── rent_rolls
│   └── encompass_links
│
├── schema: enrichment
│   ├── credit_reports
│   ├── credit_tradelines
│   ├── avm_reports
│   ├── appraisals
│   ├── entity_verifications
│   └── bank_verifications
│
├── schema: decisioning
│   ├── rule_versions
│   ├── rule_evaluations
│   ├── pricing_cards
│   ├── pricing_calculations
│   ├── conditions
│   └── decisions
│
├── schema: workflow
│   ├── workflow_instances
│   ├── workflow_tasks
│   ├── milestone_history
│   └── assignments
│
├── schema: documents
│   ├── document_registry
│   ├── document_classifications
│   └── document_versions
│
└── schema: audit
    ├── audit_events
    ├── data_access_log
    └── change_log
```

### Redis Data Structures
```
├── Cache (TTL-based)
│   ├── loan:{loan_id}:summary          # Loan summary cache
│   ├── pricing:rate_cards:{date}       # Daily rate cards
│   ├── rules:active:{product}          # Active rule sets
│   └── user:{user_id}:session          # User sessions
│
├── Queues (BullMQ)
│   ├── queue:credit:orders             # Credit pull queue
│   ├── queue:avm:orders                # AVM order queue
│   ├── queue:encompass:sync            # Sync to Encompass
│   ├── queue:documents:classify        # Doc classification
│   └── queue:notifications             # User notifications
│
└── Pub/Sub
    ├── channel:loan:{loan_id}          # Loan-specific events
    └── channel:system                  # System-wide events
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SECURITY LAYERS                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      WAF (AWS WAF / Cloudflare)                  │   │
│  │  • Rate limiting  • SQL injection  • XSS  • Bot protection      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      API Gateway                                 │   │
│  │  • JWT validation  • API key auth  • Request signing            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Service Mesh (Istio/Linkerd)               │   │
│  │  • mTLS  • Service-to-service auth  • Traffic policies          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Application Layer                           │   │
│  │  • RBAC  • Field-level encryption  • Audit logging              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Data Layer                                  │   │
│  │  • Encryption at rest (AES-256)  • Column encryption for PII    │   │
│  │  • TLS for connections  • Secrets in Vault                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AWS PRIMARY REGION (us-east-1)                   │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                          VPC                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Public Subnets                            │  │ │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │  │ │
│  │  │  │   ALB   │  │   NAT   │  │ Bastion │                      │  │ │
│  │  │  └─────────┘  └─────────┘  └─────────┘                      │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Private Subnets                           │  │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │ │
│  │  │  │                    EKS Cluster                          ││  │ │
│  │  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    ││  │ │
│  │  │  │  │Services │  │Services │  │Services │  │Workers  │    ││  │ │
│  │  │  │  │(API)    │  │(Workers)│  │(Sync)   │  │(Batch)  │    ││  │ │
│  │  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    ││  │ │
│  │  │  └─────────────────────────────────────────────────────────┘│  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Data Subnets                              │  │ │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │  │ │
│  │  │  │   RDS   │  │  Redis  │  │   ES    │                      │  │ │
│  │  │  │(Primary)│  │(Cluster)│  │(Cluster)│                      │  │ │
│  │  │  └─────────┘  └─────────┘  └─────────┘                      │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │     S3      │  │   Secrets   │  │    ECR      │                     │
│  │  (Docs)     │  │   Manager   │  │  (Images)   │                     │
│  └─────────────┘  └─────────────┘  └─────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Service Communication Patterns

### Synchronous (HTTP/gRPC)
- User-facing APIs
- Real-time queries
- Health checks

### Asynchronous (Queue/Event)
- External service calls (credit, AVM)
- Encompass synchronization
- Document processing
- Notifications

### Saga Pattern (Long-running transactions)
```
┌───────────────────────────────────────────────────────────────┐
│                  LOAN ENRICHMENT SAGA                         │
│                                                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐   │
│  │ Order   │───▶│ Order   │───▶│ Order   │───▶│ Evaluate│   │
│  │ Credit  │    │ AVM     │    │ Entity  │    │ Rules   │   │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘   │
│       │              │              │              │         │
│  ┌────┴────┐    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐   │
│  │Compensate│   │Compensate│   │Compensate│   │Compensate│  │
│  │(Cancel)  │   │(Cancel)  │   │(Cancel)  │   │(Rollback)│  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   │
└───────────────────────────────────────────────────────────────┘
```
