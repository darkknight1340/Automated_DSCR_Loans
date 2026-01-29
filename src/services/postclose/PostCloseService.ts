/**
 * Post-Close & Investor Delivery Service
 *
 * Manages post-closing activities including:
 * - Post-close quality control (QC)
 * - Investor data packaging (ULDD)
 * - Loan sale/delivery
 * - Document remediation
 * - Trailing document tracking
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type PostCloseStatus =
  | 'PENDING_QC'
  | 'QC_IN_PROGRESS'
  | 'QC_PASSED'
  | 'QC_FAILED'
  | 'REMEDIATION_REQUIRED'
  | 'REMEDIATION_IN_PROGRESS'
  | 'INVESTOR_READY'
  | 'SUBMITTED_TO_INVESTOR'
  | 'INVESTOR_APPROVED'
  | 'INVESTOR_SUSPENDED'
  | 'PURCHASED'
  | 'COMPLETE';

export type QCResult = 'PASS' | 'FAIL' | 'PASS_WITH_EXCEPTIONS';

export interface PostCloseRecord {
  id: string;
  applicationId: string;
  loanGuid: string;
  loanNumber: string;

  // Status
  status: PostCloseStatus;
  statusHistory: PostCloseStatusChange[];

  // QC
  qcReview?: QCReview;

  // Investor
  investorInfo?: InvestorInfo;

  // Delivery
  deliveryInfo?: DeliveryInfo;

  // Trailing docs
  trailingDocs: TrailingDocument[];

  // Remediation
  remediationItems: RemediationItem[];

  // Purchase
  purchaseInfo?: PurchaseInfo;

  createdAt: Date;
  updatedAt: Date;
}

export interface PostCloseStatusChange {
  status: PostCloseStatus;
  changedAt: Date;
  changedBy: string;
  notes?: string;
}

// ============================================================================
// QC Types
// ============================================================================

export interface QCReview {
  id: string;
  reviewType: 'PREFUND' | 'POSTFUND' | 'TARGETED';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  result?: QCResult;

  // Reviewer
  assignedTo?: string;
  startedAt?: Date;
  completedAt?: Date;
  completedBy?: string;

  // Checklist
  checklistItems: QCChecklistItem[];
  passedItems: number;
  failedItems: number;
  exceptionItems: number;

  // Findings
  findings: QCFinding[];

  // Scoring
  qcScore?: number; // 0-100
  riskScore?: number;

  // Notes
  reviewNotes?: string;
  signOffNotes?: string;
}

export interface QCChecklistItem {
  id: string;
  category: QCCategory;
  code: string;
  description: string;
  required: boolean;

  // Result
  result?: 'PASS' | 'FAIL' | 'EXCEPTION' | 'NA';
  reviewedAt?: Date;
  reviewedBy?: string;
  notes?: string;

  // Exception info
  exceptionApproved?: boolean;
  exceptionApprovedBy?: string;
  exceptionReason?: string;
}

export type QCCategory =
  | 'CREDIT'
  | 'INCOME'
  | 'ASSETS'
  | 'PROPERTY'
  | 'COMPLIANCE'
  | 'DOCUMENTATION'
  | 'CLOSING'
  | 'FUNDING';

export interface QCFinding {
  id: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  category: QCCategory;
  code: string;
  description: string;
  recommendation: string;

  // Resolution
  requiresRemediation: boolean;
  remediationItemId?: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
}

// ============================================================================
// DSCR QC Checklist
// ============================================================================

export const DSCR_QC_CHECKLIST: Omit<QCChecklistItem, 'id' | 'result' | 'reviewedAt' | 'reviewedBy' | 'notes'>[] = [
  // Credit
  {
    category: 'CREDIT',
    code: 'QC-CR-001',
    description: 'Credit report is within 120 days of closing',
    required: true
  },
  {
    category: 'CREDIT',
    code: 'QC-CR-002',
    description: 'Representative credit score matches documentation',
    required: true
  },
  {
    category: 'CREDIT',
    code: 'QC-CR-003',
    description: 'Bankruptcy/foreclosure seasoning verified',
    required: true
  },
  {
    category: 'CREDIT',
    code: 'QC-CR-004',
    description: 'Mortgage payment history verified (12 months)',
    required: true
  },

  // Income/DSCR
  {
    category: 'INCOME',
    code: 'QC-IN-001',
    description: 'DSCR calculation is accurate',
    required: true
  },
  {
    category: 'INCOME',
    code: 'QC-IN-002',
    description: 'Rent roll supports claimed income',
    required: true
  },
  {
    category: 'INCOME',
    code: 'QC-IN-003',
    description: 'Lease agreements in file and current',
    required: true
  },
  {
    category: 'INCOME',
    code: 'QC-IN-004',
    description: 'PITIA calculation verified against documents',
    required: true
  },

  // Assets
  {
    category: 'ASSETS',
    code: 'QC-AS-001',
    description: 'Reserve requirement met (6 months PITIA)',
    required: true
  },
  {
    category: 'ASSETS',
    code: 'QC-AS-002',
    description: 'Bank statements within 90 days of closing',
    required: true
  },
  {
    category: 'ASSETS',
    code: 'QC-AS-003',
    description: 'Source of funds verified for cash to close',
    required: true
  },

  // Property
  {
    category: 'PROPERTY',
    code: 'QC-PR-001',
    description: 'Appraisal supports value used',
    required: true
  },
  {
    category: 'PROPERTY',
    code: 'QC-PR-002',
    description: 'LTV within program limits',
    required: true
  },
  {
    category: 'PROPERTY',
    code: 'QC-PR-003',
    description: 'Property type eligible for program',
    required: true
  },
  {
    category: 'PROPERTY',
    code: 'QC-PR-004',
    description: 'Title commitment in file',
    required: true
  },

  // Compliance
  {
    category: 'COMPLIANCE',
    code: 'QC-CO-001',
    description: 'All required disclosures provided',
    required: true
  },
  {
    category: 'COMPLIANCE',
    code: 'QC-CO-002',
    description: 'Timing requirements met (TRID)',
    required: true
  },
  {
    category: 'COMPLIANCE',
    code: 'QC-CO-003',
    description: 'Rate lock valid at closing',
    required: true
  },
  {
    category: 'COMPLIANCE',
    code: 'QC-CO-004',
    description: 'Fees within tolerance',
    required: true
  },

  // Documentation
  {
    category: 'DOCUMENTATION',
    code: 'QC-DO-001',
    description: 'All conditions cleared and documented',
    required: true
  },
  {
    category: 'DOCUMENTATION',
    code: 'QC-DO-002',
    description: 'Entity documents complete (if applicable)',
    required: false
  },
  {
    category: 'DOCUMENTATION',
    code: 'QC-DO-003',
    description: 'Guarantor documentation complete (if applicable)',
    required: false
  },

  // Closing
  {
    category: 'CLOSING',
    code: 'QC-CL-001',
    description: 'Note properly executed',
    required: true
  },
  {
    category: 'CLOSING',
    code: 'QC-CL-002',
    description: 'Deed of trust properly executed and recorded',
    required: true
  },
  {
    category: 'CLOSING',
    code: 'QC-CL-003',
    description: 'Closing disclosure matches final terms',
    required: true
  },

  // Funding
  {
    category: 'FUNDING',
    code: 'QC-FU-001',
    description: 'Disbursement amounts verified',
    required: true
  },
  {
    category: 'FUNDING',
    code: 'QC-FU-002',
    description: 'Wire confirmation documented',
    required: true
  }
];

// ============================================================================
// Investor Types
// ============================================================================

export interface InvestorInfo {
  investorCode: string;
  investorName: string;
  commitmentNumber?: string;
  commitmentDate?: Date;
  commitmentAmount?: number;
  targetDeliveryDate?: Date;

  // Investor requirements
  requirements: InvestorRequirement[];
}

export interface InvestorRequirement {
  code: string;
  description: string;
  status: 'PENDING' | 'MET' | 'NOT_MET' | 'WAIVED';
  notes?: string;
}

export interface DeliveryInfo {
  deliveryType: 'WHOLE_LOAN' | 'PARTICIPATION' | 'SECURITIZATION';
  deliveryMethod: 'ELECTRONIC' | 'PHYSICAL' | 'HYBRID';

  // ULDD
  ulddVersion: string;
  ulddSubmittedAt?: Date;
  ulddStatus?: 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
  ulddErrors?: ULDDError[];

  // Physical delivery
  shippingInfo?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: Date;
    deliveredAt?: Date;
  };
}

export interface ULDDError {
  fieldId: string;
  fieldName: string;
  errorType: 'MISSING' | 'INVALID' | 'OUT_OF_RANGE';
  message: string;
  severity: 'FATAL' | 'WARNING';
}

export interface PurchaseInfo {
  purchaseDate: Date;
  purchasePrice: number;
  srp?: number; // Service Release Premium
  totalProceeds: number;

  // Confirmation
  confirmationNumber: string;
  wireReference?: string;
  wireReceivedAt?: Date;
}

// ============================================================================
// Remediation Types
// ============================================================================

export interface RemediationItem {
  id: string;
  category: QCCategory;
  description: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  source: 'QC' | 'INVESTOR' | 'AUDIT';
  sourceId?: string;

  // Status
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED' | 'ESCALATED';
  assignedTo?: string;

  // Timeline
  createdAt: Date;
  dueDate?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;

  // Resolution
  resolutionType?: 'DOCUMENT_ADDED' | 'DATA_CORRECTED' | 'EXCEPTION_APPROVED' | 'WAIVED';
  resolutionNotes?: string;

  // Tracking
  updates: RemediationUpdate[];
}

export interface RemediationUpdate {
  updatedAt: Date;
  updatedBy: string;
  action: string;
  notes?: string;
}

export interface TrailingDocument {
  documentType: string;
  description: string;
  expectedDate?: Date;
  receivedDate?: Date;
  status: 'PENDING' | 'RECEIVED' | 'OVERDUE';
  documentId?: string;
}

// ============================================================================
// Post-Close Service
// ============================================================================

export interface IPostCloseRepository {
  findById(id: string): Promise<PostCloseRecord | null>;
  findByApplication(applicationId: string): Promise<PostCloseRecord | null>;
  create(record: PostCloseRecord): Promise<PostCloseRecord>;
  update(id: string, updates: Partial<PostCloseRecord>): Promise<PostCloseRecord>;
}

export interface IEncompassSync {
  syncPostCloseStatus(applicationId: string, status: PostCloseStatus): Promise<void>;
  advanceMilestone(applicationId: string, milestone: string): Promise<void>;
}

export interface IULDDExporter {
  generateULDD(applicationId: string): Promise<{
    xml: string;
    errors: ULDDError[];
  }>;
  submitULDD(investorCode: string, ulddXml: string): Promise<{
    success: boolean;
    submissionId?: string;
    errors?: ULDDError[];
  }>;
}

export class PostCloseService {
  constructor(
    private readonly repository: IPostCloseRepository,
    private readonly ulddExporter: IULDDExporter,
    private readonly encompassSync: IEncompassSync
  ) {}

  // -------------------------------------------------------------------------
  // Post-Close Record Management
  // -------------------------------------------------------------------------

  async createPostCloseRecord(
    applicationId: string,
    loanGuid: string,
    loanNumber: string
  ): Promise<PostCloseRecord> {
    const existing = await this.repository.findByApplication(applicationId);
    if (existing) {
      return existing;
    }

    const record: PostCloseRecord = {
      id: uuidv4(),
      applicationId,
      loanGuid,
      loanNumber,
      status: 'PENDING_QC',
      statusHistory: [{
        status: 'PENDING_QC',
        changedAt: new Date(),
        changedBy: 'SYSTEM'
      }],
      trailingDocs: [],
      remediationItems: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.create(record);
  }

  async getPostCloseRecord(applicationId: string): Promise<PostCloseRecord | null> {
    return this.repository.findByApplication(applicationId);
  }

  // -------------------------------------------------------------------------
  // QC Review
  // -------------------------------------------------------------------------

  async initiateQCReview(
    postCloseId: string,
    reviewType: QCReview['reviewType'],
    assignedTo?: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    // Generate checklist
    const checklistItems: QCChecklistItem[] = DSCR_QC_CHECKLIST.map(item => ({
      ...item,
      id: uuidv4()
    }));

    const qcReview: QCReview = {
      id: uuidv4(),
      reviewType,
      status: 'PENDING',
      assignedTo,
      checklistItems,
      passedItems: 0,
      failedItems: 0,
      exceptionItems: 0,
      findings: []
    };

    return this.repository.update(postCloseId, {
      status: 'QC_IN_PROGRESS',
      qcReview,
      statusHistory: [
        ...record.statusHistory,
        {
          status: 'QC_IN_PROGRESS',
          changedAt: new Date(),
          changedBy: assignedTo ?? 'SYSTEM'
        }
      ],
      updatedAt: new Date()
    });
  }

  async updateQCChecklistItem(
    postCloseId: string,
    itemId: string,
    result: QCChecklistItem['result'],
    reviewedBy: string,
    notes?: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record?.qcReview) {
      throw new Error('QC review not found');
    }

    const updatedItems = record.qcReview.checklistItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          result,
          reviewedAt: new Date(),
          reviewedBy,
          notes
        };
      }
      return item;
    });

    // Calculate counts
    const passedItems = updatedItems.filter(i => i.result === 'PASS').length;
    const failedItems = updatedItems.filter(i => i.result === 'FAIL').length;
    const exceptionItems = updatedItems.filter(i => i.result === 'EXCEPTION').length;

    const updatedQC: QCReview = {
      ...record.qcReview,
      checklistItems: updatedItems,
      passedItems,
      failedItems,
      exceptionItems
    };

    return this.repository.update(postCloseId, {
      qcReview: updatedQC,
      updatedAt: new Date()
    });
  }

  async completeQCReview(
    postCloseId: string,
    completedBy: string,
    signOffNotes?: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record?.qcReview) {
      throw new Error('QC review not found');
    }

    // Check all required items reviewed
    const unreviewedRequired = record.qcReview.checklistItems.filter(
      item => item.required && !item.result
    );

    if (unreviewedRequired.length > 0) {
      throw new Error(`${unreviewedRequired.length} required items not reviewed`);
    }

    // Determine result
    let result: QCResult;
    if (record.qcReview.failedItems > 0) {
      result = 'FAIL';
    } else if (record.qcReview.exceptionItems > 0) {
      result = 'PASS_WITH_EXCEPTIONS';
    } else {
      result = 'PASS';
    }

    // Calculate QC score
    const totalRequired = record.qcReview.checklistItems.filter(i => i.required).length;
    const qcScore = totalRequired > 0
      ? Math.round((record.qcReview.passedItems / totalRequired) * 100)
      : 100;

    const updatedQC: QCReview = {
      ...record.qcReview,
      status: 'COMPLETED',
      result,
      completedAt: new Date(),
      completedBy,
      qcScore,
      signOffNotes
    };

    // Determine new status
    let newStatus: PostCloseStatus;
    if (result === 'FAIL') {
      newStatus = 'QC_FAILED';
    } else {
      newStatus = 'QC_PASSED';
    }

    const updated = await this.repository.update(postCloseId, {
      status: newStatus,
      qcReview: updatedQC,
      statusHistory: [
        ...record.statusHistory,
        {
          status: newStatus,
          changedAt: new Date(),
          changedBy: completedBy,
          notes: `QC Result: ${result}, Score: ${qcScore}`
        }
      ],
      updatedAt: new Date()
    });

    // Sync to Encompass
    await this.encompassSync.syncPostCloseStatus(record.applicationId, newStatus);

    // Generate remediation items from findings
    if (result === 'FAIL') {
      await this.generateRemediationFromQC(updated);
    }

    return updated;
  }

  private async generateRemediationFromQC(record: PostCloseRecord): Promise<void> {
    if (!record.qcReview) return;

    const remediationItems: RemediationItem[] = record.qcReview.findings
      .filter(f => f.requiresRemediation && !f.resolved)
      .map(finding => ({
        id: uuidv4(),
        category: finding.category,
        description: finding.description,
        severity: finding.severity,
        source: 'QC' as const,
        sourceId: finding.id,
        status: 'OPEN' as const,
        createdAt: new Date(),
        updates: []
      }));

    if (remediationItems.length > 0) {
      await this.repository.update(record.id, {
        status: 'REMEDIATION_REQUIRED',
        remediationItems: [...record.remediationItems, ...remediationItems],
        statusHistory: [
          ...record.statusHistory,
          {
            status: 'REMEDIATION_REQUIRED',
            changedAt: new Date(),
            changedBy: 'SYSTEM',
            notes: `${remediationItems.length} remediation items created`
          }
        ],
        updatedAt: new Date()
      });
    }
  }

  // -------------------------------------------------------------------------
  // Investor Delivery
  // -------------------------------------------------------------------------

  async setInvestorInfo(
    postCloseId: string,
    investorInfo: InvestorInfo
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    return this.repository.update(postCloseId, {
      investorInfo,
      updatedAt: new Date()
    });
  }

  async prepareForInvestor(postCloseId: string): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    // Verify QC passed
    if (record.status !== 'QC_PASSED') {
      throw new Error('QC must pass before investor delivery');
    }

    // Verify no open remediation
    const openRemediation = record.remediationItems.filter(
      item => item.status === 'OPEN' || item.status === 'IN_PROGRESS'
    );

    if (openRemediation.length > 0) {
      throw new Error(`${openRemediation.length} remediation items must be resolved`);
    }

    return this.repository.update(postCloseId, {
      status: 'INVESTOR_READY',
      statusHistory: [
        ...record.statusHistory,
        {
          status: 'INVESTOR_READY',
          changedAt: new Date(),
          changedBy: 'SYSTEM'
        }
      ],
      updatedAt: new Date()
    });
  }

  async submitToInvestor(
    postCloseId: string,
    submittedBy: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record || !record.investorInfo) {
      throw new Error('Post-close record or investor info not found');
    }

    // Generate and submit ULDD
    const ulddResult = await this.ulddExporter.generateULDD(record.applicationId);

    if (ulddResult.errors.filter(e => e.severity === 'FATAL').length > 0) {
      throw new Error('ULDD has fatal errors');
    }

    const submitResult = await this.ulddExporter.submitULDD(
      record.investorInfo.investorCode,
      ulddResult.xml
    );

    const deliveryInfo: DeliveryInfo = {
      deliveryType: 'WHOLE_LOAN',
      deliveryMethod: 'ELECTRONIC',
      ulddVersion: '3.4',
      ulddSubmittedAt: new Date(),
      ulddStatus: submitResult.success ? 'SUBMITTED' : 'REJECTED',
      ulddErrors: submitResult.errors
    };

    return this.repository.update(postCloseId, {
      status: submitResult.success ? 'SUBMITTED_TO_INVESTOR' : record.status,
      deliveryInfo,
      statusHistory: submitResult.success
        ? [
          ...record.statusHistory,
          {
            status: 'SUBMITTED_TO_INVESTOR',
            changedAt: new Date(),
            changedBy: submittedBy
          }
        ]
        : record.statusHistory,
      updatedAt: new Date()
    });
  }

  async recordPurchase(
    postCloseId: string,
    purchaseInfo: PurchaseInfo,
    recordedBy: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    const updated = await this.repository.update(postCloseId, {
      status: 'PURCHASED',
      purchaseInfo,
      statusHistory: [
        ...record.statusHistory,
        {
          status: 'PURCHASED',
          changedAt: new Date(),
          changedBy: recordedBy,
          notes: `Purchase price: $${(purchaseInfo.purchasePrice / 100).toFixed(2)}`
        }
      ],
      updatedAt: new Date()
    });

    // Advance to completion
    await this.encompassSync.advanceMilestone(record.applicationId, 'Completion');

    return updated;
  }

  // -------------------------------------------------------------------------
  // Remediation
  // -------------------------------------------------------------------------

  async updateRemediationItem(
    postCloseId: string,
    itemId: string,
    updates: Partial<RemediationItem>,
    updatedBy: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    const updatedItems = record.remediationItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          ...updates,
          updates: [
            ...item.updates,
            {
              updatedAt: new Date(),
              updatedBy,
              action: `Status changed to ${updates.status}`,
              notes: updates.resolutionNotes
            }
          ]
        };
      }
      return item;
    });

    // Check if all remediation resolved
    const allResolved = updatedItems.every(
      item => item.status === 'RESOLVED' || item.status === 'WAIVED'
    );

    let newStatus = record.status;
    if (allResolved && record.status === 'REMEDIATION_IN_PROGRESS') {
      newStatus = 'QC_PASSED';
    }

    return this.repository.update(postCloseId, {
      status: newStatus,
      remediationItems: updatedItems,
      statusHistory: newStatus !== record.status
        ? [
          ...record.statusHistory,
          {
            status: newStatus,
            changedAt: new Date(),
            changedBy: updatedBy,
            notes: 'All remediation items resolved'
          }
        ]
        : record.statusHistory,
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Trailing Documents
  // -------------------------------------------------------------------------

  async addTrailingDocument(
    postCloseId: string,
    doc: TrailingDocument
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    return this.repository.update(postCloseId, {
      trailingDocs: [...record.trailingDocs, doc],
      updatedAt: new Date()
    });
  }

  async updateTrailingDocumentStatus(
    postCloseId: string,
    documentType: string,
    status: TrailingDocument['status'],
    documentId?: string
  ): Promise<PostCloseRecord> {
    const record = await this.repository.findById(postCloseId);
    if (!record) {
      throw new Error(`Post-close record not found: ${postCloseId}`);
    }

    const updatedDocs = record.trailingDocs.map(doc => {
      if (doc.documentType === documentType) {
        return {
          ...doc,
          status,
          documentId,
          receivedDate: status === 'RECEIVED' ? new Date() : doc.receivedDate
        };
      }
      return doc;
    });

    return this.repository.update(postCloseId, {
      trailingDocs: updatedDocs,
      updatedAt: new Date()
    });
  }
}

// ============================================================================
// Encompass Field Mapping for Post-Close
// ============================================================================

export const POSTCLOSE_ENCOMPASS_FIELD_MAPPING = {
  custom: {
    postCloseStatus: 'CX.POSTCLOSE_STATUS',
    qcResult: 'CX.QC_RESULT',
    qcScore: 'CX.QC_SCORE',
    qcCompletedDate: 'CX.QC_COMPLETED_DATE',
    investorCode: 'CX.INVESTOR_CODE',
    investorName: 'CX.INVESTOR_NAME',
    deliveryDate: 'CX.DELIVERY_DATE',
    purchaseDate: 'CX.PURCHASE_DATE',
    purchasePrice: 'CX.PURCHASE_PRICE'
  }
};
