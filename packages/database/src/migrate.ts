import { loadEnvironment } from '@montenegrina/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase } from './client.js';

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  process.stdout.write('Database migrations completed.\n');
} finally {
  await pool.end();
}

