import type { RetrievalCandidate } from './types.js';

const RRF_K = 60;
const RRF_WEIGHT = 0.4;
const RERANK_WEIGHT = 0.6;

export function reciprocalRankFusion(
  vectorRank: number,
  lexicalRank: number,
  vectorScore = 0,
  lexicalScore = 0,
): number {
  return 1 / (RRF_K + vectorRank) + 1 / (RRF_K + lexicalRank);
}

export function mergeRetrievalScores(
  candidates: Array<
    RetrievalCandidate & {
      rerankScore?: number;
    }
  >,
): RetrievalCandidate[] {
  return candidates
    .map((candidate) => {
      const rerankScore = candidate.rerankScore ?? candidate.rrfScore;
      const finalScore = RRF_WEIGHT * candidate.rrfScore + RERANK_WEIGHT * rerankScore;
      return { ...candidate, rerankScore, finalScore };
    })
    .sort((left, right) => right.finalScore - left.finalScore);
}

export function deduplicateCandidates(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
  const seen = new Map<string, RetrievalCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.documentId}:${candidate.sectionId ?? candidate.chunkId}`;
    const existing = seen.get(key);
    if (!existing || candidate.finalScore > existing.finalScore) {
      seen.set(key, candidate);
    }
  }
  return [...seen.values()].sort((left, right) => right.finalScore - left.finalScore);
}

export function buildKnowledgePromptBlock(sources: RetrievalCandidate[]): string {
  if (!sources.length) {
    return '\n\nNema dostupnih izvora iz baze znanja. Ako korisnik traži činjenice koje zahtijevaju izvore, reci da nema dovoljno informacija u dostupnim dokumentima.';
  }
  return `\n\nIZVORI (citiraj oznakom [Sn] samo kada izvor podržava tvrdnju; ako izvori ne pokrivaju pitanje, reci da nema dovoljno informacija u dostupnim dokumentima):\n${sources
    .map(
      (source, index) =>
        `[S${index + 1}] ${source.title}${source.page ? `, str. ${source.page}` : ''}${source.section ? `, ${source.section}` : ''}: ${source.content}`,
    )
    .join('\n')}`;
}
