/**
 * Document Management Service
 *
 * Handles document upload, classification, storage, and Encompass
 * eFolder synchronization for DSCR loans.
 *
 * Key Features:
 * - Auto-classification using ML
 * - Condition auto-clear on document receipt
 * - Encompass eFolder sync
 * - Document versioning
 * - Expiration tracking
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type DocumentCategory =
  | 'INCOME'
  | 'ASSET'
  | 'PROPERTY'
  | 'CREDIT'
  | 'ENTITY'
  | 'IDENTITY'
  | 'INSURANCE'
  | 'TITLE'
  | 'CLOSING'
  | 'OTHER';

export type DocumentType =
  // Property/Income docs for DSCR
  | 'RENT_ROLL'
  | 'LEASE_AGREEMENT'
  | 'LEASE_LEDGER'
  | 'PROPERTY_INSURANCE'
  | 'HOA_STATEMENT'
  | 'PROPERTY_TAX_BILL'

  // Asset docs
  | 'BANK_STATEMENT'
  | 'INVESTMENT_STATEMENT'
  | 'RETIREMENT_ACCOUNT'

  // Entity docs
  | 'ARTICLES_OF_ORGANIZATION'
  | 'OPERATING_AGREEMENT'
  | 'CERTIFICATE_OF_GOOD_STANDING'
  | 'EIN_LETTER'
  | 'CORPORATE_RESOLUTION'

  // Identity docs
  | 'DRIVERS_LICENSE'
  | 'PASSPORT'
  | 'SOCIAL_SECURITY_CARD'

  // Title/Insurance
  | 'TITLE_COMMITMENT'
  | 'TITLE_POLICY'
  | 'INSURANCE_BINDER'
  | 'INSURANCE_DECLARATION'
  | 'FLOOD_CERTIFICATE'

  // Appraisal
  | 'APPRAISAL_REPORT'
  | 'APPRAISAL_INVOICE'

  // Closing
  | 'CLOSING_DISCLOSURE'
  | 'NOTE'
  | 'DEED_OF_TRUST'
  | 'WIRE_INSTRUCTIONS'
  | 'SETTLEMENT_STATEMENT'

  // Other
  | 'CREDIT_REPORT'
  | 'LETTER_OF_EXPLANATION'
  | 'OTHER';

export type DocumentStatus =
  | 'UPLOADED'
  | 'CLASSIFYING'
  | 'CLASSIFIED'
  | 'REVIEW_REQUIRED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED';

export interface Document {
  id: string;
  applicationId: string;
  borrowerId?: string;
  propertyId?: string;

  // File info
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;

  // Storage
  storageProvider: 'S3' | 'AZURE' | 'GCS';
  storageBucket: string;
  storageKey: string;
  storageUrl?: string;

  // Classification
  category: DocumentCategory;
  documentType: DocumentType;
  classificationConfidence?: number;
  classificationMethod: 'MANUAL' | 'AUTO' | 'ASSISTED';
  classifiedAt?: Date;
  classifiedBy?: string;

  // Status
  status: DocumentStatus;
  rejectionReason?: string;

  // Version
  version: number;
  previousVersionId?: string;
  isLatest: boolean;

  // Dates
  documentDate?: Date; // Date on the document
  effectiveDate?: Date; // When document becomes effective
  expirationDate?: Date; // When document expires

  // Encompass sync
  encompassDocId?: string;
  encompassFolderId?: string;
  encompassSyncedAt?: Date;

  // Condition linking
  clearsConditions?: string[]; // Condition codes this doc can clear

  // Metadata
  metadata?: Record<string, unknown>;
  tags?: string[];
  notes?: string;

  // Audit
  uploadedBy: string;
  uploadedAt: Date;
  updatedAt: Date;
}

export interface DocumentUploadRequest {
  applicationId: string;
  borrowerId?: string;
  propertyId?: string;
  file: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  };
  category?: DocumentCategory;
  documentType?: DocumentType;
  documentDate?: string;
  metadata?: Record<string, unknown>;
  uploadedBy: string;
}

export interface ClassificationResult {
  documentType: DocumentType;
  category: DocumentCategory;
  confidence: number;
  alternates?: Array<{
    documentType: DocumentType;
    confidence: number;
  }>;
  extractedData?: Record<string, unknown>;
}

// ============================================================================
// Document Type Definitions
// ============================================================================

export interface DocumentTypeDefinition {
  type: DocumentType;
  category: DocumentCategory;
  name: string;
  description: string;
  requiredForDSCR: boolean;
  acceptedMimeTypes: string[];
  maxSizeBytes: number;
  expirationDays?: number;
  clearsConditions?: string[];
  encompassFolder: string;
}

export const DSCR_DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  // Property/Income
  {
    type: 'RENT_ROLL',
    category: 'INCOME',
    name: 'Rent Roll',
    description: 'Current rent roll showing all units and rental income',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxSizeBytes: 10 * 1024 * 1024,
    expirationDays: 90,
    clearsConditions: ['DSCR-001'],
    encompassFolder: 'Income'
  },
  {
    type: 'LEASE_AGREEMENT',
    category: 'INCOME',
    name: 'Lease Agreement',
    description: 'Executed lease agreement(s) for the property',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 25 * 1024 * 1024,
    clearsConditions: ['DSCR-004'],
    encompassFolder: 'Income'
  },
  {
    type: 'PROPERTY_INSURANCE',
    category: 'INSURANCE',
    name: 'Property Insurance',
    description: 'Hazard insurance policy or binder',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
    clearsConditions: ['DSCR-021'],
    encompassFolder: 'Insurance'
  },

  // Assets
  {
    type: 'BANK_STATEMENT',
    category: 'ASSET',
    name: 'Bank Statement',
    description: 'Bank statements showing reserves',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
    expirationDays: 90,
    clearsConditions: ['DSCR-003'],
    encompassFolder: 'Assets'
  },

  // Entity
  {
    type: 'ARTICLES_OF_ORGANIZATION',
    category: 'ENTITY',
    name: 'Articles of Organization',
    description: 'Entity formation documents',
    requiredForDSCR: false,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
    clearsConditions: ['DSCR-002'],
    encompassFolder: 'Entity Documents'
  },
  {
    type: 'OPERATING_AGREEMENT',
    category: 'ENTITY',
    name: 'Operating Agreement',
    description: 'LLC or partnership operating agreement',
    requiredForDSCR: false,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
    clearsConditions: ['DSCR-002'],
    encompassFolder: 'Entity Documents'
  },
  {
    type: 'CERTIFICATE_OF_GOOD_STANDING',
    category: 'ENTITY',
    name: 'Certificate of Good Standing',
    description: 'State-issued certificate of good standing',
    requiredForDSCR: false,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 5 * 1024 * 1024,
    expirationDays: 90,
    clearsConditions: ['DSCR-002'],
    encompassFolder: 'Entity Documents'
  },
  {
    type: 'EIN_LETTER',
    category: 'ENTITY',
    name: 'EIN Letter',
    description: 'IRS EIN assignment letter',
    requiredForDSCR: false,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 5 * 1024 * 1024,
    clearsConditions: ['DSCR-002'],
    encompassFolder: 'Entity Documents'
  },

  // Identity
  {
    type: 'DRIVERS_LICENSE',
    category: 'IDENTITY',
    name: "Driver's License",
    description: 'Valid government-issued photo ID',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    maxSizeBytes: 5 * 1024 * 1024,
    expirationDays: null as any, // Check actual expiration
    clearsConditions: ['DSCR-005'],
    encompassFolder: 'Identification'
  },

  // Title
  {
    type: 'TITLE_COMMITMENT',
    category: 'TITLE',
    name: 'Title Commitment',
    description: 'Preliminary title commitment',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 25 * 1024 * 1024,
    clearsConditions: ['DSCR-020'],
    encompassFolder: 'Title'
  },

  // Appraisal
  {
    type: 'APPRAISAL_REPORT',
    category: 'PROPERTY',
    name: 'Appraisal Report',
    description: 'Full appraisal report',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf', 'application/xml'],
    maxSizeBytes: 50 * 1024 * 1024,
    expirationDays: 120,
    encompassFolder: 'Appraisal'
  },

  // Closing
  {
    type: 'CLOSING_DISCLOSURE',
    category: 'CLOSING',
    name: 'Closing Disclosure',
    description: 'Final Closing Disclosure',
    requiredForDSCR: true,
    acceptedMimeTypes: ['application/pdf'],
    maxSizeBytes: 10 * 1024 * 1024,
    encompassFolder: 'Closing Documents'
  }
];

// ============================================================================
// Classification Engine
// ============================================================================

export interface IClassificationEngine {
  classify(
    file: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ClassificationResult>;
}

/**
 * Simple rule-based classifier for initial implementation.
 * Can be replaced with ML-based classification.
 */
export class RuleBasedClassifier implements IClassificationEngine {
  private typeKeywords: Map<DocumentType, string[]>;

  constructor() {
    this.typeKeywords = new Map([
      ['RENT_ROLL', ['rent roll', 'rental income', 'unit', 'tenant', 'monthly rent']],
      ['LEASE_AGREEMENT', ['lease', 'rental agreement', 'term', 'lessee', 'lessor']],
      ['BANK_STATEMENT', ['account', 'balance', 'deposit', 'withdrawal', 'statement period']],
      ['ARTICLES_OF_ORGANIZATION', ['articles of organization', 'formation', 'registered agent']],
      ['OPERATING_AGREEMENT', ['operating agreement', 'member', 'membership interest']],
      ['CERTIFICATE_OF_GOOD_STANDING', ['good standing', 'certificate', 'secretary of state']],
      ['EIN_LETTER', ['employer identification', 'ein', 'internal revenue']],
      ['DRIVERS_LICENSE', ['driver', 'license', 'dob', 'expires']],
      ['TITLE_COMMITMENT', ['title commitment', 'schedule a', 'schedule b', 'vesting']],
      ['PROPERTY_INSURANCE', ['insurance', 'policy', 'coverage', 'premium', 'hazard']],
      ['APPRAISAL_REPORT', ['appraisal', 'market value', 'comparable', 'subject property']]
    ]);
  }

  async classify(
    file: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ClassificationResult> {
    // Extract text from filename and any metadata
    const lowerFileName = fileName.toLowerCase();

    // Score each document type
    const scores: Array<{ type: DocumentType; score: number }> = [];

    for (const [docType, keywords] of this.typeKeywords) {
      let score = 0;

      // Check filename
      for (const keyword of keywords) {
        if (lowerFileName.includes(keyword.toLowerCase())) {
          score += 30;
        }
      }

      // Would add OCR/text extraction for PDF content analysis
      // For now, rely on filename matching

      if (score > 0) {
        scores.push({ type: docType, score });
      }
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) {
      return {
        documentType: 'OTHER',
        category: 'OTHER',
        confidence: 0,
        alternates: []
      };
    }

    const best = scores[0];
    const definition = DSCR_DOCUMENT_TYPES.find(d => d.type === best.type);

    // Normalize confidence to 0-100
    const confidence = Math.min(100, best.score);

    return {
      documentType: best.type,
      category: definition?.category ?? 'OTHER',
      confidence,
      alternates: scores.slice(1, 4).map(s => ({
        documentType: s.type,
        confidence: Math.min(100, s.score)
      }))
    };
  }
}

// ============================================================================
// Storage Interface
// ============================================================================

export interface IStorageProvider {
  name: 'S3' | 'AZURE' | 'GCS';

  upload(
    bucket: string,
    key: string,
    file: Buffer,
    mimeType: string
  ): Promise<{ url: string; etag: string }>;

  download(bucket: string, key: string): Promise<Buffer>;

  delete(bucket: string, key: string): Promise<void>;

  getSignedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;
}

// ============================================================================
// Document Service
// ============================================================================

export interface IDocumentRepository {
  findById(id: string): Promise<Document | null>;
  findByApplication(applicationId: string): Promise<Document[]>;
  findByType(applicationId: string, documentType: DocumentType): Promise<Document[]>;
  create(document: Document): Promise<Document>;
  update(id: string, updates: Partial<Document>): Promise<Document>;
  delete(id: string): Promise<void>;
}

export interface IConditionService {
  attemptAutoClear(applicationId: string, conditionCodes: string[]): Promise<string[]>;
}

export interface IEncompassDocSync {
  uploadToEFolder(
    loanGuid: string,
    folderId: string,
    document: Document,
    fileBuffer: Buffer
  ): Promise<{ encompassDocId: string }>;

  deleteFromEFolder(loanGuid: string, encompassDocId: string): Promise<void>;
}

export class DocumentService {
  private docTypeMap: Map<DocumentType, DocumentTypeDefinition>;

  constructor(
    private readonly repository: IDocumentRepository,
    private readonly storage: IStorageProvider,
    private readonly classifier: IClassificationEngine,
    private readonly conditionService: IConditionService,
    private readonly encompassSync: IEncompassDocSync,
    private readonly defaultBucket: string = 'dscr-documents'
  ) {
    this.docTypeMap = new Map(DSCR_DOCUMENT_TYPES.map(d => [d.type, d]));
  }

  // -------------------------------------------------------------------------
  // Upload & Classification
  // -------------------------------------------------------------------------

  async uploadDocument(request: DocumentUploadRequest): Promise<Document> {
    const { file, applicationId, uploadedBy } = request;

    // Validate file
    this.validateFile(file.buffer, file.mimeType, request.documentType);

    // Generate storage key
    const fileId = uuidv4();
    const extension = this.getExtension(file.mimeType);
    const storageKey = `${applicationId}/${fileId}${extension}`;

    // Calculate checksum
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Upload to storage
    const uploadResult = await this.storage.upload(
      this.defaultBucket,
      storageKey,
      file.buffer,
      file.mimeType
    );

    // Classify if not provided
    let category = request.category;
    let documentType = request.documentType;
    let classificationConfidence: number | undefined;
    let classificationMethod: 'MANUAL' | 'AUTO' | 'ASSISTED' = 'MANUAL';

    if (!documentType) {
      const classification = await this.classifier.classify(
        file.buffer,
        file.originalName,
        file.mimeType
      );

      documentType = classification.documentType;
      category = classification.category;
      classificationConfidence = classification.confidence;
      classificationMethod = classification.confidence >= 80 ? 'AUTO' : 'ASSISTED';
    }

    // Get document type definition
    const typeDef = this.docTypeMap.get(documentType);

    // Calculate expiration
    let expirationDate: Date | undefined;
    if (typeDef?.expirationDays) {
      expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + typeDef.expirationDays);
    }

    // Create document record
    const document: Document = {
      id: fileId,
      applicationId,
      borrowerId: request.borrowerId,
      propertyId: request.propertyId,
      fileName: `${fileId}${extension}`,
      originalFileName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.buffer.length,
      checksum,
      storageProvider: this.storage.name,
      storageBucket: this.defaultBucket,
      storageKey,
      storageUrl: uploadResult.url,
      category: category ?? 'OTHER',
      documentType: documentType ?? 'OTHER',
      classificationConfidence,
      classificationMethod,
      classifiedAt: new Date(),
      status: classificationMethod === 'AUTO' ? 'CLASSIFIED' : 'REVIEW_REQUIRED',
      version: 1,
      isLatest: true,
      documentDate: request.documentDate ? new Date(request.documentDate) : undefined,
      expirationDate,
      clearsConditions: typeDef?.clearsConditions,
      metadata: request.metadata,
      uploadedBy,
      uploadedAt: new Date(),
      updatedAt: new Date()
    };

    const saved = await this.repository.create(document);

    // Attempt to auto-clear conditions
    if (saved.status === 'CLASSIFIED' && saved.clearsConditions?.length) {
      await this.conditionService.attemptAutoClear(
        applicationId,
        saved.clearsConditions
      );
    }

    return saved;
  }

  async reclassifyDocument(
    documentId: string,
    documentType: DocumentType,
    classifiedBy: string
  ): Promise<Document> {
    const document = await this.repository.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const typeDef = this.docTypeMap.get(documentType);

    const updated = await this.repository.update(documentId, {
      documentType,
      category: typeDef?.category ?? 'OTHER',
      classificationMethod: 'MANUAL',
      classificationConfidence: 100,
      classifiedAt: new Date(),
      classifiedBy,
      status: 'CLASSIFIED',
      clearsConditions: typeDef?.clearsConditions,
      updatedAt: new Date()
    });

    // Attempt to auto-clear conditions
    if (updated.clearsConditions?.length) {
      await this.conditionService.attemptAutoClear(
        updated.applicationId,
        updated.clearsConditions
      );
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // Document Retrieval
  // -------------------------------------------------------------------------

  async getDocument(documentId: string): Promise<Document | null> {
    return this.repository.findById(documentId);
  }

  async getDocumentsForApplication(applicationId: string): Promise<Document[]> {
    return this.repository.findByApplication(applicationId);
  }

  async getDocumentsByType(
    applicationId: string,
    documentType: DocumentType
  ): Promise<Document[]> {
    return this.repository.findByType(applicationId, documentType);
  }

  async getDocumentDownloadUrl(
    documentId: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const document = await this.repository.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    return this.storage.getSignedUrl(
      document.storageBucket,
      document.storageKey,
      expiresIn
    );
  }

  // -------------------------------------------------------------------------
  // Document Status Management
  // -------------------------------------------------------------------------

  async acceptDocument(documentId: string, acceptedBy: string): Promise<Document> {
    const document = await this.repository.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const updated = await this.repository.update(documentId, {
      status: 'ACCEPTED',
      updatedAt: new Date()
    });

    // Attempt to auto-clear conditions
    if (updated.clearsConditions?.length) {
      await this.conditionService.attemptAutoClear(
        updated.applicationId,
        updated.clearsConditions
      );
    }

    return updated;
  }

  async rejectDocument(
    documentId: string,
    rejectedBy: string,
    reason: string
  ): Promise<Document> {
    return this.repository.update(documentId, {
      status: 'REJECTED',
      rejectionReason: reason,
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Version Management
  // -------------------------------------------------------------------------

  async uploadNewVersion(
    documentId: string,
    request: DocumentUploadRequest
  ): Promise<Document> {
    const existing = await this.repository.findById(documentId);
    if (!existing) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Mark existing as not latest
    await this.repository.update(documentId, {
      isLatest: false,
      updatedAt: new Date()
    });

    // Upload new version
    const newDoc = await this.uploadDocument({
      ...request,
      category: existing.category,
      documentType: existing.documentType
    });

    // Update with version info
    return this.repository.update(newDoc.id, {
      version: existing.version + 1,
      previousVersionId: documentId
    });
  }

  // -------------------------------------------------------------------------
  // Encompass Sync
  // -------------------------------------------------------------------------

  async syncToEncompass(
    documentId: string,
    loanGuid: string
  ): Promise<Document> {
    const document = await this.repository.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Download file from storage
    const fileBuffer = await this.storage.download(
      document.storageBucket,
      document.storageKey
    );

    // Get folder ID for document type
    const typeDef = this.docTypeMap.get(document.documentType);
    const folderId = typeDef?.encompassFolder ?? 'Other';

    // Upload to Encompass
    const result = await this.encompassSync.uploadToEFolder(
      loanGuid,
      folderId,
      document,
      fileBuffer
    );

    // Update document with Encompass info
    return this.repository.update(documentId, {
      encompassDocId: result.encompassDocId,
      encompassFolderId: folderId,
      encompassSyncedAt: new Date(),
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Document Checklist
  // -------------------------------------------------------------------------

  async getDocumentChecklist(
    applicationId: string,
    isEntityBorrower: boolean
  ): Promise<DocumentChecklistItem[]> {
    const documents = await this.repository.findByApplication(applicationId);
    const checklist: DocumentChecklistItem[] = [];

    for (const typeDef of DSCR_DOCUMENT_TYPES) {
      // Skip entity docs for individual borrowers
      if (typeDef.category === 'ENTITY' && !isEntityBorrower) {
        continue;
      }

      const matchingDocs = documents.filter(
        d => d.documentType === typeDef.type && d.isLatest
      );

      const status: DocumentChecklistStatus = matchingDocs.length > 0
        ? matchingDocs.some(d => d.status === 'ACCEPTED' || d.status === 'CLASSIFIED')
          ? 'COMPLETE'
          : 'PENDING_REVIEW'
        : typeDef.requiredForDSCR
          ? 'REQUIRED'
          : 'OPTIONAL';

      checklist.push({
        documentType: typeDef.type,
        name: typeDef.name,
        description: typeDef.description,
        category: typeDef.category,
        required: typeDef.requiredForDSCR,
        status,
        documents: matchingDocs,
        expirationDays: typeDef.expirationDays
      });
    }

    return checklist;
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  private validateFile(
    buffer: Buffer,
    mimeType: string,
    documentType?: DocumentType
  ): void {
    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new DocumentValidationError(
        `File size ${buffer.length} exceeds maximum ${maxSize}`,
        'FILE_TOO_LARGE'
      );
    }

    // Check mime type
    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'application/xml',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedMimeTypes.includes(mimeType)) {
      throw new DocumentValidationError(
        `Unsupported file type: ${mimeType}`,
        'UNSUPPORTED_TYPE'
      );
    }

    // Check document type specific rules
    if (documentType) {
      const typeDef = this.docTypeMap.get(documentType);
      if (typeDef) {
        if (!typeDef.acceptedMimeTypes.includes(mimeType)) {
          throw new DocumentValidationError(
            `${typeDef.name} requires: ${typeDef.acceptedMimeTypes.join(', ')}`,
            'INVALID_TYPE_FOR_DOC'
          );
        }

        if (buffer.length > typeDef.maxSizeBytes) {
          throw new DocumentValidationError(
            `${typeDef.name} max size: ${typeDef.maxSizeBytes / 1024 / 1024}MB`,
            'FILE_TOO_LARGE'
          );
        }
      }
    }
  }

  private getExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/tiff': '.tiff',
      'application/xml': '.xml',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
    };
    return extensions[mimeType] ?? '';
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

export type DocumentChecklistStatus = 'REQUIRED' | 'OPTIONAL' | 'PENDING_REVIEW' | 'COMPLETE';

export interface DocumentChecklistItem {
  documentType: DocumentType;
  name: string;
  description: string;
  category: DocumentCategory;
  required: boolean;
  status: DocumentChecklistStatus;
  documents: Document[];
  expirationDays?: number;
}

export class DocumentValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

// ============================================================================
// Encompass eFolder Mapping
// ============================================================================

export const ENCOMPASS_EFOLDER_MAPPING: Record<DocumentCategory, string> = {
  INCOME: 'Income',
  ASSET: 'Assets',
  PROPERTY: 'Property',
  CREDIT: 'Credit',
  ENTITY: 'Entity Documents',
  IDENTITY: 'Identification',
  INSURANCE: 'Insurance',
  TITLE: 'Title',
  CLOSING: 'Closing Documents',
  OTHER: 'Other'
};
