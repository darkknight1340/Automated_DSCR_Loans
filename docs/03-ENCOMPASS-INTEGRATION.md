# Encompass Integration Strategy

## Overview

Encompass is the **System of Record (LOS)** for all loan data. This platform acts as an automation layer that orchestrates external services and writes results back to Encompass. All loan-critical decisions must be persisted in Encompass fields.

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENCOMPASS INTEGRATION LAYER                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ENCOMPASS ADAPTER SERVICE                         │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │    Loan      │  │    Field     │  │  Milestone   │               │   │
│  │  │   Manager    │  │   Mapper     │  │   Manager    │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  Condition   │  │   Service    │  │   Webhook    │               │   │
│  │  │   Manager    │  │    Proxy     │  │   Handler    │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │              SYNC ENGINE (Bidirectional)                      │   │   │
│  │  │  • Conflict resolution (Encompass wins by default)           │   │   │
│  │  │  • Retry with exponential backoff                            │   │   │
│  │  │  • Dead letter queue for failures                            │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ENCOMPASS API CLIENTS                            │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  REST API    │  │    SDK       │  │   Webhook    │               │   │
│  │  │   Client     │  │   Wrapper    │  │  Subscriber  │               │   │
│  │  │   (v3)       │  │   (.NET)     │  │              │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │                                 │
                    │      ICE ENCOMPASS (LOS)        │
                    │                                 │
                    └─────────────────────────────────┘
```

## A) Loan Creation Strategy

### Timing Decision Tree
```
Lead Received
    │
    ▼
Is lead qualified (score > threshold)?
    │
    ├── NO ──▶ Keep in CRM only (no Encompass loan)
    │
    └── YES
         │
         ▼
    Has borrower submitted application?
         │
         ├── NO ──▶ Create "Prospect" loan (minimal data)
         │          - Set CX.LOAN_STATUS = "PROSPECT"
         │          - Milestone: Started
         │
         └── YES
              │
              ▼
         Create full application loan
              │
              ▼
         Milestone: Application

```

### Idempotent Loan Creation

```typescript
// Loan creation is idempotent via external_id matching
interface LoanCreateRequest {
  external_id: string;          // Our platform's loan ID
  idempotency_key: string;      // Hash of (external_id + timestamp rounded to minute)
  loan_template?: string;       // "DSCR_Refinance_v2"
  borrower_data: BorrowerData;
  property_data: PropertyData;
}

// Creation logic
async function createOrGetLoan(request: LoanCreateRequest): Promise<EncompassLoan> {
  // Step 1: Check if loan already exists with this external_id
  const existing = await encompassClient.searchLoans({
    filter: `CX.PLATFORM_LOAN_ID eq '${request.external_id}'`
  });

  if (existing.length > 0) {
    return existing[0]; // Return existing loan
  }

  // Step 2: Check idempotency cache (Redis)
  const cachedGuid = await redis.get(`idempotency:loan:${request.idempotency_key}`);
  if (cachedGuid) {
    return encompassClient.getLoan(cachedGuid);
  }

  // Step 3: Create new loan
  const loan = await encompassClient.createLoan({
    loanTemplate: request.loan_template,
    ...mapToEncompassFormat(request)
  });

  // Step 4: Set our tracking field
  await encompassClient.updateLoan(loan.guid, {
    'CX.PLATFORM_LOAN_ID': request.external_id,
    'CX.PLATFORM_CREATED_AT': new Date().toISOString()
  });

  // Step 5: Cache for idempotency
  await redis.setex(`idempotency:loan:${request.idempotency_key}`, 3600, loan.guid);

  return loan;
}
```

### Pre-Approval vs Full Loan Files

| Loan Type | When Created | Data Required | Milestone |
|-----------|--------------|---------------|-----------|
| Prospect | Lead qualified | Name, email, phone, property address | Started |
| Pre-Qual | Initial app | + Est. income, credit score range | Application |
| Pre-Approval | After enrichment | + Credit report, AVM, DSCR calc | Pre-Approved |
| Full Application | Docs submitted | + All borrower docs, full app | Processing |

### Loan Re-Use Logic

```typescript
async function handleReturningBorrower(borrowerEmail: string, propertyAddress: string) {
  // Search for existing loans
  const existingLoans = await encompassClient.searchLoans({
    filter: `(Borrower.Email eq '${borrowerEmail}') and (fields['CX.LOAN_STATUS'] ne 'FUNDED')`
  });

  for (const loan of existingLoans) {
    // Check if same property
    if (normalizeAddress(loan.propertyAddress) === normalizeAddress(propertyAddress)) {
      // Check loan age
      const ageInDays = daysSince(loan.createdDate);

      if (ageInDays < 90 && loan.milestone !== 'Denied') {
        // Re-use existing loan
        return { action: 'REUSE', loan };
      } else if (ageInDays < 180) {
        // Archive old, create new with reference
        return { action: 'ARCHIVE_AND_CREATE', previousLoan: loan };
      }
    }
  }

  return { action: 'CREATE_NEW' };
}
```

## B) Field Mapping

### Standard Encompass Fields

| Platform Field | Encompass Field ID | Type | Description |
|---------------|-------------------|------|-------------|
| borrower.first_name | 4000 | String | Borrower First Name |
| borrower.last_name | 4002 | String | Borrower Last Name |
| borrower.ssn | 65 | String | SSN (encrypted) |
| borrower.email | 1240 | String | Email |
| borrower.phone | 1480 | String | Home Phone |
| property.address | 11 | String | Subject Property Address |
| property.city | 12 | String | City |
| property.state | 14 | String | State |
| property.zip | 15 | String | Zip |
| property.type | 1041 | String | Property Type |
| property.units | 16 | Integer | Number of Units |
| loan.amount | 1109 | Decimal | Total Loan Amount |
| loan.purpose | 19 | String | Loan Purpose |
| loan.rate | 3 | Decimal | Note Rate |
| loan.term | 4 | Integer | Loan Term (months) |

### CX.* Custom Fields for DSCR

We define custom fields in the `CX.DSCR_*` namespace:

#### DSCR Calculation Fields
| Custom Field | Type | Description |
|-------------|------|-------------|
| CX.DSCR_GROSS_RENT | Decimal | Monthly gross rental income |
| CX.DSCR_VACANCY_RATE | Decimal | Vacancy allowance % |
| CX.DSCR_EFFECTIVE_RENT | Decimal | Gross rent - vacancy |
| CX.DSCR_PROPERTY_TAX_MO | Decimal | Monthly property tax |
| CX.DSCR_INSURANCE_MO | Decimal | Monthly hazard insurance |
| CX.DSCR_HOA_MO | Decimal | Monthly HOA dues |
| CX.DSCR_MGMT_FEE_MO | Decimal | Monthly management fee |
| CX.DSCR_NOI_MONTHLY | Decimal | Net Operating Income (monthly) |
| CX.DSCR_PITIA | Decimal | P&I + Taxes + Insurance + HOA |
| CX.DSCR_RATIO | Decimal | Final DSCR ratio |
| CX.DSCR_CALC_DATE | Date | Date of calculation |
| CX.DSCR_CALC_VERSION | String | Calculator version used |

#### AVM Fields
| Custom Field | Type | Description |
|-------------|------|-------------|
| CX.AVM_VALUE | Decimal | AVM estimated value |
| CX.AVM_CONFIDENCE | String | High/Medium/Low |
| CX.AVM_CONFIDENCE_SCORE | Decimal | 0-100 confidence score |
| CX.AVM_FSD | Decimal | Forecast Standard Deviation |
| CX.AVM_PROVIDER | String | AVM provider name |
| CX.AVM_REPORT_ID | String | External report ID |
| CX.AVM_DATE | Date | Date of AVM |
| CX.AVM_LOW | Decimal | Low value estimate |
| CX.AVM_HIGH | Decimal | High value estimate |

#### Eligibility & Rules Fields
| Custom Field | Type | Description |
|-------------|------|-------------|
| CX.ELIG_RESULT | String | ELIGIBLE/INELIGIBLE/EXCEPTION |
| CX.ELIG_RULES_VERSION | String | Rule set version |
| CX.ELIG_EVAL_DATE | Date | Evaluation date |
| CX.ELIG_FAIL_REASONS | String | Semicolon-delimited fail reasons |
| CX.ELIG_WARNINGS | String | Semicolon-delimited warnings |
| CX.ELIG_EXCEPTIONS | String | Exception codes requiring review |
| CX.ELIG_SCORE | Integer | Composite eligibility score (0-100) |

#### Pricing Fields
| Custom Field | Type | Description |
|-------------|------|-------------|
| CX.PRICE_BASE_RATE | Decimal | Base rate before adjustments |
| CX.PRICE_ADDERS_TOTAL | Decimal | Total rate adjustments |
| CX.PRICE_FINAL_RATE | Decimal | Final offered rate |
| CX.PRICE_CARD_ID | String | Pricing card used |
| CX.PRICE_CARD_DATE | Date | Pricing card effective date |
| CX.PRICE_LOCK_DATE | Date | Rate lock date |
| CX.PRICE_LOCK_EXPIRY | Date | Lock expiration |
| CX.PRICE_LOCK_DAYS | Integer | Lock period |
| CX.PRICE_ADDER_DETAIL | String | JSON of individual adders |

#### Platform Tracking Fields
| Custom Field | Type | Description |
|-------------|------|-------------|
| CX.PLATFORM_LOAN_ID | String | Our internal loan ID |
| CX.PLATFORM_LEAD_ID | String | Originating lead ID |
| CX.PLATFORM_CREATED_AT | DateTime | When we created the loan |
| CX.PLATFORM_LAST_SYNC | DateTime | Last sync timestamp |
| CX.PLATFORM_VERSION | String | Platform version |
| CX.AUTOMATION_ENABLED | Boolean | Automation active flag |

### Field Mapping Implementation

```typescript
// Field mapping configuration
const FIELD_MAPPINGS: FieldMapping[] = [
  // Standard fields
  { platform: 'borrower.firstName', encompass: '4000', transform: 'direct' },
  { platform: 'borrower.lastName', encompass: '4002', transform: 'direct' },
  { platform: 'borrower.ssn', encompass: '65', transform: 'encrypt' },
  { platform: 'property.address', encompass: '11', transform: 'normalizeAddress' },

  // DSCR custom fields
  { platform: 'dscr.grossRent', encompass: 'CX.DSCR_GROSS_RENT', transform: 'direct' },
  { platform: 'dscr.ratio', encompass: 'CX.DSCR_RATIO', transform: 'roundDecimal(3)' },

  // AVM fields
  { platform: 'avm.value', encompass: 'CX.AVM_VALUE', transform: 'direct' },
  { platform: 'avm.confidence', encompass: 'CX.AVM_CONFIDENCE', transform: 'mapConfidence' },
];

class FieldMapper {
  async platformToEncompass(platformData: PlatformLoan): Promise<EncompassFieldUpdate[]> {
    const updates: EncompassFieldUpdate[] = [];

    for (const mapping of FIELD_MAPPINGS) {
      const value = getNestedValue(platformData, mapping.platform);
      if (value !== undefined) {
        const transformedValue = this.applyTransform(value, mapping.transform);
        updates.push({
          fieldId: mapping.encompass,
          value: transformedValue
        });
      }
    }

    return updates;
  }

  async encompassToPlatform(encompassLoan: EncompassLoan): Promise<Partial<PlatformLoan>> {
    const platformData: Partial<PlatformLoan> = {};

    for (const mapping of FIELD_MAPPINGS) {
      const value = encompassLoan.fields[mapping.encompass];
      if (value !== undefined) {
        const transformedValue = this.reverseTransform(value, mapping.transform);
        setNestedValue(platformData, mapping.platform, transformedValue);
      }
    }

    return platformData;
  }
}
```

## C) Milestones

### DSCR Loan Milestones

| Milestone | Automated Advance? | Trigger Conditions |
|-----------|-------------------|-------------------|
| Started | Yes | Loan created in Encompass |
| Application | Yes | All required app fields populated |
| Pre-Approved | Yes | Eligibility = ELIGIBLE, DSCR ≥ min |
| Processing | No | LO advances after review |
| Submitted | Yes | All PTD conditions cleared |
| Approved | No | UW approves |
| Docs Out | Yes | Closing docs generated |
| Clear to Close | Yes | All PTC conditions cleared |
| Funded | No | Wire confirmed |
| Completion | Yes | Post-close QC passed |

### Milestone Manager Implementation

```typescript
interface MilestoneRule {
  targetMilestone: string;
  prerequisites: string[];  // Required milestones before
  conditions: MilestoneCondition[];
  autoAdvance: boolean;
  notifications: string[];  // User IDs to notify
}

const MILESTONE_RULES: MilestoneRule[] = [
  {
    targetMilestone: 'Application',
    prerequisites: ['Started'],
    conditions: [
      { type: 'field_populated', fields: ['4000', '4002', '65', '11'] },
      { type: 'field_value', field: 'CX.PLATFORM_LOAN_ID', operator: 'not_empty' }
    ],
    autoAdvance: true,
    notifications: []
  },
  {
    targetMilestone: 'Pre-Approved',
    prerequisites: ['Application'],
    conditions: [
      { type: 'field_value', field: 'CX.ELIG_RESULT', operator: 'eq', value: 'ELIGIBLE' },
      { type: 'field_value', field: 'CX.DSCR_RATIO', operator: 'gte', value: 1.0 },
      { type: 'field_value', field: 'CX.AVM_VALUE', operator: 'gt', value: 0 }
    ],
    autoAdvance: true,
    notifications: ['assigned_lo']
  },
  {
    targetMilestone: 'Submitted',
    prerequisites: ['Processing'],
    conditions: [
      { type: 'conditions_cleared', category: 'PTD' },
      { type: 'document_received', docTypes: ['APPLICATION', 'ID', 'RENT_ROLL'] }
    ],
    autoAdvance: true,
    notifications: ['assigned_uw']
  },
  {
    targetMilestone: 'Clear to Close',
    prerequisites: ['Approved', 'Docs Out'],
    conditions: [
      { type: 'conditions_cleared', category: 'PTC' },
      { type: 'field_value', field: 'CX.CLOSING_SCHEDULED', operator: 'not_empty' }
    ],
    autoAdvance: true,
    notifications: ['assigned_closer', 'borrower']
  }
];

class MilestoneManager {
  async evaluateAdvancement(loanGuid: string): Promise<MilestoneAdvanceResult> {
    const loan = await this.encompassClient.getLoan(loanGuid);
    const currentMilestone = loan.currentMilestone;

    for (const rule of MILESTONE_RULES) {
      // Check if this milestone is the next logical step
      if (!rule.prerequisites.includes(currentMilestone)) continue;
      if (loan.milestoneHistory.includes(rule.targetMilestone)) continue;

      // Evaluate conditions
      const evaluation = await this.evaluateConditions(loan, rule.conditions);

      if (evaluation.allMet && rule.autoAdvance) {
        return {
          shouldAdvance: true,
          targetMilestone: rule.targetMilestone,
          reason: evaluation.summary,
          notifications: rule.notifications
        };
      }
    }

    return { shouldAdvance: false };
  }

  async advanceMilestone(loanGuid: string, milestone: string, reason: string): Promise<void> {
    await this.encompassClient.updateMilestone(loanGuid, {
      milestone,
      comments: `Auto-advanced: ${reason}`,
      systemGenerated: true
    });

    // Record in audit log
    await this.auditService.log({
      eventType: 'MILESTONE_ADVANCE',
      loanGuid,
      details: { milestone, reason, automated: true }
    });
  }
}
```

### Reacting to Milestone Changes (Webhooks)

```typescript
// Webhook handler for Encompass milestone changes
async function handleMilestoneWebhook(payload: EncompassWebhookPayload): Promise<void> {
  const { loanGuid, previousMilestone, newMilestone, changedBy } = payload;

  // Record the change
  await db.milestoneHistory.insert({
    loan_guid: loanGuid,
    previous_milestone: previousMilestone,
    new_milestone: newMilestone,
    changed_by: changedBy,
    changed_at: new Date(),
    source: changedBy === 'System' ? 'AUTOMATION' : 'MANUAL'
  });

  // Trigger milestone-specific workflows
  const handlers: Record<string, () => Promise<void>> = {
    'Processing': () => workflowOrchestrator.startProcessingWorkflow(loanGuid),
    'Submitted': () => notificationService.notifyUWAssignment(loanGuid),
    'Approved': () => workflowOrchestrator.startClosingWorkflow(loanGuid),
    'Funded': () => workflowOrchestrator.startPostCloseWorkflow(loanGuid),
    'Denied': () => workflowOrchestrator.handleDenial(loanGuid)
  };

  if (handlers[newMilestone]) {
    await handlers[newMilestone]();
  }
}
```

## D) Conditions

### Condition Categories

| Category | Code | Description | When Cleared |
|----------|------|-------------|--------------|
| Prior to Document (PTD) | PTD | Required before docs sent to UW | Pre-processing |
| Prior to Close (PTC) | PTC | Required before closing | Pre-closing |
| Prior to Funding (PTF) | PTF | Required before wire | Pre-funding |
| Post-Closing (POC) | POC | Required after closing | Post-close |

### Auto-Generated Conditions

```typescript
interface ConditionTemplate {
  code: string;
  category: 'PTD' | 'PTC' | 'PTF' | 'POC';
  title: string;
  description: string;
  triggerRules: ConditionTrigger[];
  autoClears: AutoClearRule[];
  responsible: 'BORROWER' | 'LO' | 'PROCESSOR' | 'UW' | 'CLOSER';
}

const CONDITION_TEMPLATES: ConditionTemplate[] = [
  {
    code: 'DSCR-001',
    category: 'PTD',
    title: 'Rent Roll Documentation',
    description: 'Provide current rent roll showing all unit rents and lease terms',
    triggerRules: [
      { type: 'always' }  // Always required for DSCR loans
    ],
    autoClears: [
      { type: 'document_received', docType: 'RENT_ROLL', minPages: 1 }
    ],
    responsible: 'BORROWER'
  },
  {
    code: 'DSCR-002',
    category: 'PTD',
    title: 'Entity Documentation',
    description: 'Provide operating agreement and certificate of good standing',
    triggerRules: [
      { type: 'field_value', field: 'CX.BORROWER_TYPE', operator: 'eq', value: 'ENTITY' }
    ],
    autoClears: [
      { type: 'document_received', docType: 'OPERATING_AGREEMENT' },
      { type: 'document_received', docType: 'CERTIFICATE_GOOD_STANDING' }
    ],
    responsible: 'BORROWER'
  },
  {
    code: 'DSCR-003',
    category: 'PTD',
    title: 'Bank Statements',
    description: 'Provide 2 months bank statements showing reserves',
    triggerRules: [
      { type: 'always' }
    ],
    autoClears: [
      { type: 'document_received', docType: 'BANK_STATEMENT', minCount: 2 }
    ],
    responsible: 'BORROWER'
  },
  {
    code: 'DSCR-010',
    category: 'PTD',
    title: 'Low DSCR Exception Approval',
    description: 'DSCR below 1.0 requires senior UW approval',
    triggerRules: [
      { type: 'field_value', field: 'CX.DSCR_RATIO', operator: 'lt', value: 1.0 }
    ],
    autoClears: [
      { type: 'manual_clear', requiredRole: 'SENIOR_UW' }
    ],
    responsible: 'UW'
  },
  {
    code: 'DSCR-020',
    category: 'PTC',
    title: 'Final Title Commitment',
    description: 'Title commitment with our lien position confirmed',
    triggerRules: [
      { type: 'always' }
    ],
    autoClears: [
      { type: 'document_received', docType: 'TITLE_COMMITMENT' },
      { type: 'field_value', field: 'CX.TITLE_APPROVED', operator: 'eq', value: 'Y' }
    ],
    responsible: 'CLOSER'
  },
  {
    code: 'DSCR-021',
    category: 'PTC',
    title: 'Hazard Insurance Binder',
    description: 'Insurance binder with lender listed as mortgagee',
    triggerRules: [
      { type: 'always' }
    ],
    autoClears: [
      { type: 'document_received', docType: 'INSURANCE_BINDER' },
      { type: 'field_value', field: 'CX.INSURANCE_VERIFIED', operator: 'eq', value: 'Y' }
    ],
    responsible: 'BORROWER'
  }
];

class ConditionManager {
  async generateConditions(loanGuid: string): Promise<Condition[]> {
    const loan = await this.encompassClient.getLoan(loanGuid);
    const conditions: Condition[] = [];

    for (const template of CONDITION_TEMPLATES) {
      const shouldTrigger = await this.evaluateTriggers(loan, template.triggerRules);

      if (shouldTrigger) {
        const condition = await this.encompassClient.addCondition(loanGuid, {
          title: template.title,
          description: template.description,
          category: template.category,
          source: 'SYSTEM',
          priorTo: this.mapCategoryToPriorTo(template.category),
          customData: {
            'CX.COND_CODE': template.code,
            'CX.COND_AUTO_CLEAR': JSON.stringify(template.autoClears)
          }
        });

        conditions.push(condition);
      }
    }

    return conditions;
  }

  async evaluateAutoClear(loanGuid: string): Promise<ClearResult[]> {
    const conditions = await this.encompassClient.getConditions(loanGuid, { status: 'Open' });
    const results: ClearResult[] = [];

    for (const condition of conditions) {
      const autoClearRules = JSON.parse(condition.customData['CX.COND_AUTO_CLEAR'] || '[]');
      const loan = await this.encompassClient.getLoan(loanGuid);

      const allRulesMet = await this.evaluateAutoClearRules(loan, autoClearRules);

      if (allRulesMet) {
        await this.encompassClient.clearCondition(loanGuid, condition.id, {
          clearedBy: 'SYSTEM',
          comments: 'Auto-cleared: All requirements met'
        });

        results.push({ conditionId: condition.id, cleared: true });
      }
    }

    return results;
  }
}
```

### Re-Clear Logic

```typescript
// Conditions can be re-opened if underlying data changes
async function handleFieldChange(loanGuid: string, fieldId: string, newValue: any): Promise<void> {
  // Check if any cleared conditions depend on this field
  const clearedConditions = await encompassClient.getConditions(loanGuid, { status: 'Cleared' });

  for (const condition of clearedConditions) {
    const autoClearRules = JSON.parse(condition.customData['CX.COND_AUTO_CLEAR'] || '[]');

    for (const rule of autoClearRules) {
      if (rule.type === 'field_value' && rule.field === fieldId) {
        // Re-evaluate the rule
        const stillMet = evaluateFieldRule(newValue, rule.operator, rule.value);

        if (!stillMet) {
          // Re-open the condition
          await encompassClient.reopenCondition(loanGuid, condition.id, {
            reason: `Field ${fieldId} changed, condition no longer met`,
            reopenedBy: 'SYSTEM'
          });

          await auditService.log({
            eventType: 'CONDITION_REOPENED',
            loanGuid,
            conditionId: condition.id,
            reason: `Field ${fieldId} changed from condition-satisfying value`
          });
        }
      }
    }
  }
}
```

## E) Services

### Encompass Service Integration

```typescript
interface EncompassServiceConfig {
  serviceType: 'CREDIT' | 'APPRAISAL' | 'FLOOD' | 'TITLE' | 'VERIFICATION';
  provider: string;
  credentials: ServiceCredentials;
  fieldMappings: ServiceFieldMapping[];
  callbackUrl: string;
}

class EncompassServiceProxy {
  // Credit Service - Uses Encompass native credit integration
  async orderCredit(loanGuid: string, options: CreditOrderOptions): Promise<CreditOrderResult> {
    // First, order through our platform for tracking
    const platformOrder = await this.creditService.createOrder({
      loanGuid,
      borrowers: options.borrowers,
      bureaus: options.bureaus,
      pullType: options.pullType  // 'soft' | 'hard'
    });

    // Then trigger Encompass credit service
    const encompassOrder = await this.encompassClient.services.credit.order({
      loanGuid,
      options: {
        creditVendor: 'MeridianLink',  // or configured vendor
        reportType: options.pullType === 'soft' ? 'Soft Pull' : 'Tri-Merge',
        borrowerPairs: options.borrowers.map(b => ({
          borrowerType: b.type,
          borrowerId: b.id
        }))
      }
    });

    // Link platform order to Encompass order
    await this.db.creditOrders.update(platformOrder.id, {
      encompass_order_id: encompassOrder.orderId
    });

    return {
      platformOrderId: platformOrder.id,
      encompassOrderId: encompassOrder.orderId,
      status: 'PENDING'
    };
  }

  // Handle credit callback - writes to both platform and Encompass
  async handleCreditCallback(callbackData: CreditCallbackData): Promise<void> {
    const { orderId, reportData, status } = callbackData;

    // Update platform record
    await this.creditService.processReport(orderId, reportData);

    // Encompass auto-populates credit fields, but we add custom fields
    const order = await this.db.creditOrders.findByEncompassOrderId(orderId);

    await this.encompassClient.updateLoan(order.loan_guid, {
      'CX.CREDIT_SCORE_USED': reportData.representativeScore,
      'CX.CREDIT_PULL_DATE': new Date().toISOString(),
      'CX.CREDIT_PULL_TYPE': order.pull_type,
      'CX.CREDIT_REPORT_ID': order.platform_order_id
    });

    // Evaluate if ready for milestone advance
    await this.milestoneManager.evaluateAdvancement(order.loan_guid);
  }

  // Appraisal Service - Orchestrated externally, reflected in Encompass
  async orderAppraisal(loanGuid: string, options: AppraisalOrderOptions): Promise<AppraisalOrderResult> {
    // Order through AMC integration
    const amcOrder = await this.amcClient.order({
      propertyAddress: options.propertyAddress,
      productType: options.appraisalType,  // 'FULL' | '1004D' | 'DESKTOP'
      rushRequested: options.rush,
      lenderReference: loanGuid
    });

    // Create Encompass appraisal service record
    await this.encompassClient.services.appraisal.create({
      loanGuid,
      vendorOrderId: amcOrder.orderId,
      productType: options.appraisalType,
      orderedDate: new Date(),
      status: 'Ordered'
    });

    // Update tracking fields
    await this.encompassClient.updateLoan(loanGuid, {
      'CX.APPRAISAL_ORDERED': 'Y',
      'CX.APPRAISAL_ORDER_DATE': new Date().toISOString(),
      'CX.APPRAISAL_ORDER_ID': amcOrder.orderId
    });

    return { orderId: amcOrder.orderId };
  }

  // Flood - External check, reflected in Encompass
  async orderFloodCert(loanGuid: string): Promise<FloodCertResult> {
    const loan = await this.encompassClient.getLoan(loanGuid);

    // Call flood vendor
    const floodResult = await this.floodVendor.certify({
      address: loan.propertyAddress,
      city: loan.propertyCity,
      state: loan.propertyState,
      zip: loan.propertyZip
    });

    // Update Encompass flood fields
    await this.encompassClient.updateLoan(loanGuid, {
      // Standard flood fields
      'FLOODCERT.FloodZone': floodResult.zone,
      'FLOODCERT.InFloodZone': floodResult.inFloodZone,
      'FLOODCERT.CommunityNumber': floodResult.communityNumber,
      'FLOODCERT.MapNumber': floodResult.mapNumber,
      'FLOODCERT.CertificationDate': floodResult.certDate,
      // Custom tracking
      'CX.FLOOD_CERT_ID': floodResult.certId,
      'CX.FLOOD_INSURANCE_REQUIRED': floodResult.inFloodZone ? 'Y' : 'N'
    });

    // Generate condition if flood insurance required
    if (floodResult.inFloodZone) {
      await this.conditionManager.addCondition(loanGuid, {
        code: 'DSCR-030',
        category: 'PTC',
        title: 'Flood Insurance Required',
        description: `Property in flood zone ${floodResult.zone}. Flood insurance required.`
      });
    }

    return floodResult;
  }
}
```

## F) Explainability

### Decision Explanation Framework

```typescript
interface DecisionExplanation {
  decision: 'APPROVED' | 'DENIED' | 'PENDING' | 'EXCEPTION';
  summary: string;
  ruleResults: RuleResult[];
  dataUsed: DataSourceReference[];
  alternatives?: AlternativeScenario[];
  nextSteps: NextStep[];
}

interface RuleResult {
  ruleId: string;
  ruleName: string;
  ruleVersion: string;
  category: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  inputValues: Record<string, any>;
  threshold?: any;
  actualValue?: any;
  explanation: string;
  impact: 'BLOCKING' | 'CAUTION' | 'INFO';
}

class ExplainabilityService {
  async generateExplanation(loanGuid: string): Promise<DecisionExplanation> {
    // Get all rule evaluations for this loan
    const evaluations = await this.db.ruleEvaluations.findByLoanGuid(loanGuid);
    const loan = await this.encompassClient.getLoan(loanGuid);

    const ruleResults: RuleResult[] = evaluations.map(e => ({
      ruleId: e.rule_id,
      ruleName: e.rule_name,
      ruleVersion: e.rule_version,
      category: e.category,
      result: e.result,
      inputValues: e.input_values,
      threshold: e.threshold,
      actualValue: e.actual_value,
      explanation: this.generateRuleExplanation(e),
      impact: this.determineImpact(e)
    }));

    // Get data sources used
    const dataUsed = await this.getDataSources(loanGuid);

    // Determine overall decision
    const decision = this.aggregateDecision(ruleResults);

    return {
      decision,
      summary: this.generateSummary(decision, ruleResults),
      ruleResults,
      dataUsed,
      alternatives: decision === 'DENIED' ? await this.suggestAlternatives(loan) : undefined,
      nextSteps: this.determineNextSteps(decision, ruleResults)
    };
  }

  private generateRuleExplanation(evaluation: RuleEvaluation): string {
    const templates: Record<string, (e: RuleEvaluation) => string> = {
      'DSCR_MIN': (e) => e.result === 'PASS'
        ? `DSCR of ${e.actual_value.toFixed(2)} meets minimum requirement of ${e.threshold}`
        : `DSCR of ${e.actual_value.toFixed(2)} is below minimum of ${e.threshold}`,

      'LTV_MAX': (e) => e.result === 'PASS'
        ? `LTV of ${(e.actual_value * 100).toFixed(1)}% is within maximum of ${(e.threshold * 100).toFixed(1)}%`
        : `LTV of ${(e.actual_value * 100).toFixed(1)}% exceeds maximum of ${(e.threshold * 100).toFixed(1)}%`,

      'CREDIT_SCORE_MIN': (e) => e.result === 'PASS'
        ? `Credit score of ${e.actual_value} meets minimum of ${e.threshold}`
        : `Credit score of ${e.actual_value} is below minimum of ${e.threshold}`,

      'PROPERTY_TYPE_ELIGIBLE': (e) => e.result === 'PASS'
        ? `Property type "${e.actual_value}" is eligible`
        : `Property type "${e.actual_value}" is not eligible for this program`
    };

    const template = templates[evaluation.rule_id];
    return template ? template(evaluation) : `Rule ${evaluation.rule_name}: ${evaluation.result}`;
  }

  // Write explanation to Encompass for LO/UW visibility
  async writeExplanationToEncompass(loanGuid: string, explanation: DecisionExplanation): Promise<void> {
    // Store summary in custom fields
    await this.encompassClient.updateLoan(loanGuid, {
      'CX.DECISION_RESULT': explanation.decision,
      'CX.DECISION_SUMMARY': explanation.summary.substring(0, 500),
      'CX.DECISION_DATE': new Date().toISOString(),
      'CX.RULES_PASSED': explanation.ruleResults.filter(r => r.result === 'PASS').length,
      'CX.RULES_FAILED': explanation.ruleResults.filter(r => r.result === 'FAIL').length,
      'CX.RULES_WARNED': explanation.ruleResults.filter(r => r.result === 'WARN').length
    });

    // Store detailed explanation as loan note
    const noteContent = this.formatExplanationAsNote(explanation);
    await this.encompassClient.addNote(loanGuid, {
      subject: `Automated Decision: ${explanation.decision}`,
      body: noteContent,
      category: 'SYSTEM',
      timestamp: new Date()
    });

    // Store full JSON in document
    const explanationDoc = Buffer.from(JSON.stringify(explanation, null, 2));
    await this.encompassClient.attachDocument(loanGuid, {
      title: `Decision_Explanation_${new Date().toISOString().split('T')[0]}`,
      documentType: 'Other',
      content: explanationDoc,
      contentType: 'application/json'
    });
  }

  private formatExplanationAsNote(explanation: DecisionExplanation): string {
    let note = `DECISION: ${explanation.decision}\n\n`;
    note += `SUMMARY:\n${explanation.summary}\n\n`;
    note += `RULE RESULTS:\n`;

    for (const rule of explanation.ruleResults) {
      const icon = rule.result === 'PASS' ? '[PASS]' :
                   rule.result === 'FAIL' ? '[FAIL]' :
                   rule.result === 'WARN' ? '[WARN]' : '[SKIP]';
      note += `${icon} ${rule.ruleName}: ${rule.explanation}\n`;
    }

    if (explanation.nextSteps.length > 0) {
      note += `\nNEXT STEPS:\n`;
      for (const step of explanation.nextSteps) {
        note += `- ${step.description}\n`;
      }
    }

    return note;
  }
}
```

### LO/UW Portal Display

```typescript
// API endpoint for explanation retrieval
// GET /api/v1/loans/{loanId}/explanation
interface ExplanationResponse {
  decision: string;
  summary: string;
  confidence: number;
  rules: {
    category: string;
    rules: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      explanation: string;
      details?: Record<string, any>;
    }>;
  }[];
  dataSources: Array<{
    type: string;
    provider: string;
    retrievedAt: string;
    expiresAt?: string;
  }>;
  history: Array<{
    timestamp: string;
    event: string;
    user?: string;
    details: string;
  }>;
}
```
