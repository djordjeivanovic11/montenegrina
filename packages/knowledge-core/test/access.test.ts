import { describe, expect, it } from 'vitest';

import { canAccessDocument } from '../src/access.js';

describe('document access', () => {
  it('allows org-visible docs for viewers', () => {
    expect(
      canAccessDocument(
        { actorType: 'USER', membershipRole: 'VIEWER', accessGroupIds: new Set() },
        { visibility: 'ORG', accessGroupIds: [] },
      ),
    ).toBe(true);
  });

  it('blocks group-restricted docs without membership', () => {
    expect(
      canAccessDocument(
        { actorType: 'USER', membershipRole: 'ADMIN', accessGroupIds: new Set(['other']) },
        { visibility: 'GROUP_RESTRICTED', accessGroupIds: ['legal'] },
      ),
    ).toBe(false);
  });
});
