# Canonical Domain Model

## Overview

This document defines the canonical domain model for the DSCR Loan Automation Platform. All services use these models; Encompass mappings are bidirectional translations from this model.

## Core Aggregates

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DOMAIN MODEL                                    │
│                                                                         │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐ │
│  │      LEAD       │─────▶│   APPLICATION   │─────▶│     LOAN        │ │
│  │   (Pre-LOS)     │      │   (Platform)    │      │  (Encompass)    │ │
│  └─────────────────┘      └────────┬────────┘      └─────────────────┘ │
│                                    │                                    │
│            ┌───────────────────────┼───────────────────────┐           │
│            │                       │                       │           │
│            ▼                       ▼                       ▼           │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐ │
│  │    BORROWER     │      │    PROPERTY     │      │    DECISION     │ │
│  │                 │      │                 │      │                 │ │
│  │  ┌───────────┐  │      │  ┌───────────┐  │      │  ┌───────────┐  │ │
│  │  │ Guarantor │  │      │  │ Rent Roll │  │      │  │ Condition │  │ │
│  │  └───────────┘  │      │  └───────────┘  │      │  └───────────┘  │ │
│  │  ┌───────────┐  │      │  ┌───────────┐  │      │  ┌───────────┐  │ │
│  │  │  Entity   │  │      │  │    AVM    │  │      │  │  Pricing  │  │ │
│  │  └───────────┘  │      │  └───────────┘  │      │  └───────────┘  │ │
│  └─────────────────┘      └─────────────────┘      └─────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Aggregate: Lead

The Lead aggregate represents a potential borrower before loan creation.

```typescript
interface Lead {
  id: string;                         // UUID
  externalId?: string;                // Marketing platform ID
  sourceId: string;                   // Reference to LeadSource

  // Contact
  contact: {
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    phoneSecondary?: string;
  };

  // Property Interest
  propertyInterest?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    propertyType?: PropertyType;
    estimatedValue?: Money;
  };

  // Loan Interest
  loanInterest?: {
    purpose: LoanPurpose;
    requestedAmount?: Money;
    estimatedRent?: Money;
    hasExistingMortgage?: boolean;
    existingMortgageBalance?: Money;
  };

  // Qualification
  qualification: {
    statedCreditScoreRange?: CreditScoreRange;
    isEntityBorrower: boolean;
    entityName?: string;
  };

  // Lifecycle
  status: LeadStatus;
  score?: number;                     // 0-100
  assignedLoId?: string;

  // Conversion
  convertedToApplicationId?: string;

  // Consent
  consent: {
    marketing: boolean;
    marketingAt?: Date;
    tcpa: boolean;
    tcpaAt?: Date;
  };

  // Tracking
  utmParams?: UtmParams;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  firstContactedAt?: Date;
  qualifiedAt?: Date;
  convertedAt?: Date;
}

enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  DISQUALIFIED = 'DISQUALIFIED',
  CONVERTED = 'CONVERTED',
}

interface LeadSource {
  id: string;
  name: string;
  sourceType: 'website' | 'referral' | 'broker' | 'marketing' | 'marketplace';
  apiKeyHash?: string;
  isActive: boolean;
  costPerLead?: Money;
}
```

## Aggregate: Borrower

The Borrower aggregate represents either an individual or an entity.

```typescript
interface Borrower {
  id: string;
  borrowerType: BorrowerType;

  // Individual fields (when borrowerType = INDIVIDUAL)
  individual?: {
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    ssn: EncryptedString;             // Encrypted at rest
    ssnLast4: string;                 // For display
    dateOfBirth: Date;
    citizenship: string;
  };

  // Entity fields (when borrowerType = ENTITY)
  entity?: {
    name: string;
    type: EntityType;
    stateOfFormation: string;
    formationDate: Date;
    ein: EncryptedString;
    einLast4: string;
  };

  // Contact (common)
  contact: {
    email: string;
    phone: string;
    phoneMobile?: string;
  };

  // Mailing address
  mailingAddress: Address;

  // Verification
  verification: {
    identityVerified: boolean;
    identityVerifiedAt?: Date;
    identityVerificationMethod?: string;
  };

  // Related
  guarantors: Guarantor[];            // For entity borrowers

  createdAt: Date;
  updatedAt: Date;
}

enum BorrowerType {
  INDIVIDUAL = 'INDIVIDUAL',
  ENTITY = 'ENTITY',
}

enum EntityType {
  LLC = 'LLC',
  CORPORATION = 'CORPORATION',
  PARTNERSHIP = 'PARTNERSHIP',
  TRUST = 'TRUST',
}

interface Guarantor {
  id: string;
  borrowerId: string;                 // The entity being guaranteed

  // Personal info
  firstName: string;
  middleName?: string;
  lastName: string;
  ssn: EncryptedString;
  ssnLast4: string;
  dateOfBirth: Date;

  // Ownership
  ownershipPercentage: number;        // 0-100

  // Contact
  contact: {
    email: string;
    phone: string;
  };

  // Address
  address: Address;

  // Guarantee terms
  guaranteeType: 'FULL' | 'LIMITED' | 'SEVERAL';
  isPrimary: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

## Aggregate: Property

```typescript
interface Property {
  id: string;

  // Address
  address: PropertyAddress;

  // Physical characteristics
  characteristics: {
    propertyType: PropertyType;
    yearBuilt?: number;
    squareFeet?: number;
    lotSizeSqft?: number;
    bedrooms?: number;
    bathrooms?: number;
    stories?: number;
    units: number;                    // 1 for SFR, 2+ for multi
  };

  // HOA
  hoa?: {
    hasHoa: boolean;
    monthlyDues?: Money;
    hoaName?: string;
  };

  // Legal
  legal?: {
    apn?: string;                     // Assessor Parcel Number
    legalDescription?: string;
  };

  // Rental information
  rental: {
    isCurrentlyRented: boolean;
    currentMonthlyRent?: Money;
    marketMonthlyRent?: Money;
    isShortTermRental: boolean;
  };

  // Rent roll (for multi-unit)
  rentRoll: RentRollEntry[];

  // Verification
  verification: {
    addressStandardized: boolean;
    geocoded: boolean;
    latitude?: number;
    longitude?: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

enum PropertyType {
  SFR = 'SFR',
  CONDO = 'CONDO',
  TOWNHOUSE = 'TOWNHOUSE',
  TWO_TO_FOUR_UNIT = '2_4_UNIT',
  MULTIFAMILY = 'MULTIFAMILY',
  MIXED_USE = 'MIXED_USE',
}

interface PropertyAddress {
  street: string;
  unit?: string;
  city: string;
  county?: string;
  state: string;
  zip: string;
}

interface RentRollEntry {
  id: string;
  propertyId: string;

  // Unit
  unitNumber?: string;
  unitType?: string;                  // '1BR', '2BR', 'Studio'
  squareFeet?: number;

  // Lease
  tenantName?: string;
  leaseStartDate?: Date;
  leaseEndDate?: Date;
  leaseType: 'ANNUAL' | 'MONTH_TO_MONTH' | 'STR';

  // Rent
  monthlyRent: Money;
  securityDeposit?: Money;

  // Vacancy
  isVacant: boolean;
  vacancyStartDate?: Date;

  // STR specific
  strMetrics?: {
    avgNightlyRate: Money;
    avgOccupancyRate: number;         // 0-100
  };
}
```

## Aggregate: Application

The Application aggregate is the core loan object in our platform.

```typescript
interface Application {
  id: string;
  leadId?: string;                    // Source lead if converted

  // Primary references
  borrowerId: string;
  propertyId: string;

  // Loan terms
  loanTerms: {
    purpose: LoanPurpose;
    amount: Money;
    termMonths: number;
    amortizationType: 'FIXED' | 'ARM' | 'IO';
    interestOnlyPeriodMonths?: number;
  };

  // Property financials
  financials: {
    purchasePrice?: Money;            // For purchases
    estimatedValue: Money;
    existingLiensTotal: Money;
    cashOutAmount?: Money;
    cashOutPurpose?: string;
  };

  // Calculated ratios (denormalized)
  ratios: {
    ltv?: number;
    cltv?: number;
  };

  // Reserves
  reserves: {
    monthsRequired: number;
    verified?: Money;
  };

  // Status
  status: LoanStatus;
  submittedAt?: Date;

  // Assignments
  assignments: {
    loId?: string;
    processorId?: string;
    uwId?: string;
    closerId?: string;
  };

  // Encompass link
  encompassLink?: EncompassLink;

  createdAt: Date;
  updatedAt: Date;
}

enum LoanPurpose {
  PURCHASE = 'PURCHASE',
  RATE_TERM_REFI = 'RATE_TERM_REFI',
  CASH_OUT_REFI = 'CASH_OUT_REFI',
}

enum LoanStatus {
  PROSPECT = 'PROSPECT',
  APPLICATION = 'APPLICATION',
  PROCESSING = 'PROCESSING',
  UNDERWRITING = 'UNDERWRITING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  SUSPENDED = 'SUSPENDED',
  WITHDRAWN = 'WITHDRAWN',
  CLOSING = 'CLOSING',
  FUNDED = 'FUNDED',
  POST_CLOSE = 'POST_CLOSE',
  SOLD = 'SOLD',
}

interface EncompassLink {
  applicationId: string;
  encompassLoanGuid: string;
  encompassLoanNumber?: string;
  encompassFolder?: string;

  // Sync state
  lastSyncToEncompass?: Date;
  lastSyncFromEncompass?: Date;
  syncStatus: 'SYNCED' | 'PENDING' | 'FAILED' | 'CONFLICT';
  syncErrorMessage?: string;
  syncRetryCount: number;

  // Milestone
  currentMilestone?: string;
  milestoneUpdatedAt?: Date;
}
```

## Value Objects

```typescript
// Money value object (immutable)
interface Money {
  amount: number;                     // In cents to avoid floating point
  currency: string;                   // ISO 4217 code
}

// Address value object
interface Address {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

// Encrypted string (for PII)
interface EncryptedString {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: string;                      // Reference to encryption key
}

// Credit score range
type CreditScoreRange =
  | '740+'
  | '720-739'
  | '700-719'
  | '680-699'
  | '660-679'
  | '640-659'
  | 'below-640';

// UTM parameters
interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}
```

## DSCR Calculation Model

```typescript
interface DSCRCalculation {
  id: string;
  applicationId: string;
  propertyId: string;

  // Income
  income: {
    grossMonthlyRent: Money;
    vacancyRate: number;              // As decimal (0.05 = 5%)
    effectiveGrossRent: Money;        // Gross - vacancy
    otherIncome?: Money;
  };

  // Expenses
  expenses: {
    propertyTaxMonthly: Money;
    insuranceMonthly: Money;
    hoaMonthly: Money;
    managementFeeMonthly: Money;
    floodInsuranceMonthly?: Money;
    otherExpenses?: Money;
    totalExpenses: Money;
  };

  // NOI
  noi: {
    monthly: Money;
    annual: Money;
  };

  // Debt service
  debtService: {
    principalAndInterest: Money;      // Monthly P&I
    totalPITIA: Money;                // P&I + Taxes + Insurance + HOA
  };

  // Final DSCR
  dscrRatio: number;                  // NOI / Debt Service

  // Metadata
  calculatedAt: Date;
  calculatorVersion: string;

  // For explainability
  inputs: Record<string, any>;        // Raw inputs used
  formula: string;                    // Formula used
}

// DSCR calculation function
function calculateDSCR(
  effectiveGrossRent: Money,
  expenses: DSCRExpenses,
  debtService: Money
): number {
  const noi = effectiveGrossRent.amount - sumExpenses(expenses).amount;
  if (debtService.amount === 0) return Infinity;
  return noi / debtService.amount;
}
```

## Enrichment Models

### Credit Report

```typescript
interface CreditReport {
  id: string;
  applicationId: string;
  borrowerId: string;

  // Order
  orderId: string;
  vendorOrderId?: string;
  vendor: 'MERIDIANLINK' | 'CREDITPLUS' | 'FACTUALDATA';

  // Pull type
  pullType: 'SOFT' | 'HARD';
  bureausRequested: CreditBureau[];
  bureausReturned: CreditBureau[];

  // Scores
  scores: {
    experian?: number;
    equifax?: number;
    transunion?: number;
    representative: number;           // Score used for decisioning
    model: 'FICO8' | 'FICO9' | 'VANTAGE3';
  };

  // Status
  status: 'PENDING' | 'RECEIVED' | 'ERROR' | 'EXPIRED';

  // Report data
  tradelines: Tradeline[];
  publicRecords: PublicRecord[];
  inquiries: Inquiry[];

  // Timestamps
  orderedAt: Date;
  receivedAt?: Date;
  expiresAt?: Date;

  // Encompass sync
  syncedToEncompass: boolean;
  encompassServiceId?: string;
}

type CreditBureau = 'EXPERIAN' | 'EQUIFAX' | 'TRANSUNION';

interface Tradeline {
  id: string;
  creditReportId: string;

  creditorName: string;
  accountNumberMasked: string;
  accountType: TradelineType;

  // Balances
  creditLimit?: Money;
  highBalance?: Money;
  currentBalance: Money;
  monthlyPayment?: Money;

  // Status
  accountStatus: 'OPEN' | 'CLOSED' | 'PAID';
  paymentStatus: 'CURRENT' | '30_DAYS' | '60_DAYS' | '90_DAYS' | '120_DAYS' | 'COLLECTION';

  // History
  openedDate?: Date;
  closedDate?: Date;
  lastActivityDate?: Date;
  times30Late: number;
  times60Late: number;
  times90Late: number;

  // Mortgage specific
  isMortgage: boolean;
  propertyAddress?: string;
}

type TradelineType =
  | 'MORTGAGE'
  | 'INSTALLMENT'
  | 'REVOLVING'
  | 'COLLECTION'
  | 'OTHER';
```

### AVM Report

```typescript
interface AVMReport {
  id: string;
  propertyId: string;
  applicationId?: string;

  // Order
  orderId: string;
  vendor: 'CORELOGIC' | 'HOUSECANARY' | 'BLACKKNIGHT' | 'QUANTARIUM';
  productType?: string;

  // Values
  valuation: {
    estimated: Money;
    low: Money;
    high: Money;
    confidenceScore: number;          // 0-100
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    fsd?: number;                     // Forecast Standard Deviation
  };

  // Supporting data
  supportingData: {
    comparableCount?: number;
    lastSaleDate?: Date;
    lastSalePrice?: Money;
  };

  // Status
  status: 'PENDING' | 'RECEIVED' | 'NO_VALUE' | 'ERROR';

  // Full report
  reportData?: Record<string, any>;   // Full vendor response

  // Timestamps
  orderedAt: Date;
  receivedAt?: Date;
  valueAsOfDate?: Date;

  // Encompass sync
  syncedToEncompass: boolean;
}
```

## Decision Models

### Rule Evaluation

```typescript
interface RuleVersion {
  id: string;
  ruleSetName: string;                // 'DSCR_ELIGIBILITY_V1'
  version: string;                    // Semantic version

  rules: Rule[];

  // Metadata
  description?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;

  // Approval
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: Date;

  isActive: boolean;
  createdAt: Date;
}

interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;

  // Condition
  condition: RuleCondition;

  // Outcome
  onPass: RuleOutcome;
  onFail: RuleOutcome;

  // Metadata
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  isActive: boolean;
}

type RuleCategory =
  | 'DSCR'
  | 'LTV'
  | 'CREDIT'
  | 'PROPERTY'
  | 'BORROWER'
  | 'COMPLIANCE';

interface RuleCondition {
  type: 'SIMPLE' | 'COMPOUND' | 'CUSTOM';

  // For SIMPLE conditions
  field?: string;
  operator?: RuleOperator;
  value?: any;

  // For COMPOUND conditions
  logic?: 'AND' | 'OR';
  conditions?: RuleCondition[];

  // For CUSTOM conditions
  customFunction?: string;
}

type RuleOperator =
  | 'eq' | 'ne'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'between'
  | 'contains' | 'not_contains'
  | 'exists' | 'not_exists';

interface RuleOutcome {
  result: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  message: string;
  createCondition?: {
    code: string;
    category: ConditionCategory;
    title: string;
    description: string;
  };
}

interface RuleEvaluation {
  id: string;
  applicationId: string;
  ruleVersionId: string;

  evaluationType: 'ELIGIBILITY' | 'PRICING' | 'CONDITIONS';
  triggerEvent?: string;

  // Input snapshot
  inputSnapshot: Record<string, any>;

  // Results
  overallResult: DecisionResult;
  ruleResults: RuleResult[];

  // Metrics
  metrics: {
    rulesEvaluated: number;
    rulesPassed: number;
    rulesFailed: number;
    rulesWarned: number;
    rulesSkipped: number;
    durationMs: number;
  };

  evaluatedAt: Date;
  syncedToEncompass: boolean;
}

interface RuleResult {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  result: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  inputValues: Record<string, any>;
  threshold?: any;
  actualValue?: any;
  message: string;
  conditionCreated?: string;          // Condition ID if created
}

type DecisionResult =
  | 'APPROVED'
  | 'DENIED'
  | 'PENDING'
  | 'EXCEPTION'
  | 'MANUAL_REVIEW';
```

### Pricing

```typescript
interface PricingCard {
  id: string;
  cardName: string;
  productType: string;                // 'DSCR_30YR_FIXED'

  effectiveDate: Date;
  expirationDate?: Date;

  // Base rates by LTV
  baseRates: Record<number, number>;  // { 65: 7.25, 70: 7.375, ... }

  // Lock periods
  lockPeriods: Record<number, number>; // { 30: 0, 45: 0.125, 60: 0.25 }

  // Adders
  adders: PricingAdder[];

  isActive: boolean;
  createdBy?: string;
  approvedBy?: string;
  createdAt: Date;
}

interface PricingAdder {
  id: string;
  name: string;
  category: AdderCategory;

  // Condition
  condition: {
    field: string;
    ranges: AdderRange[];
  };

  // Can be positive (cost) or negative (credit)
  adjustmentType: 'RATE' | 'POINTS';
}

type AdderCategory =
  | 'LTV'
  | 'CREDIT'
  | 'DSCR'
  | 'LOAN_AMOUNT'
  | 'PROPERTY_TYPE'
  | 'CASH_OUT'
  | 'LOCK_PERIOD'
  | 'PREPAY';

interface AdderRange {
  min: number;
  max: number;
  adjustment: number;
}

interface PricingCalculation {
  id: string;
  applicationId: string;
  pricingCardId: string;

  // Inputs
  inputs: {
    ltvRatio: number;
    creditScore: number;
    dscrRatio: number;
    loanAmount: Money;
    lockPeriodDays: number;
    propertyType: PropertyType;
    loanPurpose: LoanPurpose;
    prepayPenalty?: PrepayPenaltyType;
  };

  // Calculation
  baseRate: number;
  adders: AppliedAdder[];
  totalAdders: number;
  finalRate: number;

  // Lock
  lock?: {
    isLocked: boolean;
    lockedAt?: Date;
    expiresAt?: Date;
  };

  calculatedAt: Date;
  syncedToEncompass: boolean;
}

interface AppliedAdder {
  adderId: string;
  name: string;
  category: AdderCategory;
  inputValue: any;
  adjustment: number;
  reason: string;
}

type PrepayPenaltyType = 'NONE' | '1YR' | '2YR' | '3YR' | '5YR';
```

### Condition

```typescript
interface Condition {
  id: string;
  applicationId: string;

  // Identity
  conditionCode: string;
  category: ConditionCategory;

  // Content
  title: string;
  description?: string;

  // Responsibility
  responsibleParty: ResponsibleParty;
  assignedTo?: string;

  // Status
  status: ConditionStatus;
  statusChangedAt?: Date;
  statusChangedBy?: string;

  // Auto-clear
  autoClearRules?: AutoClearRule[];

  // Clearing
  clearing?: {
    clearedAt: Date;
    clearedBy: string;
    notes?: string;
    supportingDocumentId?: string;
  };

  // Source
  source: 'SYSTEM' | 'UW' | 'INVESTOR';
  ruleId?: string;

  // Encompass
  encompassConditionId?: string;
  syncedToEncompass: boolean;

  createdAt: Date;
  updatedAt: Date;
}

type ConditionCategory = 'PTD' | 'PTC' | 'PTF' | 'POC';
type ConditionStatus = 'OPEN' | 'WAIVED' | 'CLEARED' | 'REOPENED';
type ResponsibleParty = 'BORROWER' | 'LO' | 'PROCESSOR' | 'UW' | 'CLOSER';

interface AutoClearRule {
  type: 'DOCUMENT_RECEIVED' | 'FIELD_VALUE' | 'MANUAL_CLEAR';
  docType?: string;
  field?: string;
  operator?: RuleOperator;
  value?: any;
  requiredRole?: string;
}
```

## Encompass Field Mapping Reference

```typescript
interface FieldMapping {
  platform: string;                   // Dot-notation path in our model
  encompass: string;                  // Encompass field ID or CX.* field
  transform: TransformType;
  bidirectional: boolean;
  required: boolean;
}

type TransformType =
  | 'direct'                          // No transformation
  | 'encrypt'                         // Encrypt/decrypt
  | 'decrypt'
  | 'normalizeAddress'                // Standardize address format
  | 'normalizePhone'                  // Standardize phone format
  | 'mapEnum'                         // Map between enum values
  | 'roundDecimal'                    // Round to N decimal places
  | 'toDate'                          // Convert to date
  | 'toMoney'                         // Convert to money
  | 'custom';                         // Custom transformation function
```

## Event Model

```typescript
interface DomainEvent {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;

  // For Encompass correlation
  encompassLoanGuid?: string;

  timestamp: Date;
  version: number;

  payload: Record<string, any>;

  metadata: {
    correlationId: string;
    causationId?: string;
    sourceService: string;
    userId?: string;
  };
}

// Event types
type LoanEventType =
  | 'LEAD_CREATED'
  | 'LEAD_QUALIFIED'
  | 'LEAD_CONVERTED'
  | 'APPLICATION_CREATED'
  | 'APPLICATION_SUBMITTED'
  | 'BORROWER_UPDATED'
  | 'PROPERTY_UPDATED'
  | 'CREDIT_ORDERED'
  | 'CREDIT_RECEIVED'
  | 'AVM_ORDERED'
  | 'AVM_RECEIVED'
  | 'ELIGIBILITY_EVALUATED'
  | 'PRICING_CALCULATED'
  | 'RATE_LOCKED'
  | 'CONDITION_ADDED'
  | 'CONDITION_CLEARED'
  | 'CONDITION_REOPENED'
  | 'DECISION_MADE'
  | 'MILESTONE_CHANGED'
  | 'DOCUMENT_RECEIVED'
  | 'DOCUMENT_CLASSIFIED'
  | 'ENCOMPASS_SYNCED'
  | 'ENCOMPASS_SYNC_FAILED';
```
