/**
 * Lead Repository
 *
 * Handles lead persistence with Neon PostgreSQL.
 * Falls back to in-memory storage if database is not configured.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb, isDatabaseConfigured } from '../connection.js';

export interface Lead {
  id: string;
  externalId?: string;
  sourceId?: string;
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
    propertyType?: string;
    estimatedValue?: number;
  };
  loanInterest?: {
    purpose?: string;
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
  status: string;
  score?: number;
  assignedLoId?: string;
  source?: string;
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  consent?: {
    marketing?: boolean;
    marketingAt?: Date;
    tcpa?: boolean;
    tcpaAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  firstContactedAt?: Date;
  qualifiedAt?: Date;
  convertedAt?: Date;
  convertedToApplicationId?: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  activityType: string;
  description?: string;
  performedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface LeadSource {
  id: string;
  name: string;
  sourceType: string;
  isActive: boolean;
  costPerLead?: number;
}

export interface LeadListOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  assignedLoId?: string;
  search?: string;
  sourceId?: string;
}

// In-memory fallback store
const inMemoryLeads = new Map<string, Lead>();
const inMemoryActivities = new Map<string, LeadActivity[]>();
const inMemorySources = new Map<string, LeadSource>();

// Initialize in-memory with sample data
function initializeInMemoryData() {
  if (inMemoryLeads.size === 0) {
    // Add default sources
    const sources: LeadSource[] = [
      { id: uuidv4(), name: 'Website', sourceType: 'website', isActive: true },
      { id: uuidv4(), name: 'Google Ads', sourceType: 'marketing', isActive: true },
      { id: uuidv4(), name: 'Referral', sourceType: 'referral', isActive: true },
    ];
    sources.forEach(s => inMemorySources.set(s.id, s));
    const websiteSource = sources[0];

    // Add sample leads
    const sampleLeads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        contact: { firstName: 'John', lastName: 'Smith', email: 'john.smith@example.com', phone: '555-0101' },
        propertyInterest: { address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', propertyType: 'SFR', estimatedValue: 450000 },
        loanInterest: { purpose: 'CASH_OUT_REFI', requestedAmount: 300000, estimatedRent: 2500 },
        status: 'NEW',
        score: 85,
        source: 'website',
        sourceId: websiteSource.id,
      },
      {
        contact: { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@example.com', phone: '555-0102' },
        propertyInterest: { address: '456 Oak Ave', city: 'Dallas', state: 'TX', zip: '75201', propertyType: 'CONDO', estimatedValue: 320000 },
        loanInterest: { purpose: 'RATE_TERM_REFI', requestedAmount: 250000, estimatedRent: 1800 },
        status: 'CONTACTED',
        score: 72,
        source: 'referral',
        sourceId: sources[2].id,
      },
      {
        contact: { firstName: 'Mike', lastName: 'Williams', email: 'mike.w@example.com', phone: '555-0103' },
        propertyInterest: { address: '789 Pine Rd', city: 'Houston', state: 'TX', zip: '77001', propertyType: 'MULTIFAMILY', estimatedValue: 850000 },
        loanInterest: { purpose: 'PURCHASE', requestedAmount: 680000, estimatedRent: 6500 },
        status: 'QUALIFIED',
        score: 92,
        source: 'marketing',
        sourceId: sources[1].id,
      },
      {
        contact: { firstName: 'Emily', lastName: 'Davis', email: 'emily.d@example.com', phone: '555-0104' },
        propertyInterest: { address: '321 Elm St', city: 'San Antonio', state: 'TX', zip: '78201', propertyType: 'SFR', estimatedValue: 275000 },
        loanInterest: { purpose: 'PURCHASE', requestedAmount: 220000, estimatedRent: 1600 },
        status: 'NEW',
        score: 68,
        source: 'website',
        sourceId: websiteSource.id,
      },
      {
        contact: { firstName: 'Robert', lastName: 'Brown', email: 'robert.b@example.com', phone: '555-0105' },
        propertyInterest: { address: '654 Cedar Ln', city: 'Fort Worth', state: 'TX', zip: '76101', propertyType: 'TOWNHOUSE', estimatedValue: 385000 },
        loanInterest: { purpose: 'CASH_OUT_REFI', requestedAmount: 290000, estimatedRent: 2200 },
        status: 'DISQUALIFIED',
        score: 35,
        source: 'marketing',
        sourceId: sources[1].id,
      },
    ];

    sampleLeads.forEach(lead => {
      const id = uuidv4();
      inMemoryLeads.set(id, {
        ...lead,
        id,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
    });
  }
}

export class LeadRepository {
  constructor() {
    if (!isDatabaseConfigured()) {
      initializeInMemoryData();
    }
  }

  async findAll(options: LeadListOptions = {}): Promise<{ leads: Lead[]; total: number }> {
    const { page = 1, pageSize = 20, status, assignedLoId, search, sourceId } = options;

    if (!isDatabaseConfigured()) {
      // In-memory implementation
      let leads = Array.from(inMemoryLeads.values());

      if (status) {
        leads = leads.filter(l => l.status === status);
      }
      if (assignedLoId) {
        leads = leads.filter(l => l.assignedLoId === assignedLoId);
      }
      if (sourceId) {
        leads = leads.filter(l => l.sourceId === sourceId);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        leads = leads.filter(l =>
          l.contact.firstName?.toLowerCase().includes(searchLower) ||
          l.contact.lastName?.toLowerCase().includes(searchLower) ||
          l.contact.email.toLowerCase().includes(searchLower) ||
          l.propertyInterest?.address?.toLowerCase().includes(searchLower)
        );
      }

      leads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = leads.length;
      const start = (page - 1) * pageSize;
      const paginatedLeads = leads.slice(start, start + pageSize);

      return { leads: paginatedLeads, total };
    }

    // Database implementation
    const db = getDb()!;
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (assignedLoId) {
      conditions.push(`assigned_lo_id = $${paramIndex++}`);
      params.push(assignedLoId);
    }
    if (sourceId) {
      conditions.push(`source_id = $${paramIndex++}`);
      params.push(sourceId);
    }
    if (search) {
      conditions.push(`(
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        property_address ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [countResult, leadsResult] = await Promise.all([
      db(`SELECT COUNT(*) as count FROM leads.leads ${whereClause}`, params),
      db(`
        SELECT * FROM leads.leads
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `, params),
    ]);

    const total = parseInt(countResult[0]?.count || '0', 10);
    const leads = leadsResult.map(this.mapDbRowToLead);

    return { leads, total };
  }

  async findById(id: string): Promise<Lead | null> {
    if (!isDatabaseConfigured()) {
      return inMemoryLeads.get(id) || null;
    }

    const db = getDb()!;
    const result = await db('SELECT * FROM leads.leads WHERE id = $1 AND deleted_at IS NULL', [id]);
    return result[0] ? this.mapDbRowToLead(result[0]) : null;
  }

  async findByEmail(email: string): Promise<Lead | null> {
    if (!isDatabaseConfigured()) {
      for (const lead of inMemoryLeads.values()) {
        if (lead.contact.email.toLowerCase() === email.toLowerCase()) {
          return lead;
        }
      }
      return null;
    }

    const db = getDb()!;
    const result = await db(
      'SELECT * FROM leads.leads WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [email]
    );
    return result[0] ? this.mapDbRowToLead(result[0]) : null;
  }

  async create(lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> {
    const id = uuidv4();
    const now = new Date();

    const newLead: Lead = {
      ...lead,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (!isDatabaseConfigured()) {
      inMemoryLeads.set(id, newLead);
      return newLead;
    }

    const db = getDb()!;
    await db(`
      INSERT INTO leads.leads (
        id, external_id, source_id, first_name, last_name, email, phone, phone_secondary,
        property_address, property_city, property_state, property_zip, property_type, estimated_value,
        loan_purpose, requested_amount, estimated_rent, stated_credit_score_range,
        has_existing_mortgage, existing_mortgage_balance, is_entity_borrower, entity_name,
        status, score, assigned_lo_id, utm_source, utm_medium, utm_campaign, utm_content,
        marketing_consent, marketing_consent_at, tcpa_consent, tcpa_consent_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
      )
    `, [
      id, lead.externalId, lead.sourceId,
      lead.contact.firstName, lead.contact.lastName, lead.contact.email,
      lead.contact.phone, lead.contact.phoneSecondary,
      lead.propertyInterest?.address, lead.propertyInterest?.city,
      lead.propertyInterest?.state, lead.propertyInterest?.zip,
      lead.propertyInterest?.propertyType, lead.propertyInterest?.estimatedValue,
      lead.loanInterest?.purpose, lead.loanInterest?.requestedAmount,
      lead.loanInterest?.estimatedRent, lead.qualification?.statedCreditScoreRange,
      lead.loanInterest?.hasExistingMortgage, lead.loanInterest?.existingMortgageBalance,
      lead.qualification?.isEntityBorrower, lead.qualification?.entityName,
      lead.status, lead.score, lead.assignedLoId,
      lead.utmParams?.source, lead.utmParams?.medium, lead.utmParams?.campaign, lead.utmParams?.content,
      lead.consent?.marketing, lead.consent?.marketingAt, lead.consent?.tcpa, lead.consent?.tcpaAt,
      now, now,
    ]);

    return newLead;
  }

  async update(id: string, updates: Partial<Lead>): Promise<Lead | null> {
    if (!isDatabaseConfigured()) {
      const existing = inMemoryLeads.get(id);
      if (!existing) return null;

      const updated: Lead = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };
      inMemoryLeads.set(id, updated);
      return updated;
    }

    const db = getDb()!;
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Map updates to database columns
    const fieldMap: Record<string, string> = {
      status: 'status',
      score: 'score',
      assignedLoId: 'assigned_lo_id',
      firstContactedAt: 'first_contacted_at',
      qualifiedAt: 'qualified_at',
      convertedAt: 'converted_at',
      convertedToApplicationId: 'converted_to_loan_id',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push((updates as Record<string, unknown>)[key]);
      }
    }

    params.push(id);
    await db(`UPDATE leads.leads SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`, params);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    if (!isDatabaseConfigured()) {
      return inMemoryLeads.delete(id);
    }

    const db = getDb()!;
    await db('UPDATE leads.leads SET deleted_at = NOW() WHERE id = $1', [id]);
    return true;
  }

  async addActivity(leadId: string, activity: Omit<LeadActivity, 'id' | 'leadId' | 'createdAt'>): Promise<LeadActivity> {
    const id = uuidv4();
    const newActivity: LeadActivity = {
      ...activity,
      id,
      leadId,
      createdAt: new Date(),
    };

    if (!isDatabaseConfigured()) {
      const activities = inMemoryActivities.get(leadId) || [];
      activities.push(newActivity);
      inMemoryActivities.set(leadId, activities);
      return newActivity;
    }

    const db = getDb()!;
    await db(`
      INSERT INTO leads.lead_activities (id, lead_id, activity_type, description, performed_by, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, leadId, activity.activityType, activity.description, activity.performedBy, JSON.stringify(activity.metadata), new Date()]);

    return newActivity;
  }

  async getActivities(leadId: string): Promise<LeadActivity[]> {
    if (!isDatabaseConfigured()) {
      return inMemoryActivities.get(leadId) || [];
    }

    const db = getDb()!;
    const result = await db(
      'SELECT * FROM leads.lead_activities WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );
    return result.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      leadId: row.lead_id as string,
      activityType: row.activity_type as string,
      description: row.description as string,
      performedBy: row.performed_by as string,
      metadata: row.metadata as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
    }));
  }

  async getSource(sourceId: string): Promise<LeadSource | null> {
    if (!isDatabaseConfigured()) {
      return inMemorySources.get(sourceId) || null;
    }

    const db = getDb()!;
    const result = await db('SELECT * FROM leads.lead_sources WHERE id = $1', [sourceId]);
    if (!result[0]) return null;

    const row = result[0];
    return {
      id: row.id as string,
      name: row.name as string,
      sourceType: row.source_type as string,
      isActive: row.is_active as boolean,
      costPerLead: row.cost_per_lead as number,
    };
  }

  async getAllSources(): Promise<LeadSource[]> {
    if (!isDatabaseConfigured()) {
      return Array.from(inMemorySources.values());
    }

    const db = getDb()!;
    const result = await db('SELECT * FROM leads.lead_sources WHERE is_active = true ORDER BY name');
    return result.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      sourceType: row.source_type as string,
      isActive: row.is_active as boolean,
      costPerLead: row.cost_per_lead as number,
    }));
  }

  private mapDbRowToLead(row: Record<string, unknown>): Lead {
    return {
      id: row.id as string,
      externalId: row.external_id as string,
      sourceId: row.source_id as string,
      contact: {
        firstName: row.first_name as string,
        lastName: row.last_name as string,
        email: row.email as string,
        phone: row.phone as string,
        phoneSecondary: row.phone_secondary as string,
      },
      propertyInterest: row.property_address ? {
        address: row.property_address as string,
        city: row.property_city as string,
        state: row.property_state as string,
        zip: row.property_zip as string,
        propertyType: row.property_type as string,
        estimatedValue: row.estimated_value as number,
      } : undefined,
      loanInterest: row.loan_purpose ? {
        purpose: row.loan_purpose as string,
        requestedAmount: row.requested_amount as number,
        estimatedRent: row.estimated_rent as number,
        hasExistingMortgage: row.has_existing_mortgage as boolean,
        existingMortgageBalance: row.existing_mortgage_balance as number,
      } : undefined,
      qualification: {
        statedCreditScoreRange: row.stated_credit_score_range as string,
        isEntityBorrower: row.is_entity_borrower as boolean,
        entityName: row.entity_name as string,
      },
      status: row.status as string,
      score: row.score as number,
      assignedLoId: row.assigned_lo_id as string,
      source: row.utm_source as string,
      utmParams: {
        source: row.utm_source as string,
        medium: row.utm_medium as string,
        campaign: row.utm_campaign as string,
        content: row.utm_content as string,
      },
      consent: {
        marketing: row.marketing_consent as boolean,
        marketingAt: row.marketing_consent_at ? new Date(row.marketing_consent_at as string) : undefined,
        tcpa: row.tcpa_consent as boolean,
        tcpaAt: row.tcpa_consent_at ? new Date(row.tcpa_consent_at as string) : undefined,
      },
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      firstContactedAt: row.first_contacted_at ? new Date(row.first_contacted_at as string) : undefined,
      qualifiedAt: row.qualified_at ? new Date(row.qualified_at as string) : undefined,
      convertedAt: row.converted_at ? new Date(row.converted_at as string) : undefined,
      convertedToApplicationId: row.converted_to_loan_id as string,
    };
  }
}

// Export singleton
export const leadRepository = new LeadRepository();
