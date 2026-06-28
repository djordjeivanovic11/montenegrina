'use client';

import { useCallback, useMemo } from 'react';

import cnr from './cnr.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };

export type Locale = 'en' | 'cnr';

const dictionaries: Record<Locale, Record<string, unknown>> = { en, cnr };

function resolve(dict: Record<string, unknown>, key: string): string {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : key;
}

export function useI18n(locale: Locale) {
  const dict = dictionaries[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let value = resolve(dict, key);
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.replace(`{${name}}`, replacement);
        }
      }
      return value;
    },
    [dict],
  );

  return useMemo(() => ({ t, locale }), [t, locale]);
}

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'cnr';
  const stored = localStorage.getItem('montenegrina-locale');
  return stored === 'en' ? 'en' : 'cnr';
}

export function storeLocale(locale: Locale): void {
  localStorage.setItem('montenegrina-locale', locale);
}
