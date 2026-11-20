import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadAreaReference } = vi.hoisted(() => ({ loadAreaReference: vi.fn() }));

vi.mock('@/lib/cost-figures-query', () => ({ loadAreaReference }));

import { loadRoomMoneyReference, pageHasRoomMoneyBlock } from './room-money';

const REFERENCE = {
  level: 'city',
  slug: 'warsaw',
  name: 'city.warsaw',
  summary: { reportCount: 1, groups: {} },
};

describe('room money block, server side (spec 02 §Room money block)', () => {
  beforeEach(() => {
    loadAreaReference.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the city room reference through the shared loader, as the bot does for "any district"', async () => {
    loadAreaReference.mockResolvedValue(REFERENCE);
    await expect(loadRoomMoneyReference('city-1')).resolves.toBe(REFERENCE);
    expect(loadAreaReference).toHaveBeenCalledTimes(1);
    expect(loadAreaReference).toHaveBeenCalledWith({
      districtId: null,
      cityId: 'city-1',
      rentalType: 'room',
    });
  });

  it('no room report in the city: null (the block without the figures line)', async () => {
    loadAreaReference.mockResolvedValue(null);
    await expect(loadRoomMoneyReference('city-1')).resolves.toBeNull();
  });

  it('a database error: null, logging only the error message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadAreaReference.mockRejectedValue(new Error('connection refused'));
    await expect(loadRoomMoneyReference('city-1')).resolves.toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[roommate] room money figures failed', 'connection refused');
  });

  it('only the checker city (warsaw) has the block', () => {
    expect(pageHasRoomMoneyBlock('warsaw')).toBe(true);
    expect(pageHasRoomMoneyBlock('krakow')).toBe(false);
    expect(pageHasRoomMoneyBlock('')).toBe(false);
  });
});
