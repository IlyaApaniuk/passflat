import { revalidatePath, revalidateTag } from 'next/cache';
import { routing } from '@/i18n/routing';

/** Tag carried by every cached cost aggregate (lib/cost-aggregates.ts, the
 *  building page's district/city baselines, the costs overview page). */
const COSTS_TAG = 'costs';

/**
 * Purge the cost caches after a report is written or edited.
 *
 * Two layers have to be dropped. The tagged `unstable_cache` aggregates, and —
 * separately — the building page's own ISR entry, which holds a rendered page
 * for an hour (`revalidate = 3600` there, kept for crawlers). Without the second
 * one a fresh report shows up on its building page only an hour later, breaking
 * the "I submitted → I see myself" loop the submit flow ends on.
 *
 * Never throws: the DB write it follows has already succeeded, so a cache
 * failure must not turn a saved report into a 500.
 */
export function revalidateCostSurfaces(target?: {
  citySlug?: string | null;
  buildingSlug?: string | null;
  districtSlug?: string | null;
}): void {
  try {
    // `{ expire: 0 }` = expire now. Next 16 deprecated the single-argument form,
    // and every other profile means stale-while-revalidate — which would still
    // serve the pre-submit numbers to the request right after the submit.
    revalidateTag(COSTS_TAG, { expire: 0 });

    const citySlug = target?.citySlug;
    if (!citySlug) return;

    // Only pages with their own ISR entry need a path purge — the landing and
    // /costs read through tagged caches and are already covered above. The city
    // hub and calculator hold rendered aggregates for an hour, so they'd
    // otherwise contradict the building page the submitter just landed on.
    const paths = [...localeVariants(`/${citySlug}`), ...localeVariants(`/${citySlug}/calculator`)];
    const { buildingSlug, districtSlug } = target ?? {};
    if (buildingSlug) paths.push(...localeVariants(`/${citySlug}/building/${buildingSlug}`));
    if (districtSlug) paths.push(...localeVariants(`/${citySlug}/${districtSlug}`));

    for (const path of paths) {
      revalidatePath(path);
    }
  } catch (err) {
    console.error('[revalidate-costs] revalidation failed', err);
  }
}

/**
 * Drop just one building's page.
 *
 * For changes that touch a single building and no aggregate — a tenant tag
 * vote. Expiring the whole `costs` tag would throw away every city and district
 * roll-up for one checkbox, so this stays deliberately narrow. Without it a tag
 * shows up an hour later, which breaks the same "I contributed → I see it" loop
 * the cost flow was fixed for.
 */
export function revalidateBuildingPage(citySlug: string, buildingSlug: string): void {
  try {
    for (const path of localeVariants(`/${citySlug}/building/${buildingSlug}`)) {
      revalidatePath(path);
    }
  } catch (err) {
    console.error('[revalidate-costs] building revalidation failed', err);
  }
}

/**
 * Every URL one page is cached under. `localePrefix: 'as-needed'` means the
 * default locale is served without a prefix but rewritten to the prefixed path
 * internally, so both spellings are revalidated.
 */
function localeVariants(pathname: string): string[] {
  const suffix = pathname === '/' ? '' : pathname;
  return [pathname, ...routing.locales.map((locale) => `/${locale}${suffix}`)];
}
