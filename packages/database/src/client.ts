import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

const { Pool } = pg;

export type Database = ReturnType<typeof createDatabase>['db'];

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    application_name: 'montenegrina-api',
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export interface TenantContext {
  organizationId: string;
  actorId: string;
  actorType: 'USER' | 'API_KEY' | 'SERVICE';
  permissions: ReadonlySet<string>;
  requestId: string;
  traceId: string;
}

export function assertTenant(context: TenantContext, organizationId: string): void {
  if (context.organizationId !== organizationId) {
    throw new TenantBoundaryError(context.organizationId, organizationId);
  }
}

export class TenantBoundaryError extends Error {
  readonly code = 'TENANT_ACCESS_DENIED';
  constructor(expected: string, received: string) {
    super(`Tenant scope mismatch: expected ${expected}, received ${received}`);
    this.name = 'TenantBoundaryError';
  }
}

