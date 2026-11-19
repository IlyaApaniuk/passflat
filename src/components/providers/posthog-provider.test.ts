import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeFigures } from '@/lib/cost-figures';

// Landing capture (spec 01 §Landing capture, FR-13). Vitest has no DOM, so a page "mounts"
// through a small harness: each mounted component runs as a function with `useEffect`
// recorded, and the effects run the way React commits them, a component's effects after
// its children's, siblings in order, and on a re-render only when a dependency changed.
// That order is why an init in the provider's own effect came after every child's capture.
// The boot follows Next.js: `src/instrumentation-client.ts` first, then hydration. The real
// browser run is `e2e/posthog-landing.spec.ts`.

type Effect = { fn: () => unknown; deps?: readonly unknown[] };
type SentEvent = { event: string; properties: Record<string, unknown> };

const h = vi.hoisted(() => {
  const sent: SentEvent[] = [];
  const dropped: string[] = [];
  // A double of posthog-js: like the real SDK's uninitialised guard it drops a capture made
  // before `init`, and like the SDK it passes every event through `before_send`.
  const ph = {
    __loaded: false,
    config: {} as Record<string, unknown>,
    init: vi.fn((_key: string, config: Record<string, unknown>) => {
      ph.__loaded = true;
      ph.config = { ...config };
      return ph;
    }),
    capture: vi.fn((event: string, properties: Record<string, unknown> = {}) => {
      if (!ph.__loaded) {
        dropped.push(event);
        return undefined;
      }
      const beforeSend = ph.config.before_send as ((e: unknown) => SentEvent | null) | undefined;
      const result = {
        uuid: `e${sent.length}`,
        event,
        properties: { $session_id: 's1', ...properties },
      };
      const out = beforeSend ? beforeSend(result) : result;
      if (out) sent.push(out);
      return out;
    }),
    register_once: vi.fn(),
    set_config: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  };
  return {
    ph,
    sent,
    dropped,
    nav: { pathname: '/', search: new URLSearchParams() },
    consent: { granted: false },
    collecting: { effects: null as Effect[] | null },
  };
});

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (fn: () => unknown, deps?: readonly unknown[]) => {
    h.collecting.effects?.push({ fn, deps });
  },
}));
vi.mock('posthog-js', () => ({ default: h.ph }));
vi.mock('posthog-js/react', () => ({
  PostHogProvider: function PHProvider({ children }: { children: ReactNode }) {
    return children;
  },
  usePostHog: () => h.ph,
  useFeatureFlagEnabled: () => false,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => h.nav.pathname,
  useSearchParams: () => h.nav.search,
}));
vi.mock('@/lib/consent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/consent')>()),
  useAnalyticsConsent: () => h.consent.granted,
}));
vi.mock('next-intl', () => {
  const t = Object.assign((key: string) => key, { rich: (key: string) => key, has: () => true });
  return { useTranslations: () => t, useLocale: () => 'en' };
});
vi.mock('@/i18n/navigation', () => ({ Link: 'a' }));
vi.mock('@/hooks/use-has-contributed', () => ({ useHasContributed: () => false }));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/components/costs/share-button', () => ({ ShareButton: () => null }));
vi.mock('@/components/costs/follow-building-button', () => ({ FollowBuildingButton: () => null }));
vi.mock('@/components/listings/location-score', () => ({ LocationScore: () => null }));
vi.mock('@/components/costs/district-position-bar', () => ({ DistrictPositionBar: () => null }));
vi.mock('@/components/buildings/tenant-tags', () => ({ TenantTags: () => null }));
vi.mock('@/components/analytics/tracked-link', () => ({ TrackedLink: () => null }));

/** Components the harness runs; anything else is a wrapper whose children it walks. */
const MOUNTED = new Set([
  'PostHogProvider',
  'PostHogPageView',
  'PersistenceUpgrade',
  'SessionRecordingGate',
  'BuildingCostsClient',
]);

function collect(node: ReactNode): Effect[] {
  if (Array.isArray(node)) return node.flatMap(collect);
  if (!isValidElement(node)) return [];
  const { type, props } = node as ReactElement<{ children?: ReactNode }>;
  if (typeof type === 'function' && MOUNTED.has(type.name)) {
    const own: Effect[] = [];
    h.collecting.effects = own;
    const output = (type as (p: unknown) => ReactNode)(props);
    h.collecting.effects = null;
    return [...collect(output), ...own];
  }
  return collect(props.children);
}

let previous: Effect[] | null = null;

/** Renders the tree and runs the effects React would run for this commit. */
function commit(tree: ReactElement) {
  const effects = collect(tree);
  effects.forEach((effect, index) => {
    const before = previous?.[index];
    const changed =
      !before?.deps ||
      !effect.deps ||
      effect.deps.length !== before.deps.length ||
      effect.deps.some((dep, i) => !Object.is(dep, before.deps![i]));
    if (changed) effect.fn();
  });
  previous = effects;
}

const BUILDING_PATH = '/en/warsaw/building/marszalkowska-1';

/** A full page load of the building page: instrumentation first, then hydration. */
async function loadBuildingPage() {
  await import('@/instrumentation-client');
  const { PostHogProvider } = await import('./posthog-provider');
  const { BuildingCostsClient } = await import('@/app/[locale]/[city]/building/[slug]/client');
  const page = createElement(BuildingCostsClient, {
    building: {
      id: 'b1',
      slug: 'marszalkowska-1',
      address: 'Marszałkowska 1',
      district: 'Śródmieście',
      districtSlug: 'srodmiescie',
      city: 'Warsaw',
      placeId: null,
    },
    figures: summarizeFigures([], { level: 'building', rentalType: 'all' }),
    areaReference: null,
    nuisancesCard: null,
    tenantDetails: null,
    lastUpdated: null,
    citySlug: 'warsaw',
    tenantTags: null,
    initialLocationScore: null,
  });
  const tree = createElement(PostHogProvider, null, page);
  commit(tree);
  return tree;
}

const named = (name: string) => h.sent.filter((e) => e.event === name);

beforeEach(() => {
  vi.resetModules();
  previous = null;
  h.ph.__loaded = false;
  h.ph.config = {};
  h.sent.length = 0;
  h.dropped.length = 0;
  h.nav.pathname = BUILDING_PATH;
  h.nav.search = new URLSearchParams();
  h.consent.granted = false;
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  vi.stubGlobal('window', {
    origin: 'https://passflat.com',
    location: {
      get pathname() {
        return h.nav.pathname;
      },
    },
    localStorage: { getItem: () => null },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('landing capture', () => {
  it('records the landing $pageview exactly once, after init, with page context', async () => {
    await loadBuildingPage();

    expect(h.ph.init).toHaveBeenCalledTimes(1);
    expect(h.dropped).toEqual([]);
    const pageviews = named('$pageview');
    expect(pageviews).toHaveLength(1);
    expect(pageviews[0].properties).toMatchObject({
      $current_url: `https://passflat.com${BUILDING_PATH}`,
      page_type: 'building',
      entry_page_type: 'building',
      locale: 'en',
      city: 'warsaw',
    });
  });

  it("does not drop the building page's mount-time building_detail_viewed", async () => {
    await loadBuildingPage();

    const viewed = named('building_detail_viewed');
    expect(viewed).toHaveLength(1);
    expect(viewed[0].properties).toMatchObject({
      building_id: 'b1',
      report_count: 0,
      page_type: 'building',
    });
  });

  it('records one more $pageview on a client navigation and none on a plain re-render', async () => {
    const tree = await loadBuildingPage();

    commit(tree);
    expect(named('$pageview')).toHaveLength(1);

    h.nav.pathname = '/en/warsaw/costs';
    h.nav.search = new URLSearchParams('utm_source=threads');
    commit(tree);
    commit(tree);

    const pageviews = named('$pageview');
    expect(pageviews.map((e) => e.properties.$current_url)).toEqual([
      `https://passflat.com${BUILDING_PATH}`,
      'https://passflat.com/en/warsaw/costs?utm_source=threads',
    ]);
    expect(pageviews[1].properties).toMatchObject({
      page_type: 'costs',
      entry_page_type: 'building',
    });
    expect(h.ph.register_once).toHaveBeenCalledWith({ utm_source: 'threads' });
    expect(named('building_detail_viewed')).toHaveLength(1);
  });

  it('initialises and sends nothing without a key, and the page still renders', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');

    await expect(loadBuildingPage()).resolves.toBeDefined();
    expect(h.ph.init).not.toHaveBeenCalled();
    expect(h.sent).toEqual([]);
  });

  it('keeps the memory store until consent and upgrades the same instance on accept (D10)', async () => {
    const tree = await loadBuildingPage();
    expect(h.ph.config.persistence).toBe('memory');
    expect(h.ph.set_config).not.toHaveBeenCalled();

    h.consent.granted = true;
    commit(tree);

    expect(h.ph.set_config).toHaveBeenCalledWith({
      persistence: 'localStorage+cookie',
      disable_surveys: false,
    });
    expect(h.ph.init).toHaveBeenCalledTimes(1);
  });
});
