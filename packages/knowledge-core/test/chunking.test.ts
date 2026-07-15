import { describe, expect, it } from 'vitest';

import { chunkSections, flattenParserSections } from '../src/chunking.js';

describe('structure-aware chunking', () => {
  it('keeps page provenance and bounded semantic chunks', () => {
    const sections = [
      {
        ordinal: 0,
        level: 1,
        heading: 'Uslovi',
        pageStart: 3,
        content: 'Dugačak pasus. '.repeat(1_000),
      },
    ];
    const chunks = chunkSections(sections);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page === 3 && chunk.section === 'Uslovi')).toBe(true);
    expect(Math.max(...chunks.map((chunk) => chunk.tokenCount))).toBeLessThan(800);
  });

  it('keeps tables atomic', () => {
    const sections = [
      {
        ordinal: 0,
        level: 2,
        heading: 'Tabela',
        content: 'A | B\n1 | 2\n3 | 4',
        isTable: true,
      },
    ];
    const chunks = chunkSections(sections);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('Tabela');
  });

  it('removes PostgreSQL-incompatible NUL characters from parser output', () => {
    const sections = flattenParserSections([
      {
        heading: 'Head\0ing',
        content: 'Bo\0dy',
        articleNumber: '1\0a',
        metadata: { 'bad\0key': { value: 'bad\0value' } },
      },
    ]);

    expect(sections).toEqual([
      {
        ordinal: 0,
        level: 0,
        heading: 'Heading',
        content: 'Body',
        articleNumber: '1a',
        isTable: false,
        metadata: { badkey: { value: 'badvalue' } },
      },
    ]);
  });
});
