import { createHash } from 'node:crypto';

import type { Database } from '@montenegrina/database';
import { schema } from '@montenegrina/database';
import type { ProviderRequestContext } from '@montenegrina/provider-core';
import type { ProviderSet } from '@montenegrina/providers';
import { and, eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { v7 as uuidv7 } from 'uuid';

import { ObjectStorage } from './storage.js';

interface ExtractedSection {
  text: string;
  page?: number;
  section?: string;
}

interface Chunk extends ExtractedSection {
  content: string;
  tokenCount: number;
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedSection[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false }).promise;
  if (document.numPages > 1_000) throw new Error('PDF_PAGE_LIMIT_EXCEEDED');
  const pages: ExtractedSection[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (text) pages.push({ text, page: pageNumber });
  }
  return pages;
}

async function extract(bytes: Uint8Array, mediaType: string): Promise<ExtractedSection[]> {
  if (mediaType === 'application/pdf') return extractPdf(bytes);
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return [{ text: result.value }];
  }
  return [{ text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }];
}

function chunks(sections: ExtractedSection[]): Chunk[] {
  const result: Chunk[] = [];
  for (const source of sections) {
    const paragraphs = source.text
      .split(/\n{2,}/u)
      .flatMap((value) =>
        Math.ceil(value.length / 4) > 600 ? value.split(/(?<=[.!?])\s+/u) : [value],
      )
      .map((value) => value.trim())
      .filter(Boolean);
    let current = '';
    for (const paragraph of paragraphs.length ? paragraphs : [source.text]) {
      if (current && Math.ceil((current.length + paragraph.length) / 4) > 600) {
        result.push({ ...source, content: current, tokenCount: Math.ceil(current.length / 4) });
        const overlap = current.slice(-400);
        current = `${overlap}\n\n${paragraph}`;
      } else {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }
    if (current) result.push({ ...source, content: current, tokenCount: Math.ceil(current.length / 4) });
  }
  return result;
}

export class DocumentProcessor {
  constructor(
    private readonly database: Database,
    private readonly storage: ObjectStorage,
    private readonly providers: ProviderSet,
  ) {}

  async process(data: Record<string, unknown>): Promise<void> {
    const documentId = String(data.documentId);
    const versionId = String(data.documentVersionId);
    const version = await this.database.query.documentVersions.findFirst({
      where: and(
        eq(schema.documentVersions.id, versionId),
        eq(schema.documentVersions.documentId, documentId),
      ),
    });
    const document = await this.database.query.documents.findFirst({
      where: eq(schema.documents.id, documentId),
    });
    if (!version || !document || !version.objectKey) throw new Error('DOCUMENT_VERSION_NOT_FOUND');
    await this.database
      .update(schema.documents)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(schema.documents.id, documentId));
    try {
      const bytes = await this.storage.get(version.objectKey);
      if (bytes.byteLength !== version.byteSize) throw new Error('DOCUMENT_SIZE_MISMATCH');
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== version.sha256) throw new Error('DOCUMENT_DIGEST_MISMATCH');
      const extracted = await extract(bytes, version.mediaType);
      const documentChunks = chunks(extracted);
      if (!documentChunks.length) throw new Error('DOCUMENT_EMPTY');
      const context: ProviderRequestContext = {
        requestId: uuidv7(),
        traceId: digest.slice(0, 32),
        organizationId: document.organizationId,
        timeoutMs: 60_000,
        dataPolicy: {
          allowedProviders: [this.providers.embeddings.id],
          allowedRegions: ['local', 'global', 'eu'],
          allowFallback: false,
        },
      };
      const vectors: number[][] = [];
      for (let offset = 0; offset < documentChunks.length; offset += 20) {
        const batch = documentChunks.slice(offset, offset + 20);
        const response = await this.providers.embeddings.embed(
          { texts: batch.map((chunk) => chunk.content) },
          context,
        );
        vectors.push(...response.data);
      }
      await this.database.transaction(async (transaction) => {
        await transaction
          .delete(schema.documentChunks)
          .where(eq(schema.documentChunks.documentVersionId, versionId));
        await transaction.insert(schema.documentChunks).values(
          documentChunks.map((chunk, index) => ({
            id: uuidv7(),
            organizationId: document.organizationId,
            documentId,
            documentVersionId: versionId,
            ordinal: index,
            page: chunk.page,
            section: chunk.section,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            embedding: vectors[index] as number[],
            searchText: chunk.content,
          })),
        );
        await transaction
          .update(schema.documentVersions)
          .set({ extractedText: extracted.map((section) => section.text).join('\n\n') })
          .where(eq(schema.documentVersions.id, versionId));
        await transaction
          .update(schema.documents)
          .set({ status: 'READY', errorCode: null, updatedAt: new Date() })
          .where(eq(schema.documents.id, documentId));
      });
    } catch (error) {
      await this.database
        .update(schema.documents)
        .set({
          status: 'FAILED',
          errorCode: error instanceof Error ? error.message.slice(0, 100) : 'DOCUMENT_PROCESSING_FAILED',
          updatedAt: new Date(),
        })
        .where(eq(schema.documents.id, documentId));
      throw error;
    }
  }
}

export { chunks as chunkDocument };
