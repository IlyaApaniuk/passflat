import { unstable_cache } from 'next/cache';

import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';

import { loadRoommateCounts } from './counts';
import type { FlatmateBlockCounts } from './flatmate-block';

/**
 * Server side of the roommate page's "Looking for someone to rent with" block (spec 02 §Find a
 * flatmate). Website only: the bot reads `loadRoommateCounts` directly, so this bare
 * `unstable_cache` never runs under `bot:dev`.
 */

/** **Assumption** (spec 02 §Find a flatmate, D68): the website's counts are at most an hour old. */
export const FLATMATE_COUNTS_REVALIDATE_SECONDS = 3600;

const cachedWebsiteCounts = unstable_cache(
  async (): Promise<FlatmateBlockCounts> => {
    // Without a viewer the counts are always the `top` kind (the Warsaw total and the most
    // named districts).
    const counts = await loadRoommateCounts();
    return {
      status: 'counts',
      total: counts.total,
      top: counts.kind === 'top' ? counts.top : [],
    };
  },
  ['roommate-website-counts-v1'],
  { revalidate: FLATMATE_COUNTS_REVALIDATE_SECONDS },
);

/**
 * The block's counts, cached for an hour. A database error is not cached: the block shows
 * without counts and the next request tries again. Only the error's message is logged.
 */
export async function loadFlatmateBlockCounts(): Promise<FlatmateBlockCounts> {
  try {
    return await cachedWebsiteCounts();
  } catch (error) {
    console.error(
      '[roommate] website counts failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return { status: 'unavailable' };
  }
}

/**
 * Whether the roommate page of `citySlug` has the block: only the checker city (`warsaw`), and
 * only when the bot is configured (`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`), so no other page loads
 * the counts.
 */
export function pageHasFlatmateBlock(
  citySlug: string,
  botUsername: string | undefined = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
): boolean {
  return citySlug === LOCATION_CHECKER_CITY_SLUG && Boolean(botUsername);
}
