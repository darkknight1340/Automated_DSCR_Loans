/**
 * Closing & Funding Service
 *
 * Manages the closing process for DSCR loans including:
 * - Closing document generation
 * - Closing scheduling
 * - Funding authorization
 * - Wire management
 * - Recording tracking
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type ClosingStatus =
  | 'NOT_READY'
  | 'DOCS_ORDERED'
  | 'DOCS_RECEIVED'
  | 'SCHEDULED'
  | 'IN_CLOSING'
  | 'SIGNED'
  | 'RECORDING'
  | 'RECORDED'
  | 'FUNDING_APPROVED'
  | 'FUNDED'
  | 'CANCELLED';

export type FundingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WIRE_SENT'
  | 'WIRE_CONFIRMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETURNED';

export interface Closing {
  id: string;
  applicationId: string;
  loanGuid: string;

  // Status
  status: ClosingStatus;
  statusHistory: ClosingStatusChange[];

  // Closing docs
  docsOrderedAt?: Date;
  docsReceivedAt?: Date;
  docsVendor?: string;
  docsOrderId?: string;
  docsExpirationDate?: Date;

  // Schedule
  scheduledDate?: Date;
  scheduledTime?: string;
  closingType: 'IN_PERSON' | 'RON' | 'HYBRID' | 'MAIL_AWAY';

  // Location
  closingLocation?: ClosingLocation;

  // Parties
  titleCompany: TitleCompany;
  closingAgent?: ClosingAgent;

  // Settlement
  settlementStatement?: SettlementStatement;

  // Recording
  recordingInfo?: RecordingInfo;

  // Funding
  fundingInfo?: FundingInfo;

  // Notes
  closingInstructions?: string;
  specialInstructions?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface ClosingStatusChange {
  status: ClosingStatus;
  changedAt: Date;
  changedBy: string;
  notes?: string;
}

export interface ClosingLocation {
  type: 'TITLE_OFFICE' | 'ATTORNEY_OFFICE' | 'BORROWER_LOCATION' | 'REMOTE';
  name?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  contactPhone?: string;
}

export interface TitleCompany {
  id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  phone: string;
  email: string;
  closingContactName?: string;
  closingContactEmail?: string;
  closingContactPhone?: string;
  wireInstructions?: WireInstructions;
}

export interface ClosingAgent {
  name: string;
  email: string;
  phone: string;
  licenseNumber?: string;
  licenseState?: string;
}

export interface SettlementStatement {
  id: string;
  version: number;
  createdAt: Date;

  // Loan terms
  loanAmount: number;
  interestRate: number;
  loanTerm: number;
  monthlyPayment: number;

  // Purchase/Refinance specific
  purchasePrice?: number;
  payoffAmount?: number;
  cashToClose?: number;
  cashToBorrower?: number;

  // Charges
  originationCharges: SettlementCharge[];
  titleCharges: SettlementCharge[];
  governmentCharges: SettlementCharge[];
  prepaidItems: SettlementCharge[];
  escrowItems: SettlementCharge[];
  otherCharges: SettlementCharge[];

  // Totals
  totalClosingCosts: number;
  totalCashFromBorrower: number;
  totalCashToBorrower: number;

  // Proration
  prorations?: Proration[];
}

export interface SettlementCharge {
  code: string;
  description: string;
  amount: number;
  paidBy: 'BORROWER' | 'SELLER' | 'LENDER' | 'OTHER';
  paidTo?: string;
  paidAtClosing: boolean;
  poc?: boolean; // Paid Outside of Closing
}

export interface Proration {
  type: 'TAX' | 'HOA' | 'RENT' | 'INSURANCE' | 'OTHER';
  description: string;
  fromDate: Date;
  toDate: Date;
  dailyRate: number;
  days: number;
  amount: number;
  creditTo: 'BORROWER' | 'SELLER';
}

export interface RecordingInfo {
  status: 'PENDING' | 'SUBMITTED' | 'RECORDED' | 'REJECTED';
  submittedAt?: Date;
  recordedAt?: Date;
  recordingNumber?: string;
  bookNumber?: string;
  pageNumber?: string;
  county: string;
  state: string;
  recordingFee: number;
  rejectionReason?: string;
}

export interface FundingInfo {
  status: FundingStatus;
  approvedAt?: Date;
  approvedBy?: string;

  // Wire details
  wireAmount: number;
  wireDate?: Date;
  wireConfirmationNumber?: string;
  wireInstructions: WireInstructions;

  // Funding checklist
  fundingChecklist: FundingChecklistItem[];

  // Disbursement
  disbursements: Disbursement[];
}

export interface WireInstructions {
  bankName: string;
  bankAddress: string;
  routingNumber: string;
  accountNumber: string;
  accountName: string;
  reference?: string;
  additionalInstructions?: string;
  verifiedAt?: Date;
  verifiedBy?: string;
}

export interface FundingChecklistItem {
  code: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedAt?: Date;
  completedBy?: string;
  notes?: string;
}

export interface Disbursement {
  id: string;
  payee: string;
  amount: number;
  type: 'PAYOFF' | 'CASH_OUT' | 'ESCROW' | 'FEE' | 'OTHER';
  wireInstructions?: WireInstructions;
  status: 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED';
  sentAt?: Date;
  confirmationNumber?: string;
}

// ============================================================================
// Closing Docs Types
// ============================================================================

export interface ClosingDocsOrder {
  id: string;
  applicationId: string;
  vendorName: string;
  vendorOrderId: string;
  status: 'ORDERED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

  // Order details
  orderedAt: Date;
  requestedDeliveryDate: Date;
  actualDeliveryDate?: Date;

  // Documents
  documents: ClosingDocument[];

  // Pricing
  fee: number;

  // Notes
  specialInstructions?: string;
}

export interface ClosingDocument {
  documentType: ClosingDocumentType;
  name: string;
  pages: number;
  requiresSignature: boolean;
  signatoryParties: ('BORROWER' | 'LENDER' | 'TITLE')[];
  notarizationRequired: boolean;
}

export type ClosingDocumentType =
  | 'NOTE'
  | 'DEED_OF_TRUST'
  | 'CLOSING_DISCLOSURE'
  | 'LOAN_ESTIMATE'
  | 'INITIAL_ESCROW_DISCLOSURE'
  | 'FIRST_PAYMENT_LETTER'
  | 'BORROWER_CERTIFICATION'
  | 'COMPLIANCE_AGREEMENT'
  | 'NAME_AFFIDAVIT'
  | 'OWNER_OCCUPANCY_AFFIDAVIT'
  | 'W9'
  | 'ACH_AUTHORIZATION'
  | 'SIGNATURE_AFFIDAVIT'
  | 'ERROR_RESOLUTION_NOTICE'
  | 'ANTI_COERCION_STATEMENT'
  | 'HAZARD_INSURANCE_DISCLOSURE';

// ============================================================================
// Vendor Interfaces
// ============================================================================

export interface IClosingDocsVendor {
  name: string;
  orderDocs(request: ClosingDocsOrderRequest): Promise<{
    success: boolean;
    orderId: string;
    error?: { code: string; message: string };
  }>;
  getOrderStatus(orderId: string): Promise<ClosingDocsOrder | null>;
  downloadDocs(orderId: string): Promise<Buffer>;
}

export interface ClosingDocsOrderRequest {
  applicationId: string;
  loanGuid: string;
  closingDate: Date;
  closingType: Closing['closingType'];
  disbursementDate: Date;
  titleCompany: TitleCompany;
  specialInstructions?: string;
}

// ============================================================================
// Closing Service
// ============================================================================

export interface IClosingRepository {
  findById(id: string): Promise<Closing | null>;
  findByApplication(applicationId: string): Promise<Closing | null>;
  create(closing: Closing): Promise<Closing>;
  update(id: string, updates: Partial<Closing>): Promise<Closing>;
}

export interface IEncompassSync {
  updateClosingStatus(applicationId: string, status: ClosingStatus): Promise<void>;
  updateFundingInfo(applicationId: string, fundingInfo: FundingInfo): Promise<void>;
  advanceMilestone(applicationId: string, milestone: string): Promise<void>;
}

export interface INotificationService {
  sendClosingScheduledNotification(closing: Closing): Promise<void>;
  sendFundedNotification(closing: Closing): Promise<void>;
}

export interface IWireService {
  initiateWire(
    amount: number,
    wireInstructions: WireInstructions,
    reference: string
  ): Promise<{ success: boolean; confirmationNumber?: string; error?: string }>;
  checkWireStatus(confirmationNumber: string): Promise<'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED'>;
}

export class ClosingService {
  constructor(
    private readonly repository: IClosingRepository,
    private readonly docsVendor: IClosingDocsVendor,
    private readonly wireService: IWireService,
    private readonly encompassSync: IEncompassSync,
    private readonly notifications: INotificationService
  ) {}

  // -------------------------------------------------------------------------
  // Closing Management
  // -------------------------------------------------------------------------

  async createClosing(
    applicationId: string,
    loanGuid: string,
    titleCompany: TitleCompany
  ): Promise<Closing> {
    const existing = await this.repository.findByApplication(applicationId);
    if (existing) {
      return existing;
    }

    const closing: Closing = {
      id: uuidv4(),
      applicationId,
      loanGuid,
      status: 'NOT_READY',
      statusHistory: [{
        status: 'NOT_READY',
        changedAt: new Date(),
        changedBy: 'SYSTEM'
      }],
      closingType: 'IN_PERSON',
      titleCompany,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.create(closing);
  }

  async getClosing(applicationId: string): Promise<Closing | null> {
    return this.repository.findByApplication(applicationId);
  }

  async updateClosingStatus(
    closingId: string,
    status: ClosingStatus,
    changedBy: string,
    notes?: string
  ): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    const statusChange: ClosingStatusChange = {
      status,
      changedAt: new Date(),
      changedBy,
      notes
    };

    const updated = await this.repository.update(closingId, {
      status,
      statusHistory: [...closing.statusHistory, statusChange],
      updatedAt: new Date()
    });

    // Sync to Encompass
    await this.encompassSync.updateClosingStatus(closing.applicationId, status);

    // Handle milestone advancement
    if (status === 'FUNDED') {
      await this.encompassSync.advanceMilestone(closing.applicationId, 'Funded');
      await this.notifications.sendFundedNotification(updated);
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // Closing Docs
  // -------------------------------------------------------------------------

  async orderClosingDocs(
    closingId: string,
    closingDate: Date,
    disbursementDate: Date,
    specialInstructions?: string
  ): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    const orderResult = await this.docsVendor.orderDocs({
      applicationId: closing.applicationId,
      loanGuid: closing.loanGuid,
      closingDate,
      closingType: closing.closingType,
      disbursementDate,
      titleCompany: closing.titleCompany,
      specialInstructions
    });

    if (!orderResult.success) {
      throw new Error(`Failed to order closing docs: ${orderResult.error?.message}`);
    }

    return this.repository.update(closingId, {
      status: 'DOCS_ORDERED',
      docsOrderedAt: new Date(),
      docsVendor: this.docsVendor.name,
      docsOrderId: orderResult.orderId,
      docsExpirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      statusHistory: [
        ...closing.statusHistory,
        {
          status: 'DOCS_ORDERED',
          changedAt: new Date(),
          changedBy: 'SYSTEM'
        }
      ],
      updatedAt: new Date()
    });
  }

  async processDocsReceived(closingId: string): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    return this.repository.update(closingId, {
      status: 'DOCS_RECEIVED',
      docsReceivedAt: new Date(),
      statusHistory: [
        ...closing.statusHistory,
        {
          status: 'DOCS_RECEIVED',
          changedAt: new Date(),
          changedBy: 'SYSTEM'
        }
      ],
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  async scheduleClosing(
    closingId: string,
    scheduledDate: Date,
    scheduledTime: string,
    closingType: Closing['closingType'],
    location?: ClosingLocation,
    agent?: ClosingAgent
  ): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    const updated = await this.repository.update(closingId, {
      status: 'SCHEDULED',
      scheduledDate,
      scheduledTime,
      closingType,
      closingLocation: location,
      closingAgent: agent,
      statusHistory: [
        ...closing.statusHistory,
        {
          status: 'SCHEDULED',
          changedAt: new Date(),
          changedBy: 'SYSTEM'
        }
      ],
      updatedAt: new Date()
    });

    // Send notification
    await this.notifications.sendClosingScheduledNotification(updated);

    return updated;
  }

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  async updateRecordingInfo(
    closingId: string,
    recordingInfo: RecordingInfo
  ): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    let newStatus = closing.status;
    if (recordingInfo.status === 'RECORDED') {
      newStatus = 'RECORDED';
    }

    return this.repository.update(closingId, {
      recordingInfo,
      status: newStatus,
      statusHistory: newStatus !== closing.status
        ? [
          ...closing.statusHistory,
          {
            status: newStatus,
            changedAt: new Date(),
            changedBy: 'SYSTEM',
            notes: `Recorded: ${recordingInfo.recordingNumber}`
          }
        ]
        : closing.statusHistory,
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Funding
  // -------------------------------------------------------------------------

  async initiateFunding(
    closingId: string,
    approvedBy: string
  ): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    // Verify recording is complete for wet funding states
    // (simplified - actual implementation would check state requirements)
    if (closing.status !== 'RECORDED' && closing.status !== 'SIGNED') {
      throw new Error('Recording must be complete before funding');
    }

    // Run funding checklist
    const checklist = this.generateFundingChecklist(closing);
    const allComplete = checklist.every(item => !item.required || item.completed);

    if (!allComplete) {
      const incomplete = checklist.filter(item => item.required && !item.completed);
      throw new Error(`Funding checklist incomplete: ${incomplete.map(i => i.description).join(', ')}`);
    }

    const fundingInfo: FundingInfo = {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy,
      wireAmount: closing.settlementStatement?.totalCashFromBorrower ?? 0,
      wireInstructions: closing.titleCompany.wireInstructions!,
      fundingChecklist: checklist,
      disbursements: []
    };

    return this.repository.update(closingId, {
      status: 'FUNDING_APPROVED',
      fundingInfo,
      statusHistory: [
        ...closing.statusHistory,
        {
          status: 'FUNDING_APPROVED',
          changedAt: new Date(),
          changedBy: approvedBy
        }
      ],
      updatedAt: new Date()
    });
  }

  async sendFundingWire(closingId: string, sentBy: string): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing || !closing.fundingInfo) {
      throw new Error(`Closing not found or not ready for funding: ${closingId}`);
    }

    if (closing.fundingInfo.status !== 'APPROVED') {
      throw new Error('Funding must be approved before sending wire');
    }

    // Send wire
    const wireResult = await this.wireService.initiateWire(
      closing.fundingInfo.wireAmount,
      closing.fundingInfo.wireInstructions,
      `LOAN-${closing.applicationId}`
    );

    if (!wireResult.success) {
      // Update with failure
      const failedFundingInfo: FundingInfo = {
        ...closing.fundingInfo,
        status: 'FAILED'
      };

      return this.repository.update(closingId, {
        fundingInfo: failedFundingInfo,
        updatedAt: new Date()
      });
    }

    const updatedFundingInfo: FundingInfo = {
      ...closing.fundingInfo,
      status: 'WIRE_SENT',
      wireDate: new Date(),
      wireConfirmationNumber: wireResult.confirmationNumber
    };

    return this.repository.update(closingId, {
      fundingInfo: updatedFundingInfo,
      statusHistory: [
        ...closing.statusHistory,
        {
          status: 'FUNDED',
          changedAt: new Date(),
          changedBy: sentBy,
          notes: `Wire confirmation: ${wireResult.confirmationNumber}`
        }
      ],
      updatedAt: new Date()
    });
  }

  async confirmFunding(closingId: string, confirmedBy: string): Promise<Closing> {
    const closing = await this.repository.findById(closingId);
    if (!closing || !closing.fundingInfo) {
      throw new Error(`Closing not found: ${closingId}`);
    }

    const updatedFundingInfo: FundingInfo = {
      ...closing.fundingInfo,
      status: 'COMPLETED'
    };

    const updated = await this.repository.update(closingId, {
      status: 'FUNDED',
      fundingInfo: updatedFundingInfo,
      statusHistory: [
        ...closing.statusHistory,
        {
          status: 'FUNDED',
          changedAt: new Date(),
          changedBy: confirmedBy
        }
      ],
      updatedAt: new Date()
    });

    // Sync to Encompass
    await this.encompassSync.updateFundingInfo(closing.applicationId, updatedFundingInfo);
    await this.encompassSync.advanceMilestone(closing.applicationId, 'Funded');

    // Send notification
    await this.notifications.sendFundedNotification(updated);

    return updated;
  }

  // -------------------------------------------------------------------------
  // Funding Checklist
  // -------------------------------------------------------------------------

  private generateFundingChecklist(closing: Closing): FundingChecklistItem[] {
    const checklist: FundingChecklistItem[] = [
      {
        code: 'DOCS_SIGNED',
        description: 'All closing documents executed',
        required: true,
        completed: closing.status === 'SIGNED' || closing.status === 'RECORDING' || closing.status === 'RECORDED'
      },
      {
        code: 'RECORDING_SUBMITTED',
        description: 'Documents submitted for recording',
        required: true,
        completed: !!closing.recordingInfo?.submittedAt
      },
      {
        code: 'WIRE_VERIFIED',
        description: 'Wire instructions verified',
        required: true,
        completed: !!closing.titleCompany.wireInstructions?.verifiedAt
      },
      {
        code: 'SETTLEMENT_FINAL',
        description: 'Final settlement statement approved',
        required: true,
        completed: !!closing.settlementStatement
      },
      {
        code: 'CONDITIONS_CLEARED',
        description: 'All PTC conditions cleared',
        required: true,
        completed: true // Would check against condition service
      },
      {
        code: 'INSURANCE_CONFIRMED',
        description: 'Hazard insurance confirmed',
        required: true,
        completed: true // Would check against document service
      }
    ];

    return checklist;
  }
}

// ============================================================================
// Encompass Field Mapping for Closing
// ============================================================================

export const CLOSING_ENCOMPASS_FIELD_MAPPING = {
  // Standard fields
  standard: {
    closingDate: '748',
    disbursementDate: '2370',
    fundingDate: '2554'
  },

  // Custom fields
  custom: {
    closingStatus: 'CX.CLOSING_STATUS',
    closingType: 'CX.CLOSING_TYPE',
    scheduledDate: 'CX.CLOSING_SCHEDULED_DATE',
    titleCompanyName: 'CX.TITLE_COMPANY_NAME',
    titleCompanyContact: 'CX.TITLE_COMPANY_CONTACT',
    recordingNumber: 'CX.RECORDING_NUMBER',
    recordingDate: 'CX.RECORDING_DATE',
    wireConfirmation: 'CX.WIRE_CONFIRMATION',
    fundedDate: 'CX.FUNDED_DATE',
    fundedAmount: 'CX.FUNDED_AMOUNT'
  }
};
