/**
 * Applications Routes
 *
 * Endpoints for loan application management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for demo (replace with database in production)
const applicationsStore: Map<string, Application> = new Map();

interface Application {
  id: string;
  leadId?: string;
  borrower: {
    name: string;
    email: string;
    phone?: string;
    entityName?: string;
  };
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    type: string;
    estimatedValue: number;
    units: number;
  };
  loan: {
    purpose: string;
    amount: number;
    termMonths: number;
    interestRate?: number;
  };
  dscr?: {
    ratio: number;
    grossRent: number;
    noi: number;
    pitia: number;
  };
  ltv?: number;
  status: string;
  milestone: string;
  conditions?: {
    ptd: number;
    ptc: number;
    ptf: number;
    cleared: number;
  };
  assignedLoId?: string;
  assignedProcessorId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ApplicationListQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  milestone?: string;
  assignedLOId?: string;
  search?: string;
}

// Seed sample data
function seedApplications() {
  if (applicationsStore.size === 0) {
    const sampleApps: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        borrower: { name: 'ABC Investments LLC', email: 'contact@abcinv.com', entityName: 'ABC Investments LLC' },
        property: { address: '100 Investment Way', city: 'Austin', state: 'TX', zip: '78701', type: 'SFR', estimatedValue: 500000, units: 1 },
        loan: { purpose: 'CASH_OUT_REFI', amount: 375000, termMonths: 360, interestRate: 7.25 },
        dscr: { ratio: 1.35, grossRent: 3200, noi: 2800, pitia: 2074 },
        ltv: 75,
        status: 'PROCESSING',
        milestone: 'PROCESSING',
        conditions: { ptd: 2, ptc: 3, ptf: 1, cleared: 5 },
      },
      {
        borrower: { name: 'John Davis', email: 'john.davis@email.com' },
        property: { address: '250 Rental Blvd', city: 'Dallas', state: 'TX', zip: '75201', type: 'DUPLEX', estimatedValue: 650000, units: 2 },
        loan: { purpose: 'PURCHASE', amount: 520000, termMonths: 360, interestRate: 7.5 },
        dscr: { ratio: 1.22, grossRent: 5400, noi: 4700, pitia: 3852 },
        ltv: 80,
        status: 'UNDERWRITING',
        milestone: 'SUBMITTED_TO_UW',
        conditions: { ptd: 0, ptc: 5, ptf: 2, cleared: 8 },
      },
      {
        borrower: { name: 'Sunrise Properties LLC', email: 'info@sunriseprop.com', entityName: 'Sunrise Properties LLC' },
        property: { address: '500 Beach Dr', city: 'Galveston', state: 'TX', zip: '77550', type: 'SFR', estimatedValue: 420000, units: 1 },
        loan: { purpose: 'RATE_TERM_REFI', amount: 315000, termMonths: 360, interestRate: 6.99 },
        dscr: { ratio: 1.48, grossRent: 4800, noi: 4200, pitia: 2838 },
        ltv: 75,
        status: 'APPROVED',
        milestone: 'CLEAR_TO_CLOSE',
        conditions: { ptd: 0, ptc: 0, ptf: 2, cleared: 12 },
      },
      {
        borrower: { name: 'Maria Garcia', email: 'maria.g@email.com' },
        property: { address: '888 STR Lane', city: 'San Antonio', state: 'TX', zip: '78201', type: 'SFR', estimatedValue: 380000, units: 1 },
        loan: { purpose: 'CASH_OUT_REFI', amount: 285000, termMonths: 360, interestRate: 7.375 },
        dscr: { ratio: 1.15, grossRent: 6200, noi: 5400, pitia: 4696 },
        ltv: 75,
        status: 'APPLICATION',
        milestone: 'PRE_APPROVED',
        conditions: { ptd: 4, ptc: 6, ptf: 3, cleared: 2 },
      },
    ];

    sampleApps.forEach((app) => {
      const id = uuidv4();
      applicationsStore.set(id, {
        ...app,
        id,
        createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
    });
  }
}

export async function applicationsRoutes(fastify: FastifyInstance) {
  seedApplications();

  /**
   * GET /applications
   * List applications with pagination and filters
   */
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: ApplicationListQuery }>,
    reply: FastifyReply
  ) => {
    const { page = '1', pageSize = '20', status, milestone, assignedLOId, search } = request.query;

    let applications = Array.from(applicationsStore.values());

    // Apply filters
    if (status) {
      applications = applications.filter(a => a.status === status);
    }
    if (milestone) {
      applications = applications.filter(a => a.milestone === milestone);
    }
    if (assignedLOId) {
      applications = applications.filter(a => a.assignedLoId === assignedLOId);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      applications = applications.filter(a =>
        a.borrower.name.toLowerCase().includes(searchLower) ||
        a.property.address.toLowerCase().includes(searchLower)
      );
    }

    // Sort by created date descending
    applications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);
    const start = (pageNum - 1) * pageSizeNum;
    const paginatedApps = applications.slice(start, start + pageSizeNum);

    return {
      data: paginatedApps,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalItems: applications.length,
        totalPages: Math.ceil(applications.length / pageSizeNum),
        hasMore: start + pageSizeNum < applications.length,
      },
    };
  });

  /**
   * GET /applications/:id
   * Get application by ID
   */
  fastify.get('/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const app = applicationsStore.get(request.params.id);

    if (!app) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    return app;
  });

  /**
   * GET /applications/:id/dscr
   * Get DSCR calculation details
   */
  fastify.get('/:id/dscr', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const app = applicationsStore.get(request.params.id);

    if (!app) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    // Return detailed DSCR breakdown
    return {
      applicationId: app.id,
      dscrRatio: app.dscr?.ratio || 0,
      income: {
        grossMonthlyRent: app.dscr?.grossRent || 0,
        vacancyRate: 0.05,
        effectiveGrossRent: (app.dscr?.grossRent || 0) * 0.95,
      },
      expenses: {
        propertyTax: Math.round((app.property.estimatedValue * 0.02) / 12),
        insurance: Math.round((app.property.estimatedValue * 0.0035) / 12),
        hoa: 0,
        management: Math.round((app.dscr?.grossRent || 0) * 0.08),
      },
      noi: app.dscr?.noi || 0,
      debtService: {
        principalAndInterest: Math.round((app.dscr?.pitia || 0) * 0.7),
        taxes: Math.round((app.dscr?.pitia || 0) * 0.15),
        insurance: Math.round((app.dscr?.pitia || 0) * 0.1),
        hoa: Math.round((app.dscr?.pitia || 0) * 0.05),
        totalPITIA: app.dscr?.pitia || 0,
      },
      calculatedAt: new Date(),
    };
  });

  /**
   * GET /applications/:id/documents
   * Get document list for application
   */
  fastify.get('/:id/documents', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const app = applicationsStore.get(request.params.id);

    if (!app) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    // Sample document list
    return {
      applicationId: app.id,
      documents: [
        { id: uuidv4(), type: 'ENTITY_DOCS', name: 'Operating Agreement', status: 'RECEIVED', uploadedAt: new Date() },
        { id: uuidv4(), type: 'BANK_STATEMENTS', name: 'Bank Statements - 3 months', status: 'RECEIVED', uploadedAt: new Date() },
        { id: uuidv4(), type: 'RENT_ROLL', name: 'Current Rent Roll', status: 'PENDING', uploadedAt: null },
        { id: uuidv4(), type: 'INSURANCE', name: 'Hazard Insurance Policy', status: 'PENDING', uploadedAt: null },
      ],
    };
  });

  /**
   * GET /applications/:id/conditions
   * Get conditions for application
   */
  fastify.get('/:id/conditions', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const app = applicationsStore.get(request.params.id);

    if (!app) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    // Sample conditions
    return {
      applicationId: app.id,
      conditions: [
        { id: uuidv4(), code: 'PTD-001', category: 'PTD', title: 'Verify Entity Good Standing', status: 'OPEN' },
        { id: uuidv4(), code: 'PTD-002', category: 'PTD', title: 'Confirm LLC Ownership', status: 'CLEARED' },
        { id: uuidv4(), code: 'PTC-001', category: 'PTC', title: 'Final Title Commitment', status: 'OPEN' },
        { id: uuidv4(), code: 'PTC-002', category: 'PTC', title: 'Hazard Insurance Binder', status: 'OPEN' },
        { id: uuidv4(), code: 'PTF-001', category: 'PTF', title: 'Wire Instructions', status: 'OPEN' },
      ],
      summary: app.conditions,
    };
  });

  /**
   * POST /applications
   * Create new application
   */
  fastify.post('/', async (
    request: FastifyRequest<{ Body: Partial<Application> }>,
    reply: FastifyReply
  ) => {
    const body = request.body;

    if (!body.borrower?.email || !body.property?.address) {
      return reply.status(400).send({ error: 'Borrower email and property address are required' });
    }

    const id = uuidv4();
    const app: Application = {
      id,
      leadId: body.leadId,
      borrower: {
        name: body.borrower.name || '',
        email: body.borrower.email,
        phone: body.borrower.phone,
        entityName: body.borrower.entityName,
      },
      property: {
        address: body.property.address,
        city: body.property.city || '',
        state: body.property.state || '',
        zip: body.property.zip || '',
        type: body.property.type || 'SFR',
        estimatedValue: body.property.estimatedValue || 0,
        units: body.property.units || 1,
      },
      loan: {
        purpose: body.loan?.purpose || 'CASH_OUT_REFI',
        amount: body.loan?.amount || 0,
        termMonths: body.loan?.termMonths || 360,
        interestRate: body.loan?.interestRate,
      },
      dscr: body.dscr,
      ltv: body.ltv,
      status: 'APPLICATION',
      milestone: 'APPLICATION',
      conditions: { ptd: 0, ptc: 0, ptf: 0, cleared: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    applicationsStore.set(id, app);

    return reply.status(201).send(app);
  });
}
