import { describe, expect, it } from 'vitest';

import { assertTenant, TenantBoundaryError } from '@montenegrina/database';

describe('tenant isolation', () => {
  it('assertTenant passes for matching organization', () => {
    expect(() =>
      assertTenant(
        {
          organizationId: 'org-a',
          actorId: 'user-1',
          actorType: 'USER',
          permissions: new Set(['*']),
          requestId: 'req-1',
          traceId: 'trace-1',
        },
        'org-a',
      ),
    ).not.toThrow();
  });

  it('assertTenant rejects cross-tenant access', () => {
    expect(() =>
      assertTenant(
        {
          organizationId: 'org-a',
          actorId: 'user-1',
          actorType: 'USER',
          permissions: new Set(['*']),
          requestId: 'req-1',
          traceId: 'trace-1',
        },
        'org-b',
      ),
    ).toThrow(TenantBoundaryError);
  });
});
