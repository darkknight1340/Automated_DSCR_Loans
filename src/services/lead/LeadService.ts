/**
 * Lead Intake & CRM Service
 *
 * Handles lead capture, scoring, assignment, and conversion to applications.
 * Leads exist in the platform CRM before being converted to Encompass loans.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Lead,
  LeadStatus,
  LeadSource,
  Money,
  PropertyType,
  LoanPurpose,
} from '../../types';

// =====================================================
// INTERFACES
// =====================================================

export interface LeadCreateRequest {
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
    estimatedValue?: number;
  };
  loanInterest?: {
    purpose: LoanPurpose;
    requestedAmount?: number;
    estimatedRent?: number;
    hasExistingMortgage?: boolean;
    existingMortgageBalance?: number;
  };
  qualification?: {
    statedCreditScoreRange?: string;
    isEntityBorrower?: boolean;
    entityName?: string;
  };
  consent: {
    marketing: boolean;
    tcpa: boolean;
  };
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
}

export interface LeadScoringResult {
  score: number;
  factors: ScoringFactor[];
  recommendation: 'HIGH_PRIORITY' | 'MEDIUM_PRIORITY' | 'LOW_PRIORITY' | 'DISQUALIFY';
}

export interface ScoringFactor {
  factor: string;
  weight: number;
  value: number;
  contribution: number;
  description: string;
}

export interface LeadAssignmentResult {
  assignedLoId: string;
  assignmentReason: string;
  priority: number;
}

export interface LeadConversionResult {
  applicationId: string;
  encompassLoanGuid?: string;
  conversionNotes: string[];
}

// =====================================================
// LEAD SCORING ENGINE
// =====================================================

export class LeadScoringEngine {
  private readonly scoringWeights: Record<string, number> = {
    creditScoreRange: 25,
    loanAmount: 20,
    propertyType: 15,
    loanPurpose: 10,
    hasContact: 10,
    hasPropertyInfo: 10,
    tcpaConsent: 5,
    sourceQuality: 5,
  };

  score(lead: Lead, source: LeadSource): LeadScoringResult {
    const factors: ScoringFactor[] = [];
    let totalScore = 0;

    // Credit score range factor
    const creditFactor = this.scoreCreditRange(lead.qualification.statedCreditScoreRange);
    factors.push(creditFactor);
    totalScore += creditFactor.contribution;

    // Loan amount factor
    const amountFactor = this.scoreLoanAmount(lead.loanInterest?.requestedAmount);
    factors.push(amountFactor);
    totalScore += amountFactor.contribution;

    // Property type factor
    const propertyFactor = this.scorePropertyType(lead.propertyInterest?.propertyType);
    factors.push(propertyFactor);
    totalScore += propertyFactor.contribution;

    // Loan purpose factor
    const purposeFactor = this.scoreLoanPurpose(lead.loanInterest?.purpose);
    factors.push(purposeFactor);
    totalScore += purposeFactor.contribution;

    // Contact completeness
    const contactFactor = this.scoreContactCompleteness(lead);
    factors.push(contactFactor);
    totalScore += contactFactor.contribution;

    // Property info completeness
    const propInfoFactor = this.scorePropertyInfoCompleteness(lead);
    factors.push(propInfoFactor);
    totalScore += propInfoFactor.contribution;

    // TCPA consent
    const tcpaFactor = this.scoreTcpaConsent(lead.consent.tcpa);
    factors.push(tcpaFactor);
    totalScore += tcpaFactor.contribution;

    // Source quality
    const sourceFactor = this.scoreSourceQuality(source);
    factors.push(sourceFactor);
    totalScore += sourceFactor.contribution;

    const recommendation = this.getRecommendation(totalScore);

    return {
      score: Math.round(totalScore),
      factors,
      recommendation,
    };
  }

  private scoreCreditRange(range?: string): ScoringFactor {
    const weight = this.scoringWeights.creditScoreRange;
    let value = 0;

    switch (range) {
      case '740+': value = 100; break;
      case '720-739': value = 90; break;
      case '700-719': value = 80; break;
      case '680-699': value = 70; break;
      case '660-679': value = 60; break;
      case '640-659': value = 50; break;
      case 'below-640': value = 30; break;
      default: value = 50; // Unknown = medium
    }

    return {
      factor: 'creditScoreRange',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Credit score range: ${range || 'Not provided'}`,
    };
  }

  private scoreLoanAmount(amount?: Money | number): ScoringFactor {
    const weight = this.scoringWeights.loanAmount;
    const amountValue = typeof amount === 'number' ? amount : amount?.amount ?? 0;
    let value = 0;

    // DSCR loans typically range from $150K to $3M
    if (amountValue >= 500000 && amountValue <= 1500000) {
      value = 100; // Sweet spot
    } else if (amountValue >= 250000 && amountValue < 500000) {
      value = 80;
    } else if (amountValue > 1500000 && amountValue <= 2500000) {
      value = 85;
    } else if (amountValue >= 150000 && amountValue < 250000) {
      value = 60;
    } else if (amountValue > 2500000) {
      value = 70; // Large but possible
    } else {
      value = 40; // Too small or unknown
    }

    return {
      factor: 'loanAmount',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Loan amount: $${amountValue?.toLocaleString() || 'Not provided'}`,
    };
  }

  private scorePropertyType(type?: PropertyType): ScoringFactor {
    const weight = this.scoringWeights.propertyType;
    let value = 0;

    switch (type) {
      case PropertyType.SFR: value = 100; break;
      case PropertyType.TOWNHOUSE: value = 95; break;
      case PropertyType.CONDO: value = 90; break;
      case PropertyType.TWO_TO_FOUR_UNIT: value = 95; break;
      case PropertyType.MULTIFAMILY: value = 85; break;
      case PropertyType.MIXED_USE: value = 70; break;
      default: value = 70;
    }

    return {
      factor: 'propertyType',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Property type: ${type || 'Not provided'}`,
    };
  }

  private scoreLoanPurpose(purpose?: LoanPurpose): ScoringFactor {
    const weight = this.scoringWeights.loanPurpose;
    let value = 0;

    switch (purpose) {
      case LoanPurpose.RATE_TERM_REFI: value = 100; break;
      case LoanPurpose.CASH_OUT_REFI: value = 90; break;
      case LoanPurpose.PURCHASE: value = 95; break;
      default: value = 70;
    }

    return {
      factor: 'loanPurpose',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Loan purpose: ${purpose || 'Not provided'}`,
    };
  }

  private scoreContactCompleteness(lead: Lead): ScoringFactor {
    const weight = this.scoringWeights.hasContact;
    let completeness = 0;
    let total = 0;

    if (lead.contact.email) { completeness++; }
    total++;
    if (lead.contact.phone) { completeness++; }
    total++;
    if (lead.contact.firstName) { completeness++; }
    total++;
    if (lead.contact.lastName) { completeness++; }
    total++;

    const value = (completeness / total) * 100;

    return {
      factor: 'hasContact',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Contact completeness: ${Math.round(value)}%`,
    };
  }

  private scorePropertyInfoCompleteness(lead: Lead): ScoringFactor {
    const weight = this.scoringWeights.hasPropertyInfo;
    if (!lead.propertyInterest) {
      return {
        factor: 'hasPropertyInfo',
        weight,
        value: 30,
        contribution: 0.3 * weight,
        description: 'No property information provided',
      };
    }

    let completeness = 0;
    let total = 0;

    if (lead.propertyInterest.address) { completeness++; }
    total++;
    if (lead.propertyInterest.city) { completeness++; }
    total++;
    if (lead.propertyInterest.state) { completeness++; }
    total++;
    if (lead.propertyInterest.zip) { completeness++; }
    total++;
    if (lead.propertyInterest.propertyType) { completeness++; }
    total++;
    if (lead.propertyInterest.estimatedValue) { completeness++; }
    total++;

    const value = (completeness / total) * 100;

    return {
      factor: 'hasPropertyInfo',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Property info completeness: ${Math.round(value)}%`,
    };
  }

  private scoreTcpaConsent(hasConsent: boolean): ScoringFactor {
    const weight = this.scoringWeights.tcpaConsent;
    const value = hasConsent ? 100 : 0;

    return {
      factor: 'tcpaConsent',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: hasConsent ? 'Has TCPA consent' : 'No TCPA consent',
    };
  }

  private scoreSourceQuality(source: LeadSource): ScoringFactor {
    const weight = this.scoringWeights.sourceQuality;
    let value = 0;

    switch (source.sourceType) {
      case 'referral': value = 100; break;
      case 'broker': value = 90; break;
      case 'website': value = 80; break;
      case 'marketplace': value = 70; break;
      case 'marketing': value = 60; break;
      default: value = 50;
    }

    return {
      factor: 'sourceQuality',
      weight,
      value,
      contribution: (value / 100) * weight,
      description: `Source type: ${source.sourceType}`,
    };
  }

  private getRecommendation(
    score: number
  ): 'HIGH_PRIORITY' | 'MEDIUM_PRIORITY' | 'LOW_PRIORITY' | 'DISQUALIFY' {
    if (score >= 75) return 'HIGH_PRIORITY';
    if (score >= 55) return 'MEDIUM_PRIORITY';
    if (score >= 35) return 'LOW_PRIORITY';
    return 'DISQUALIFY';
  }
}

// =====================================================
// LEAD SERVICE
// =====================================================

export class LeadService {
  private readonly scoringEngine: LeadScoringEngine;

  constructor(
    private readonly db: LeadRepository,
    private readonly eventBus: EventBus,
    private readonly auditLog: AuditLogger,
  ) {
    this.scoringEngine = new LeadScoringEngine();
  }

  /**
   * Create a new lead with deduplication
   */
  async createLead(request: LeadCreateRequest): Promise<Lead> {
    // Check for duplicates
    const existingLead = await this.findDuplicate(request);
    if (existingLead) {
      // Update existing lead instead of creating duplicate
      return this.updateExistingLead(existingLead, request);
    }

    // Validate source
    const source = await this.db.getLeadSource(request.sourceId);
    if (!source || !source.isActive) {
      throw new Error(`Invalid or inactive lead source: ${request.sourceId}`);
    }

    // Create lead
    const lead: Lead = {
      id: uuidv4(),
      externalId: request.externalId,
      sourceId: request.sourceId,
      contact: {
        firstName: request.contact.firstName?.trim(),
        lastName: request.contact.lastName?.trim(),
        email: request.contact.email.toLowerCase().trim(),
        phone: this.normalizePhone(request.contact.phone),
        phoneSecondary: this.normalizePhone(request.contact.phoneSecondary),
      },
      propertyInterest: request.propertyInterest ? {
        address: request.propertyInterest.address,
        city: request.propertyInterest.city,
        state: request.propertyInterest.state?.toUpperCase(),
        zip: request.propertyInterest.zip,
        propertyType: request.propertyInterest.propertyType,
        estimatedValue: request.propertyInterest.estimatedValue
          ? { amount: request.propertyInterest.estimatedValue * 100, currency: 'USD' }
          : undefined,
      } : undefined,
      loanInterest: request.loanInterest ? {
        purpose: request.loanInterest.purpose,
        requestedAmount: request.loanInterest.requestedAmount
          ? { amount: request.loanInterest.requestedAmount * 100, currency: 'USD' }
          : undefined,
        estimatedRent: request.loanInterest.estimatedRent
          ? { amount: request.loanInterest.estimatedRent * 100, currency: 'USD' }
          : undefined,
        hasExistingMortgage: request.loanInterest.hasExistingMortgage,
        existingMortgageBalance: request.loanInterest.existingMortgageBalance
          ? { amount: request.loanInterest.existingMortgageBalance * 100, currency: 'USD' }
          : undefined,
      } : undefined,
      qualification: {
        statedCreditScoreRange: request.qualification?.statedCreditScoreRange,
        isEntityBorrower: request.qualification?.isEntityBorrower ?? false,
        entityName: request.qualification?.entityName,
      },
      status: LeadStatus.NEW,
      consent: {
        marketing: request.consent.marketing,
        marketingAt: request.consent.marketing ? new Date() : undefined,
        tcpa: request.consent.tcpa,
        tcpaAt: request.consent.tcpa ? new Date() : undefined,
      },
      utmParams: request.utmParams,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Score the lead
    const scoringResult = this.scoringEngine.score(lead, source);
    lead.score = scoringResult.score;

    // Auto-disqualify if score too low
    if (scoringResult.recommendation === 'DISQUALIFY') {
      lead.status = LeadStatus.DISQUALIFIED;
    }

    // Save lead
    await this.db.createLead(lead);

    // Auto-assign if qualified
    if (lead.status !== LeadStatus.DISQUALIFIED) {
      await this.autoAssignLead(lead);
    }

    // Emit event
    await this.eventBus.emit({
      eventType: 'LEAD_CREATED',
      aggregateType: 'lead',
      aggregateId: lead.id,
      payload: {
        leadId: lead.id,
        score: lead.score,
        status: lead.status,
        source: source.name,
      },
    });

    // Audit log
    await this.auditLog.log({
      eventType: 'LEAD_CREATED',
      resourceType: 'lead',
      resourceId: lead.id,
      action: 'CREATE',
      newState: this.sanitizeLeadForAudit(lead),
    });

    return lead;
  }

  /**
   * Score or re-score a lead
   */
  async scoreLead(leadId: string): Promise<LeadScoringResult> {
    const lead = await this.db.getLead(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const source = await this.db.getLeadSource(lead.sourceId);
    if (!source) {
      throw new Error(`Lead source not found: ${lead.sourceId}`);
    }

    const result = this.scoringEngine.score(lead, source);

    // Update lead score
    await this.db.updateLead(leadId, {
      score: result.score,
      updatedAt: new Date(),
    });

    return result;
  }

  /**
   * Qualify a lead (move to QUALIFIED status)
   */
  async qualifyLead(leadId: string, notes?: string): Promise<Lead> {
    const lead = await this.db.getLead(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    if (lead.status !== LeadStatus.NEW && lead.status !== LeadStatus.CONTACTED) {
      throw new Error(`Cannot qualify lead in status: ${lead.status}`);
    }

    const previousStatus = lead.status;

    await this.db.updateLead(leadId, {
      status: LeadStatus.QUALIFIED,
      qualifiedAt: new Date(),
      updatedAt: new Date(),
    });

    // Record activity
    await this.db.addLeadActivity(leadId, {
      activityType: 'status_change',
      description: `Lead qualified. ${notes || ''}`,
      metadata: { previousStatus, newStatus: LeadStatus.QUALIFIED },
    });

    await this.eventBus.emit({
      eventType: 'LEAD_QUALIFIED',
      aggregateType: 'lead',
      aggregateId: leadId,
      payload: { leadId, previousStatus },
    });

    return this.db.getLead(leadId) as Promise<Lead>;
  }

  /**
   * Convert a qualified lead to an application
   */
  async convertLead(leadId: string): Promise<LeadConversionResult> {
    const lead = await this.db.getLead(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    if (lead.status !== LeadStatus.QUALIFIED) {
      throw new Error(`Lead must be qualified before conversion. Current status: ${lead.status}`);
    }

    if (lead.convertedToApplicationId) {
      throw new Error(`Lead already converted to application: ${lead.convertedToApplicationId}`);
    }

    const conversionNotes: string[] = [];

    // Validate minimum required data
    if (!lead.contact.email) {
      throw new Error('Email is required for conversion');
    }
    if (!lead.loanInterest?.purpose) {
      throw new Error('Loan purpose is required for conversion');
    }

    // Create application (this would call ApplicationService)
    // For now, we'll return a placeholder
    const applicationId = uuidv4();

    conversionNotes.push(`Created application ${applicationId}`);

    // Update lead
    await this.db.updateLead(leadId, {
      status: LeadStatus.CONVERTED,
      convertedToApplicationId: applicationId,
      convertedAt: new Date(),
      updatedAt: new Date(),
    });

    // Record activity
    await this.db.addLeadActivity(leadId, {
      activityType: 'conversion',
      description: `Lead converted to application ${applicationId}`,
      metadata: { applicationId },
    });

    await this.eventBus.emit({
      eventType: 'LEAD_CONVERTED',
      aggregateType: 'lead',
      aggregateId: leadId,
      payload: { leadId, applicationId },
    });

    return {
      applicationId,
      conversionNotes,
    };
  }

  /**
   * Auto-assign lead to an LO based on rules
   */
  private async autoAssignLead(lead: Lead): Promise<void> {
    // Simple round-robin assignment for now
    // In production, this would consider:
    // - LO capacity
    // - Lead source routing rules
    // - Geographic assignment
    // - Product specialization

    const availableLOs = await this.db.getAvailableLOs();
    if (availableLOs.length === 0) {
      return; // No one to assign to
    }

    // Get least-loaded LO
    const loId = availableLOs[0]; // Simplified

    await this.db.updateLead(lead.id, {
      assignedLoId: loId,
      updatedAt: new Date(),
    });

    await this.db.addLeadActivity(lead.id, {
      activityType: 'assignment',
      description: `Lead auto-assigned to LO ${loId}`,
      performedBy: undefined, // System
      metadata: { loId, assignmentType: 'auto' },
    });
  }

  /**
   * Find potential duplicate lead
   */
  private async findDuplicate(request: LeadCreateRequest): Promise<Lead | null> {
    // Check by email
    const byEmail = await this.db.findLeadByEmail(request.contact.email);
    if (byEmail && byEmail.status !== LeadStatus.CONVERTED) {
      return byEmail;
    }

    // Check by phone
    if (request.contact.phone) {
      const byPhone = await this.db.findLeadByPhone(
        this.normalizePhone(request.contact.phone)!
      );
      if (byPhone && byPhone.status !== LeadStatus.CONVERTED) {
        return byPhone;
      }
    }

    // Check by external ID
    if (request.externalId) {
      const byExternal = await this.db.findLeadByExternalId(request.externalId);
      if (byExternal) {
        return byExternal;
      }
    }

    return null;
  }

  /**
   * Update existing lead with new information
   */
  private async updateExistingLead(
    existing: Lead,
    request: LeadCreateRequest
  ): Promise<Lead> {
    // Merge new data with existing
    const updates: Partial<Lead> = {
      updatedAt: new Date(),
    };

    // Update contact info if new values provided
    if (request.contact.firstName && !existing.contact.firstName) {
      updates.contact = { ...existing.contact, firstName: request.contact.firstName };
    }
    if (request.contact.lastName && !existing.contact.lastName) {
      updates.contact = {
        ...(updates.contact || existing.contact),
        lastName: request.contact.lastName,
      };
    }

    // Update property interest if not set
    if (request.propertyInterest && !existing.propertyInterest) {
      updates.propertyInterest = {
        address: request.propertyInterest.address,
        city: request.propertyInterest.city,
        state: request.propertyInterest.state,
        zip: request.propertyInterest.zip,
        propertyType: request.propertyInterest.propertyType,
        estimatedValue: request.propertyInterest.estimatedValue
          ? { amount: request.propertyInterest.estimatedValue * 100, currency: 'USD' }
          : undefined,
      };
    }

    await this.db.updateLead(existing.id, updates);

    // Record that we received duplicate inquiry
    await this.db.addLeadActivity(existing.id, {
      activityType: 'duplicate_inquiry',
      description: `Duplicate inquiry received from source ${request.sourceId}`,
      metadata: { sourceId: request.sourceId, externalId: request.externalId },
    });

    return this.db.getLead(existing.id) as Promise<Lead>;
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhone(phone?: string): string | undefined {
    if (!phone) return undefined;

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Assume US if 10 digits
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }

    return phone; // Return as-is if can't normalize
  }

  /**
   * Remove sensitive data for audit logging
   */
  private sanitizeLeadForAudit(lead: Lead): Partial<Lead> {
    return {
      ...lead,
      contact: {
        ...lead.contact,
        phone: lead.contact.phone ? '***REDACTED***' : undefined,
        phoneSecondary: lead.contact.phoneSecondary ? '***REDACTED***' : undefined,
      },
    };
  }
}

// =====================================================
// INTERFACES FOR DI
// =====================================================

export interface LeadRepository {
  createLead(lead: Lead): Promise<void>;
  getLead(id: string): Promise<Lead | null>;
  updateLead(id: string, updates: Partial<Lead>): Promise<void>;
  findLeadByEmail(email: string): Promise<Lead | null>;
  findLeadByPhone(phone: string): Promise<Lead | null>;
  findLeadByExternalId(externalId: string): Promise<Lead | null>;
  getLeadSource(id: string): Promise<LeadSource | null>;
  addLeadActivity(
    leadId: string,
    activity: {
      activityType: string;
      description: string;
      performedBy?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void>;
  getAvailableLOs(): Promise<string[]>;
}

export interface EventBus {
  emit(event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface AuditLogger {
  log(event: {
    eventType: string;
    resourceType: string;
    resourceId: string;
    action: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
  }): Promise<void>;
}
