import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, getCityWithDistricts, cityFindUnique, costReportFindMany, loadSplit } =
  vi.hoisted(() => ({
    findMany: vi.fn(),
    getCityWithDistricts: vi.fn(),
    cityFindUnique: vi.fn(),
    costReportFindMany: vi.fn(),
    loadSplit: vi.fn(async (): Promise<unknown> => null),
  }));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(),
  getTranslations: async () => (key: string) => (key === 'city.warsaw' ? 'Warsaw' : key),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    roommateProfile: { findMany },
    city: { findUnique: cityFindUnique },
    costReport: { findMany: costReportFindMany },
  },
}));
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
// The split's own loader is tested over reports in `per-person-consistency.test.ts`.
vi.mock('@/lib/roommate/room-costs', () => ({ loadWarsawPerPersonSplit: loadSplit }));

import { getLocale } from 'next-intl/server';
import { getAlternates, getOgImage } from '@/lib/seo';
import RoommatePage, { generateMetadata } from './page';

type ClientProps = {
  citySlug: string;
  listingType: string;
  districts: { slug: string; name: string }[];
  flatmateCounts?: unknown;
  roomMoney?: {
    reference: { level: string; slug: string; name: string; summary: unknown };
    areaName: string;
  } | null;
  perPersonSplit?: unknown;
  perPersonArea?: string;
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
    cityFindUnique.mockResolvedValue({ slug: 'warsaw', nameKey: 'city.warsaw' });
    costReportFindMany.mockResolvedValue([]);
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
      byDistrict: { mokotow: 2, wola: 1 },
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

  it('another city: no counts query and no counts passed', async () => {
    const props = await render('krakow');
    expect(findMany).not.toHaveBeenCalled();
    expect(props.flatmateCounts).toBeUndefined();
  });

  // The block itself still renders without counts (`roommatePageLayout`, PRD 4 FR-2).
  it('without NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: no counts query and no counts passed', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    const props = await render('warsaw');
    expect(findMany).not.toHaveBeenCalled();
    expect(props.flatmateCounts).toBeUndefined();
  });
});

describe('/[city]/roommate page: the room money block figures (spec 02 §Room money block)', () => {
  const room = (source: string, total: number) => ({
    source,
    rentalType: 'room',
    totalMonthlyAvg: total,
    utilitiesComplete: true,
  });

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
    cityFindUnique.mockReset();
    cityFindUnique.mockResolvedValue({ slug: 'warsaw', nameKey: 'city.warsaw' });
    costReportFindMany.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('warsaw: the city room reference with the city name rendered on the server', async () => {
    costReportFindMany.mockResolvedValue([room('user', 1_600), room('user', 1_800)]);
    const props = await render('warsaw');
    expect(costReportFindMany).toHaveBeenCalledTimes(1);
    expect(costReportFindMany.mock.calls[0][0].where).toEqual({
      building: { cityId: 'city-warsaw' },
      isVisible: true,
      rentalType: 'room',
    });
    expect(cityFindUnique).toHaveBeenCalledWith({
      where: { id: 'city-warsaw' },
      select: { slug: true, nameKey: true },
    });
    expect(props.roomMoney?.areaName).toBe('Warsaw');
    expect(props.roomMoney?.reference).toMatchObject({
      level: 'city',
      slug: 'warsaw',
      name: 'city.warsaw',
    });
  });

  it('warsaw without room reports: null, so the block shows without the figures line', async () => {
    costReportFindMany.mockResolvedValue([]);
    const props = await render('warsaw');
    expect(props.roomMoney).toBeNull();
  });

  it('warsaw, database error in the figures: null and the page still renders with its counts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    costReportFindMany.mockRejectedValue(new Error('timeout'));
    const props = await render('warsaw');
    expect(props.roomMoney).toBeNull();
    expect(props.flatmateCounts).toEqual({ status: 'counts', total: 0, top: [], byDistrict: {} });
  });

  it('the room money block does not need the bot username', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    costReportFindMany.mockResolvedValue([room('user', 1_600)]);
    const props = await render('warsaw');
    expect(props.flatmateCounts).toBeUndefined();
    expect(props.roomMoney?.reference.level).toBe('city');
  });

  it('another city: no figure query and no block', async () => {
    const props = await render('krakow');
    expect(costReportFindMany).not.toHaveBeenCalled();
    expect(cityFindUnique).not.toHaveBeenCalled();
    expect(props.roomMoney).toBeUndefined();
  });
});

describe('/[city]/roommate page: the per-person line (spec 08 §Per-person line, PRD 4 FR-13)', () => {
  const SPLIT = { value: 2_450, n: 5, level: 'city', name: 'city.warsaw' };

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
    cityFindUnique.mockResolvedValue({ slug: 'warsaw', nameKey: 'city.warsaw' });
    costReportFindMany.mockResolvedValue([]);
    loadSplit.mockReset();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('warsaw: the bot split in the parallel load, its own area named on the server', async () => {
    loadSplit.mockResolvedValue(SPLIT);
    const props = await render('warsaw');
    expect(loadSplit).toHaveBeenCalledTimes(1);
    expect(props.perPersonSplit).toEqual(SPLIT);
    expect(props.perPersonArea).toBe('Warsaw');
  });

  it('a district-level split keeps its district name as is', async () => {
    loadSplit.mockResolvedValue({ ...SPLIT, level: 'district', name: 'Mokotów' });
    expect((await render('warsaw')).perPersonArea).toBe('Mokotów');
  });

  it('null (no figure) or a rejection → no line; the page still renders with its counts', async () => {
    loadSplit.mockResolvedValue(null);
    let props = await render('warsaw');
    expect(props.perPersonSplit).toBeNull();
    expect(props.perPersonArea).toBeUndefined();

    loadSplit.mockRejectedValue(new Error('timeout'));
    props = await render('warsaw');
    expect(props.perPersonSplit).toBeNull();
    expect(props.perPersonArea).toBeUndefined();
    expect(props.flatmateCounts).toEqual({ status: 'counts', total: 0, top: [], byDistrict: {} });
  });

  it('needs no bot username (a cost figure)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    loadSplit.mockResolvedValue(SPLIT);
    expect((await render('warsaw')).perPersonArea).toBe('Warsaw');
  });

  it('another city (no flatmate block): no split load', async () => {
    const props = await render('krakow');
    expect(loadSplit).not.toHaveBeenCalled();
    expect(props.perPersonSplit).toBeNull();
    expect(props.perPersonArea).toBeUndefined();
  });
});

describe('/[city]/roommate metadata (spec 08 §Roommate page shell and metadata, PRD 4 FR-3)', () => {
  beforeEach(() => {
    cityFindUnique.mockReset();
    vi.mocked(getLocale).mockResolvedValue('pl');
  });

  const metadata = () =>
    generateMetadata({
      params: Promise.resolve({ locale: 'pl', city: 'warsaw' }),
      searchParams: Promise.resolve({}),
    });

  it('the title is the key itself: no " — {city}" (the layout template adds " — Passflat")', async () => {
    const result = await metadata();
    expect(result.title).toBe('listings.titleRoommate');
    expect(result.description).toBe('listings.roommateMetaDescription');
    expect(result.openGraph).toMatchObject({
      title: 'listings.titleRoommate',
      description: 'listings.roommateMetaDescription',
    });
    // The city name is no longer looked up: both keys name Warsaw themselves.
    expect(cityFindUnique).not.toHaveBeenCalled();
  });

  it('keeps the URL, canonical, hreflang and the OG image call', async () => {
    const result = await metadata();
    expect(result.alternates).toEqual(getAlternates('/warsaw/roommate', 'pl'));
    expect(result.openGraph?.images).toEqual([
      getOgImage('listings.titleRoommate', 'listings.roommateMetaDescription'),
    ]);
  });
});
