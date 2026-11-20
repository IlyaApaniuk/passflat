import type { MetadataRoute } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD 4 FR-28 (spec 09 §Sitemap, robots, structured data and the submit page's metadata):
 * the roommate page outranks the frozen lists, blog entries carry their lastmod, and the
 * listing-detail loop stays until Q-1 (FR-29, T150).
 */

const BASE = 'https://passflat.com';

const data = vi.hoisted(() => ({
  posts: [] as { slug: string; locale: string; date: string }[],
}));

vi.mock('@/lib/site-url', () => ({ SITE_URL: 'https://passflat.com' }));
vi.mock('@/lib/feature-flags', () => ({ isDocumentTemplatesEnabled: () => false }));
vi.mock('@/lib/location-checker', () => ({ LOCATION_CHECKER_CITY_SLUG: 'warsaw' }));
vi.mock('@/lib/blog', () => ({ getAllPosts: () => data.posts }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findMany: vi.fn(async () => [{ slug: 'warsaw', districts: [{ slug: 'mokotow' }] }]),
    },
    listing: {
      findMany: vi.fn(async () => [
        {
          id: 'listing-1',
          slug: 'pulawska-12-room',
          type: 'replacement',
          updatedAt: new Date('2026-10-01T10:00:00Z'),
          building: { city: { slug: 'warsaw' } },
        },
      ]),
    },
    building: {
      findMany: vi.fn(async () => [
        {
          id: 'building-1',
          slug: 'pulawska-12',
          city: { slug: 'warsaw' },
          costReports: [{ createdAt: new Date('2026-11-01T10:00:00Z') }],
        },
      ]),
    },
  },
}));

import sitemap from './sitemap';

function find(entries: MetadataRoute.Sitemap, path: string) {
  const found = entries.filter((e) => e.url === `${BASE}${path}`);
  expect(found, path).toHaveLength(1);
  return found[0];
}

beforeEach(() => {
  // As getAllPosts returns them: newest first, one post per slug and locale.
  data.posts = [
    { slug: 'kaucja-zwrot', locale: 'en', date: '2026-09-12' },
    { slug: 'kaucja-zwrot', locale: 'pl', date: '2026-08-01' },
    { slug: 'hidden-rental-costs-warsaw', locale: 'pl', date: '2026-05-20' },
    { slug: 'hidden-rental-costs-warsaw', locale: 'ru', date: '2026-05-20' },
  ];
});

describe('sitemap', () => {
  it('ranks the roommate page above the frozen lists', async () => {
    const entries = await sitemap();

    expect(find(entries, '/warsaw/roommate')).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    expect(find(entries, '/warsaw/replacement')).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.4,
    });
    expect(find(entries, '/warsaw/sublet')).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.4,
    });
  });

  it('gives each guide one entry with the latest date of its locales as lastModified', async () => {
    const entries = await sitemap();
    const blog = entries.filter((e) => e.url.startsWith(`${BASE}/blog/`));

    expect(blog.map((e) => e.url)).toEqual([
      `${BASE}/blog/warsaw-rent-prices`,
      `${BASE}/blog/kaucja-zwrot`,
      `${BASE}/blog/hidden-rental-costs-warsaw`,
    ]);
    expect(find(entries, '/blog/kaucja-zwrot')).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.6,
      lastModified: new Date('2026-09-12'),
    });
    expect(find(entries, '/blog/hidden-rental-costs-warsaw').lastModified).toEqual(
      new Date('2026-05-20'),
    );
  });

  it('keeps the listing-detail loop and the building lastmod', async () => {
    const entries = await sitemap();

    expect(find(entries, '/warsaw/replacement/pulawska-12-room')).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8,
      lastModified: new Date('2026-10-01T10:00:00Z'),
    });
    expect(find(entries, '/warsaw/building/pulawska-12').lastModified).toEqual(
      new Date('2026-11-01T10:00:00Z'),
    );
  });
});
