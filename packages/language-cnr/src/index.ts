export { defaultMontenegrinSystemInstruction } from './default-prompt.js';

export type Script = 'LATIN' | 'CYRILLIC' | 'MIXED' | 'UNKNOWN';
export type WarningCode =
  | 'EKAVIAN_DRIFT'
  | 'UNTRANSLATED_ENGLISH'
  | 'MIXED_SCRIPT'
  | 'PROTECTED_SPAN_CHANGED'
  | 'CRITICAL_VALUE_CHANGED';

export interface ProtectedSpan {
  start: number;
  end: number;
  value: string;
  reason: 'explicit' | 'url' | 'email' | 'identifier' | 'quotation' | 'glossary';
}

export interface LanguageWarning {
  code: WarningCode;
  message: string;
  matches: string[];
}

export interface NormalizedValue {
  kind: 'currency' | 'telephone' | 'date' | 'number';
  original: string;
  display: string;
  spoken: string;
  start: number;
  end: number;
}

export interface LanguageProfile {
  outputScript?: 'LATIN' | 'CYRILLIC';
  preferIjekavian?: boolean;
  glossary?: readonly string[];
  protectedValues?: readonly string[];
}

export interface LanguageResult {
  language: 'cnr';
  originalText: string;
  correctedText: string;
  displayText: string;
  spokenText: string;
  detectedScript: Script;
  warnings: LanguageWarning[];
  protectedSpans: ProtectedSpan[];
  normalizedValues: NormalizedValue[];
  correctionApplied: boolean;
}

const cyrillicPattern = /[А-Яа-яЉЊЏЂЋЈљњџђћј]/gu;
const latinPattern = /[A-Za-zČĆŽŠĐčćžšđŚŹśź]/gu;
const ekavianMarkers = [
  /\bvreme\b/giu,
  /\bčovek\b/giu,
  /\blepo\b/giu,
  /\breč\b/giu,
  /\bmleko\b/giu,
  /\bdeca\b/giu,
  /\bsledeć\w*/giu,
  /\bobaveštenj\w*/giu,
];
const englishMarkers = [
  /\bplease\b/giu,
  /\bsorry\b/giu,
  /\bthank(?:s| you)\b/giu,
  /\bappointment\b/giu,
  /\bavailable\b/giu,
  /\bstatus\b/giu,
];

export function detectScript(text: string): Script {
  const cyrillic = text.match(cyrillicPattern)?.length ?? 0;
  const latin = text.match(latinPattern)?.length ?? 0;
  if (cyrillic === 0 && latin === 0) return 'UNKNOWN';
  if (cyrillic > 0 && latin > 0) return 'MIXED';
  return cyrillic > 0 ? 'CYRILLIC' : 'LATIN';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectPatternSpans(
  text: string,
  pattern: RegExp,
  reason: ProtectedSpan['reason'],
): ProtectedSpan[] {
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    value: match[0],
    reason,
  }));
}

function removeOverlaps(spans: ProtectedSpan[]): ProtectedSpan[] {
  const ordered = [...spans].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const result: ProtectedSpan[] = [];
  for (const span of ordered) {
    const previous = result.at(-1);
    if (!previous || span.start >= previous.end) result.push(span);
  }
  return result;
}

export function identifyProtectedSpans(
  text: string,
  profile: LanguageProfile = {},
): ProtectedSpan[] {
  const spans = [
    ...collectPatternSpans(text, /https?:\/\/[^\s)\]}]+/giu, 'url'),
    ...collectPatternSpans(text, /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, 'email'),
    ...collectPatternSpans(text, /`[^`]+`/gu, 'identifier'),
    ...collectPatternSpans(text, /\b[A-ZČĆŽŠĐ]{2,}[A-ZČĆŽŠĐ0-9_-]*\b/gu, 'identifier'),
    ...collectPatternSpans(text, /["„“][^"„“]+["„“]/gu, 'quotation'),
  ];

  for (const value of profile.protectedValues ?? []) {
    spans.push(...collectPatternSpans(text, new RegExp(escapeRegExp(value), 'gu'), 'explicit'));
  }
  for (const value of profile.glossary ?? []) {
    spans.push(...collectPatternSpans(text, new RegExp(escapeRegExp(value), 'giu'), 'glossary'));
  }
  return removeOverlaps(spans);
}

function collectMatches(text: string, patterns: readonly RegExp[]): string[] {
  const matches = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({ value: match[0], index: match.index })),
  );
  matches.sort((left, right) => left.index - right.index);
  return [...new Set(matches.map((match) => match.value))];
}

export function detectLanguageWarnings(text: string): LanguageWarning[] {
  const warnings: LanguageWarning[] = [];
  const ekavian = collectMatches(text, ekavianMarkers);
  if (ekavian.length > 0) {
    warnings.push({
      code: 'EKAVIAN_DRIFT',
      message:
        'Tekst vjerovatno sadrži ekavske oblike; potrebna je provjera bez automatske zamjene.',
      matches: ekavian,
    });
  }
  const english = collectMatches(text, englishMarkers);
  if (english.length > 0) {
    warnings.push({
      code: 'UNTRANSLATED_ENGLISH',
      message: 'Tekst sadrži vjerovatno nepotrebne engleske riječi.',
      matches: english,
    });
  }
  if (detectScript(text) === 'MIXED') {
    warnings.push({
      code: 'MIXED_SCRIPT',
      message: 'Tekst miješa latinicu i ćirilicu.',
      matches: [],
    });
  }
  return warnings;
}

const digitWords: Record<string, string> = {
  '0': 'nula',
  '1': 'jedan',
  '2': 'dva',
  '3': 'tri',
  '4': 'četiri',
  '5': 'pet',
  '6': 'šest',
  '7': 'sedam',
  '8': 'osam',
  '9': 'devet',
};

function speakDigits(value: string): string {
  return [...value].map((digit) => digitWords[digit] ?? digit).join(' ');
}

export function normalizeCriticalValues(text: string): {
  displayText: string;
  spokenText: string;
  values: NormalizedValue[];
} {
  const values: NormalizedValue[] = [];
  const patterns: Array<{
    kind: NormalizedValue['kind'];
    expression: RegExp;
    convert: (value: string) => { display: string; spoken: string };
  }> = [
    {
      kind: 'currency',
      expression: /(?:€\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:EUR|€))/giu,
      convert(value) {
        const amount = value.replace(/[€\s]|EUR/giu, '').replace(',', '.');
        return { display: `${amount} EUR`, spoken: `${amount.replace('.', ' zarez ')} eura` };
      },
    },
    {
      kind: 'telephone',
      expression: /\+?\d(?:[\s/-]?\d){7,14}/gu,
      convert(value) {
        const prefix = value.trim().startsWith('+') ? '+' : '';
        const digits = value.replace(/\D/gu, '');
        return {
          display: `${prefix}${digits}`,
          spoken: `${prefix ? 'plus ' : ''}${speakDigits(digits)}`,
        };
      },
    },
    {
      kind: 'date',
      expression: /\b(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19|20)\d{2}\b/gu,
      convert(value) {
        const [day = '', month = '', year = ''] = value.split(/[./-]/u);
        return {
          display: `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}.`,
          spoken: `${day}. ${month}. ${year}. godine`,
        };
      },
    },
  ];

  for (const { kind, expression, convert } of patterns) {
    for (const match of text.matchAll(expression)) {
      if (
        values.some(
          (existing) =>
            match.index < existing.end && match.index + match[0].length > existing.start,
        )
      ) {
        continue;
      }
      const converted = convert(match[0]);
      values.push({
        kind,
        original: match[0],
        display: converted.display,
        spoken: converted.spoken,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  const ordered = values.sort((left, right) => left.start - right.start);
  const replace = (kind: 'display' | 'spoken'): string => {
    let cursor = 0;
    let output = '';
    for (const value of ordered) {
      output += text.slice(cursor, value.start) + value[kind];
      cursor = value.end;
    }
    return output + text.slice(cursor);
  };
  return { displayText: replace('display'), spokenText: replace('spoken'), values: ordered };
}

const latinToCyrillic: ReadonlyArray<readonly [string, string]> = [
  ['Dž', 'Џ'],
  ['dž', 'џ'],
  ['Lj', 'Љ'],
  ['lj', 'љ'],
  ['Nj', 'Њ'],
  ['nj', 'њ'],
  ['A', 'А'],
  ['a', 'а'],
  ['B', 'Б'],
  ['b', 'б'],
  ['C', 'Ц'],
  ['c', 'ц'],
  ['Č', 'Ч'],
  ['č', 'ч'],
  ['Ć', 'Ћ'],
  ['ć', 'ћ'],
  ['D', 'Д'],
  ['d', 'д'],
  ['Đ', 'Ђ'],
  ['đ', 'ђ'],
  ['E', 'Е'],
  ['e', 'е'],
  ['F', 'Ф'],
  ['f', 'ф'],
  ['G', 'Г'],
  ['g', 'г'],
  ['H', 'Х'],
  ['h', 'х'],
  ['I', 'И'],
  ['i', 'и'],
  ['J', 'Ј'],
  ['j', 'ј'],
  ['K', 'К'],
  ['k', 'к'],
  ['L', 'Л'],
  ['l', 'л'],
  ['M', 'М'],
  ['m', 'м'],
  ['N', 'Н'],
  ['n', 'н'],
  ['O', 'О'],
  ['o', 'о'],
  ['P', 'П'],
  ['p', 'п'],
  ['R', 'Р'],
  ['r', 'р'],
  ['S', 'С'],
  ['s', 'с'],
  ['Š', 'Ш'],
  ['š', 'ш'],
  ['T', 'Т'],
  ['t', 'т'],
  ['U', 'У'],
  ['u', 'у'],
  ['V', 'В'],
  ['v', 'в'],
  ['Z', 'З'],
  ['z', 'з'],
  ['Ž', 'Ж'],
  ['ž', 'ж'],
  ['Ś', 'С́'],
  ['ś', 'с́'],
  ['Ź', 'З́'],
  ['ź', 'з́'],
];

const cyrillicToLatin: ReadonlyArray<readonly [string, string]> = [
  ['Љ', 'Lj'],
  ['љ', 'lj'],
  ['Њ', 'Nj'],
  ['њ', 'nj'],
  ['Џ', 'Dž'],
  ['џ', 'dž'],
  ['С́', 'Ś'],
  ['с́', 'ś'],
  ['З́', 'Ź'],
  ['з́', 'ź'],
  ['А', 'A'],
  ['а', 'a'],
  ['Б', 'B'],
  ['б', 'b'],
  ['В', 'V'],
  ['в', 'v'],
  ['Г', 'G'],
  ['г', 'g'],
  ['Д', 'D'],
  ['д', 'd'],
  ['Ђ', 'Đ'],
  ['ђ', 'đ'],
  ['Е', 'E'],
  ['е', 'e'],
  ['Ж', 'Ž'],
  ['ж', 'ž'],
  ['З', 'Z'],
  ['з', 'z'],
  ['И', 'I'],
  ['и', 'i'],
  ['Ј', 'J'],
  ['ј', 'j'],
  ['К', 'K'],
  ['к', 'k'],
  ['Л', 'L'],
  ['л', 'l'],
  ['М', 'M'],
  ['м', 'm'],
  ['Н', 'N'],
  ['н', 'n'],
  ['О', 'O'],
  ['о', 'o'],
  ['П', 'P'],
  ['п', 'p'],
  ['Р', 'R'],
  ['р', 'r'],
  ['С', 'S'],
  ['с', 's'],
  ['Т', 'T'],
  ['т', 't'],
  ['Ћ', 'Ć'],
  ['ћ', 'ć'],
  ['У', 'U'],
  ['у', 'u'],
  ['Ф', 'F'],
  ['ф', 'f'],
  ['Х', 'H'],
  ['х', 'h'],
  ['Ц', 'C'],
  ['ц', 'c'],
  ['Ч', 'Č'],
  ['ч', 'č'],
  ['Ш', 'Š'],
  ['ш', 'š'],
];

function transformOutsideSpans(
  text: string,
  spans: readonly ProtectedSpan[],
  transform: (fragment: string) => string,
): string {
  let cursor = 0;
  let output = '';
  for (const span of spans) {
    output += transform(text.slice(cursor, span.start));
    output += span.value;
    cursor = span.end;
  }
  return output + transform(text.slice(cursor));
}

export function toCyrillic(text: string, protectedSpans: readonly ProtectedSpan[] = []): string {
  return transformOutsideSpans(text, protectedSpans, (fragment) => {
    let result = fragment;
    for (const [latin, cyrillic] of latinToCyrillic) result = result.replaceAll(latin, cyrillic);
    return result;
  });
}

export function toLatin(text: string, protectedSpans: readonly ProtectedSpan[] = []): string {
  return transformOutsideSpans(text.normalize('NFC'), protectedSpans, (fragment) => {
    let result = fragment;
    for (const [cyrillic, latin] of cyrillicToLatin) result = result.replaceAll(cyrillic, latin);
    return result;
  });
}

export function protectedSpansPreserved(
  correctedText: string,
  spans: readonly ProtectedSpan[],
): boolean {
  return spans.every((span) => correctedText.includes(span.value));
}

export function processMontenegrin(text: string, profile: LanguageProfile = {}): LanguageResult {
  const originalText = text.normalize('NFC');
  const protectedSpans = identifyProtectedSpans(originalText, profile);
  const warnings = detectLanguageWarnings(originalText);
  let correctedText = originalText
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s+([,.;:!?])/gu, '$1')
    .trim();

  if (profile.outputScript === 'CYRILLIC') {
    correctedText = toCyrillic(correctedText, identifyProtectedSpans(correctedText, profile));
  } else if (profile.outputScript === 'LATIN') {
    correctedText = toLatin(correctedText, identifyProtectedSpans(correctedText, profile));
  }

  if (!protectedSpansPreserved(correctedText, protectedSpans)) {
    warnings.push({
      code: 'PROTECTED_SPAN_CHANGED',
      message: 'Korekcija nije primijenjena jer zaštićeni sadržaj nije sačuvan.',
      matches: protectedSpans.map((span) => span.value),
    });
    correctedText = originalText;
  }

  const normalized = normalizeCriticalValues(correctedText);
  return {
    language: 'cnr',
    originalText,
    correctedText,
    displayText: normalized.displayText,
    spokenText: normalized.spokenText,
    detectedScript: detectScript(originalText),
    warnings,
    protectedSpans,
    normalizedValues: normalized.values,
    correctionApplied: correctedText !== originalText,
  };
}
