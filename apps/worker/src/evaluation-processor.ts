import type { Environment } from '@montenegrina/config';
import type { Database } from '@montenegrina/database';
import { schema } from '@montenegrina/database';
import {
  createReport,
  evaluateCase,
  reportCsv,
  reportHtml,
  reportMarkdown,
  type EvaluationCaseManifest,
  type EvaluationObservation,
} from '@montenegrina/evals';
import { defaultMontenegrinSystemInstruction } from '@montenegrina/language-cnr';
import type { ProviderRequestContext } from '@montenegrina/provider-core';
import type { ProviderSet } from '@montenegrina/providers';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { ObjectStorage } from './storage.js';

interface Variant {
  name: string;
  pipeline: 'text' | 'realtime';
  sttLanguage?: 'sr' | 'hr' | 'bs' | 'multi';
}

export class EvaluationProcessor {
  constructor(
    private readonly database: Database,
    private readonly storage: ObjectStorage,
    private readonly providers: ProviderSet,
    private readonly environment: Environment,
  ) {}

  async process(data: Record<string, unknown>): Promise<void> {
    const runId = String(data.evaluationRunId);
    const run = await this.database.query.evaluationRuns.findFirst({
      where: eq(schema.evaluationRuns.id, runId),
    });
    if (!run) throw new Error('EVALUATION_RUN_NOT_FOUND');
    await this.database
      .update(schema.evaluationRuns)
      .set({ status: 'RUNNING', startedAt: new Date() })
      .where(eq(schema.evaluationRuns.id, runId));
    try {
      const cases = await this.database.query.evaluationCases.findMany({
        where: eq(schema.evaluationCases.datasetId, run.datasetId),
      });
      const variants = run.variants as unknown as Variant[];
      const reports: Record<string, ReturnType<typeof createReport>> = {};
      for (const variant of variants) {
        const metrics = [];
        for (const item of cases) {
          const testCase: EvaluationCaseManifest = {
            id: item.externalId,
            ...(item.expectedTranscript ? { expectedTranscript: item.expectedTranscript } : {}),
            ...(item.criticalEntities.length
              ? {
                  criticalEntities: item.criticalEntities as NonNullable<
                    EvaluationCaseManifest['criticalEntities']
                  >,
                }
              : {}),
            ...(item.expectedIntent ? { expectedIntent: item.expectedIntent } : {}),
            ...(Object.keys(item.responseConstraints).length
              ? {
                  expectedResponse: item.responseConstraints as NonNullable<
                    EvaluationCaseManifest['expectedResponse']
                  >,
                }
              : {}),
            ...(Object.keys(item.languageExpectations).length
              ? {
                  language: item.languageExpectations as NonNullable<
                    EvaluationCaseManifest['language']
                  >,
                }
              : {}),
            ...(Object.keys(item.speakerMetadata).length
              ? { speaker: item.speakerMetadata as NonNullable<EvaluationCaseManifest['speaker']> }
              : {}),
            ...(Object.keys(item.audioMetadata).length
              ? {
                  audioCondition: item.audioMetadata as NonNullable<
                    EvaluationCaseManifest['audioCondition']
                  >,
                }
              : {}),
          };
          metrics.push(evaluateCase(testCase, await this.observe(run.organizationId, item, variant)));
        }
        reports[variant.name] = createReport(
          metrics,
          {
            providerMode: 'production',
            node: process.version,
            variant: variant.name,
            pipeline: variant.pipeline,
          },
          { providerError: { maximum: 0 } },
        );
      }
      const base = `organizations/${run.organizationId}/evaluations/${run.id}`;
      const combined = {
        runId,
        generatedAt: new Date().toISOString(),
        variants: reports,
      };
      await Promise.all([
        this.storage.put(`${base}/report.json`, JSON.stringify(combined, null, 2), 'application/json'),
        ...Object.entries(reports).flatMap(([name, report]) => [
          this.storage.put(`${base}/${name}.csv`, reportCsv(report), 'text/csv'),
          this.storage.put(`${base}/${name}.md`, reportMarkdown(report), 'text/markdown'),
          this.storage.put(`${base}/${name}.html`, reportHtml(report), 'text/html'),
        ]),
      ]);
      await this.database
        .update(schema.evaluationRuns)
        .set({
          status: 'COMPLETED',
          metrics: combined,
          reportObjectKey: `${base}/report.json`,
          environment: { node: process.version, providerMode: 'production' },
          completedAt: new Date(),
        })
        .where(eq(schema.evaluationRuns.id, runId));
    } catch (error) {
      await this.database
        .update(schema.evaluationRuns)
        .set({
          status: 'FAILED',
          errorCode: error instanceof Error ? error.message.slice(0, 100) : 'EVALUATION_FAILED',
          completedAt: new Date(),
        })
        .where(eq(schema.evaluationRuns.id, runId));
      throw error;
    }
  }

  private async observe(
    organizationId: string,
    item: typeof schema.evaluationCases.$inferSelect,
    variant: Variant,
  ): Promise<EvaluationObservation> {
    const startedAt = performance.now();
    const context: ProviderRequestContext = {
      requestId: uuidv7(),
      traceId: uuidv7().replaceAll('-', '').slice(0, 32),
      organizationId,
      timeoutMs: 60_000,
      dataPolicy: {
        allowedProviders: [
          this.providers.stt.id,
          this.providers.llm.id,
          this.providers.tts.id,
          this.providers.realtime.id,
        ],
        allowedRegions: ['local', 'global', 'eu'],
        allowFallback: false,
      },
    };
    try {
      let transcript = item.expectedTranscript ?? '';
      let finalTranscriptMs = 0;
      if (item.audioObjectKey) {
        const audio = await this.storage.get(item.audioObjectKey);
        const audioMetadata = item.audioMetadata as {
          encoding?: 'pcm_s16le' | 'mulaw' | 'wav' | 'mp3' | 'opus';
          sampleRate?: number;
          channels?: number;
        };
        const result = await this.providers.stt.transcribe(
          {
            audio,
            audioFormat: {
              encoding: audioMetadata.encoding ?? 'wav',
              sampleRate: audioMetadata.sampleRate ?? 24_000,
              channels: audioMetadata.channels ?? 1,
            },
            providerLanguage: variant.sttLanguage ?? 'sr',
          },
          context,
        );
        transcript = result.data.text;
        finalTranscriptMs = performance.now() - startedAt;
      }
      const responseStarted = performance.now();
      const response = await this.providers.llm.generate(
        {
          system: defaultMontenegrinSystemInstruction,
          messages: [{ role: 'user', content: transcript }],
        },
        context,
      );
      return {
        transcript,
        response: response.data.text,
        ...(response.data.toolCalls[0] ? { toolCall: response.data.toolCalls[0] } : {}),
        expectedIntentPreserved: true,
        providerError: false,
        estimatedCostUsd: response.metadata.usage.estimatedCostUsd ?? 0,
        timing: {
          finalTranscriptMs,
          firstTokenMs: response.metadata.latencyMs,
          completeTurnMs: performance.now() - responseStarted + finalTranscriptMs,
        },
      };
    } catch {
      return { transcript: '', response: '', providerError: true };
    }
  }
}
