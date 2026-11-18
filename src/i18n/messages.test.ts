import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Every copy change must touch all four locale files with identical key sets
// (CLAUDE.md, docs/specs/01-analytics-context.md#locale-key-parity). next-intl
// only reports a missing key at runtime, so this test is the guard.
const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;

function loadMessages(locale: string): Record<string, unknown> {
  const file = new URL(`./messages/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Dotted paths of every leaf value (anything that is not a nested object). */
function flattenLeafKeys(messages: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isPlainObject(value) ? flattenLeafKeys(value, path) : [path];
  });
}

const keysByLocale = new Map(
  LOCALES.map((locale) => [locale, new Set(flattenLeafKeys(loadMessages(locale)))]),
);

describe('locale messages', () => {
  it('loads a non-empty catalog for every locale', () => {
    for (const locale of LOCALES) {
      expect(keysByLocale.get(locale)?.size, `${locale}.json has no keys`).toBeGreaterThan(0);
    }
  });

  it('has identical leaf key sets in pl, en, ru and uk', () => {
    const allKeys = new Set([...keysByLocale.values()].flatMap((keys) => [...keys]));
    const missing: string[] = [];
    for (const locale of LOCALES) {
      const keys = keysByLocale.get(locale) ?? new Set<string>();
      for (const key of [...allKeys].sort()) {
        if (!keys.has(key)) missing.push(`${locale}.json is missing "${key}"`);
      }
    }
    expect(missing, `Missing locale keys:\n${missing.join('\n')}`).toEqual([]);
  });
});
