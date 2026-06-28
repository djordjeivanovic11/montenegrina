import createClient from 'openapi-fetch';

import type { paths } from './schema.js';

export type { components, operations, paths } from './schema.js';

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, credentials: 'include' });
}

export type ApiClient = ReturnType<typeof createApiClient>;
