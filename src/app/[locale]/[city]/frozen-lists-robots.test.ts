import { describe, expect, it, vi } from 'vitest';

/**
 * PRD 4 FR-29 (D78, spec 09 §Sitemap, robots, structured data and the submit page's metadata):
 * the frozen lists /[city]/replacement and /[city]/sublet stay reachable but carry
 * `noindex, follow`, with their alternates unchanged.
 */

vi.mock('@/lib/site-url', () => ({ SITE_URL: 'https://passflat.com' }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'ru',
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { city: { findUnique: vi.fn(async () => ({ nameKey: 'cities.warsaw' })) } },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/components/listings/listings-page-client', () => ({ ListingsPageClient: () => null }));
vi.mock('@/lib/listings-query', () => ({
  queryListings: vi.fn(),
  serializeListing: vi.fn(),
  parseSearchParams: vi.fn(),
  getCityWithDistricts: vi.fn(),
}));

import { generateMetadata as replacementMetadata } from './replacement/page';
import { generateMetadata as subletMetadata } from './sublet/page';

const params = Promise.resolve({ locale: 'ru', city: 'warsaw' });
const searchParams = Promise.resolve({});

describe.each([
  ['replacement', replacementMetadata],
  ['sublet', subletMetadata],
])('/[city]/%s metadata', (type, generateMetadata) => {
  it('is noindex, follow and keeps its alternates', async () => {
    const metadata = await generateMetadata({ params, searchParams });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toEqual({
      canonical: `https://passflat.com/ru/warsaw/${type}`,
      languages: {
        pl: `https://passflat.com/warsaw/${type}`,
        en: `https://passflat.com/en/warsaw/${type}`,
        ru: `https://passflat.com/ru/warsaw/${type}`,
        uk: `https://passflat.com/uk/warsaw/${type}`,
        'x-default': `https://passflat.com/warsaw/${type}`,
      },
    });
  });
});
