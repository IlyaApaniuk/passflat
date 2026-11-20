import { beforeEach, describe, expect, it, vi } from 'vitest';

const { count, findMany } = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({ prisma: { listing: { count, findMany } } }));

import { countCityListings, queryListings } from './listings-query';

const CITY_WHERE = { building: { cityId: 'city-1' }, status: 'active', type: 'roommate' };

describe('countCityListings', () => {
  beforeEach(() => {
    count.mockReset();
    findMany.mockReset();
  });

  it('counts active listings of the type in the city with one count query', async () => {
    count.mockResolvedValue(4);
    await expect(countCityListings({ cityId: 'city-1', type: 'roommate' })).resolves.toBe(4);
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ where: CITY_WHERE });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('uses the queryListings where without the filter params', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(4);
    await queryListings({
      cityId: 'city-1',
      type: 'roommate',
      district: 'mokotow',
      priceMax: 1500,
      rooms: 2,
      areaMin: 20,
      amenities: ['wifi'],
    });
    await countCityListings({ cityId: 'city-1', type: 'roommate' });

    const listWhere = findMany.mock.calls[0][0].where;
    expect(listWhere).toMatchObject({ status: 'active', type: 'roommate' });
    expect(listWhere.building).toEqual({ cityId: 'city-1', district: { slug: 'mokotow' } });
    expect(listWhere.pricePerPerson).toEqual({ lte: 1500 });
    // The filters of the list query never leak into the city count.
    expect(count).toHaveBeenCalledWith({ where: CITY_WHERE });
  });
});
