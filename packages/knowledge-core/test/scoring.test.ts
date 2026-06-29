import { describe, expect, it } from 'vitest';

import {
  buildKnowledgePromptBlock,
  diversifyCandidatesByDocument,
} from '../src/scoring.js';
import type { RetrievalCandidate } from '../src/types.js';

function candidate(
  documentId: string,
  chunkId: string,
  finalScore: number,
): RetrievalCandidate {
  return {
    chunkId,
    documentId,
    documentVersionId: 'v1',
    sectionId: null,
    title: `doc-${documentId}`,
    documentType: 'general',
    language: 'cnr',
    version: 1,
    page: 1,
    section: null,
    articleNumber: null,
    headingPath: null,
    sourceUrl: null,
    content: 'Sadržaj.',
    vectorScore: 0.1,
    lexicalScore: 0.1,
    rrfScore: 0.1,
    finalScore,
  };
}

describe('diversifyCandidatesByDocument', () => {
  it('limits chunks per document', () => {
    const input = [
      candidate('a', '1', 0.9),
      candidate('a', '2', 0.8),
      candidate('a', '3', 0.7),
      candidate('b', '4', 0.6),
    ];
    const result = diversifyCandidatesByDocument(input, 4, 2);
    expect(result).toHaveLength(3);
    expect(result.filter((item) => item.documentId === 'a')).toHaveLength(2);
    expect(result.at(-1)?.documentId).toBe('b');
  });
});

describe('buildKnowledgePromptBlock', () => {
  it('includes concise answer guidance', () => {
    const block = buildKnowledgePromptBlock([candidate('a', '1', 0.9)]);
    expect(block).toContain('Odgovori sažeto');
    expect(block).toContain('[S1]');
  });
});
