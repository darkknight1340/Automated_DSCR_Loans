/**
 * Application Repository
 *
 * Handles loan application persistence with Neon PostgreSQL.
 * Falls back to in-memory storage if database is not configured.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb, isDatabaseConfigured } from '../connection.js';

export interface Borrower {
  id: string;
  borrowerType: 'INDIVIDUAL' | 'ENTITY';
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  entityName?: string;
  entityType?: 'LLC' | 'CORPORATION' | 'PARTNERSHIP' | 'TRUST';
  createdAt: Date;
  updatedAt: Date;
}

export interface Property {
  id: string;
  address: string;
  unit?: string;
  city: string;
  county?: string;
  state: string;
  zip: string;
  propertyType: string;
  yearBuilt?: number;
  squareFeet?: number;
  bedrooms?: number;
  bathrooms?: number;
  units?: number;
  isCurrentlyRented?: boolean;
  currentMonthlyRent?: number;
  marketMonthlyRent?: number;
  isShortTermRental?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Application {
  id: string;
  leadId?: string;
  borrowerId: string;
  propertyId: string;
  borrower?: Borrower;
  property?: Property;
  loanPurpose: string;
  loanAmount: number;
  loanTermMonths?: number;
  amortizationType?: string;
  purchasePrice?: number;
  estimatedValue?: number;
  existingLiensTotal?: number;
  ltvRatio?: number;
  cashOutAmount?: number;
  status: string;
  assignedLoId?: string;
  assignedProcessorId?: string;
  assignedUwId?: string;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncompassLink {
  id: string;
  applicationId: string;
  encompassLoanGuid: string;
  encompassLoanNumber?: string;
  encompassFolder?: string;
  currentMilestone?: string;
  lastSyncToEncompass?: Date;
  lastSyncFromEncompass?: Date;
  syncStatus: string;
  syncErrorMessage?: string;
  syncRetryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationListOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  assignedLoId?: string;
  milestone?: string;
  search?: string;
}

// In-memory fallback stores
const inMemoryBorrowers = new Map<string, Borrower>();
const inMemoryProperties = new Map<string, Property>();
const inMemoryApplications = new Map<string, Application>();
const inMemoryEncompassLinks = new Map<string, EncompassLink>();

// Initialize in-memory with sample data
function initializeInMemoryData() {
  if (inMemoryApplications.size === 0) {
    // Create sample borrowers
    const borrowers: Borrower[] = [
      {
        id: uuidv4(),
        borrowerType: 'INDIVIDUAL',
        firstName: 'James',
        lastName: 'Wilson',
        email: 'james.wilson@example.com',
        phone: '555-0201',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        borrowerType: 'ENTITY',
        entityName: 'Wilson Properties LLC',
        entityType: 'LLC',
        email: 'contact@wilsonproperties.com',
        phone: '555-0202',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        borrowerType: 'INDIVIDUAL',
        firstName: 'Amanda',
        lastName: 'Chen',
        email: 'amanda.chen@example.com',
        phone: '555-0203',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    borrowers.forEach(b => inMemoryBorrowers.set(b.id, b));

    // Create sample properties
    const properties: Property[] = [
      {
        id: uuidv4(),
        address: '1500 Investment Ave',
        city: 'Austin',
        state: 'TX',
        zip: '78702',
        propertyType: 'SFR',
        yearBuilt: 2015,
        squareFeet: 2200,
        bedrooms: 4,
        bathrooms: 2.5,
        units: 1,
        isCurrentlyRented: true,
        currentMonthlyRent: 2800,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        address: '2200 Rental Blvd',
        city: 'Dallas',
        state: 'TX',
        zip: '75202',
        propertyType: 'MULTIFAMILY',
        yearBuilt: 2008,
        squareFeet: 4500,
        bedrooms: 8,
        bathrooms: 4,
        units: 4,
        isCurrentlyRented: true,
        currentMonthlyRent: 5600,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        address: '800 STR Lane',
        city: 'San Antonio',
        state: 'TX',
        zip: '78205',
        propertyType: 'CONDO',
        yearBuilt: 2020,
        squareFeet: 1100,
        bedrooms: 2,
        bathrooms: 2,
        units: 1,
        isShortTermRental: true,
        marketMonthlyRent: 3500,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    properties.forEach(p => inMemoryProperties.set(p.id, p));

    // Create sample applications with different statuses
    const applications: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        borrowerId: borrowers[0].id,
        propertyId: properties[0].id,
        loanPurpose: 'CASH_OUT_REFI',
        loanAmount: 350000,
        loanTermMonths: 360,
        estimatedValue: 480000,
        ltvRatio: 0.729,
        cashOutAmount: 75000,
        status: 'PROCESSING',
      },
      {
        borrowerId: borrowers[1].id,
        propertyId: properties[1].id,
        loanPurpose: 'PURCHASE',
        loanAmount: 720000,
        loanTermMonths: 360,
        purchasePrice: 950000,
        estimatedValue: 950000,
        ltvRatio: 0.758,
        status: 'UNDERWRITING',
      },
      {
        borrowerId: borrowers[2].id,
        propertyId: properties[2].id,
        loanPurpose: 'RATE_TERM_REFI',
        loanAmount: 280000,
        loanTermMonths: 360,
        estimatedValue: 385000,
        existingLiensTotal: 290000,
        ltvRatio: 0.727,
        status: 'APPROVED',
      },
      {
        borrowerId: borrowers[0].id,
        propertyId: properties[0].id,
        loanPurpose: 'PURCHASE',
        loanAmount: 400000,
        loanTermMonths: 360,
        purchasePrice: 520000,
        estimatedValue: 520000,
        ltvRatio: 0.769,
        status: 'APPLICATION',
      },
    ];

    applications.forEach((app, index) => {
      const id = uuidv4();
      const application: Application = {
        ...app,
        id,
        borrower: inMemoryBorrowers.get(app.borrowerId),
        property: inMemoryProperties.get(app.propertyId),
        createdAt: new Date(Date.now() - (index + 1) * 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      };
      inMemoryApplications.set(id, application);

      // Create Encompass links for some applications
      if (index < 3) {
        const linkId = uuidv4();
        const milestones = ['Started', 'Application', 'Processing', 'Submitted', 'Approved'];
        inMemoryEncompassLinks.set(application.id, {
          id: linkId,
          applicationId: application.id,
          encompassLoanGuid: `{${uuidv4().toUpperCase()}}`,
          encompassLoanNumber: `DSCR-2024-${1000 + index}`,
          encompassFolder: 'DSCR Pipeline',
          currentMilestone: milestones[index + 1],
          syncStatus: 'SYNCED',
          syncRetryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });
  }
}

export class ApplicationRepository {
  constructor() {
    if (!isDatabaseConfigured()) {
      initializeInMemoryData();
    }
  }

  async findAll(options: ApplicationListOptions = {}): Promise<{ applications: Application[]; total: number }> {
    const { page = 1, pageSize = 20, status, assignedLoId, milestone, search } = options;

    if (!isDatabaseConfigured()) {
      let applications = Array.from(inMemoryApplications.values());

      if (status) {
        applications = applications.filter(a => a.status === status);
      }
      if (assignedLoId) {
        applications = applications.filter(a => a.assignedLoId === assignedLoId);
      }
      if (milestone) {
        applications = applications.filter(a => {
          const link = inMemoryEncompassLinks.get(a.id);
          return link?.currentMilestone === milestone;
        });
      }
      if (search) {
        const searchLower = search.toLowerCase();
        applications = applications.filter(a => {
          const borrower = a.borrower || inMemoryBorrowers.get(a.borrowerId);
          const property = a.property || inMemoryProperties.get(a.propertyId);
          return (
            borrower?.firstName?.toLowerCase().includes(searchLower) ||
            borrower?.lastName?.toLowerCase().includes(searchLower) ||
            borrower?.entityName?.toLowerCase().includes(searchLower) ||
            property?.address.toLowerCase().includes(searchLower)
          );
        });
      }

      // Enrich with borrower and property data
      applications = applications.map(a => ({
        ...a,
        borrower: a.borrower || inMemoryBorrowers.get(a.borrowerId),
        property: a.property || inMemoryProperties.get(a.propertyId),
      }));

      applications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = applications.length;
      const start = (page - 1) * pageSize;
      const paginatedApps = applications.slice(start, start + pageSize);

      return { applications: paginatedApps, total };
    }

    // Database implementation
    const db = getDb()!;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(status);
    }
    if (assignedLoId) {
      conditions.push(`a.assigned_lo_id = $${paramIndex++}`);
      params.push(assignedLoId);
    }
    if (milestone) {
      conditions.push(`el.current_milestone = $${paramIndex++}`);
      params.push(milestone);
    }
    if (search) {
      conditions.push(`(
        b.first_name ILIKE $${paramIndex} OR
        b.last_name ILIKE $${paramIndex} OR
        b.entity_name ILIKE $${paramIndex} OR
        p.address ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [countResult, appsResult] = await Promise.all([
      db(`
        SELECT COUNT(*) as count
        FROM loans.applications a
        LEFT JOIN loans.borrowers b ON a.borrower_id = b.id
        LEFT JOIN loans.properties p ON a.property_id = p.id
        LEFT JOIN loans.encompass_loan_links el ON a.id = el.application_id
        ${whereClause}
      `, params),
      db(`
        SELECT
          a.*,
          b.borrower_type, b.first_name, b.last_name, b.entity_name, b.email as borrower_email,
          p.address, p.city, p.state, p.zip, p.property_type,
          el.encompass_loan_guid, el.encompass_loan_number, el.current_milestone
        FROM loans.applications a
        LEFT JOIN loans.borrowers b ON a.borrower_id = b.id
        LEFT JOIN loans.properties p ON a.property_id = p.id
        LEFT JOIN loans.encompass_loan_links el ON a.id = el.application_id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `, params),
    ]);

    const total = parseInt(countResult[0]?.count || '0', 10);
    const applications = appsResult.map(this.mapDbRowToApplication);

    return { applications, total };
  }

  async findById(id: string): Promise<Application | null> {
    if (!isDatabaseConfigured()) {
      const app = inMemoryApplications.get(id);
      if (!app) return null;
      return {
        ...app,
        borrower: app.borrower || inMemoryBorrowers.get(app.borrowerId),
        property: app.property || inMemoryProperties.get(app.propertyId),
      };
    }

    const db = getDb()!;
    const result = await db(`
      SELECT
        a.*,
        b.borrower_type, b.first_name, b.last_name, b.entity_name, b.email as borrower_email, b.phone as borrower_phone,
        p.address, p.unit, p.city, p.county, p.state, p.zip, p.property_type,
        p.year_built, p.square_feet, p.bedrooms, p.bathrooms, p.units,
        p.is_currently_rented, p.current_monthly_rent, p.is_short_term_rental,
        el.encompass_loan_guid, el.encompass_loan_number, el.current_milestone, el.sync_status
      FROM loans.applications a
      LEFT JOIN loans.borrowers b ON a.borrower_id = b.id
      LEFT JOIN loans.properties p ON a.property_id = p.id
      LEFT JOIN loans.encompass_loan_links el ON a.id = el.application_id
      WHERE a.id = $1
    `, [id]);

    return result[0] ? this.mapDbRowToApplication(result[0]) : null;
  }

  async create(application: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>): Promise<Application> {
    const id = uuidv4();
    const now = new Date();

    const newApp: Application = {
      ...application,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (!isDatabaseConfigured()) {
      // Get or create borrower and property for in-memory
      newApp.borrower = application.borrower || inMemoryBorrowers.get(application.borrowerId);
      newApp.property = application.property || inMemoryProperties.get(application.propertyId);
      inMemoryApplications.set(id, newApp);
      return newApp;
    }

    const db = getDb()!;
    await db(`
      INSERT INTO loans.applications (
        id, lead_id, borrower_id, property_id, loan_purpose, loan_amount, loan_term_months,
        amortization_type, purchase_price, estimated_value, existing_liens_total, ltv_ratio,
        cash_out_amount, status, assigned_lo_id, assigned_processor_id, assigned_uw_id,
        submitted_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )
    `, [
      id, application.leadId, application.borrowerId, application.propertyId,
      application.loanPurpose, application.loanAmount, application.loanTermMonths,
      application.amortizationType, application.purchasePrice, application.estimatedValue,
      application.existingLiensTotal, application.ltvRatio, application.cashOutAmount,
      application.status, application.assignedLoId, application.assignedProcessorId,
      application.assignedUwId, application.submittedAt, now, now,
    ]);

    return newApp;
  }

  async update(id: string, updates: Partial<Application>): Promise<Application | null> {
    if (!isDatabaseConfigured()) {
      const existing = inMemoryApplications.get(id);
      if (!existing) return null;

      const updated: Application = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };
      inMemoryApplications.set(id, updated);
      return updated;
    }

    const db = getDb()!;
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      status: 'status',
      loanAmount: 'loan_amount',
      estimatedValue: 'estimated_value',
      ltvRatio: 'ltv_ratio',
      assignedLoId: 'assigned_lo_id',
      assignedProcessorId: 'assigned_processor_id',
      assignedUwId: 'assigned_uw_id',
      submittedAt: 'submitted_at',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push((updates as Record<string, unknown>)[key]);
      }
    }

    params.push(id);
    await db(`UPDATE loans.applications SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`, params);

    return this.findById(id);
  }

  // Encompass Link methods
  async getEncompassLink(applicationId: string): Promise<EncompassLink | null> {
    if (!isDatabaseConfigured()) {
      return inMemoryEncompassLinks.get(applicationId) || null;
    }

    const db = getDb()!;
    const result = await db(
      'SELECT * FROM loans.encompass_loan_links WHERE application_id = $1',
      [applicationId]
    );
    return result[0] ? this.mapDbRowToEncompassLink(result[0]) : null;
  }

  async createEncompassLink(link: Omit<EncompassLink, 'id' | 'createdAt' | 'updatedAt'>): Promise<EncompassLink> {
    const id = uuidv4();
    const now = new Date();

    const newLink: EncompassLink = {
      ...link,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (!isDatabaseConfigured()) {
      inMemoryEncompassLinks.set(link.applicationId, newLink);
      return newLink;
    }

    const db = getDb()!;
    await db(`
      INSERT INTO loans.encompass_loan_links (
        id, application_id, encompass_loan_guid, encompass_loan_number, encompass_folder,
        current_milestone, last_sync_to_encompass, last_sync_from_encompass,
        sync_status, sync_error_message, sync_retry_count, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      id, link.applicationId, link.encompassLoanGuid, link.encompassLoanNumber,
      link.encompassFolder, link.currentMilestone, link.lastSyncToEncompass,
      link.lastSyncFromEncompass, link.syncStatus, link.syncErrorMessage,
      link.syncRetryCount, now, now,
    ]);

    return newLink;
  }

  async updateEncompassLink(applicationId: string, updates: Partial<EncompassLink>): Promise<EncompassLink | null> {
    if (!isDatabaseConfigured()) {
      const existing = inMemoryEncompassLinks.get(applicationId);
      if (!existing) return null;

      const updated: EncompassLink = {
        ...existing,
        ...updates,
        updatedAt: new Date(),
      };
      inMemoryEncompassLinks.set(applicationId, updated);
      return updated;
    }

    const db = getDb()!;
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      currentMilestone: 'current_milestone',
      lastSyncToEncompass: 'last_sync_to_encompass',
      lastSyncFromEncompass: 'last_sync_from_encompass',
      syncStatus: 'sync_status',
      syncErrorMessage: 'sync_error_message',
      syncRetryCount: 'sync_retry_count',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push((updates as Record<string, unknown>)[key]);
      }
    }

    params.push(applicationId);
    await db(`UPDATE loans.encompass_loan_links SET ${setClauses.join(', ')} WHERE application_id = $${paramIndex}`, params);

    return this.getEncompassLink(applicationId);
  }

  // Borrower methods
  async createBorrower(borrower: Omit<Borrower, 'id' | 'createdAt' | 'updatedAt'>): Promise<Borrower> {
    const id = uuidv4();
    const now = new Date();

    const newBorrower: Borrower = {
      ...borrower,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (!isDatabaseConfigured()) {
      inMemoryBorrowers.set(id, newBorrower);
      return newBorrower;
    }

    const db = getDb()!;
    await db(`
      INSERT INTO loans.borrowers (
        id, borrower_type, first_name, middle_name, last_name, email, phone,
        entity_name, entity_type, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id, borrower.borrowerType, borrower.firstName, borrower.middleName,
      borrower.lastName, borrower.email, borrower.phone,
      borrower.entityName, borrower.entityType, now, now,
    ]);

    return newBorrower;
  }

  // Property methods
  async createProperty(property: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>): Promise<Property> {
    const id = uuidv4();
    const now = new Date();

    const newProperty: Property = {
      ...property,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (!isDatabaseConfigured()) {
      inMemoryProperties.set(id, newProperty);
      return newProperty;
    }

    const db = getDb()!;
    await db(`
      INSERT INTO loans.properties (
        id, address, unit, city, county, state, zip, property_type,
        year_built, square_feet, bedrooms, bathrooms, units,
        is_currently_rented, current_monthly_rent, market_monthly_rent, is_short_term_rental,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `, [
      id, property.address, property.unit, property.city, property.county,
      property.state, property.zip, property.propertyType,
      property.yearBuilt, property.squareFeet, property.bedrooms, property.bathrooms, property.units,
      property.isCurrentlyRented, property.currentMonthlyRent, property.marketMonthlyRent,
      property.isShortTermRental, now, now,
    ]);

    return newProperty;
  }

  private mapDbRowToApplication(row: Record<string, unknown>): Application {
    return {
      id: row.id as string,
      leadId: row.lead_id as string,
      borrowerId: row.borrower_id as string,
      propertyId: row.property_id as string,
      borrower: row.borrower_type ? {
        id: row.borrower_id as string,
        borrowerType: row.borrower_type as 'INDIVIDUAL' | 'ENTITY',
        firstName: row.first_name as string,
        lastName: row.last_name as string,
        entityName: row.entity_name as string,
        email: row.borrower_email as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      } : undefined,
      property: row.address ? {
        id: row.property_id as string,
        address: row.address as string,
        unit: row.unit as string,
        city: row.city as string,
        county: row.county as string,
        state: row.state as string,
        zip: row.zip as string,
        propertyType: row.property_type as string,
        yearBuilt: row.year_built as number,
        squareFeet: row.square_feet as number,
        bedrooms: row.bedrooms as number,
        bathrooms: row.bathrooms as number,
        units: row.units as number,
        isCurrentlyRented: row.is_currently_rented as boolean,
        currentMonthlyRent: row.current_monthly_rent as number,
        isShortTermRental: row.is_short_term_rental as boolean,
        createdAt: new Date(),
        updatedAt: new Date(),
      } : undefined,
      loanPurpose: row.loan_purpose as string,
      loanAmount: row.loan_amount as number,
      loanTermMonths: row.loan_term_months as number,
      amortizationType: row.amortization_type as string,
      purchasePrice: row.purchase_price as number,
      estimatedValue: row.estimated_value as number,
      existingLiensTotal: row.existing_liens_total as number,
      ltvRatio: row.ltv_ratio as number,
      cashOutAmount: row.cash_out_amount as number,
      status: row.status as string,
      assignedLoId: row.assigned_lo_id as string,
      assignedProcessorId: row.assigned_processor_id as string,
      assignedUwId: row.assigned_uw_id as string,
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapDbRowToEncompassLink(row: Record<string, unknown>): EncompassLink {
    return {
      id: row.id as string,
      applicationId: row.application_id as string,
      encompassLoanGuid: row.encompass_loan_guid as string,
      encompassLoanNumber: row.encompass_loan_number as string,
      encompassFolder: row.encompass_folder as string,
      currentMilestone: row.current_milestone as string,
      lastSyncToEncompass: row.last_sync_to_encompass ? new Date(row.last_sync_to_encompass as string) : undefined,
      lastSyncFromEncompass: row.last_sync_from_encompass ? new Date(row.last_sync_from_encompass as string) : undefined,
      syncStatus: row.sync_status as string,
      syncErrorMessage: row.sync_error_message as string,
      syncRetryCount: row.sync_retry_count as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// Export singleton
export const applicationRepository = new ApplicationRepository();
