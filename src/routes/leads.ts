/**
 * Leads Routes
 *
 * Endpoints for lead management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for demo (replace with database in production)
const leadsStore: Map<string, Lead> = new Map();

interface Lead {
  id: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
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
    purpose: string;
    requestedAmount?: number;
    estimatedRent?: number;
  };
  status: string;
  score?: number;
  assignedLoId?: string;
  source?: string;
  utmParams?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

interface LeadListQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  assignedLOId?: string;
  search?: string;
}

// Seed some sample data
function seedLeads() {
  if (leadsStore.size === 0) {
    const sampleLeads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        contact: { firstName: 'John', lastName: 'Smith', email: 'john.smith@example.com', phone: '555-0101' },
        propertyInterest: { address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', propertyType: 'SFR', estimatedValue: 450000 },
        loanInterest: { purpose: 'CASH_OUT_REFI', requestedAmount: 300000, estimatedRent: 2500 },
        status: 'NEW',
        score: 85,
        source: 'website',
      },
      {
        contact: { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@example.com', phone: '555-0102' },
        propertyInterest: { address: '456 Oak Ave', city: 'Dallas', state: 'TX', zip: '75201', propertyType: 'CONDO', estimatedValue: 320000 },
        loanInterest: { purpose: 'RATE_TERM_REFI', requestedAmount: 250000, estimatedRent: 1800 },
        status: 'CONTACTED',
        score: 72,
        source: 'referral',
      },
      {
        contact: { firstName: 'Mike', lastName: 'Williams', email: 'mike.w@example.com', phone: '555-0103' },
        propertyInterest: { address: '789 Pine Rd', city: 'Houston', state: 'TX', zip: '77001', propertyType: 'MULTIFAMILY', estimatedValue: 850000 },
        loanInterest: { purpose: 'PURCHASE', requestedAmount: 680000, estimatedRent: 6500 },
        status: 'QUALIFIED',
        score: 92,
        source: 'marketing',
      },
    ];

    sampleLeads.forEach((lead) => {
      const id = uuidv4();
      leadsStore.set(id, {
        ...lead,
        id,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
    });
  }
}

export async function leadsRoutes(fastify: FastifyInstance) {
  seedLeads();

  /**
   * GET /leads
   * List leads with pagination and filters
   */
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: LeadListQuery }>,
    reply: FastifyReply
  ) => {
    const { page = '1', pageSize = '20', status, assignedLOId, search } = request.query;

    let leads = Array.from(leadsStore.values());

    // Apply filters
    if (status) {
      leads = leads.filter(l => l.status === status);
    }
    if (assignedLOId) {
      leads = leads.filter(l => l.assignedLoId === assignedLOId);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      leads = leads.filter(l =>
        l.contact.firstName.toLowerCase().includes(searchLower) ||
        l.contact.lastName.toLowerCase().includes(searchLower) ||
        l.contact.email.toLowerCase().includes(searchLower)
      );
    }

    // Sort by created date descending
    leads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);
    const start = (pageNum - 1) * pageSizeNum;
    const paginatedLeads = leads.slice(start, start + pageSizeNum);

    return {
      data: paginatedLeads,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalItems: leads.length,
        totalPages: Math.ceil(leads.length / pageSizeNum),
        hasMore: start + pageSizeNum < leads.length,
      },
    };
  });

  /**
   * GET /leads/:id
   * Get lead by ID
   */
  fastify.get('/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const lead = leadsStore.get(request.params.id);

    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    return lead;
  });

  /**
   * POST /leads
   * Create new lead
   */
  fastify.post('/', async (
    request: FastifyRequest<{ Body: Partial<Lead> }>,
    reply: FastifyReply
  ) => {
    const body = request.body;

    if (!body.contact?.email) {
      return reply.status(400).send({ error: 'Email is required' });
    }

    const id = uuidv4();
    const lead: Lead = {
      id,
      contact: {
        firstName: body.contact.firstName || '',
        lastName: body.contact.lastName || '',
        email: body.contact.email,
        phone: body.contact.phone,
      },
      propertyInterest: body.propertyInterest,
      loanInterest: body.loanInterest,
      status: 'NEW',
      score: body.score,
      source: body.source,
      utmParams: body.utmParams,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    leadsStore.set(id, lead);

    return reply.status(201).send(lead);
  });

  /**
   * PATCH /leads/:id
   * Update lead
   */
  fastify.patch('/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: Partial<Lead> }>,
    reply: FastifyReply
  ) => {
    const existing = leadsStore.get(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const updated: Lead = {
      ...existing,
      ...request.body,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    leadsStore.set(request.params.id, updated);

    return updated;
  });

  /**
   * POST /leads/:id/status
   * Update lead status
   */
  fastify.post('/:id/status', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>,
    reply: FastifyReply
  ) => {
    const existing = leadsStore.get(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    existing.status = request.body.status;
    existing.updatedAt = new Date();

    leadsStore.set(request.params.id, existing);

    return existing;
  });
}
