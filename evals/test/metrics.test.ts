import { describe, expect, it } from 'vitest';

import { characterErrorRate, createReport, evaluateCase, wordErrorRate } from '../src/index.js';

describe('evaluation metrics', () => {
  it('computes exact WER and CER', () => {
    expect(wordErrorRate('Dobar dan', 'Dobar dan')).toBe(0);
    expect(characterErrorRate('broj 12', 'broj 13')).toBeGreaterThan(0);
  });

  it('scores language, entities, tools, and regression thresholds', () => {
    const metrics = evaluateCase(
      {
        id: 'case-1',
        expectedTranscript: 'Termin je 3. jula za Marka.',
        criticalEntities: [
          { value: '3. jula', kind: 'date' },
          { value: 'Marka', kind: 'name' },
        ],
        expectedIntent: 'appointment',
        expectedResponse: {
          protectedSpans: ['ACME'],
          expectedTool: { name: 'appointment_create', arguments: { date: '2026-07-03' } },
        },
        language: { script: 'LATIN', requireIjekavian: true },
      },
      {
        transcript: 'Termin je 3. jula za Marka.',
        response: 'ACME je zakazao termin sljedeće sedmice.',
        expectedIntentPreserved: true,
        toolCall: { name: 'appointment_create', arguments: { date: '2026-07-03' } },
      },
    );
    const report = createReport([metrics], { runner: 'test' }, { wordErrorRate: { maximum: 0 } });
    expect(metrics.criticalEntityAccuracy).toBe(1);
    expect(metrics.toolSelectionAccuracy).toBe(1);
    expect(metrics.protectedSpanPreservation).toBe(1);
    expect(report.passed).toBe(true);
  });
});

