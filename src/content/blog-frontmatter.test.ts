import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN, type HonestyLocale } from '@/i18n/honesty-rules';
import { parseFrontMatter } from '@/lib/blog';

// Spec 09 §Blog frontmatter (PRD 4 FR-23, D25): a guide's title and description are what search
// shows, so they hold no claim word of the honesty rules and no percentage (no invented
// statistics). The test defines the set: every frontmatter it flags is rewritten.

const BLOG_DIR = join(process.cwd(), 'src/content/blog');
const FILE_NAME = /^(.+)-(en|pl|ru|uk)\.mdx$/;
const PERCENTAGE = /\d+\s?%/;
const FIELDS = ['title', 'description'] as const;

/**
 * `<file>:<field>` → one-line reason, for a match that is not a claim about figures. Starts
 * empty (spec 09); an entry must still match, or the allow-list test fails.
 */
const ALLOWED_FRONTMATTER_MATCHES: Record<string, string> = {};

interface Guide {
  file: string;
  slug: string;
  locale: HonestyLocale;
  data: ReturnType<typeof parseFrontMatter>['data'];
}

function loadGuides(): Guide[] {
  return readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .sort()
    .map((file) => {
      const match = file.match(FILE_NAME);
      if (!match) throw new Error(`${file}: the name does not end in -<locale>.mdx`);
      const { data } = parseFrontMatter(readFileSync(join(BLOG_DIR, file), 'utf-8'));
      return { file, slug: match[1], locale: match[2] as HonestyLocale, data };
    });
}

const GUIDES = loadGuides();

function claims(locale: HonestyLocale, value: string): string[] {
  const found: string[] = [];
  const word = value.match(FORBIDDEN[locale]);
  if (word) found.push(word[0]);
  const percentage = value.match(PERCENTAGE);
  if (percentage) found.push(percentage[0]);
  return found;
}

function guide(slug: string, locale: HonestyLocale): Guide {
  const found = GUIDES.find((g) => g.slug === slug && g.locale === locale);
  if (!found) throw new Error(`no guide ${slug}-${locale}`);
  return found;
}

describe('blog frontmatter (spec 09 §Blog frontmatter)', () => {
  it('reads every guide in four locales, with the locale of its file name', () => {
    expect(GUIDES.length).toBeGreaterThan(0);
    const slugs = new Set(GUIDES.map((g) => g.slug));
    for (const slug of slugs) {
      expect(GUIDES.filter((g) => g.slug === slug).map((g) => g.locale)).toEqual([
        'en',
        'pl',
        'ru',
        'uk',
      ]);
    }
    for (const g of GUIDES) {
      expect(g.data.locale, g.file).toBe(g.locale);
      expect(g.data.slug, g.file).toBe(g.slug);
      expect(g.data.title, g.file).toBeTruthy();
      expect(g.data.description, g.file).toBeTruthy();
    }
  });

  it('no title or description claims verified, checked, real or market figures, or a percentage', () => {
    const flagged: string[] = [];
    for (const g of GUIDES) {
      for (const field of FIELDS) {
        if (`${g.file}:${field}` in ALLOWED_FRONTMATTER_MATCHES) continue;
        const found = claims(g.locale, g.data[field]);
        if (found.length > 0) flagged.push(`${g.file} ${field}: ${found.join(', ')}`);
      }
    }
    expect(flagged).toEqual([]);
  });

  it('every allowed match still matches, with a reason', () => {
    for (const [entry, reason] of Object.entries(ALLOWED_FRONTMATTER_MATCHES)) {
      const [file, field] = entry.split(':');
      const g = GUIDES.find((candidate) => candidate.file === file);
      expect(g, entry).toBeDefined();
      expect(FIELDS as readonly string[], entry).toContain(field);
      const value = g!.data[field as (typeof FIELDS)[number]];
      expect(claims(g!.locale, value).length, entry).toBeGreaterThan(0);
      expect(reason.trim().length, entry).toBeGreaterThan(0);
    }
  });

  it('the check catches a claim word and a percentage in every locale', () => {
    expect(claims('en', 'What landlords actually check')).not.toEqual([]);
    expect(claims('en', '77% of tenants got it back in full')).toEqual(['in full', '77%']);
    expect(claims('pl', 'Tylko 77 % najemców')).toEqual(['77 %']);
    expect(claims('pl', 'realnej ceny dzielnicy')).not.toEqual([]);
    expect(claims('pl', 'rzeczywistych kosztach')).not.toEqual([]);
    expect(claims('ru', 'реальной стоимости аренды')).not.toEqual([]);
    expect(claims('uk', 'справжньої ціни району')).not.toEqual([]);
    expect(claims('en', 'Getting your deposit (kaucja) back in Warsaw: the rules')).toEqual([]);
    expect(claims('pl', 'Zwrot kaucji: zasady i termin')).toEqual([]);
  });

  it('the deposit descriptions name the Telegram bot in ru and uk only (D63, D50)', () => {
    for (const locale of ['ru', 'uk'] as const) {
      expect(guide('rental-deposit-kaucja-warsaw', locale).data.description).toMatch(/Telegram/);
    }
    for (const locale of ['en', 'pl'] as const) {
      expect(guide('rental-deposit-kaucja-warsaw', locale).data.description).not.toMatch(
        /telegram|\bbot/i,
      );
    }
  });
});
