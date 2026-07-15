import { describe, expect, it } from 'vitest';

import { queuePrefix } from '../src/queue-config.js';

describe('BullMQ Redis Cluster configuration', () => {
  it('uses a Redis hash tag so queue keys share one cluster slot', () => {
    expect(queuePrefix).toMatch(/^\{[^{}]+\}$/);
  });
});
