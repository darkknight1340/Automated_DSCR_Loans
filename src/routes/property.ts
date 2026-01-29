/**
 * Property Routes
 *
 * Endpoints for property data from PropertyReach and DataTree
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { propertyReach } from '../adapters/propertyreach/PropertyReachAdapter.js';
import { dataTreeProperty } from '../adapters/datatree/DataTreeAdapter.js';

interface AddressQuery {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface DSCRQuery extends AddressQuery {
  loanAmount: string;
  interestRate: string;
  termMonths: string;
}

export async function propertyRoutes(fastify: FastifyInstance) {
  /**
   * GET /property/report
   * Get comprehensive property report including owner, mortgages, equity, STR analysis
   */
  fastify.get('/report', async (
    request: FastifyRequest<{ Querystring: AddressQuery }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip } = request.query;

    if (!street || !city || !state || !zip) {
      return reply.status(400).send({
        error: 'Missing required address fields: street, city, state, zip',
      });
    }

    const report = await propertyReach.getPropertyReport({
      street, city, state, zip,
    });

    if (!report) {
      return reply.status(404).send({
        error: 'Property not found or service unavailable',
      });
    }

    return report;
  });

  /**
   * GET /property/details
   * Get basic property details
   */
  fastify.get('/details', async (
    request: FastifyRequest<{ Querystring: AddressQuery }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip } = request.query;

    if (!street || !city || !state || !zip) {
      return reply.status(400).send({
        error: 'Missing required address fields: street, city, state, zip',
      });
    }

    // Try PropertyReach first, fall back to DataTree
    let details = await propertyReach.getPropertyDetails({ street, city, state, zip });

    if (!details) {
      const dataTreeData = await dataTreeProperty.getPropertyData({
        street,
        city,
        state,
        zipCode: zip,
      });

      if (dataTreeData) {
        return {
          source: 'DataTree',
          ...dataTreeData,
        };
      }

      return reply.status(404).send({
        error: 'Property not found',
      });
    }

    return {
      source: 'PropertyReach',
      ...details,
    };
  });

  /**
   * GET /property/owner
   * Get property owner information
   */
  fastify.get('/owner', async (
    request: FastifyRequest<{ Querystring: AddressQuery & { skipTrace?: string } }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip, skipTrace } = request.query;

    if (!street || !city || !state || !zip) {
      return reply.status(400).send({
        error: 'Missing required address fields',
      });
    }

    const owner = await propertyReach.getOwnerInfo(
      { street, city, state, zip },
      skipTrace === 'true'
    );

    if (!owner) {
      return reply.status(404).send({
        error: 'Owner information not found',
      });
    }

    return owner;
  });

  /**
   * GET /property/mortgages
   * Get current mortgage/loan information
   */
  fastify.get('/mortgages', async (
    request: FastifyRequest<{ Querystring: AddressQuery }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip } = request.query;

    if (!street || !city || !state || !zip) {
      return reply.status(400).send({
        error: 'Missing required address fields',
      });
    }

    const mortgages = await propertyReach.getMortgages({ street, city, state, zip });
    return { mortgages };
  });

  /**
   * GET /property/equity
   * Get equity analysis
   */
  fastify.get('/equity', async (
    request: FastifyRequest<{ Querystring: AddressQuery }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip } = request.query;

    if (!street || !city || !state || !zip) {
      return reply.status(400).send({
        error: 'Missing required address fields',
      });
    }

    const equity = await propertyReach.getEquityAnalysis({ street, city, state, zip });

    if (!equity) {
      return reply.status(404).send({
        error: 'Equity analysis not available',
      });
    }

    return equity;
  });

  /**
   * GET /property/str-analysis
   * Detect if property is a short-term rental
   */
  fastify.get('/str-analysis', async (
    request: FastifyRequest<{ Querystring: AddressQuery }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip } = request.query;

    if (!street || !city || !state || !zip) {
      return reply.status(400).send({
        error: 'Missing required address fields',
      });
    }

    const strAnalysis = await propertyReach.detectSTR({ street, city, state, zip });

    return strAnalysis || {
      isShortTermRental: false,
      confidence: 0,
      platforms: [],
    };
  });

  /**
   * GET /property/dscr-inputs
   * Get computed DSCR inputs for a property
   */
  fastify.get('/dscr-inputs', async (
    request: FastifyRequest<{ Querystring: DSCRQuery }>,
    reply: FastifyReply
  ) => {
    const { street, city, state, zip, loanAmount, interestRate, termMonths } = request.query;

    if (!street || !city || !state || !zip || !loanAmount || !interestRate) {
      return reply.status(400).send({
        error: 'Missing required fields: street, city, state, zip, loanAmount, interestRate',
      });
    }

    const dscrInputs = await propertyReach.computeDSCRInputs(
      { street, city, state, zip },
      parseFloat(loanAmount),
      parseFloat(interestRate),
      parseInt(termMonths || '360', 10)
    );

    if (!dscrInputs) {
      return reply.status(404).send({
        error: 'Could not compute DSCR inputs for this property',
      });
    }

    return dscrInputs;
  });
}
