/**
 * API Routes Registration
 */

import type { FastifyInstance } from 'fastify';
import { propertyRoutes } from './property.js';
import { valuationRoutes } from './valuation.js';
import { analyticsRoutes } from './analytics.js';
import { leadsRoutes } from './leads.js';
import { applicationsRoutes } from './applications.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register all route modules under /api/v1
  await fastify.register(
    async (api) => {
      await api.register(propertyRoutes, { prefix: '/property' });
      await api.register(valuationRoutes, { prefix: '/valuation' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
      await api.register(leadsRoutes, { prefix: '/leads' });
      await api.register(applicationsRoutes, { prefix: '/applications' });
    },
    { prefix: '/api/v1' }
  );
}
