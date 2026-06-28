import type { ParsedSection, StructureChunk } from './types.js';

const TARGET_TOKENS = 600;
const MIN_TOKENS = 400;
const MAX_TOKENS = 700;
const OVERLAP_CHARS = 400;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildHeadingPath(section: ParsedSection, sections: ParsedSection[]): string {
  const parts: string[] = [];
  let current: ParsedSection | undefined = section;
  while (current) {
    if (current.heading) parts.unshift(current.heading);
    current =
      current.parentOrdinal === undefined
        ? undefined
        : sections.find((item) => item.ordinal === current?.parentOrdinal);
  }
  return parts.join(' > ');
}

function prefixContent(section: ParsedSection, sections: ParsedSection[], body: string): string {
  const headingPath = buildHeadingPath(section, sections);
  if (!headingPath) return body;
  return `[${headingPath}]\n\n${body}`;
}

function buildChunk(
  ordinal: number,
  section: ParsedSection,
  sections: ParsedSection[],
  content: string,
  searchBody: string,
): StructureChunk {
  const headingPath = buildHeadingPath(section, sections);
  return {
    ordinal,
    sectionOrdinal: section.ordinal,
    ...(section.pageStart !== undefined ? { page: section.pageStart } : {}),
    ...(section.heading ? { section: section.heading } : {}),
    ...(section.articleNumber ? { articleNumber: section.articleNumber } : {}),
    ...(headingPath ? { headingPath } : {}),
    content,
    tokenCount: estimateTokens(content),
    searchText: `${section.heading ?? ''} ${section.articleNumber ?? ''} ${searchBody}`.trim(),
  };
}

function splitLongText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .flatMap((value) =>
      estimateTokens(value) > TARGET_TOKENS ? value.split(/(?<=[.!?])\s+/u) : [value],
    )
    .map((value) => value.trim())
    .filter(Boolean);
  return paragraphs.length ? paragraphs : [text];
}

export function chunkSections(sections: ParsedSection[]): StructureChunk[] {
  const result: StructureChunk[] = [];
  let ordinal = 0;

  for (const section of sections) {
    const baseBody = section.content.trim();
    if (!baseBody) continue;

    if (section.isTable || estimateTokens(baseBody) <= MAX_TOKENS) {
      const content = prefixContent(section, sections, baseBody);
      result.push(buildChunk(ordinal++, section, sections, content, baseBody));
      continue;
    }

    const parts = splitLongText(baseBody);
    let current = '';
    for (const part of parts) {
      const candidate = current ? `${current}\n\n${part}` : part;
      const prefixed = prefixContent(section, sections, candidate);
      if (current && estimateTokens(prefixed) > TARGET_TOKENS) {
        const finalized = prefixContent(section, sections, current);
        result.push(buildChunk(ordinal++, section, sections, finalized, current));
        const overlap = current.slice(-OVERLAP_CHARS);
        current = overlap ? `${overlap}\n\n${part}` : part;
      } else {
        current = candidate;
      }
    }
    if (current) {
      const finalized = prefixContent(section, sections, current);
      if (estimateTokens(finalized) >= MIN_TOKENS / 2 || result.length === 0) {
        result.push(buildChunk(ordinal++, section, sections, finalized, current));
      }
    }
  }

  return result;
}

export function flattenParserSections(
  sections: Array<{
    heading?: string | null;
    level?: number;
    pageStart?: number | null;
    pageEnd?: number | null;
    articleNumber?: string | null;
    content: string;
    parentIndex?: number | null;
    isTable?: boolean;
    metadata?: Record<string, unknown>;
  }>,
): ParsedSection[] {
  return sections.map((section, index) => ({
    ordinal: index,
    level: section.level ?? 0,
    content: section.content,
    isTable: section.isTable ?? false,
    ...(section.heading ? { heading: section.heading } : {}),
    ...(section.pageStart != null ? { pageStart: section.pageStart } : {}),
    ...(section.pageEnd != null ? { pageEnd: section.pageEnd } : {}),
    ...(section.articleNumber ? { articleNumber: section.articleNumber } : {}),
    ...(section.parentIndex != null ? { parentOrdinal: section.parentIndex } : {}),
    ...(section.metadata ? { metadata: section.metadata } : {}),
  }));
}
