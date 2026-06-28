import { describe, expect, it } from 'vitest';

import { normalizeE164, parseE164 } from '../../src/livekit/e164.js';

describe('e164', () => {
  it('normalizes Montenegro mobile numbers', () => {
    expect(normalizeE164('+38267123456')).toBe('+38267123456');
    expect(normalizeE164('38267123456')).toBe('+38267123456');
  });

  it('rejects invalid numbers via parseE164', () => {
    expect(() => parseE164('not-a-phone')).toThrow(/E\.164/);
  });
});
