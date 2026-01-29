/**
 * Valuation Routes
 *
 * Endpoints for AVM (Automated Valuation Model) from DataTree
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dataTreeAVM } from '../adapters/datatree/DataTreeAdapter.js';

interface AddressBody {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
}

interface AVMOrderBody {
  applicationId?: string;
  propertyId?: string;
  address: AddressBody;
}

export async function valuationRoutes(fastify: FastifyInstance) {
  /**
   * POST /valuation/avm
   * Order an AVM for a property
   */
  fastify.post('/avm', async (
    request: FastifyRequest<{ Body: AVMOrderBody }>,
    reply: FastifyReply
  ) => {
    const { applicationId, propertyId, address } = request.body;

    if (!address || !address.street || !address.city || !address.state || !address.zipCode) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ADDRESS',
          message: 'Missing required address fields: street, city, state, zipCode',
        },
      });
    }

    const result = await dataTreeAVM.orderAVM(address);

    if (!result.success) {
      return reply.status(422).send({
        success: false,
        orderId: result.orderId,
        error: result.error,
      });
    }

    // Attach applicationId and propertyId if provided
    if (result.report) {
      result.report.applicationId = applicationId || '';
      result.report.propertyId = propertyId || '';
    }

    return {
      success: true,
      orderId: result.orderId,
      report: result.report,
    };
  });

  /**
   * GET /valuation/avm/:orderId
   * Get AVM report by order ID (for async workflows)
   */
  fastify.get('/avm/:orderId', async (
    request: FastifyRequest<{ Params: { orderId: string } }>,
    reply: FastifyReply
  ) => {
    const { orderId } = request.params;

    const report = await dataTreeAVM.getReport(orderId);

    if (!report) {
      return reply.status(404).send({
        error: 'AVM report not found',
      });
    }

    return report;
  });

  /**
   * POST /valuation/quick-value
   * Quick property value lookup (simplified AVM response)
   */
  fastify.post('/quick-value', async (
    request: FastifyRequest<{ Body: { address: AddressBody } }>,
    reply: FastifyReply
  ) => {
    const { address } = request.body;

    if (!address || !address.street || !address.city || !address.state || !address.zipCode) {
      return reply.status(400).send({
        error: 'Missing required address fields',
      });
    }

    const result = await dataTreeAVM.orderAVM(address);

    if (!result.success || !result.report) {
      return {
        hasValue: false,
        error: result.error?.message || 'No value available',
      };
    }

    const report = result.report;

    return {
      hasValue: true,
      value: {
        estimated: report.estimatedValue ? report.estimatedValue / 100 : null,
        low: report.valueLow ? report.valueLow / 100 : null,
        high: report.valueHigh ? report.valueHigh / 100 : null,
      },
      confidence: {
        score: report.confidenceScore,
        level: report.confidenceLevel,
      },
      property: report.propertyCharacteristics ? {
        type: report.propertyCharacteristics.propertyType,
        yearBuilt: report.propertyCharacteristics.yearBuilt,
        sqft: report.propertyCharacteristics.squareFeet,
        beds: report.propertyCharacteristics.bedrooms,
        baths: report.propertyCharacteristics.bathrooms,
      } : null,
      lastSale: report.lastSaleDate ? {
        date: report.lastSaleDate,
        price: report.lastSalePrice ? report.lastSalePrice / 100 : null,
      } : null,
      comparablesCount: report.comparables?.length || 0,
      vendor: report.vendorName,
    };
  });
}
