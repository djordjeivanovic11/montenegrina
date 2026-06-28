import { describe, expect, it } from 'vitest';

import { chunkSections } from '@montenegrina/knowledge-core';

describe('document chunking', () => {
  it('keeps page provenance and bounded semantic chunks', () => {
    const sections = [{ ordinal: 0, level: 1, pageStart: 3, heading: 'Uslovi', content: 'Dugačak pasus. '.repeat(1_000) }];
    const chunks = chunkSections(sections);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page === 3 && chunk.section === 'Uslovi')).toBe(true);
    expect(Math.max(...chunks.map((chunk) => chunk.tokenCount))).toBeLessThan(800);
  });
});
