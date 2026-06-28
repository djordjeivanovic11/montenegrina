import { detectLanguageWarnings, detectScript } from '@montenegrina/language-cnr';

import type { CaseMetrics, EvaluationCaseManifest, EvaluationObservation } from './types.js';

function normalize(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('cnr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function editDistance<T>(left: readonly T[], right: readonly T[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        (previous[rightIndex - 1] ?? 0) +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        substitution,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? left.length;
}

export function wordErrorRate(reference: string, hypothesis: string): number {
  const expected = normalize(reference).split(' ').filter(Boolean);
  const actual = normalize(hypothesis).split(' ').filter(Boolean);
  return expected.length === 0 ? (actual.length === 0 ? 0 : 1) : editDistance(expected, actual) / expected.length;
}

export function characterErrorRate(reference: string, hypothesis: string): number {
  const expected = [...normalize(reference).replaceAll(' ', '')];
  const actual = [...normalize(hypothesis).replaceAll(' ', '')];
  return expected.length === 0 ? (actual.length === 0 ? 0 : 1) : editDistance(expected, actual) / expected.length;
}

function entityAccuracy(
  entities: NonNullable<EvaluationCaseManifest['criticalEntities']>,
  transcript: string,
  kind?: string,
): number | undefined {
  const selected = kind ? entities.filter((entity) => entity.kind === kind) : entities;
  if (selected.length === 0) return undefined;
  const normalizedTranscript = normalize(transcript);
  return selected.filter((entity) => normalizedTranscript.includes(normalize(entity.value))).length / selected.length;
}

function deepEqualArguments(expected: Record<string, unknown>, actual: Record<string, unknown>): number {
  const keys = Object.keys(expected);
  if (keys.length === 0) return 1;
  return keys.filter((key) => JSON.stringify(expected[key]) === JSON.stringify(actual[key])).length / keys.length;
}

export function evaluateCase(
  testCase: EvaluationCaseManifest,
  observation: EvaluationObservation,
): CaseMetrics {
  const metrics: CaseMetrics = { caseId: testCase.id };
  if (testCase.expectedTranscript !== undefined && observation.transcript !== undefined) {
    metrics.wordErrorRate = wordErrorRate(testCase.expectedTranscript, observation.transcript);
    metrics.characterErrorRate = characterErrorRate(testCase.expectedTranscript, observation.transcript);
    const entities = testCase.criticalEntities ?? [];
    const allEntities = entityAccuracy(entities, observation.transcript);
    const names = entityAccuracy(entities, observation.transcript, 'name');
    const numbers = entityAccuracy(entities, observation.transcript, 'number');
    const dates = entityAccuracy(entities, observation.transcript, 'date');
    const currencies = entityAccuracy(entities, observation.transcript, 'currency');
    if (allEntities !== undefined) metrics.criticalEntityAccuracy = allEntities;
    if (names !== undefined) metrics.nameAccuracy = names;
    if (numbers !== undefined) metrics.numberAccuracy = numbers;
    if (dates !== undefined) metrics.dateAccuracy = dates;
    if (currencies !== undefined) metrics.currencyAccuracy = currencies;
  }
  const response = observation.response ?? '';
  if (testCase.expectedIntent) metrics.intentPreservation = observation.expectedIntentPreserved ? 1 : 0;
  if (testCase.language?.script) metrics.scriptCompliance = detectScript(response) === testCase.language.script ? 1 : 0;
  if (testCase.language?.requireIjekavian) {
    metrics.ijekavianCompliance = detectLanguageWarnings(response).some((warning) => warning.code === 'EKAVIAN_DRIFT') ? 0 : 1;
  }
  const protectedSpans = testCase.expectedResponse?.protectedSpans ?? [];
  if (protectedSpans.length) {
    metrics.protectedSpanPreservation = protectedSpans.filter((span) => response.includes(span)).length / protectedSpans.length;
  }
  if (observation.factual !== undefined) metrics.factuality = observation.factual ? 1 : 0;
  const expectedCitations = testCase.expectedResponse?.expectedCitationChunkIds;
  if (expectedCitations?.length) {
    const actual = new Set(observation.citations ?? []);
    metrics.citationCorrectness = expectedCitations.filter((citation) => actual.has(citation)).length / expectedCitations.length;
  }
  const expectedTool = testCase.expectedResponse?.expectedTool;
  if (expectedTool) {
    metrics.toolSelectionAccuracy = observation.toolCall?.name === expectedTool.name ? 1 : 0;
    metrics.toolArgumentAccuracy = observation.toolCall
      ? deepEqualArguments(expectedTool.arguments, observation.toolCall.arguments)
      : 0;
  }
  Object.assign(metrics, observation.timing);
  if (observation.interruptionSucceeded !== undefined) metrics.interruptionSuccess = observation.interruptionSucceeded ? 1 : 0;
  if (observation.providerError !== undefined) metrics.providerError = observation.providerError ? 1 : 0;
  if (observation.estimatedCostUsd !== undefined) metrics.estimatedCostUsd = observation.estimatedCostUsd;
  return metrics;
}

export function aggregateMetrics(cases: readonly CaseMetrics[]): Record<string, number> {
  const values = new Map<string, number[]>();
  for (const item of cases) {
    for (const [key, value] of Object.entries(item)) {
      if (key === 'caseId' || typeof value !== 'number') continue;
      const group = values.get(key) ?? [];
      group.push(value);
      values.set(key, group);
    }
  }
  return Object.fromEntries(
    [...values].map(([key, group]) => [key, group.reduce((total, value) => total + value, 0) / group.length]),
  );
}
