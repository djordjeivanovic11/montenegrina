import { describe, expect, it } from 'vitest';

import { batchValues } from '../src/batching.js';

describe('batchValues', () => {
  it('splits large writes without dropping or reordering values', () => {
    const values = Array.from({ length: 251 }, (_, index) => index);

    const batches = batchValues(values, 100);

    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 51]);
    expect(batches.flat()).toEqual(values);
  });

  it('returns no writes for an empty collection', () => {
    expect(batchValues([], 100)).toEqual([]);
  });

  it('rejects invalid batch sizes', () => {
    expect(() => batchValues([1], 0)).toThrow('INVALID_BATCH_SIZE');
  });
});
