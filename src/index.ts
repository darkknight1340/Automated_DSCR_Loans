/**
 * DSCR Loan Automation Platform - API Server
 *
 * Fastify-based REST API server with integrations to:
 * - DataTree API (AVM / property valuation)
 * - PropertyReach API (property data, loan info, owner details)
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from 'dotenv';

// Load environment variables
config();

// Import routes
import { registerRoutes } from './routes/index.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
});

// Register plugins
async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable for API
  });
}

// Health check endpoint
fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});

// Start server
async function start() {
  try {
    await registerPlugins();
    await registerRoutes(fastify);

    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         DSCR Loan Automation Platform - API Server        ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://${host}:${port}                    ║
║  Health check:      http://${host}:${port}/health             ║
║  API base:          http://${host}:${port}/api/v1             ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

export { fastify };
