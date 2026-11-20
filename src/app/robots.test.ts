import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD 4 FR-28 (spec 09 §Sitemap, robots, structured data and the submit page's metadata):
 * link-preview images stay crawlable, private areas are closed in every locale, and a
 * non-indexable deployment closes everything as before.
 */

const PRIVATE = ['/api/', '/dashboard/', '/messages/', '/create-listing/', '/auth/', '/admin/'];

async function loadRobots(indexable: boolean) {
  vi.resetModules();
  vi.doMock('@/lib/seo', () => ({ isIndexable: indexable }));
  vi.doMock('@/lib/site-url', () => ({ SITE_URL: 'https://passflat.com' }));
  const { default: robots } = await import('./robots');
  return robots();
}

afterEach(() => {
  vi.doUnmock('@/lib/seo');
  vi.doUnmock('@/lib/site-url');
});

describe('robots.txt', () => {
  it('allows the site and the OG images, and closes each private path bare and per locale', async () => {
    const output = await loadRobots(true);
    const rules = output.rules as { userAgent: string; allow: string[]; disallow: string[] };

    expect(rules.userAgent).toBe('*');
    expect(rules.allow).toEqual(['/', '/api/og']);
    expect(rules.disallow).toHaveLength(24);
    expect(rules.disallow).toEqual(
      PRIVATE.flatMap((path) => [path, `/en${path}`, `/ru${path}`, `/uk${path}`]),
    );
    expect(rules.disallow).not.toContain('/pl/dashboard/');
    expect(output.sitemap).toBe('https://passflat.com/sitemap.xml');
  });

  it('disallows everything when the deployment is not indexable', async () => {
    const output = await loadRobots(false);

    expect(output).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});
