import { describe, expect, it } from 'vitest';

import {
  detectLanguageWarnings,
  detectScript,
  identifyProtectedSpans,
  normalizeCriticalValues,
  processMontenegrin,
  protectedSpansPreserved,
} from '../src/index.js';

describe('Montenegrin language processing', () => {
  it('detects script without relabeling provider locale as language', () => {
    expect(detectScript('Dobar dan')).toBe('LATIN');
    expect(detectScript('Добар дан')).toBe('CYRILLIC');
    expect(detectScript('Dobar дан')).toBe('MIXED');
  });

  it('warns about likely ekavian and English drift without rewriting it', () => {
    const text = 'Please sačekajte sledeće obaveštenje.';
    const result = processMontenegrin(text);
    expect(result.correctedText).toBe(text);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['EKAVIAN_DRIFT', 'UNTRANSLATED_ENGLISH']),
    );
  });

  it('protects identifiers, quotations, URLs, and glossary terms', () => {
    const text = 'Otvorite ACME_ID na https://example.com i zadržite „Moj Paket“.';
    const spans = identifyProtectedSpans(text, { glossary: ['Moj Paket'] });
    expect(spans.map((span) => span.value)).toEqual(
      expect.arrayContaining(['ACME_ID', 'https://example.com', '„Moj Paket“']),
    );
    expect(protectedSpansPreserved(text, spans)).toBe(true);
  });

  it('normalizes critical values into separate display and spoken forms', () => {
    const result = normalizeCriticalValues('Cijena je € 12,50, datum 3/7/2026, broj +382 67 123 456.');
    expect(result.displayText).toContain('12.50 EUR');
    expect(result.displayText).toContain('03.07.2026.');
    expect(result.spokenText).toContain('plus tri osam dva');
    expect(result.values.map((value) => value.kind)).toEqual(
      expect.arrayContaining(['currency', 'date', 'telephone']),
    );
  });

  it('transliterates output while preserving explicit company terminology', () => {
    const result = processMontenegrin('Dobar dan iz ACME servisa.', {
      outputScript: 'CYRILLIC',
      glossary: ['ACME'],
    });
    expect(result.correctedText).toBe('Добар дан из ACME сервиса.');
  });

  it('returns stable warning matches', () => {
    expect(detectLanguageWarnings('lepo vreme').at(0)?.matches).toEqual(['lepo', 'vreme']);
  });
});

