/**
 * Leads Routes
 *
 * Endpoints for lead management using database repository.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { leadRepository, type Lead } from '../db/repositories/LeadRepository.js';

interface LeadListQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  assignedLOId?: string;
  search?: string;
  sourceId?: string;
}

interface LeadCreateBody {
  contact: {
    firstName?: string;
    lastName?: string;
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
    purpose?: string;
    requestedAmount?: number;
    estimatedRent?: number;
  };
  sourceId?: string;
  source?: string;
  utmParams?: Record<string, string>;
}

interface LeadUpdateBody {
  contact?: Partial<Lead['contact']>;
  propertyInterest?: Partial<Lead['propertyInterest']>;
  loanInterest?: Partial<Lead['loanInterest']>;
  status?: string;
  score?: number;
  assignedLoId?: string;
}

export async function leadsRoutes(fastify: FastifyInstance) {
  /**
   * GET /leads
   * List leads with pagination and filters
   */
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: LeadListQuery }>,
    reply: FastifyReply
  ) => {
    const { page = '1', pageSize = '20', status, assignedLOId, search, sourceId } = request.query;

    const { leads, total } = await leadRepository.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      status,
      assignedLoId: assignedLOId,
      search,
      sourceId,
    });

    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);

    return {
      data: leads,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalItems: total,
        totalPages: Math.ceil(total / pageSizeNum),
        hasMore: pageNum * pageSizeNum < total,
      },
    };
  });

  /**
   * GET /leads/sources
   * Get all lead sources
   */
  fastify.get('/sources', async () => {
    const sources = await leadRepository.getAllSources();
    return { data: sources };
  });

  /**
   * GET /leads/:id
   * Get lead by ID
   */
  fastify.get('/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const lead = await leadRepository.findById(request.params.id);

    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    // Get activities for the lead
    const activities = await leadRepository.getActivities(request.params.id);

    return {
      ...lead,
      activities,
    };
  });

  /**
   * POST /leads
   * Create new lead
   */
  fastify.post('/', async (
    request: FastifyRequest<{ Body: LeadCreateBody }>,
    reply: FastifyReply
  ) => {
    const body = request.body;

    if (!body.contact?.email) {
      return reply.status(400).send({ error: 'Email is required' });
    }

    // Check for duplicate by email
    const existing = await leadRepository.findByEmail(body.contact.email);
    if (existing) {
      // Update existing lead with new information
      const updated = await leadRepository.update(existing.id, {
        propertyInterest: body.propertyInterest || existing.propertyInterest,
        loanInterest: body.loanInterest || existing.loanInterest,
      });

      // Add activity for duplicate inquiry
      await leadRepository.addActivity(existing.id, {
        activityType: 'duplicate_inquiry',
        description: 'Duplicate lead submission received',
        metadata: { source: body.source },
      });

      return reply.status(200).send(updated);
    }

    // Calculate initial score (simplified)
    const score = calculateLeadScore(body);

    const lead = await leadRepository.create({
      contact: {
        firstName: body.contact.firstName || '',
        lastName: body.contact.lastName || '',
        email: body.contact.email,
        phone: body.contact.phone,
      },
      propertyInterest: body.propertyInterest,
      loanInterest: body.loanInterest,
      sourceId: body.sourceId,
      source: body.source,
      utmParams: body.utmParams ? {
        source: body.utmParams.utm_source,
        medium: body.utmParams.utm_medium,
        campaign: body.utmParams.utm_campaign,
        content: body.utmParams.utm_content,
      } : undefined,
      status: score < 40 ? 'DISQUALIFIED' : 'NEW',
      score,
    });

    // Add creation activity
    await leadRepository.addActivity(lead.id, {
      activityType: 'lead_created',
      description: 'Lead created from intake form',
      metadata: { source: body.source, score },
    });

    return reply.status(201).send(lead);
  });

  /**
   * PATCH /leads/:id
   * Update lead
   */
  fastify.patch('/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: LeadUpdateBody }>,
    reply: FastifyReply
  ) => {
    const existing = await leadRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const updated = await leadRepository.update(request.params.id, request.body);

    // Add activity for the update
    await leadRepository.addActivity(request.params.id, {
      activityType: 'lead_updated',
      description: 'Lead information updated',
      metadata: { fields: Object.keys(request.body) },
    });

    return updated;
  });

  /**
   * POST /leads/:id/status
   * Update lead status
   */
  fastify.post('/:id/status', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { status: string; notes?: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await leadRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const { status, notes } = request.body;
    const previousStatus = existing.status;

    const updates: Partial<Lead> = { status };

    // Set timestamps based on status
    if (status === 'CONTACTED' && !existing.firstContactedAt) {
      updates.firstContactedAt = new Date();
    } else if (status === 'QUALIFIED' && !existing.qualifiedAt) {
      updates.qualifiedAt = new Date();
    } else if (status === 'CONVERTED' && !existing.convertedAt) {
      updates.convertedAt = new Date();
    }

    const updated = await leadRepository.update(request.params.id, updates);

    // Add activity
    await leadRepository.addActivity(request.params.id, {
      activityType: 'status_change',
      description: `Status changed from ${previousStatus} to ${status}${notes ? `: ${notes}` : ''}`,
      metadata: { previousStatus, newStatus: status, notes },
    });

    return updated;
  });

  /**
   * POST /leads/:id/activity
   * Add activity to lead
   */
  fastify.post('/:id/activity', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { activityType: string; description?: string; metadata?: Record<string, unknown> }
    }>,
    reply: FastifyReply
  ) => {
    const existing = await leadRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const activity = await leadRepository.addActivity(request.params.id, {
      activityType: request.body.activityType,
      description: request.body.description,
      metadata: request.body.metadata,
    });

    return reply.status(201).send(activity);
  });

  /**
   * DELETE /leads/:id
   * Soft delete lead
   */
  fastify.delete('/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await leadRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    await leadRepository.delete(request.params.id);

    return { success: true };
  });
}

// Simple lead scoring function
function calculateLeadScore(lead: LeadCreateBody): number {
  let score = 50; // Base score

  // Contact completeness
  if (lead.contact.firstName) score += 5;
  if (lead.contact.lastName) score += 5;
  if (lead.contact.phone) score += 10;

  // Property info
  if (lead.propertyInterest) {
    if (lead.propertyInterest.address) score += 5;
    if (lead.propertyInterest.city && lead.propertyInterest.state) score += 5;
    if (lead.propertyInterest.estimatedValue) {
      // Sweet spot for DSCR loans
      if (lead.propertyInterest.estimatedValue >= 200000 && lead.propertyInterest.estimatedValue <= 2000000) {
        score += 10;
      } else {
        score += 5;
      }
    }
    if (lead.propertyInterest.propertyType) score += 5;
  }

  // Loan info
  if (lead.loanInterest) {
    if (lead.loanInterest.requestedAmount) {
      // Sweet spot for loan amount
      if (lead.loanInterest.requestedAmount >= 150000 && lead.loanInterest.requestedAmount <= 1500000) {
        score += 10;
      } else {
        score += 5;
      }
    }
    if (lead.loanInterest.estimatedRent) score += 5;
    if (lead.loanInterest.purpose) score += 5;
  }

  // Source quality bonus
  if (lead.source === 'referral') score += 10;
  else if (lead.source === 'website') score += 5;

  return Math.min(100, Math.max(0, score));
}
