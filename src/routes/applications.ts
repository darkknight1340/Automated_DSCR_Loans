/**
 * Applications Routes
 *
 * Endpoints for loan application management with Encompass integration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { applicationRepository, type Application } from '../db/repositories/ApplicationRepository.js';
import { encompassService } from '../adapters/encompass/EncompassStubClient.js';

interface ApplicationListQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  assignedLOId?: string;
  milestone?: string;
  search?: string;
}

interface ApplicationCreateBody {
  leadId?: string;
  borrower: {
    borrowerType: 'INDIVIDUAL' | 'ENTITY';
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    entityName?: string;
    entityType?: 'LLC' | 'CORPORATION' | 'PARTNERSHIP' | 'TRUST';
  };
  property: {
    address: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
    propertyType: string;
    yearBuilt?: number;
    squareFeet?: number;
    bedrooms?: number;
    bathrooms?: number;
    units?: number;
    currentMonthlyRent?: number;
    isShortTermRental?: boolean;
  };
  loanPurpose: string;
  loanAmount: number;
  loanTermMonths?: number;
  purchasePrice?: number;
  estimatedValue?: number;
  existingLiensTotal?: number;
  cashOutAmount?: number;
}

export async function applicationsRoutes(fastify: FastifyInstance) {
  /**
   * GET /applications
   * List applications with pagination and filters
   */
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: ApplicationListQuery }>,
    reply: FastifyReply
  ) => {
    const { page = '1', pageSize = '20', status, assignedLOId, milestone, search } = request.query;

    const { applications, total } = await applicationRepository.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      status,
      assignedLoId: assignedLOId,
      milestone,
      search,
    });

    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);

    // Enrich with Encompass data
    const enrichedApps = await Promise.all(
      applications.map(async (app) => {
        const link = await applicationRepository.getEncompassLink(app.id);
        return {
          ...app,
          encompass: link ? {
            loanGuid: link.encompassLoanGuid,
            loanNumber: link.encompassLoanNumber,
            milestone: link.currentMilestone,
            syncStatus: link.syncStatus,
            lastSync: link.lastSyncToEncompass,
          } : null,
        };
      })
    );

    return {
      data: enrichedApps,
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
   * GET /applications/:id
   * Get application by ID with full details
   */
  fastify.get('/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const application = await applicationRepository.findById(request.params.id);

    if (!application) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    // Get Encompass status
    const encompassStatus = await encompassService.getLoanStatus(request.params.id);

    return {
      ...application,
      encompass: encompassStatus,
    };
  });

  /**
   * GET /applications/:id/dscr
   * Get DSCR calculation details
   */
  fastify.get('/:id/dscr', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const app = await applicationRepository.findById(request.params.id);

    if (!app) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    const estimatedValue = app.estimatedValue || 0;
    const monthlyRent = app.property?.currentMonthlyRent || 0;

    // Calculate DSCR components
    const grossMonthlyRent = monthlyRent;
    const vacancyRate = 0.05;
    const effectiveGrossRent = grossMonthlyRent * (1 - vacancyRate);

    const propertyTax = Math.round((estimatedValue * 0.02) / 12);
    const insurance = Math.round((estimatedValue * 0.0035) / 12);
    const management = Math.round(grossMonthlyRent * 0.08);

    const noi = effectiveGrossRent - propertyTax - insurance - management;

    // Calculate P&I (simplified 30-year fixed at estimated rate)
    const rate = 0.075; // 7.5% assumed
    const monthlyRate = rate / 12;
    const numPayments = app.loanTermMonths || 360;
    const pi = app.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);

    const totalPITIA = pi + propertyTax + insurance;
    const dscrRatio = totalPITIA > 0 ? noi / totalPITIA : 0;

    return {
      applicationId: app.id,
      dscrRatio: Math.round(dscrRatio * 100) / 100,
      income: {
        grossMonthlyRent,
        vacancyRate,
        effectiveGrossRent: Math.round(effectiveGrossRent),
      },
      expenses: {
        propertyTax,
        insurance,
        hoa: 0,
        management,
      },
      noi: Math.round(noi),
      debtService: {
        principalAndInterest: Math.round(pi),
        taxes: propertyTax,
        insurance: insurance,
        hoa: 0,
        totalPITIA: Math.round(totalPITIA),
      },
      calculatedAt: new Date(),
    };
  });

  /**
   * POST /applications
   * Create new application
   */
  fastify.post('/', async (
    request: FastifyRequest<{ Body: ApplicationCreateBody }>,
    reply: FastifyReply
  ) => {
    const body = request.body;

    // Create borrower
    const borrower = await applicationRepository.createBorrower({
      borrowerType: body.borrower.borrowerType,
      firstName: body.borrower.firstName,
      lastName: body.borrower.lastName,
      email: body.borrower.email,
      phone: body.borrower.phone,
      entityName: body.borrower.entityName,
      entityType: body.borrower.entityType,
    });

    // Create property
    const property = await applicationRepository.createProperty({
      address: body.property.address,
      unit: body.property.unit,
      city: body.property.city,
      state: body.property.state,
      zip: body.property.zip,
      propertyType: body.property.propertyType,
      yearBuilt: body.property.yearBuilt,
      squareFeet: body.property.squareFeet,
      bedrooms: body.property.bedrooms,
      bathrooms: body.property.bathrooms,
      units: body.property.units || 1,
      currentMonthlyRent: body.property.currentMonthlyRent,
      isShortTermRental: body.property.isShortTermRental,
    });

    // Calculate LTV
    const estimatedValue = body.estimatedValue || body.purchasePrice || 0;
    const ltvRatio = estimatedValue > 0 ? body.loanAmount / estimatedValue : undefined;

    // Create application
    const application = await applicationRepository.create({
      leadId: body.leadId,
      borrowerId: borrower.id,
      propertyId: property.id,
      borrower,
      property,
      loanPurpose: body.loanPurpose,
      loanAmount: body.loanAmount,
      loanTermMonths: body.loanTermMonths || 360,
      purchasePrice: body.purchasePrice,
      estimatedValue,
      existingLiensTotal: body.existingLiensTotal,
      ltvRatio,
      cashOutAmount: body.cashOutAmount,
      status: 'APPLICATION',
    });

    // Create loan in Encompass
    try {
      const link = await encompassService.createLoanFromApplication(application.id);
      console.log(`Created Encompass loan ${link.encompassLoanNumber} for application ${application.id}`);
    } catch (error) {
      console.error('Failed to create Encompass loan:', error);
      // Don't fail the request - application is created, Encompass sync can be retried
    }

    return reply.status(201).send(application);
  });

  /**
   * PATCH /applications/:id
   * Update application
   */
  fastify.patch('/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: Partial<Application> }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    const updated = await applicationRepository.update(request.params.id, request.body);

    // Sync to Encompass if linked
    try {
      const link = await applicationRepository.getEncompassLink(request.params.id);
      if (link) {
        await encompassService.syncToEncompass(request.params.id, request.body as Record<string, unknown>);
      }
    } catch (error) {
      console.error('Failed to sync to Encompass:', error);
    }

    return updated;
  });

  /**
   * POST /applications/:id/status
   * Update application status
   */
  fastify.post('/:id/status', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    const updated = await applicationRepository.update(request.params.id, {
      status: request.body.status,
      submittedAt: request.body.status === 'PROCESSING' ? new Date() : existing.submittedAt,
    });

    return updated;
  });

  /**
   * GET /applications/:id/documents
   * Get document list for application
   */
  fastify.get('/:id/documents', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const app = await applicationRepository.findById(request.params.id);

    if (!app) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    // Sample document list (would come from document service in production)
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
   * POST /applications/:id/encompass/create
   * Create Encompass loan for application (if not exists)
   */
  fastify.post('/:id/encompass/create', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    try {
      const link = await encompassService.createLoanFromApplication(request.params.id);
      return {
        success: true,
        loanGuid: link.encompassLoanGuid,
        loanNumber: link.encompassLoanNumber,
        milestone: link.currentMilestone,
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to create Encompass loan',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /applications/:id/encompass/sync
   * Force sync application to Encompass
   */
  fastify.post('/:id/encompass/sync', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    const link = await applicationRepository.getEncompassLink(request.params.id);
    if (!link) {
      return reply.status(400).send({ error: 'Application not linked to Encompass' });
    }

    try {
      await encompassService.syncToEncompass(request.params.id, existing as unknown as Record<string, unknown>);
      const updatedLink = await applicationRepository.getEncompassLink(request.params.id);
      return {
        success: true,
        syncStatus: updatedLink?.syncStatus,
        lastSync: updatedLink?.lastSyncToEncompass,
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /applications/:id/encompass/milestone
   * Advance milestone in Encompass
   */
  fastify.post('/:id/encompass/milestone', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { milestone: string; reason?: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    const link = await applicationRepository.getEncompassLink(request.params.id);
    if (!link) {
      return reply.status(400).send({ error: 'Application not linked to Encompass' });
    }

    try {
      await encompassService.advanceMilestone(
        request.params.id,
        request.body.milestone,
        request.body.reason
      );

      const updatedLink = await applicationRepository.getEncompassLink(request.params.id);
      return {
        success: true,
        previousMilestone: link.currentMilestone,
        currentMilestone: updatedLink?.currentMilestone,
      };
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to advance milestone',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /applications/:id/encompass/conditions
   * Get conditions from Encompass
   */
  fastify.get('/:id/encompass/conditions', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    const status = await encompassService.getLoanStatus(request.params.id);
    if (!status) {
      return reply.status(400).send({ error: 'Application not linked to Encompass' });
    }

    return { data: status.conditions };
  });

  /**
   * POST /applications/:id/encompass/conditions
   * Add condition to Encompass loan
   */
  fastify.post('/:id/encompass/conditions', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { title: string; description?: string; category: string; priorTo: string }
    }>,
    reply: FastifyReply
  ) => {
    const existing = await applicationRepository.findById(request.params.id);

    if (!existing) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    try {
      const condition = await encompassService.addCondition(request.params.id, {
        title: request.body.title,
        description: request.body.description,
        category: request.body.category,
        priorTo: request.body.priorTo,
      });

      return reply.status(201).send(condition);
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to add condition',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
