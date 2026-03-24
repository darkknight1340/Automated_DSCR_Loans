// ============================================================================
// DSCR Platform - Shared Types
// Mirrors backend types for frontend consumption
// ============================================================================

// -----------------------------------------------------------------------------
// User & Auth Types
// -----------------------------------------------------------------------------

export type UserRole = 'LOAN_OFFICER' | 'PROCESSOR' | 'UNDERWRITER' | 'CLOSER' | 'POST_CLOSER' | 'MANAGER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Lead Types
// -----------------------------------------------------------------------------

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'NURTURING'
  | 'APPLICATION_STARTED'
  | 'CONVERTED'
  | 'DISQUALIFIED'
  | 'DEAD';

export type LeadSource =
  | 'WEBSITE'
  | 'REFERRAL'
  | 'BROKER'
  | 'PAID_AD'
  | 'ORGANIC'
  | 'PARTNER'
  | 'OTHER';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status: LeadStatus;
  source: LeadSource;
  score: number; // 0-100
  assignedLOId?: string;
  assignedLO?: User;
  propertyAddress?: string;
  propertyState?: string;
  estimatedLoanAmount?: number; // cents
  estimatedPropertyValue?: number; // cents
  estimatedDSCR?: number;
  decisionResult?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  notes?: string;
  lastContactedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Application Types
// -----------------------------------------------------------------------------

export type ApplicationStatus = 'ACTIVE' | 'APPROVED' | 'DENIED' | 'WITHDRAWN' | 'SUSPENDED';

export type Milestone =
  | 'LEADS'
  | 'LEADS_VERIFIED'
  | 'CONTACTED'
  | 'REACHED_LANDING'
  | 'VERIFIED_INFO'
  | 'FUNDED'
  | 'STARTED'
  | 'APPLICATION'
  | 'PRE_APPROVED'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'CONDITIONALLY_APPROVED'
  | 'APPROVED'
  | 'DOCS_OUT'
  | 'DOCS_BACK'
  | 'CLEAR_TO_CLOSE'
  | 'CLOSING'
  | 'COMPLETION'
  | 'DENIED'
  | 'WITHDRAWN';

export type PropertyType =
  | 'SFR'
  | 'CONDO'
  | 'TOWNHOUSE'
  | 'DUPLEX'
  | 'TRIPLEX'
  | 'FOURPLEX'
  | 'MULTIFAMILY_5PLUS';

export type LoanPurpose = 'PURCHASE' | 'RATE_TERM_REFINANCE' | 'CASH_OUT_REFINANCE';

export type OccupancyType = 'INVESTMENT' | 'SECOND_HOME';

export interface Property {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  propertyType: PropertyType;
  units: number;
  yearBuilt?: number;
  squareFeet?: number;
  currentValue?: number; // cents
  purchasePrice?: number; // cents
}

export interface LoanTerms {
  loanAmountCents: number;
  interestRate: number;
  loanTermMonths: number;
  amortizationMonths: number;
  loanPurpose: LoanPurpose;
  occupancyType: OccupancyType;
}

export interface DSCRCalculation {
  grossRentalIncomeCents: number;
  vacancyRate: number;
  effectiveGrossIncomeCents: number;
  annualTaxesCents: number;
  annualInsuranceCents: number;
  annualHOACents: number;
  floodInsuranceCents: number;
  monthlyPITIACents: number;
  monthlyNOICents: number;
  dscr: number;
  dscrTier: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'MARGINAL' | 'BELOW_MIN';
}

export interface Application {
  id: string;
  leadId: string;
  encompassLoanId?: string;
  loanNumber?: string;
  status: ApplicationStatus;
  milestone: Milestone;
  property: Property;
  loanTerms: LoanTerms;
  dscrCalculation?: DSCRCalculation;
  ltv?: number;
  cltv?: number;
  creditScore?: number;
  assignedLOId: string;
  assignedLO?: User;
  assignedProcessorId?: string;
  assignedProcessor?: User;
  conditionCounts?: {
    total: number;
    pending: number;
    cleared: number;
    waived: number;
  };
  createdAt: string;
  updatedAt: string;
  milestoneUpdatedAt: string;
}

// -----------------------------------------------------------------------------
// Task Types
// -----------------------------------------------------------------------------

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  applicationId: string;
  application?: Application;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedRole: UserRole;
  assignedUserId?: string;
  assignedUser?: User;
  dueAt?: string;
  slaHours?: number;
  completedAt?: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Condition Types
// -----------------------------------------------------------------------------

export type ConditionCategory = 'PTD' | 'PTC' | 'PTF'; // Prior to Docs, Clear, Fund
export type ConditionStatus = 'PENDING' | 'RECEIVED' | 'UNDER_REVIEW' | 'CLEARED' | 'WAIVED' | 'REJECTED';

export interface Condition {
  id: string;
  applicationId: string;
  code: string;
  description: string;
  category: ConditionCategory;
  status: ConditionStatus;
  documentType?: string;
  notes?: string;
  clearedBy?: string;
  clearedAt?: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Document Types
// -----------------------------------------------------------------------------

export type DocumentStatus = 'PENDING' | 'UPLOADED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface Document {
  id: string;
  applicationId: string;
  type: string;
  name: string;
  status: DocumentStatus;
  uploadedAt?: string;
  uploadedBy?: string;
  fileUrl?: string;
  expiresAt?: string;
}

// -----------------------------------------------------------------------------
// Analytics Types
// -----------------------------------------------------------------------------

export interface FunnelStage {
  stage: string;
  count: number;
  conversionRate: number | null;
  previousStage?: string;
}

export interface FunnelMetrics {
  stages: FunnelStage[];
  overallConversion: number;
  period: {
    from: string;
    to: string;
  };
}

export type ContactMethod = 'email' | 'physical_mail' | 'voice_call' | 'text';

export interface ContactMethodMetrics {
  method: ContactMethod;
  label: string;
  contacted: number;
  converted: number;
  conversionRate: number;
}

export interface PipelineMilestoneMetrics {
  milestone: Milestone;
  count: number;
  volumeCents: number;
  avgDaysInStage: number;
}

export interface SLABreach {
  applicationId: string;
  loanNumber?: string;
  milestone: Milestone;
  daysInStage: number;
  slaHours: number;
  breachedAt: string;
}

export interface PipelineMetrics {
  byMilestone: PipelineMilestoneMetrics[];
  slaBreaches: SLABreach[];
  totalVolumeCents: number;
  totalCount: number;
}

export interface RiskBucket {
  range: string;
  count: number;
  min: number;
  max: number;
}

export interface StateDistribution {
  state: string;
  count: number;
  volumeCents: number;
}

export interface RiskDistribution {
  dscr: { buckets: RiskBucket[] };
  ltv: { buckets: RiskBucket[] };
  creditScore: { buckets: RiskBucket[] };
  byState: StateDistribution[];
}

export interface VelocityMetrics {
  period: string;
  avgDaysLeadToFund: number;
  count: number;
}

// -----------------------------------------------------------------------------
// Lead Detail Types (from /leads/{id}/detail endpoint)
// -----------------------------------------------------------------------------

export interface LeadDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status: string;
  createdAt: string;
  analysisData?: AnalysisData;
  application?: {
    id: string;
    loanAmount: number | null;
    status: string | null;
    ltvRatio: number | null;
    loanPurpose: string | null;
  };
  property?: {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    propertyType: string | null;
    yearBuilt: number | null;
    squareFeet: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    units: number | null;
    stories: number | null;
    pool: boolean | null;
    garageSpaces: number | null;
    estimatedValue: number | null;
    assessedValue: number | null;
    annualTaxes: number | null;
    marketMonthlyRent: number | null;
    ownerInfo: OwnerContact[] | null;
    existingLoans: ExistingLoan[] | null;
  };
  decision?: {
    result: string;
    summary: string | null;
    denialReasons: { reasons: string[] } | null;
    decidedAt: string | null;
  };
  offer?: {
    token: string;
    status: string | null;
    url: string;
  };
  avm?: {
    value: number;
    confidence: string | null;
  };
}

export interface AnalysisData {
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    type: string | null;
    yearBuilt: number | null;
    squareFeet: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    units: number | null;
    pool: boolean | null;
    garageSpaces: number | null;
    estimatedValue: number | null;
    assessedValue: number | null;
    annualTaxes: number | null;
  };
  ownerInfo: OwnerContact[];
  existingLoans: ExistingLoan[];
  dscr: {
    ratio: number | null;  // NOI method (conservative)
    simpleDscr: number | null;  // Simple Rent/PITIA (like Encompass)
    meetsMinimum: boolean;
    monthlyRent: number;
    monthlyPITIA: number;
  };
  avm: AVMWithSources;
  rent?: RentWithSources;
  rentEstimate: number | null;
  rentalComps: RentalComp[] | null;
  salesComps?: SalesComp[] | null;
  dataSources?: DataSourceAttribution;
  loanAmount: number;
  loanPurpose: string;
  decision: {
    result: string | null;
    reason: string | null;
    rejectionReasons: string[] | null;
    finalRate: number | null;
    conditions: number;
  };
  offerToken: string | null;
  encompassValidation?: EncompassValidation;
}

export interface EncompassValidation {
  loanId: string;
  loanGuid: string;
  milestone: string;
  loanAmount: number;
  interestRate: number;
  ltv: number;
  monthlyPI: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  totalPITIA: number;
  encompassDSCR: number;
  pipelineDSCR: number;
  dscrDiff: number;
  dscrDiffPct: number;
  dscrMatch: boolean;

  ownerComparison?: {
    encompassOwner: string;
    pipelineOwner: string;
    match: boolean;
  };

  avmComparison?: {
    encompassValue: number;
    pipelineValue: number;
    diff: number;
    diffPct: number;
    match: boolean;
  };

  rentComparison?: {
    encompassImpliedRent: number;
    encompassGrossRent: number | null;
    pipelineRent: number;
    diff: number;
    diffPct: number;
    match: boolean;
  };

  propertyComparison?: {
    encompass: {
      type: string | null;
      sqft: number | null;
      bedrooms: number | null;
      bathrooms: number | null;
      yearBuilt: number | null;
      units: number | null;
    };
    pipeline: {
      type: string | null;
      sqft: number | null;
      bedrooms: number | null;
      bathrooms: number | null;
      yearBuilt: number | null;
      units: number | null;
    };
    match: boolean;
    sqftMatch: boolean;
    bedsMatch: boolean;
    bathsMatch: boolean;
    yearMatch: boolean;
  };

  lienComparison?: {
    encompassFirstLien: number | null;
    encompassSecondLien: number | null;
    encompassTotalBalance: number;
    pipelineTotalBalance: number;
    pipelineLoans: number;
    diff: number;
    diffPct: number;
    match: boolean;
  };

  summary?: {
    dscrMatch: boolean;
    ownerMatch: boolean;
    avmMatch: boolean;
    rentMatch: boolean;
    propertyMatch: boolean;
    lienMatch: boolean;
    allMatch: boolean;
    matchCount: number;
    totalChecks: number;
  };
}

export interface OwnerContact {
  name: string;
  ownerType: string;
  ownerNumber?: number;
  firstName?: string;
  lastName?: string;
  phones: string[];
  emails: string[];
  deceased?: boolean;
  mailingAddress?: Record<string, string>;
  ownerOccupied?: boolean;
  ownershipMonths?: number;
}

export interface ExistingLoan {
  position: number;
  lenderName: string | null;
  originalAmount: number | null;
  estimatedBalance: number | null;
  interestRate: number | null;
  estimatedPayment: number | null;
  loanType: string | null;
  termMonths: number | null;
  recordingDate: string | null;
  dueDate: string | null;
  isActive: boolean;
  loanFlags: string[];
  documentNumber?: string;
  source?: string;  // "DataTree" | "PropertyReach" etc.
}

export interface RentalComp {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  rent: number;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  distance: number | null;
  correlation: number | null;
}

export interface SalesComp {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  salePrice: number;
  saleDate?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  distance?: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
}

// -----------------------------------------------------------------------------
// Data Source Attribution Types
// -----------------------------------------------------------------------------

export interface VerificationResult {
  source: string;
  value?: number;
  diffPct?: number;
  match?: boolean;
  error?: string;
}

export interface PremiumAVM {
  source: string;
  value: number;
  confidence?: string;
  usedForDecision?: boolean;
}

export interface DataSourceAttribution {
  property?: string;
  avm?: string;
  avmVerified?: string[];
  premiumAvm?: string;
  rent?: string;
  rentVerified?: string[];
  taxes?: string;
}

export interface AVMWithSources {
  value: number;
  confidence: string | null;
  source?: string;
  verifiedBy?: string[];
  verification?: Record<string, VerificationResult>;
  premiumAvm?: PremiumAVM;
}

export interface RentWithSources {
  estimate: number;
  source?: string;
  verifiedBy?: string[];
  verification?: Record<string, VerificationResult>;
}

export interface LeadStats {
  totalLeads: number;
  activeLeads: number;
  applications: number;
  offers: number;
  approvals: number;
  rejections: number;
}

// -----------------------------------------------------------------------------
// API Response Types
// -----------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
