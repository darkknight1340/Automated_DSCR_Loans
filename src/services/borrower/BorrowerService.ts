/**
 * Borrower & Entity Management Service
 *
 * Handles individual borrowers, entity borrowers (LLC, Corp, Trust),
 * ownership structures, and guarantor relationships for DSCR loans.
 *
 * DSCR loans commonly use entity structures for liability protection,
 * requiring complex ownership tracking and guarantor management.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type BorrowerType = 'INDIVIDUAL' | 'LLC' | 'CORPORATION' | 'TRUST' | 'PARTNERSHIP';

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  alternatePhone?: string;
  preferredContactMethod: 'EMAIL' | 'PHONE' | 'SMS';
}

export interface IndividualBorrower {
  id: string;
  type: 'INDIVIDUAL';
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: Date;
  ssn: string; // Encrypted at rest
  citizenship: 'US_CITIZEN' | 'PERMANENT_RESIDENT' | 'NON_PERMANENT_RESIDENT' | 'FOREIGN_NATIONAL';
  mailingAddress: Address;
  residenceAddress?: Address;
  contact: ContactInfo;

  // Employment (optional for DSCR but useful for profile)
  employmentStatus?: 'EMPLOYED' | 'SELF_EMPLOYED' | 'RETIRED' | 'NOT_EMPLOYED';
  employer?: string;

  // Real estate experience
  investmentPropertyCount: number;
  yearsOfExperience: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface EntityBorrower {
  id: string;
  type: Exclude<BorrowerType, 'INDIVIDUAL'>;
  legalName: string;
  tradeName?: string;
  ein: string; // Encrypted at rest
  stateOfFormation: string;
  dateOfFormation: Date;

  // Registration
  registrationNumber?: string;
  goodStandingVerified: boolean;
  goodStandingDate?: Date;

  // Entity address
  principalAddress: Address;
  mailingAddress?: Address;
  contact: ContactInfo;

  // Documents received
  articlesOfOrganizationReceived: boolean;
  operatingAgreementReceived: boolean;
  certificateOfGoodStandingReceived: boolean;
  einLetterReceived: boolean;

  // Ownership structure
  ownershipStructure: OwnershipMember[];

  // For trusts
  trustType?: 'REVOCABLE' | 'IRREVOCABLE';
  trustDate?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface OwnershipMember {
  id: string;
  entityId: string;

  // Member can be individual or another entity
  memberType: 'INDIVIDUAL' | 'ENTITY';
  individualId?: string;
  memberEntityId?: string;

  ownershipPercentage: number; // 0-100
  role: 'MEMBER' | 'MANAGER' | 'MANAGING_MEMBER' | 'TRUSTEE' | 'BENEFICIARY' | 'GENERAL_PARTNER' | 'LIMITED_PARTNER';

  // Signing authority
  hasSigningAuthority: boolean;
  signingAuthorityLimit?: number; // In cents

  createdAt: Date;
}

export interface Guarantor {
  id: string;
  applicationId: string;
  individualId: string;

  guarantyType: 'FULL' | 'LIMITED' | 'PAYMENT' | 'COMPLETION';
  guarantyPercentage: number; // For limited guaranties

  // Guarantor financial info
  estimatedNetWorth?: number;
  estimatedLiquidAssets?: number;

  // Consent
  consentDate?: Date;
  consentIpAddress?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type Borrower = IndividualBorrower | EntityBorrower;

export interface BorrowerProfile {
  primary: Borrower;
  guarantors: Array<{
    guarantor: Guarantor;
    individual: IndividualBorrower;
  }>;
  ownershipChain?: OwnershipChainNode[];
}

export interface OwnershipChainNode {
  entity: EntityBorrower;
  level: number;
  ownershipPath: Array<{
    from: string;
    to: string;
    percentage: number;
  }>;
  ultimateBeneficialOwners: Array<{
    individual: IndividualBorrower;
    effectiveOwnership: number;
  }>;
}

export interface CreateIndividualInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: string; // ISO date
  ssn: string;
  citizenship: IndividualBorrower['citizenship'];
  mailingAddress: Address;
  residenceAddress?: Address;
  contact: ContactInfo;
  investmentPropertyCount?: number;
  yearsOfExperience?: number;
}

export interface CreateEntityInput {
  type: Exclude<BorrowerType, 'INDIVIDUAL'>;
  legalName: string;
  tradeName?: string;
  ein: string;
  stateOfFormation: string;
  dateOfFormation: string; // ISO date
  principalAddress: Address;
  mailingAddress?: Address;
  contact: ContactInfo;
  trustType?: 'REVOCABLE' | 'IRREVOCABLE';
  trustDate?: string;
}

export interface AddOwnershipMemberInput {
  entityId: string;
  memberType: 'INDIVIDUAL' | 'ENTITY';
  individualId?: string;
  memberEntityId?: string;
  ownershipPercentage: number;
  role: OwnershipMember['role'];
  hasSigningAuthority: boolean;
  signingAuthorityLimit?: number;
}

export interface CreateGuarantorInput {
  applicationId: string;
  individualId: string;
  guarantyType: Guarantor['guarantyType'];
  guarantyPercentage?: number;
  estimatedNetWorth?: number;
  estimatedLiquidAssets?: number;
}

// ============================================================================
// Validation
// ============================================================================

export class BorrowerValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'BorrowerValidationError';
  }
}

export class BorrowerValidator {
  validateSSN(ssn: string): boolean {
    // Basic SSN format validation (XXX-XX-XXXX or XXXXXXXXX)
    const cleaned = ssn.replace(/\D/g, '');
    if (cleaned.length !== 9) return false;

    // Cannot start with 9 (ITIN), 000, or be all zeros in any group
    if (cleaned.startsWith('9')) return false;
    if (cleaned.startsWith('000')) return false;
    if (cleaned.substring(3, 5) === '00') return false;
    if (cleaned.substring(5) === '0000') return false;

    return true;
  }

  validateEIN(ein: string): boolean {
    const cleaned = ein.replace(/\D/g, '');
    if (cleaned.length !== 9) return false;

    // Valid EIN prefixes
    const validPrefixes = [
      '01', '02', '03', '04', '05', '06', '10', '11', '12', '13', '14', '15',
      '16', '20', '21', '22', '23', '24', '25', '26', '27', '30', '31', '32',
      '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44',
      '45', '46', '47', '48', '50', '51', '52', '53', '54', '55', '56', '57',
      '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '71',
      '72', '73', '74', '75', '76', '77', '80', '81', '82', '83', '84', '85',
      '86', '87', '88', '90', '91', '92', '93', '94', '95', '98', '99'
    ];

    return validPrefixes.includes(cleaned.substring(0, 2));
  }

  validateOwnershipTotal(members: OwnershipMember[]): { valid: boolean; total: number } {
    const total = members.reduce((sum, m) => sum + m.ownershipPercentage, 0);
    return {
      valid: Math.abs(total - 100) < 0.01, // Allow small floating point variance
      total
    };
  }

  validateIndividual(input: CreateIndividualInput): void {
    if (!input.firstName?.trim()) {
      throw new BorrowerValidationError('First name is required', 'firstName', 'REQUIRED');
    }

    if (!input.lastName?.trim()) {
      throw new BorrowerValidationError('Last name is required', 'lastName', 'REQUIRED');
    }

    if (!this.validateSSN(input.ssn)) {
      throw new BorrowerValidationError('Invalid SSN format', 'ssn', 'INVALID_FORMAT');
    }

    const dob = new Date(input.dateOfBirth);
    const age = this.calculateAge(dob);
    if (age < 18) {
      throw new BorrowerValidationError('Borrower must be at least 18 years old', 'dateOfBirth', 'UNDERAGE');
    }

    if (!input.contact?.email?.includes('@')) {
      throw new BorrowerValidationError('Valid email is required', 'contact.email', 'INVALID_FORMAT');
    }
  }

  validateEntity(input: CreateEntityInput): void {
    if (!input.legalName?.trim()) {
      throw new BorrowerValidationError('Legal name is required', 'legalName', 'REQUIRED');
    }

    if (!this.validateEIN(input.ein)) {
      throw new BorrowerValidationError('Invalid EIN format', 'ein', 'INVALID_FORMAT');
    }

    const formationDate = new Date(input.dateOfFormation);
    if (formationDate > new Date()) {
      throw new BorrowerValidationError('Formation date cannot be in the future', 'dateOfFormation', 'FUTURE_DATE');
    }

    if (input.type === 'TRUST' && !input.trustType) {
      throw new BorrowerValidationError('Trust type is required for trust borrowers', 'trustType', 'REQUIRED');
    }
  }

  private calculateAge(dob: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }
}

// ============================================================================
// Service
// ============================================================================

export interface IBorrowerRepository {
  findIndividualById(id: string): Promise<IndividualBorrower | null>;
  findIndividualBySSN(ssn: string): Promise<IndividualBorrower | null>;
  findEntityById(id: string): Promise<EntityBorrower | null>;
  findEntityByEIN(ein: string): Promise<EntityBorrower | null>;
  findOwnershipMembers(entityId: string): Promise<OwnershipMember[]>;
  findGuarantorsByApplication(applicationId: string): Promise<Guarantor[]>;

  createIndividual(individual: IndividualBorrower): Promise<IndividualBorrower>;
  createEntity(entity: EntityBorrower): Promise<EntityBorrower>;
  addOwnershipMember(member: OwnershipMember): Promise<OwnershipMember>;
  createGuarantor(guarantor: Guarantor): Promise<Guarantor>;

  updateIndividual(id: string, updates: Partial<IndividualBorrower>): Promise<IndividualBorrower>;
  updateEntity(id: string, updates: Partial<EntityBorrower>): Promise<EntityBorrower>;
  updateGuarantor(id: string, updates: Partial<Guarantor>): Promise<Guarantor>;

  removeOwnershipMember(memberId: string): Promise<void>;
}

export interface IEncryptionService {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
  hash(value: string): string;
}

export class BorrowerService {
  constructor(
    private readonly repository: IBorrowerRepository,
    private readonly encryption: IEncryptionService,
    private readonly validator: BorrowerValidator = new BorrowerValidator()
  ) {}

  // -------------------------------------------------------------------------
  // Individual Borrower Operations
  // -------------------------------------------------------------------------

  async createIndividual(input: CreateIndividualInput): Promise<IndividualBorrower> {
    this.validator.validateIndividual(input);

    // Check for existing borrower by SSN
    const ssnHash = this.encryption.hash(input.ssn);
    const existing = await this.repository.findIndividualBySSN(ssnHash);
    if (existing) {
      // Return existing borrower (idempotent)
      return existing;
    }

    const encryptedSSN = await this.encryption.encrypt(input.ssn);

    const individual: IndividualBorrower = {
      id: uuidv4(),
      type: 'INDIVIDUAL',
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim(),
      lastName: input.lastName.trim(),
      suffix: input.suffix?.trim(),
      dateOfBirth: new Date(input.dateOfBirth),
      ssn: encryptedSSN,
      citizenship: input.citizenship,
      mailingAddress: input.mailingAddress,
      residenceAddress: input.residenceAddress,
      contact: input.contact,
      investmentPropertyCount: input.investmentPropertyCount ?? 0,
      yearsOfExperience: input.yearsOfExperience ?? 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.createIndividual(individual);
  }

  async getIndividual(id: string): Promise<IndividualBorrower | null> {
    return this.repository.findIndividualById(id);
  }

  async updateIndividualExperience(
    id: string,
    propertyCount: number,
    yearsExperience: number
  ): Promise<IndividualBorrower> {
    return this.repository.updateIndividual(id, {
      investmentPropertyCount: propertyCount,
      yearsOfExperience: yearsExperience,
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Entity Borrower Operations
  // -------------------------------------------------------------------------

  async createEntity(input: CreateEntityInput): Promise<EntityBorrower> {
    this.validator.validateEntity(input);

    // Check for existing entity by EIN
    const einHash = this.encryption.hash(input.ein);
    const existing = await this.repository.findEntityByEIN(einHash);
    if (existing) {
      return existing;
    }

    const encryptedEIN = await this.encryption.encrypt(input.ein);

    const entity: EntityBorrower = {
      id: uuidv4(),
      type: input.type,
      legalName: input.legalName.trim(),
      tradeName: input.tradeName?.trim(),
      ein: encryptedEIN,
      stateOfFormation: input.stateOfFormation,
      dateOfFormation: new Date(input.dateOfFormation),
      principalAddress: input.principalAddress,
      mailingAddress: input.mailingAddress,
      contact: input.contact,
      goodStandingVerified: false,
      articlesOfOrganizationReceived: false,
      operatingAgreementReceived: false,
      certificateOfGoodStandingReceived: false,
      einLetterReceived: false,
      ownershipStructure: [],
      trustType: input.trustType,
      trustDate: input.trustDate ? new Date(input.trustDate) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.createEntity(entity);
  }

  async getEntity(id: string): Promise<EntityBorrower | null> {
    const entity = await this.repository.findEntityById(id);
    if (entity) {
      entity.ownershipStructure = await this.repository.findOwnershipMembers(id);
    }
    return entity;
  }

  async updateEntityDocuments(
    id: string,
    documents: Partial<Pick<EntityBorrower,
      'articlesOfOrganizationReceived' |
      'operatingAgreementReceived' |
      'certificateOfGoodStandingReceived' |
      'einLetterReceived'
    >>
  ): Promise<EntityBorrower> {
    return this.repository.updateEntity(id, {
      ...documents,
      updatedAt: new Date()
    });
  }

  async verifyGoodStanding(id: string): Promise<EntityBorrower> {
    return this.repository.updateEntity(id, {
      goodStandingVerified: true,
      goodStandingDate: new Date(),
      updatedAt: new Date()
    });
  }

  // -------------------------------------------------------------------------
  // Ownership Structure
  // -------------------------------------------------------------------------

  async addOwnershipMember(input: AddOwnershipMemberInput): Promise<OwnershipMember> {
    // Validate ownership percentage
    const existingMembers = await this.repository.findOwnershipMembers(input.entityId);
    const currentTotal = existingMembers.reduce((sum, m) => sum + m.ownershipPercentage, 0);

    if (currentTotal + input.ownershipPercentage > 100.01) {
      throw new BorrowerValidationError(
        `Adding ${input.ownershipPercentage}% would exceed 100% total ownership (current: ${currentTotal}%)`,
        'ownershipPercentage',
        'EXCEEDS_TOTAL'
      );
    }

    // Validate member exists
    if (input.memberType === 'INDIVIDUAL' && input.individualId) {
      const individual = await this.repository.findIndividualById(input.individualId);
      if (!individual) {
        throw new BorrowerValidationError('Individual not found', 'individualId', 'NOT_FOUND');
      }
    } else if (input.memberType === 'ENTITY' && input.memberEntityId) {
      const memberEntity = await this.repository.findEntityById(input.memberEntityId);
      if (!memberEntity) {
        throw new BorrowerValidationError('Member entity not found', 'memberEntityId', 'NOT_FOUND');
      }
    }

    const member: OwnershipMember = {
      id: uuidv4(),
      entityId: input.entityId,
      memberType: input.memberType,
      individualId: input.individualId,
      memberEntityId: input.memberEntityId,
      ownershipPercentage: input.ownershipPercentage,
      role: input.role,
      hasSigningAuthority: input.hasSigningAuthority,
      signingAuthorityLimit: input.signingAuthorityLimit,
      createdAt: new Date()
    };

    return this.repository.addOwnershipMember(member);
  }

  async removeOwnershipMember(memberId: string): Promise<void> {
    return this.repository.removeOwnershipMember(memberId);
  }

  /**
   * Calculate Ultimate Beneficial Owners (UBOs) by traversing ownership chain.
   * Required for compliance (BSA/AML, FinCEN beneficial ownership rules).
   */
  async calculateUltimateBeneficialOwners(
    entityId: string,
    threshold: number = 25 // Default 25% for FinCEN
  ): Promise<Array<{ individual: IndividualBorrower; effectiveOwnership: number }>> {
    const ubos: Map<string, { individual: IndividualBorrower; effectiveOwnership: number }> = new Map();

    await this.traverseOwnership(entityId, 100, ubos);

    // Filter by threshold and sort by ownership
    return Array.from(ubos.values())
      .filter(ubo => ubo.effectiveOwnership >= threshold)
      .sort((a, b) => b.effectiveOwnership - a.effectiveOwnership);
  }

  private async traverseOwnership(
    entityId: string,
    ownershipMultiplier: number,
    ubos: Map<string, { individual: IndividualBorrower; effectiveOwnership: number }>,
    visited: Set<string> = new Set()
  ): Promise<void> {
    // Prevent circular ownership
    if (visited.has(entityId)) return;
    visited.add(entityId);

    const members = await this.repository.findOwnershipMembers(entityId);

    for (const member of members) {
      const effectiveOwnership = (member.ownershipPercentage * ownershipMultiplier) / 100;

      if (member.memberType === 'INDIVIDUAL' && member.individualId) {
        const individual = await this.repository.findIndividualById(member.individualId);
        if (individual) {
          const existing = ubos.get(individual.id);
          if (existing) {
            existing.effectiveOwnership += effectiveOwnership;
          } else {
            ubos.set(individual.id, { individual, effectiveOwnership });
          }
        }
      } else if (member.memberType === 'ENTITY' && member.memberEntityId) {
        // Recurse into nested entity
        await this.traverseOwnership(
          member.memberEntityId,
          effectiveOwnership,
          ubos,
          visited
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Guarantor Operations
  // -------------------------------------------------------------------------

  async addGuarantor(input: CreateGuarantorInput): Promise<Guarantor> {
    // Validate individual exists
    const individual = await this.repository.findIndividualById(input.individualId);
    if (!individual) {
      throw new BorrowerValidationError('Guarantor individual not found', 'individualId', 'NOT_FOUND');
    }

    // For limited guaranties, percentage is required
    if (input.guarantyType === 'LIMITED' && !input.guarantyPercentage) {
      throw new BorrowerValidationError(
        'Guaranty percentage required for limited guaranties',
        'guarantyPercentage',
        'REQUIRED'
      );
    }

    const guarantor: Guarantor = {
      id: uuidv4(),
      applicationId: input.applicationId,
      individualId: input.individualId,
      guarantyType: input.guarantyType,
      guarantyPercentage: input.guarantyPercentage ?? 100,
      estimatedNetWorth: input.estimatedNetWorth,
      estimatedLiquidAssets: input.estimatedLiquidAssets,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.repository.createGuarantor(guarantor);
  }

  async recordGuarantorConsent(
    guarantorId: string,
    ipAddress: string
  ): Promise<Guarantor> {
    return this.repository.updateGuarantor(guarantorId, {
      consentDate: new Date(),
      consentIpAddress: ipAddress,
      updatedAt: new Date()
    });
  }

  async getGuarantorsForApplication(applicationId: string): Promise<Array<{
    guarantor: Guarantor;
    individual: IndividualBorrower;
  }>> {
    const guarantors = await this.repository.findGuarantorsByApplication(applicationId);

    const results: Array<{ guarantor: Guarantor; individual: IndividualBorrower }> = [];

    for (const guarantor of guarantors) {
      const individual = await this.repository.findIndividualById(guarantor.individualId);
      if (individual) {
        results.push({ guarantor, individual });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Complete Borrower Profile
  // -------------------------------------------------------------------------

  async getBorrowerProfile(
    borrowerId: string,
    borrowerType: BorrowerType,
    applicationId?: string
  ): Promise<BorrowerProfile> {
    let primary: Borrower;
    let ownershipChain: OwnershipChainNode[] | undefined;

    if (borrowerType === 'INDIVIDUAL') {
      const individual = await this.repository.findIndividualById(borrowerId);
      if (!individual) {
        throw new Error(`Individual borrower not found: ${borrowerId}`);
      }
      primary = individual;
    } else {
      const entity = await this.getEntity(borrowerId);
      if (!entity) {
        throw new Error(`Entity borrower not found: ${borrowerId}`);
      }
      primary = entity;

      // Build ownership chain for entity borrowers
      ownershipChain = await this.buildOwnershipChain(borrowerId);
    }

    // Get guarantors if application provided
    let guarantors: Array<{ guarantor: Guarantor; individual: IndividualBorrower }> = [];
    if (applicationId) {
      guarantors = await this.getGuarantorsForApplication(applicationId);
    }

    return {
      primary,
      guarantors,
      ownershipChain
    };
  }

  private async buildOwnershipChain(
    entityId: string,
    level: number = 0,
    path: Array<{ from: string; to: string; percentage: number }> = []
  ): Promise<OwnershipChainNode[]> {
    const entity = await this.getEntity(entityId);
    if (!entity) return [];

    const ubos = await this.calculateUltimateBeneficialOwners(entityId, 0); // Get all

    const node: OwnershipChainNode = {
      entity,
      level,
      ownershipPath: path,
      ultimateBeneficialOwners: ubos
    };

    const result: OwnershipChainNode[] = [node];

    // Recurse into member entities
    for (const member of entity.ownershipStructure) {
      if (member.memberType === 'ENTITY' && member.memberEntityId) {
        const childPath = [
          ...path,
          { from: entityId, to: member.memberEntityId, percentage: member.ownershipPercentage }
        ];
        const childNodes = await this.buildOwnershipChain(
          member.memberEntityId,
          level + 1,
          childPath
        );
        result.push(...childNodes);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Entity Document Completeness Check
  // -------------------------------------------------------------------------

  checkEntityDocumentCompleteness(entity: EntityBorrower): {
    complete: boolean;
    missing: string[];
    received: string[];
  } {
    const required: Array<{ field: keyof EntityBorrower; label: string }> = [
      { field: 'articlesOfOrganizationReceived', label: 'Articles of Organization' },
      { field: 'operatingAgreementReceived', label: 'Operating Agreement' },
      { field: 'certificateOfGoodStandingReceived', label: 'Certificate of Good Standing' },
      { field: 'einLetterReceived', label: 'EIN Letter' }
    ];

    const missing: string[] = [];
    const received: string[] = [];

    for (const doc of required) {
      if (entity[doc.field]) {
        received.push(doc.label);
      } else {
        missing.push(doc.label);
      }
    }

    return {
      complete: missing.length === 0,
      missing,
      received
    };
  }
}

// ============================================================================
// Encompass Field Mapping for Borrower/Entity
// ============================================================================

export const BORROWER_ENCOMPASS_FIELD_MAPPING = {
  // Standard borrower fields (Field IDs)
  individual: {
    firstName: '4000',
    middleName: '4001',
    lastName: '4002',
    suffix: '4003',
    ssn: '65',
    dateOfBirth: '1402',
    email: '1240',
    phone: '66',
    mailingStreet: '97',
    mailingCity: '98',
    mailingState: '99',
    mailingZip: '100'
  },

  // Custom fields for entity borrowers
  entity: {
    legalName: 'CX.ENTITY_LEGAL_NAME',
    ein: 'CX.ENTITY_EIN',
    entityType: 'CX.ENTITY_TYPE',
    stateOfFormation: 'CX.ENTITY_STATE_FORMATION',
    dateOfFormation: 'CX.ENTITY_DATE_FORMATION',
    goodStandingVerified: 'CX.ENTITY_GOOD_STANDING',
    goodStandingDate: 'CX.ENTITY_GOOD_STANDING_DATE'
  },

  // Entity documents
  entityDocs: {
    articlesReceived: 'CX.ENTITY_ARTICLES_RECEIVED',
    operatingAgreementReceived: 'CX.ENTITY_OA_RECEIVED',
    goodStandingReceived: 'CX.ENTITY_GS_RECEIVED',
    einLetterReceived: 'CX.ENTITY_EIN_LETTER_RECEIVED'
  },

  // Ownership/UBO tracking
  ownership: {
    ownerCount: 'CX.ENTITY_OWNER_COUNT',
    uboCount: 'CX.ENTITY_UBO_COUNT',
    primaryUboName: 'CX.ENTITY_PRIMARY_UBO_NAME',
    primaryUboOwnership: 'CX.ENTITY_PRIMARY_UBO_PCT'
  },

  // Guarantor fields
  guarantor: {
    guarantorName: 'CX.GUARANTOR_1_NAME',
    guarantyType: 'CX.GUARANTOR_1_TYPE',
    guarantyPercentage: 'CX.GUARANTOR_1_PCT',
    consentDate: 'CX.GUARANTOR_1_CONSENT_DATE'
  }
};
