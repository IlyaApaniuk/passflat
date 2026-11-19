import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, getCityWithDistricts } = vi.hoisted(() => ({
  findMany: vi.fn(),
  getCityWithDistricts: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(), getTranslations: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { roommateProfile: { findMany } } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/listings-query', () => ({
  getCityWithDistricts,
  queryListings: async () => [],
  countCityListings: async () => 0,
  serializeListing: (listing: unknown) => listing,
  parseSearchParams: () => ({}),
}));
vi.mock('@/components/listings/listings-page-client', () => ({ ListingsPageClient: () => null }));

import RoommatePage from './page';

type ClientProps = {
  citySlug: string;
  listingType: string;
  districts: { slug: string; name: string }[];
  flatmateCounts?: unknown;
};

function cityRecord(slug: string) {
  return {
    id: `city-${slug}`,
    slug,
    bounds: null,
    districts: [
      { slug: 'mokotow', nameKey: 'Mokotów' },
      { slug: 'wola', nameKey: 'Wola' },
    ],
  };
}

async function render(city: string): Promise<ClientProps> {
  getCityWithDistricts.mockResolvedValue(cityRecord(city));
  const element = (await RoommatePage({
    params: Promise.resolve({ locale: 'en', city }),
    searchParams: Promise.resolve({}),
  })) as ReactElement<ClientProps>;
  return element.props;
}

describe('/[city]/roommate page: the flatmate block counts (spec 02 §Find a flatmate)', () => {
  beforeEach(() => {
    findMany.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('warsaw with a configured bot: loads the counts on the server and passes them down', async () => {
    findMany.mockResolvedValue([
      { id: '1', districtSlugs: ['mokotow'], anyDistrict: false },
      { id: '2', districtSlugs: ['mokotow', 'wola'], anyDistrict: false },
    ]);
    const props = await render('warsaw');
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(props.flatmateCounts).toEqual({
      status: 'counts',
      total: 2,
      top: [
        { slug: 'mokotow', count: 2 },
        { slug: 'wola', count: 1 },
      ],
    });
    // The block names districts from the list the district filter already receives.
    expect(props.districts).toEqual([
      { slug: 'mokotow', name: 'Mokotów' },
      { slug: 'wola', name: 'Wola' },
    ]);
  });

  it('warsaw, database error: the page still renders and the block gets "unavailable"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    findMany.mockRejectedValue(new Error('timeout'));
    const props = await render('warsaw');
    expect(props.flatmateCounts).toEqual({ status: 'unavailable' });
    expect(props.listingType).toBe('roommate');
  });

  it('another city: no counts query and no block', async () => {
    const props = await render('krakow');
    expect(findMany).not.toHaveBeenCalled();
    expect(props.flatmateCounts).toBeUndefined();
  });

  it('without NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: no counts query and no block', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    const props = await render('warsaw');
    expect(findMany).not.toHaveBeenCalled();
    expect(props.flatmateCounts).toBeUndefined();
  });
});
