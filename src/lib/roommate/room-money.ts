import type { AreaReference } from '@/lib/cost-figures';
import { loadAreaReference } from '@/lib/cost-figures-query';
import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';

/**
 * Server side of the roommate page's room money block (spec 02 §Room money block, PRD 3
 * FR-22): the city's room reference from the shared figure loader, the same call the bot's
 * room cost reference makes for "any district" (`loadRoomCostAreas(city, [])`,
 * `room-costs.ts`), so the website and the bot show the same figures. Cached by the loader
 * itself (`costs` tag); no second aggregation.
 */

/** Whether the roommate page of `citySlug` has the block: only the checker city (`warsaw`). */
export function pageHasRoomMoneyBlock(citySlug: string): boolean {
  return citySlug === LOCATION_CHECKER_CITY_SLUG;
}

/**
 * The city's room reference (`districtId: null`, `rentalType: 'room'`); null when the city has
 * no room report, and on a database error, which only drops the block's figures line (only
 * the error's message is logged).
 */
export async function loadRoomMoneyReference(cityId: string): Promise<AreaReference | null> {
  try {
    return await loadAreaReference({ districtId: null, cityId, rentalType: 'room' });
  } catch (error) {
    console.error(
      '[roommate] room money figures failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return null;
  }
}
