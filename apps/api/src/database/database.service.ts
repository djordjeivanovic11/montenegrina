import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database } from '@montenegrina/database';
import type { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: Database;
  readonly pool: Pool;

  constructor(databaseUrl: string) {
    const connection = createDatabase(databaseUrl);
    this.db = connection.db;
    this.pool = connection.pool;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
