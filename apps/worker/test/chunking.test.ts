import { describe, expect, it } from 'vitest';

import { chunkDocument } from '../src/document-processor.js';

describe('document chunking', () => {
  it('keeps page provenance and bounded semantic chunks', () => {
    const sections = [{ page: 3, section: 'Uslovi', text: 'Dugačak pasus. '.repeat(1_000) }];
    const chunks = chunkDocument(sections);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page === 3 && chunk.section === 'Uslovi')).toBe(true);
    expect(Math.max(...chunks.map((chunk) => chunk.tokenCount))).toBeLessThan(800);
  });
});

