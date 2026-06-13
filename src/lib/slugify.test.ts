import { describe, expect, it } from 'vitest';

import { generateListingSlug, transliterate } from './slugify';

// A real-shaped listing id; the slug suffix is its first 8 hex chars (hyphens stripped).
const ID = '7c060c8d-a2e3-4f5f-8dfc-5d3b21e3e8b3';
const SUFFIX = '7c060c8d';

describe('transliterate', () => {
  it('leaves Latin / ASCII text unchanged', () => {
    expect(transliterate('Cesja 2 pokoje, 50m2!')).toBe('Cesja 2 pokoje, 50m2!');
  });

  it('maps Polish diacritics to Latin', () => {
    expect(transliterate('ąćęłńóśźż')).toBe('acelnoszz');
    expect(transliterate('Łódź')).toBe('lodz');
  });

  it('maps Russian Cyrillic to Latin, preserving case', () => {
    expect(transliterate('Привет')).toBe('Privet');
    // ж→zh, щ→sch, ё→e, ъ/ь→removed
    expect(transliterate('жщёъь')).toBe('zhsche');
    expect(transliterate('Щука')).toBe('Schuka');
  });

  it('maps Ukrainian-specific letters (і ї є ґ)', () => {
    expect(transliterate('їєґі')).toBe('yiyegi');
    expect(transliterate('Київ')).toBe('Kiyiv');
  });

  it('leaves unmapped non-Latin characters as-is', () => {
    expect(transliterate('日本語')).toBe('日本語');
  });
});

describe('generateListingSlug', () => {
  it('builds a slug from a Polish title + id suffix', () => {
    expect(generateListingSlug('Cesja 2 pokoje Mokotów', ID)).toBe(
      `cesja-2-pokoje-mokotow-${SUFFIX}`,
    );
  });

  it('transliterates a Russian title', () => {
    expect(generateListingSlug('Сдам 2-комнатную в Мокотуве', ID)).toBe(
      `sdam-2-komnatnuyu-v-mokotuve-${SUFFIX}`,
    );
  });

  it('transliterates a Ukrainian title', () => {
    expect(generateListingSlug('Кімната для дівчини, Воля', ID)).toBe(
      `kimnata-dlya-divchini-volya-${SUFFIX}`,
    );
  });

  it('falls back to just the id suffix when the title slugifies to nothing', () => {
    expect(generateListingSlug('🏠🏠🏠', ID)).toBe(SUFFIX);
    expect(generateListingSlug('!!! ??? ...', ID)).toBe(SUFFIX);
    expect(generateListingSlug('', ID)).toBe(SUFFIX);
    expect(generateListingSlug('日本語', ID)).toBe(SUFFIX);
  });

  it('collapses whitespace + punctuation and trims separators', () => {
    expect(generateListingSlug('  Hello,   World!!!  ', ID)).toBe(`hello-world-${SUFFIX}`);
  });

  it('keeps digits', () => {
    expect(generateListingSlug('2 pokoje 50m2', ID)).toBe(`2-pokoje-50m2-${SUFFIX}`);
  });

  it('derives the suffix from the id (hyphens stripped, first 8 chars)', () => {
    const slug = generateListingSlug('Test', ID);
    expect(slug).toBe(`test-${SUFFIX}`);
    expect(SUFFIX).toHaveLength(8);
    expect(SUFFIX).not.toContain('-');
  });

  it('is deterministic for the same title + id', () => {
    expect(generateListingSlug('Stable Title', ID)).toBe(generateListingSlug('Stable Title', ID));
  });

  it('never produces a double hyphen', () => {
    expect(generateListingSlug('a -- b // c', ID)).toBe(`a-b-c-${SUFFIX}`);
  });

  it('caps the title base at 60 chars (no trailing hyphen before the suffix)', () => {
    const slug = generateListingSlug('a'.repeat(80), ID);
    expect(slug).toBe(`${'a'.repeat(60)}-${SUFFIX}`);
    expect(slug).not.toMatch(/--/);
  });

  it('trims a separator left at the 60-char truncation boundary', () => {
    // 59 chars, then a space that becomes "-" at position 60 → must be trimmed.
    const slug = generateListingSlug(`${'a'.repeat(59)} bbb`, ID);
    expect(slug).toBe(`${'a'.repeat(59)}-${SUFFIX}`);
  });
});
