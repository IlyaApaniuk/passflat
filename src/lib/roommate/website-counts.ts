import { revalidateTag, unstable_cache } from 'next/cache';

import { loadRoommateCounts } from './counts';
import type { FlatmateBlockCounts } from './flatmate-block';

/**
 * Server side of the website's profile counts: the roommate page's "Looking for someone to rent
 * with" block (spec 02 §Find a flatmate), the flatmate callout and the district page's count line
 * (spec 09 §District section). The bot reads `loadRoommateCounts` directly and imports only
 * `revalidateRoommateCounts` from here, so this bare `unstable_cache` never runs under `bot:dev`
 * (creating it does not throw; calling it outside Next would). Whether the roommate page loads them is
 * `canLoadFlatmateCounts` (`flatmate-block.ts`, client-safe).
 */

/** **Assumption** (spec 02 §Find a flatmate, D68): the website's counts are at most an hour old. */
export const FLATMATE_COUNTS_REVALIDATE_SECONDS = 3600;

/**
 * The cache tag of the website's counts (spec 09 §District section): `revalidateRoommateCounts`
 * expires it, and with it the ISR renders of the pages that read the counts (district, hub, home).
 */
const ROOMMATE_COUNTS_TAG = 'roommate-counts';

const cachedWebsiteCounts = unstable_cache(
  async (): Promise<FlatmateBlockCounts> => {
    // Without a viewer the counts are always the `top` kind (the Warsaw total, the most named
    // districts and every named district's own count).
    const counts = await loadRoommateCounts();
    return {
      status: 'counts',
      total: counts.total,
      top: counts.kind === 'top' ? counts.top : [],
      byDistrict: (counts.kind === 'top' && counts.byDistrict) || {},
    };
  },
  // v2: `byDistrict` added (T147, spec 03 §Loaders rule: a shape change bumps the key).
  ['roommate-website-counts-v2'],
  { revalidate: FLATMATE_COUNTS_REVALIDATE_SECONDS, tags: [ROOMMATE_COUNTS_TAG] },
);

/**
 * The website's counts, cached for an hour. A database error is not cached: the block shows
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
 * Expires the website's counts now (spec 09 §District section, freshness): called after every
 * profile write that changes who is counted (a profile saved or edited, deleted, hidden or restored
 * by moderation, the daily cron's expiry and deletion, the closing run). `{ expire: 0 }` is the
 * Next 16 form `revalidate-costs.ts` uses; any other profile would serve the old counts once more.
 *
 * Never throws: the write it follows has already succeeded. Outside a Next request (`bot:dev`, a
 * script, a test) `revalidateTag` throws and there is no cache to expire, so nothing is done.
 */
export function revalidateRoommateCounts(): void {
  try {
    revalidateTag(ROOMMATE_COUNTS_TAG, { expire: 0 });
  } catch {
    // No Next request store: nothing to expire.
  }
}
