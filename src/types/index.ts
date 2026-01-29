/**
 * DSCR Loan Automation Platform - Core Types
 * These types represent the canonical domain model used across all services.
 */

// =====================================================
// PRIMITIVE VALUE OBJECTS
// =====================================================

export interface Money {
  readonly amount: number; // In cents to avoid floating point issues
  readonly currency: string; // ISO 4217 (e.g., 'USD')
}

export interface Address {
  readonly street: string;
  readonly unit?: string;
  readonly city: string;
  readonly state: string;
  readonly zip: string;
  readonly county?: string;
  readonly country?: string;
}

export interface EncryptedField {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly keyId: string;
}

// =====================================================
// ENUMS
// =====================================================

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  DISQUALIFIED = 'DISQUALIFIED',
  CONVERTED = 'CONVERTED',
}

export enum LoanStatus {
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

export enum BorrowerType {
  INDIVIDUAL = 'INDIVIDUAL',
  ENTITY = 'ENTITY',
}

export enum EntityType {
  LLC = 'LLC',
  CORPORATION = 'CORPORATION',
  PARTNERSHIP = 'PARTNERSHIP',
  TRUST = 'TRUST',
}

export enum PropertyType {
  SFR = 'SFR',
  CONDO = 'CONDO',
  TOWNHOUSE = 'TOWNHOUSE',
  TWO_TO_FOUR_UNIT = '2_4_UNIT',
  MULTIFAMILY = 'MULTIFAMILY',
  MIXED_USE = 'MIXED_USE',
}

export enum OccupancyType {
  INVESTMENT = 'INVESTMENT',
  SECOND_HOME = 'SECOND_HOME',
}

export enum LoanPurpose {
  PURCHASE = 'PURCHASE',
  RATE_TERM_REFI = 'RATE_TERM_REFI',
  CASH_OUT_REFI = 'CASH_OUT_REFI',
}

export enum AmortizationType {
  FIXED = 'FIXED',
  ARM = 'ARM',
  IO = 'IO',
}

export enum CreditBureau {
  EXPERIAN = 'EXPERIAN',
  EQUIFAX = 'EQUIFAX',
  TRANSUNION = 'TRANSUNION',
}

export enum CreditPullType {
  SOFT = 'SOFT',
  HARD = 'HARD',
}

export enum ConditionCategory {
  PTD = 'PTD', // Prior to Documents
  PTC = 'PTC', // Prior to Close
  PTF = 'PTF', // Prior to Funding
  POC = 'POC', // Post-Closing
}

export enum ConditionStatus {
  OPEN = 'OPEN',
  WAIVED = 'WAIVED',
  CLEARED = 'CLEARED',
  REOPENED = 'REOPENED',
}

export enum DecisionResult {
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  PENDING = 'PENDING',
  EXCEPTION = 'EXCEPTION',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export enum RuleResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  WARN = 'WARN',
  SKIP = 'SKIP',
}

export enum SyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  CONFLICT = 'CONFLICT',
}

// =====================================================
// LEAD AGGREGATE
// =====================================================

export interface Lead {
  id: string;
  externalId?: string;
  sourceId: string;

  contact: {
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    phoneSecondary?: string;
  };

  propertyInterest?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    propertyType?: PropertyType;
    estimatedValue?: Money;
  };

  loanInterest?: {
    purpose: LoanPurpose;
    requestedAmount?: Money;
    estimatedRent?: Money;
    hasExistingMortgage?: boolean;
    existingMortgageBalance?: Money;
  };

  qualification: {
    statedCreditScoreRange?: string;
    isEntityBorrower: boolean;
    entityName?: string;
  };

  status: LeadStatus;
  score?: number;
  assignedLoId?: string;
  convertedToApplicationId?: string;

  consent: {
    marketing: boolean;
    marketingAt?: Date;
    tcpa: boolean;
    tcpaAt?: Date;
  };

  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };

  createdAt: Date;
  updatedAt: Date;
  firstContactedAt?: Date;
  qualifiedAt?: Date;
  convertedAt?: Date;
}

export interface LeadSource {
  id: string;
  name: string;
  sourceType: 'website' | 'referral' | 'broker' | 'marketing' | 'marketplace';
  apiKeyHash?: string;
  isActive: boolean;
  costPerLead?: Money;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// BORROWER AGGREGATE
// =====================================================

export interface Borrower {
  id: string;
  borrowerType: BorrowerType;

  individual?: {
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    ssn: EncryptedField;
    ssnLast4: string;
    dateOfBirth: Date;
    citizenship: string;
  };

  entity?: {
    name: string;
    type: EntityType;
    stateOfFormation: string;
    formationDate: Date;
    ein: EncryptedField;
    einLast4: string;
  };

  contact: {
    email: string;
    phone: string;
    phoneMobile?: string;
  };

  mailingAddress: Address;

  verification: {
    identityVerified: boolean;
    identityVerifiedAt?: Date;
    identityVerificationMethod?: string;
  };

  guarantors?: Guarantor[];

  createdAt: Date;
  updatedAt: Date;
}

export interface Guarantor {
  id: string;
  borrowerId: string;

  firstName: string;
  middleName?: string;
  lastName: string;
  ssn: EncryptedField;
  ssnLast4: string;
  dateOfBirth: Date;

  ownershipPercentage: number;

  contact: {
    email: string;
    phone: string;
  };

  address: Address;

  guaranteeType: 'FULL' | 'LIMITED' | 'SEVERAL';
  isPrimary: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// PROPERTY AGGREGATE
// =====================================================

export interface Property {
  id: string;

  address: Address;

  characteristics: {
    propertyType: PropertyType;
    occupancyType: OccupancyType;
    yearBuilt?: number;
    squareFeet?: number;
    lotSizeSqft?: number;
    bedrooms?: number;
    bathrooms?: number;
    stories?: number;
    units: number;
  };

  hoa?: {
    hasHoa: boolean;
    monthlyDues?: Money;
    hoaName?: string;
  };

  legal?: {
    apn?: string;
    legalDescription?: string;
  };

  rental: {
    isCurrentlyRented: boolean;
    currentMonthlyRent?: Money;
    marketMonthlyRent?: Money;
    isShortTermRental: boolean;
  };

  rentRoll?: RentRollEntry[];

  verification: {
    addressStandardized: boolean;
    geocoded: boolean;
    latitude?: number;
    longitude?: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

export interface RentRollEntry {
  id: string;
  propertyId: string;

  unitNumber?: string;
  unitType?: string;
  squareFeet?: number;

  tenantName?: string;
  leaseStartDate?: Date;
  leaseEndDate?: Date;
  leaseType: 'ANNUAL' | 'MONTH_TO_MONTH' | 'STR';

  monthlyRent: Money;
  securityDeposit?: Money;

  isVacant: boolean;
  vacancyStartDate?: Date;

  strMetrics?: {
    avgNightlyRate: Money;
    avgOccupancyRate: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// APPLICATION AGGREGATE
// =====================================================

export interface Application {
  id: string;
  leadId?: string;

  borrowerId: string;
  propertyId: string;

  loanTerms: {
    purpose: LoanPurpose;
    amount: Money;
    termMonths: number;
    amortizationType: AmortizationType;
    interestOnlyPeriodMonths?: number;
  };

  financials: {
    purchasePrice?: Money;
    estimatedValue: Money;
    existingLiensTotal: Money;
    cashOutAmount?: Money;
    cashOutPurpose?: string;
  };

  ratios: {
    ltv?: number;
    cltv?: number;
  };

  reserves: {
    monthsRequired: number;
    verified?: Money;
  };

  status: LoanStatus;
  submittedAt?: Date;

  assignments: {
    loId?: string;
    processorId?: string;
    uwId?: string;
    closerId?: string;
  };

  encompassLink?: EncompassLink;

  createdAt: Date;
  updatedAt: Date;
}

export interface EncompassLink {
  applicationId: string;
  encompassLoanGuid: string;
  encompassLoanNumber?: string;
  encompassFolder?: string;

  lastSyncToEncompass?: Date;
  lastSyncFromEncompass?: Date;
  syncStatus: SyncStatus;
  syncErrorMessage?: string;
  syncRetryCount: number;

  fieldsPendingSync?: string[];

  currentMilestone?: string;
  milestoneUpdatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// DSCR CALCULATION
// =====================================================

export interface DSCRCalculation {
  id: string;
  applicationId: string;
  propertyId: string;

  income: {
    grossMonthlyRent: Money;
    vacancyRate: number;
    effectiveGrossRent: Money;
    otherIncome?: Money;
  };

  expenses: {
    propertyTaxMonthly: Money;
    insuranceMonthly: Money;
    hoaMonthly: Money;
    managementFeeMonthly: Money;
    floodInsuranceMonthly?: Money;
    otherExpenses?: Money;
    totalExpenses: Money;
  };

  noi: {
    monthly: Money;
    annual: Money;
  };

  debtService: {
    principalAndInterest: Money;
    totalPITIA: Money;
  };

  dscrRatio: number;

  calculatedAt: Date;
  calculatorVersion: string;
  inputs: Record<string, unknown>;
  formula: string;
}

// =====================================================
// CREDIT
// =====================================================

export interface CreditReport {
  id: string;
  applicationId: string;
  borrowerId: string;

  orderId: string;
  vendorOrderId?: string;
  vendor: string;

  pullType: CreditPullType;
  bureausRequested: CreditBureau[];
  bureausReturned: CreditBureau[];

  scores: {
    experian?: number;
    equifax?: number;
    transunion?: number;
    representative: number;
    model: string;
  };

  status: 'PENDING' | 'RECEIVED' | 'ERROR' | 'EXPIRED';

  tradelines?: Tradeline[];
  publicRecords?: PublicRecord[];
  inquiries?: Inquiry[];

  orderedAt: Date;
  receivedAt?: Date;
  expiresAt?: Date;

  syncedToEncompass: boolean;
  encompassServiceId?: string;

  createdAt: Date;
}

export interface Tradeline {
  id: string;
  creditReportId: string;

  creditorName: string;
  accountNumberMasked: string;
  accountType: string;

  creditLimit?: Money;
  highBalance?: Money;
  currentBalance: Money;
  monthlyPayment?: Money;

  accountStatus: 'OPEN' | 'CLOSED' | 'PAID';
  paymentStatus: string;

  openedDate?: Date;
  closedDate?: Date;
  lastActivityDate?: Date;
  times30Late: number;
  times60Late: number;
  times90Late: number;

  isMortgage: boolean;
  propertyAddress?: string;
}

export interface PublicRecord {
  id: string;
  creditReportId: string;
  type: string;
  filingDate?: Date;
  amount?: Money;
  status: string;
}

export interface Inquiry {
  id: string;
  creditReportId: string;
  creditorName: string;
  inquiryDate: Date;
  inquiryType: 'HARD' | 'SOFT';
}

// =====================================================
// AVM
// =====================================================

export interface AVMReport {
  id: string;
  propertyId: string;
  applicationId?: string;

  orderId: string;
  vendor: string;
  productType?: string;

  valuation: {
    estimated: Money;
    low: Money;
    high: Money;
    confidenceScore: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    fsd?: number;
  };

  supportingData?: {
    comparableCount?: number;
    lastSaleDate?: Date;
    lastSalePrice?: Money;
  };

  status: 'PENDING' | 'RECEIVED' | 'NO_VALUE' | 'ERROR';

  reportData?: Record<string, unknown>;

  orderedAt: Date;
  receivedAt?: Date;
  valueAsOfDate?: Date;

  syncedToEncompass: boolean;
}

// =====================================================
// RULES ENGINE
// =====================================================

export interface RuleVersion {
  id: string;
  ruleSetName: string;
  version: string;

  rules: Rule[];

  description?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;

  createdBy?: string;
  approvedBy?: string;
  approvedAt?: Date;

  isActive: boolean;
  createdAt: Date;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: string;

  condition: RuleCondition;

  onPass: RuleOutcome;
  onFail: RuleOutcome;

  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  isActive: boolean;
}

export interface RuleCondition {
  type: 'SIMPLE' | 'COMPOUND' | 'CUSTOM';

  field?: string;
  operator?: string;
  value?: unknown;

  logic?: 'AND' | 'OR';
  conditions?: RuleCondition[];

  customFunction?: string;
}

export interface RuleOutcome {
  result: RuleResult;
  message: string;
  createCondition?: {
    code: string;
    category: ConditionCategory;
    title: string;
    description: string;
  };
}

export interface RuleEvaluation {
  id: string;
  applicationId: string;
  ruleVersionId: string;

  evaluationType: 'ELIGIBILITY' | 'PRICING' | 'CONDITIONS';
  triggerEvent?: string;

  inputSnapshot: Record<string, unknown>;

  overallResult: DecisionResult;
  ruleResults: RuleEvaluationResult[];

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

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  category: string;
  result: RuleResult;
  inputValues: Record<string, unknown>;
  threshold?: unknown;
  actualValue?: unknown;
  message: string;
  conditionCreated?: string;
}

// =====================================================
// PRICING
// =====================================================

export interface PricingCard {
  id: string;
  cardName: string;
  productType: string;

  effectiveDate: Date;
  expirationDate?: Date;

  baseRates: Record<number, number>;
  lockPeriods: Record<number, number>;
  adders: PricingAdder[];

  isActive: boolean;
  createdBy?: string;
  approvedBy?: string;
  createdAt: Date;
}

export interface PricingAdder {
  id: string;
  name: string;
  category: string;

  condition: {
    field: string;
    ranges: AdderRange[];
  };

  adjustmentType: 'RATE' | 'POINTS';
}

export interface AdderRange {
  min: number;
  max: number;
  adjustment: number;
}

export interface PricingCalculation {
  id: string;
  applicationId: string;
  pricingCardId: string;

  inputs: {
    ltvRatio: number;
    creditScore: number;
    dscrRatio: number;
    loanAmount: Money;
    lockPeriodDays: number;
    propertyType: PropertyType;
    loanPurpose: LoanPurpose;
    prepayPenalty?: string;
  };

  baseRate: number;
  adders: AppliedAdder[];
  totalAdders: number;
  finalRate: number;

  lock?: {
    isLocked: boolean;
    lockedAt?: Date;
    expiresAt?: Date;
  };

  calculatedAt: Date;
  syncedToEncompass: boolean;
}

export interface AppliedAdder {
  adderId: string;
  name: string;
  category: string;
  inputValue: unknown;
  adjustment: number;
  reason: string;
}

// =====================================================
// CONDITIONS
// =====================================================

export interface Condition {
  id: string;
  applicationId: string;

  conditionCode: string;
  category: ConditionCategory;

  title: string;
  description?: string;

  responsibleParty: 'BORROWER' | 'LO' | 'PROCESSOR' | 'UW' | 'CLOSER';
  assignedTo?: string;

  status: ConditionStatus;
  statusChangedAt?: Date;
  statusChangedBy?: string;

  autoClearRules?: AutoClearRule[];

  clearing?: {
    clearedAt: Date;
    clearedBy: string;
    notes?: string;
    supportingDocumentId?: string;
  };

  source: 'SYSTEM' | 'UW' | 'INVESTOR';
  ruleId?: string;

  encompassConditionId?: string;
  syncedToEncompass: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface AutoClearRule {
  type: 'DOCUMENT_RECEIVED' | 'FIELD_VALUE' | 'MANUAL_CLEAR';
  docType?: string;
  field?: string;
  operator?: string;
  value?: unknown;
  requiredRole?: string;
}

// =====================================================
// DECISIONS
// =====================================================

export interface Decision {
  id: string;
  applicationId: string;

  decisionType: 'PRE_APPROVAL' | 'FINAL_APPROVAL' | 'DENIAL' | 'SUSPENSION';
  decisionResult: DecisionResult;

  eligibilityEvaluationId?: string;
  pricingCalculationId?: string;

  summary: string;
  conditionsAdded: number;
  exceptionsNoted?: Record<string, unknown>[];

  denialReasons?: string[];
  adverseActionRequired: boolean;
  adverseActionSentAt?: Date;

  decidedBy: string;
  decisionAuthority: 'AUTO' | 'LO' | 'UW' | 'SENIOR_UW' | 'CREDIT_COMMITTEE';

  isOverride: boolean;
  overrideReason?: string;
  overrideApprovedBy?: string;

  decidedAt: Date;
  syncedToEncompass: boolean;
}

// =====================================================
// DOCUMENTS
// =====================================================

export interface Document {
  id: string;
  applicationId?: string;
  borrowerId?: string;
  propertyId?: string;

  documentTypeCode: string;

  file: {
    originalFilename: string;
    storedFilename: string;
    storagePath: string;
    storageBucket: string;
    fileSizeBytes: number;
    mimeType: string;
    pageCount?: number;
  };

  contentHash: string;

  classification: {
    isAutoClassified: boolean;
    confidence?: number;
  };

  status: 'UPLOADED' | 'PROCESSING' | 'CLASSIFIED' | 'VERIFIED' | 'REJECTED';
  ocrStatus?: string;
  ocrText?: string;

  verification?: {
    verifiedAt: Date;
    verifiedBy: string;
  };

  encompassDocumentId?: string;
  syncedToEncompass: boolean;

  source: 'BORROWER_UPLOAD' | 'EMAIL' | 'VENDOR' | 'SYSTEM';
  uploadedBy?: string;

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// AUDIT
// =====================================================

export interface AuditEvent {
  id: string;

  eventType: string;
  eventCategory: 'LOAN' | 'USER' | 'SYSTEM' | 'SECURITY' | 'COMPLIANCE';

  applicationId?: string;
  encompassLoanGuid?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;

  action: string;
  resourceType?: string;
  resourceId?: string;

  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  changes?: Record<string, unknown>;

  metadata?: Record<string, unknown>;

  correlationId: string;
  causationId?: string;

  createdAt: Date;
}

// =====================================================
// WORKFLOW
// =====================================================

export interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  applicationId: string;

  currentStep: string;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

  context: Record<string, unknown>;

  startedAt: Date;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTask {
  id: string;
  workflowInstanceId?: string;
  applicationId: string;

  taskType: string;
  title: string;
  description?: string;

  assignedTo?: string;
  assignedRole?: string;

  priority: number;
  dueAt?: Date;
  slaHours?: number;

  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED';

  completedAt?: Date;
  completedBy?: string;
  outcome?: string;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface MilestoneHistory {
  id: string;
  applicationId: string;
  encompassLoanGuid?: string;

  previousMilestone?: string;
  newMilestone: string;

  changedBy: string;
  changeSource: 'AUTOMATION' | 'MANUAL' | 'ENCOMPASS_WEBHOOK';
  changeReason?: string;

  changedAt: Date;
  timeInPreviousMs?: number;
}

// =====================================================
// API TYPES
// =====================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: {
    requestId: string;
    timestamp: Date;
    duration: number;
  };
}
