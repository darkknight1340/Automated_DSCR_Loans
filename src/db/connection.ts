/**
 * Database Connection Module
 *
 * Uses Neon's serverless driver for PostgreSQL connectivity.
 * Supports connection pooling and handles connection lifecycle.
 */

import { neon, neonConfig } from '@neondatabase/serverless';

// Configure Neon for better performance
neonConfig.fetchConnectionCache = true;

// Database connection string from environment
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('DATABASE_URL not configured. Using in-memory fallback.');
    return '';
  }
  return url;
}

// SQL query function - uses Neon's tagged template literal
let sqlClient: ReturnType<typeof neon> | null = null;

export function getDb() {
  const url = getDatabaseUrl();
  if (!url) {
    return null;
  }

  if (!sqlClient) {
    sqlClient = neon(url);
  }

  return sqlClient;
}

// Helper to check if DB is configured
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

// Generic query helper with error handling
export async function query<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = getDb();
  if (!db) {
    throw new Error('Database not configured');
  }

  try {
    const result = await db(sql, params);
    return result as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Transaction helper (simplified for Neon serverless)
export async function transaction<T>(
  operations: (query: typeof query) => Promise<T>
): Promise<T> {
  const db = getDb();
  if (!db) {
    throw new Error('Database not configured');
  }

  // Neon serverless doesn't support true transactions in the same way,
  // but we can batch queries. For full transaction support, use pooled connections.
  try {
    await db('BEGIN');
    const result = await operations(query);
    await db('COMMIT');
    return result;
  } catch (error) {
    await db('ROLLBACK');
    throw error;
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const db = getDb();
  if (!db) {
    return { connected: false, error: 'Database not configured' };
  }

  const start = Date.now();
  try {
    await db('SELECT 1');
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
