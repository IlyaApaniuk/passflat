import type { MetadataRoute } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD 4 FR-28 and FR-29 (spec 09 §Sitemap, robots, structured data and the submit page's
 * metadata): the roommate page is listed, the frozen lists and their listing details are not
 * (D78), and blog entries carry their lastmod.
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

import { prisma } from '@/lib/prisma';
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
  it('lists the roommate page and leaves out the frozen lists and listing details (D78)', async () => {
    const entries = await sitemap();

    expect(find(entries, '/warsaw/roommate')).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    // The mocked database holds an active replacement listing; neither it nor the two lists
    // may appear, under any path.
    const frozen = entries.filter((e) => /\/(replacement|sublet)(\/|$)/.test(e.url));
    expect(frozen.map((e) => e.url)).toEqual([]);
    expect(entries.some((e) => e.url.includes('pulawska-12-room'))).toBe(false);
    expect(prisma.listing.findMany).not.toHaveBeenCalled();
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

  it('keeps the building lastmod', async () => {
    const entries = await sitemap();

    expect(find(entries, '/warsaw/building/pulawska-12').lastModified).toEqual(
      new Date('2026-11-01T10:00:00Z'),
    );
  });
});
