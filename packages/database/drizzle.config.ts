import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://montenegrina:montenegrina@localhost:5432/montenegrina',
  },
  strict: true,
  verbose: true,
});

