import { describe, expect, it } from 'vitest';

import { assertTenant, type TenantContext } from '../src/client.js';

const context: TenantContext = {
  organizationId: 'tenant-a',
  actorId: 'user-a',
  actorType: 'USER',
  permissions: new Set(['agents:read']),
  requestId: 'request-a',
  traceId: 'trace-a',
};

describe('tenant boundary', () => {
  it('allows the selected organization', () => {
    expect(() => assertTenant(context, 'tenant-a')).not.toThrow();
  });

  it('rejects cross-tenant access in application services', () => {
    expect(() => assertTenant(context, 'tenant-b')).toThrowError(
      expect.objectContaining({ code: 'TENANT_ACCESS_DENIED' }),
    );
  });
});

