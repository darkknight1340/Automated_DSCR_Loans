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
