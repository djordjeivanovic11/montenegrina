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
  void vectorScore;
  void lexicalScore;
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

/** Prefer breadth across documents so one long PDF does not dominate the prompt. */
export function diversifyCandidatesByDocument(
  candidates: RetrievalCandidate[],
  topK: number,
  maxPerDocument = 2,
): RetrievalCandidate[] {
  const result: RetrievalCandidate[] = [];
  const perDocument = new Map<string, number>();
  for (const candidate of candidates) {
    if (result.length >= topK) break;
    const used = perDocument.get(candidate.documentId) ?? 0;
    if (used >= maxPerDocument) continue;
    perDocument.set(candidate.documentId, used + 1);
    result.push(candidate);
  }
  return result;
}

const KNOWLEDGE_ANSWER_GUIDANCE =
  'Odgovori sažeto (obično 2–5 rečenica ili kratka lista tačaka). Ne prepisuj cijele izvore; izvuci samo ono što odgovara na pitanje i citiraj [Sn]. Ako korisnik traži detaljan vodič, tada možeš biti opširniji.';

export function buildKnowledgePromptBlock(sources: RetrievalCandidate[]): string {
  if (!sources.length) {
    return '\n\nNema dostupnih izvora iz baze znanja. Ako korisnik traži činjenice koje zahtijevaju izvore, reci da nema dovoljno informacija u dostupnim dokumentima.';
  }
  return `\n\nIZVORI (citiraj oznakom [Sn] samo kada izvor podržava tvrdnju; ako izvori ne pokrivaju pitanje, reci da nema dovoljno informacija u dostupnim dokumentima):\n${sources
    .map(
      (source, index) =>
        `[S${index + 1}] ${source.title}${source.page ? `, str. ${source.page}` : ''}${source.section ? `, ${source.section}` : ''}: ${source.content}`,
    )
    .join('\n')}\n\n${KNOWLEDGE_ANSWER_GUIDANCE}`;
}
