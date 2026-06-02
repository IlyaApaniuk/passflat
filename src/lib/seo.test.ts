import { describe, expect, it } from 'vitest';

import { getAlternates, getOgImage } from './seo';

describe('getAlternates', () => {
  it('builds a canonical URL from the pathname', () => {
    const { canonical } = getAlternates('/about');
    expect(canonical).toBe('https://passflat.com/about');
  });

  it('leaves the default locale (pl) unprefixed and prefixes the rest', () => {
    const { languages } = getAlternates('/about');
    expect(languages.pl).toBe('https://passflat.com/about');
    expect(languages.en).toBe('https://passflat.com/en/about');
    expect(languages.ru).toBe('https://passflat.com/ru/about');
    expect(languages.uk).toBe('https://passflat.com/uk/about');
  });

  it('includes an unprefixed x-default entry', () => {
    const { languages } = getAlternates('/contact');
    expect(languages['x-default']).toBe('https://passflat.com/contact');
  });
});

describe('getOgImage', () => {
  it('encodes the title into the OG endpoint URL', () => {
    const og = getOgImage('Hello World');
    expect(og.url).toBe('https://passflat.com/api/og?title=Hello+World');
    expect(og).toMatchObject({ width: 1200, height: 630, type: 'image/png' });
  });

  it('adds the subtitle param only when provided', () => {
    expect(getOgImage('Title').url).not.toContain('subtitle');
    expect(getOgImage('Title', 'Sub').url).toContain('subtitle=Sub');
  });
});
