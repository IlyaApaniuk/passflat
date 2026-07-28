import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { BuildingCostsClient } from './client';
import { getAlternates, getOgImage, getCostOgImage } from '@/lib/seo';
import { JsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
import { computeStats, median, monthsSince, perAreaValues, type CostStats } from '@/lib/cost-stats';
import { periodicChargesMonthlyTotal, PERIODIC_CATEGORIES } from '@/lib/periodic-charges';
import { SCORE_VERSION } from '@/lib/location-score';
import { summarizeTagVotes } from '@/lib/building-tags';
import type { Metadata } from 'next';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISR: the page reads no per-request auth — the summary ("база") is public for
// everyone and crawlers, and the deeper per-utility detail is gated client-side
// (useHasContributed). A hard server-side withhold (Phase 2 monetization) would
// opt it back into dynamic.
// 1h window: reports are rare, but bots crawl ~1100 building-page variants
// (282 buildings x 4 locales) around the clock — the old 5-min window made every
// crawler hit a full re-render and burned the Vercel free tier (3h39m CPU /
// 71K ISR writes in 30 days at ~50 human visits/week).
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; city: string; slug: string }>;
}

type NumericField =
  | 'rent'
  | 'adminFee'
  | 'electricityAvg'
  | 'electricityWinter'
  | 'electricitySummer'
  | 'gas'
  | 'heating'
  | 'heatingWinter'
  | 'heatingSummer'
  | 'water'
  | 'internet'
  | 'otherCosts'
  | 'totalMonthlyAvg'
  | 'depositAmount';

type BoolField = 'electricityIncluded' | 'heatingIncluded' | 'waterIncluded';

function statsForField(
  reports: Array<Record<string, unknown>>,
  field: NumericField,
): CostStats | null {
  return computeStats(
    reports.map((r) => {
      const v = r[field];
      return v == null ? null : Number(v);
    }),
    { trimOutliers: true },
  );
}

function statsPerM2(
  reports: Array<Record<string, unknown>>,
  field: NumericField,
): CostStats | null {
  return computeStats(
    perAreaValues(
      reports.map((r) => ({
        value: r[field] as number | null,
        areaM2: r.areaM2 as number | null,
      })),
    ),
    { trimOutliers: true },
  );
}

// ---------------------------------------------------------------------------
// React cache() wrappers — deduplicate across generateMetadata & page render
// ---------------------------------------------------------------------------

const costReportSelect = {
  rent: true,
  adminFee: true,
  electricityAvg: true,
  electricityWinter: true,
  electricitySummer: true,
  electricityIncluded: true,
  gas: true,
  heating: true,
  heatingWinter: true,
  heatingSummer: true,
  heatingIncluded: true,
  water: true,
  waterIncluded: true,
  internet: true,
  otherCosts: true,
  totalMonthlyAvg: true,
  depositAmount: true,
  depositReturned: true,
  depositReturnedAmount: true,
  depositReturnDays: true,
  utilitiesComplete: true,
  source: true,
  leaseType: true,
  isCurrentTenant: true,
  livedFrom: true,
  livedUntil: true,
  areaM2: true,
  createdAt: true,
  confirmedAt: true,
  periodicCharges: { select: { amount: true, frequency: true, category: true } },
} as const;

const buildingQuery = {
  select: {
    id: true,
    slug: true,
    addressFull: true,
    cityId: true,
    districtId: true,
    // Deep-links the "tell us about this building" CTA straight into /review
    // with the address already resolved. Null on buildings that were never
    // created from a Places result (e.g. the scraped import).
    placeId: true,
    district: { select: { nameKey: true, slug: true } },
    city: { select: { nameKey: true } },
    locationScore: { select: { overall: true, categories: true, version: true } },
    costReports: {
      where: { isVisible: true },
      orderBy: { createdAt: 'desc' as const },
      select: costReportSelect,
    },
    // Moderated-out votes stop counting without losing the row, so the filter
    // has to happen here — the aggregate below trusts what it is handed.
    tags: {
      where: { isVisible: true },
      select: { tagKey: true, source: true, voterKey: true },
    },
  },
} as const;

const getCityId = cache(async (citySlug: string) => {
  const city = await prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } });
  return city?.id ?? null;
});

const getBuilding = cache(async (citySlug: string, slug: string) => {
  const cityId = await getCityId(citySlug);
  if (!cityId) return null;

  if (UUID_RE.test(slug)) {
    return prisma.building.findUnique({ where: { id: slug }, ...buildingQuery });
  }

  return prisma.building.findUnique({
    where: { cityId_slug: { cityId, slug } },
    ...buildingQuery,
  });
});

// ---------------------------------------------------------------------------
// unstable_cache: baseline distributions (revalidate every 10 min)
// ---------------------------------------------------------------------------

const DISTRIBUTION_LIMIT = 5000;

// Median + the typical p25–p75 band, for the district position bars.
type StatRange = { median: number; p25: number; p75: number };

const toRange = (values: Array<number | null | undefined>): StatRange | null => {
  const s = computeStats(values);
  return s ? { median: s.median, p25: s.p25, p75: s.p75 } : null;
};

type CachedDistrictBaseline = {
  median: number;
  p25: number;
  p75: number;
  count: number;
  rent: StatRange | null;
  expenses: StatRange | null;
  rentPerM2: StatRange | null;
  totalPerM2: StatRange | null;
  totals: number[];
};

type CachedCityBaseline = {
  median: number;
  p25: number;
  p75: number;
  count: number;
  totals: number[];
};

const getDistrictBaseline = unstable_cache(
  async (districtId: string): Promise<CachedDistrictBaseline | null> => {
    const reports = await prisma.costReport.findMany({
      where: {
        building: { districtId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      select: { totalMonthlyAvg: true, rent: true, areaM2: true },
      take: DISTRIBUTION_LIMIT,
    });

    const totals = reports
      .map((r) => (r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg)))
      .filter((v): v is number => v != null && Number.isFinite(v));

    const stats = computeStats(totals);
    if (!stats) return null;

    return {
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      count: stats.count,
      rent: toRange(reports.map((r) => (r.rent == null ? null : Number(r.rent)))),
      expenses: toRange(
        reports.map((r) => {
          const total = r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg);
          const rentVal = r.rent == null ? null : Number(r.rent);
          if (total == null || rentVal == null) return null;
          return Math.max(0, total - rentVal);
        }),
      ),
      rentPerM2: toRange(
        perAreaValues(
          reports.map((r) => ({
            value: r.rent == null ? null : Number(r.rent),
            areaM2: r.areaM2 == null ? null : Number(r.areaM2),
          })),
        ),
      ),
      totalPerM2: toRange(
        perAreaValues(
          reports.map((r) => ({
            value: r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg),
            areaM2: r.areaM2 == null ? null : Number(r.areaM2),
          })),
        ),
      ),
      totals,
    };
  },
  ['building-district-baseline'],
  { revalidate: 300, tags: ['costs'] },
);

const getCityBaseline = unstable_cache(
  async (cityId: string): Promise<CachedCityBaseline | null> => {
    const reports = await prisma.costReport.findMany({
      where: {
        building: { cityId },
        isVisible: true,
        totalMonthlyAvg: { not: null },
      },
      select: { totalMonthlyAvg: true },
      take: DISTRIBUTION_LIMIT,
    });

    const totals = reports
      .map((r) => (r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg)))
      .filter((v): v is number => v != null && Number.isFinite(v));

    const stats = computeStats(totals);
    if (!stats) return null;

    return {
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      count: stats.count,
      totals,
    };
  },
  ['building-city-baseline'],
  { revalidate: 300, tags: ['costs'] },
);

// ---------------------------------------------------------------------------

function cheaperThanPercentile(values: number[], buildingMedian: number | null): number | null {
  if (buildingMedian == null || values.length === 0) return null;
  const pricier = values.filter((v) => v > buildingMedian).length;
  return Math.round((pricier / values.length) * 100);
}

type Baseline = {
  median: number;
  p25: number;
  p75: number;
  count: number;
  rent: StatRange | null;
  expenses: StatRange | null;
  rentPerM2: StatRange | null;
  totalPerM2: StatRange | null;
  percentile: number | null;
};

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug, city } = await params;
  setRequestLocale(locale);
  const building = await getBuilding(city, slug);
  if (!building) return { title: 'Building not found' };

  const t = await getTranslations();
  const cityName = t(building.city.nameKey);
  // District `nameKey` holds a plain display name (e.g. "Mokotów"), unlike city
  // nameKey which is a translation key — so it's used as-is, not through t().
  const districtName = building.district?.nameKey ?? cityName;

  const title = `${building.addressFull} — Cost Reports | Passflat`;
  const description = `Real rental costs for ${building.addressFull}, ${districtName}. Crowdsourced from actual tenants.`;

  // Rich cost share-card when the building has data (the viral artifact people
  // drop into chats); generic title/subtitle OG otherwise.
  const reports = building.costReports;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const totalMedian = median(reports.map((r) => num(r.totalMonthlyAvg)));
  const rentMedian = median(reports.map((r) => num(r.rent)));
  const expensesMedian = median(
    reports.map((r) => {
      const tot = num(r.totalMonthlyAvg);
      const rnt = num(r.rent);
      return tot != null && rnt != null ? Math.max(0, tot - rnt) : null;
    }),
  );

  const ogImage =
    totalMedian != null
      ? getCostOgImage({
          title: building.addressFull,
          subtitle: `${districtName}, ${cityName} · ${t('costs.overview.nReports', { count: reports.length })}`,
          stat: `≈ ${totalMedian.toLocaleString()} zł`,
          statLabel: t('costs.building.medianMonthlyTotal'),
          split:
            rentMedian != null && expensesMedian != null
              ? `${t('costs.building.rent')} ≈ ${rentMedian.toLocaleString()} · ${t('costs.building.expenses')} ≈ ${expensesMedian.toLocaleString()}`
              : undefined,
        })
      : getOgImage(building.addressFull, cityName);

  return {
    title,
    description,
    alternates: getAlternates(`/${city}/building/${building.slug}`, await getLocale()),
    openGraph: {
      title,
      description,
      images: [ogImage],
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BuildingCostsPage({ params }: PageProps) {
  const { locale, city: citySlug, slug } = await params;
  setRequestLocale(locale);

  const building = await getBuilding(citySlug, slug);

  if (!building) notFound();

  if (UUID_RE.test(slug)) {
    redirect(`/${locale}/${citySlug}/building/${building.slug}`);
  }

  const t = await getTranslations();

  const reports = building.costReports;
  const reportCount = reports.length;

  const recs = reports as unknown as Array<Record<string, unknown>>;
  function countIncluded(field: BoolField) {
    return recs.filter((r) => r[field] === true).length;
  }

  const costs =
    reportCount > 0
      ? {
          rent: statsForField(recs, 'rent'),
          adminFee: statsForField(recs, 'adminFee'),
          electricity: statsForField(recs, 'electricityAvg'),
          electricityWinter: statsForField(recs, 'electricityWinter'),
          electricitySummer: statsForField(recs, 'electricitySummer'),
          gas: statsForField(recs, 'gas'),
          heating: statsForField(recs, 'heating'),
          heatingWinter: statsForField(recs, 'heatingWinter'),
          heatingSummer: statsForField(recs, 'heatingSummer'),
          water: statsForField(recs, 'water'),
          internet: statsForField(recs, 'internet'),
          otherCosts: statsForField(recs, 'otherCosts'),
          periodic: computeStats(
            reports.map((r) => {
              const total = periodicChargesMonthlyTotal(r.periodicCharges);
              return total > 0 ? total : null;
            }),
          ),
          totalMonthlyAvg: statsForField(recs, 'totalMonthlyAvg'),
          deposit: statsForField(recs, 'depositAmount'),
          // Expenses = everything on top of rent (czynsz/komunalka + utilities +
          // periodic). Computed per report, then median — never median-of-medians.
          expenses: computeStats(
            reports.map((r) => {
              const total = r.totalMonthlyAvg == null ? null : Number(r.totalMonthlyAvg);
              const rentVal = r.rent == null ? null : Number(r.rent);
              if (total == null || rentVal == null) return null;
              return Math.max(0, total - rentVal);
            }),
          ),
        }
      : null;

  const perM2 =
    reportCount > 0
      ? {
          rent: statsPerM2(recs, 'rent'),
          total: statsPerM2(recs, 'totalMonthlyAvg'),
          adminFee: statsPerM2(recs, 'adminFee'),
          heating: statsPerM2(recs, 'heating'),
        }
      : null;

  const includedCounts =
    reportCount > 0
      ? {
          electricity: countIncluded('electricityIncluded'),
          heating: countIncluded('heatingIncluded'),
          water: countIncluded('waterIncluded'),
          total: reportCount,
        }
      : null;

  // Deposit-return reliability — a unique trust signal. Only past tenants who
  // answered "did you get your deposit back?" count toward the rate.
  const depositReturn = (() => {
    const answered = reports.filter(
      (r) => r.isCurrentTenant === false && r.depositReturned != null,
    );
    if (answered.length === 0) return null;
    const returnedCount = answered.filter((r) => r.depositReturned === true).length;
    const medianDays = median(
      answered.map((r) => (r.depositReturnDays == null ? null : Number(r.depositReturnDays))),
    );
    // Average fraction of the deposit actually returned — captures partial
    // withholds the binary rate hides. depositReturnedAmount holds the returned
    // sum (full → deposit, partial → entered, none → 0); null on legacy reports
    // (pre-migration), which then drop out → null when no report carries one.
    const medianReturnedPct = median(
      answered.map((r) => {
        const dep = r.depositAmount == null ? null : Number(r.depositAmount);
        const ret = r.depositReturnedAmount == null ? null : Number(r.depositReturnedAmount);
        if (dep == null || ret == null || dep <= 0) return null;
        return Math.min(100, Math.max(0, (ret / dep) * 100));
      }),
    );
    return {
      sampleSize: answered.length,
      returnedRate: Math.round((returnedCount / answered.length) * 100),
      medianDays,
      medianReturnedPct,
    };
  })();

  // Typical tenure — median months lived (move-in → move-out, or → now for
  // current tenants). Built from livedFrom; reports without it are skipped.
  const tenure = (() => {
    const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
    const months = reports
      .map((r) => {
        if (!r.livedFrom) return null;
        // Past tenant: move-in → move-out. Current tenant (no livedUntil):
        // move-in → now, via monthsSince (keeps Date.now out of render).
        if (r.livedUntil) {
          const fromMs = new Date(r.livedFrom).getTime();
          const toMs = new Date(r.livedUntil).getTime();
          if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
          const m = (toMs - fromMs) / MS_PER_MONTH;
          return m > 0 ? m : null;
        }
        const m = monthsSince(r.livedFrom);
        return m != null && m > 0 ? m : null;
      })
      .filter((v): v is number => v != null);
    if (months.length === 0) return null;
    return { sampleSize: months.length, medianMonths: median(months) };
  })();

  // Deposit expressed in months of rent (typical deposit ÷ typical rent) — more
  // comparable across price levels than an absolute zł figure. Kept off median()
  // here so the ratio doesn't get rounded to a whole number.
  const depositMonths =
    costs?.deposit?.median != null && costs?.rent?.median != null && costs.rent.median > 0
      ? costs.deposit.median / costs.rent.median
      : null;

  // Per-category breakdown of periodic charges (e.g. water billed quarterly):
  // typical amount + most common frequency, across all reports' charges.
  const periodicBreakdown = (() => {
    const all = reports.flatMap((r) => r.periodicCharges);
    if (all.length === 0) return null;
    const rows: Array<{
      category: string;
      amount: number;
      frequency: string | null;
      count: number;
    }> = [];
    for (const category of PERIODIC_CATEGORIES) {
      const ofCat = all.filter((c) => c.category === category);
      if (ofCat.length === 0) continue;
      const amount = median(ofCat.map((c) => Number(c.amount)));
      if (amount == null) continue;
      const freqCounts: Record<string, number> = {};
      for (const c of ofCat) {
        if (c.frequency) freqCounts[c.frequency] = (freqCounts[c.frequency] ?? 0) + 1;
      }
      const frequency = Object.entries(freqCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      rows.push({ category, amount, frequency, count: ofCat.length });
    }
    return rows.length ? rows.sort((a, b) => b.count - a.count) : null;
  })();

  // "Total may understate utilities" chip — counts ONLY genuine tenant «не знаю»
  // answers (source 'user'). Scraped imports carry utilitiesComplete=false as a
  // provenance marker (rent+czynsz known, meters not captured), not a tenant
  // answer, so they're excluded — otherwise an imported listing trips the chip
  // even though no tenant ever said «не знаю».
  const utilitiesUnknown = reports.filter(
    (r) => r.source === 'user' && r.utilitiesComplete === false,
  ).length;

  // Most common meaningful lease type (excludes "unknown"). null → no badge.
  const leaseTypeAgg = (() => {
    const present = reports
      .map((r) => r.leaseType)
      .filter((v): v is string => v != null && v !== '' && v !== 'unknown');
    if (present.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const v of present) counts[v] = (counts[v] ?? 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { dominant, count: counts[dominant], total: reportCount };
  })();

  // What tenants said about the building itself — the second pillar next to the
  // numbers. Which of those votes may be shown is a product+legal decision
  // (positives publish on the first voice, negatives wait for a second one —
  // art. 212 k.k.), so it stays in `aggregateTagVotes`; this only shapes the
  // rows and counts the distinct voters behind them, the same way the checker
  // endpoint does.
  const tenantTags = (() => {
    // Null → the invitation renders instead of a card with no chips.
    return summarizeTagVotes(building.tags);
  })();

  const buildingMedianTotal = costs?.totalMonthlyAvg?.median ?? null;

  // Parallel: district + city baselines (independent of each other). No auth
  // read — the page is fully public; the detail gate is resolved on the client.
  const [cachedDistrict, cachedCity] = await Promise.all([
    building.districtId ? getDistrictBaseline(building.districtId) : Promise.resolve(null),
    getCityBaseline(building.cityId),
  ]);

  const districtBaseline: Baseline | null = cachedDistrict
    ? {
        median: cachedDistrict.median,
        p25: cachedDistrict.p25,
        p75: cachedDistrict.p75,
        count: cachedDistrict.count,
        rent: cachedDistrict.rent,
        expenses: cachedDistrict.expenses,
        rentPerM2: cachedDistrict.rentPerM2,
        totalPerM2: cachedDistrict.totalPerM2,
        percentile: cheaperThanPercentile(cachedDistrict.totals, buildingMedianTotal),
      }
    : null;

  const cityBaseline: Baseline | null = cachedCity
    ? {
        median: cachedCity.median,
        p25: cachedCity.p25,
        p75: cachedCity.p75,
        count: cachedCity.count,
        rent: null,
        expenses: null,
        rentPerM2: null,
        totalPerM2: null,
        percentile: cheaperThanPercentile(cachedCity.totals, buildingMedianTotal),
      }
    : null;

  // Freshness = the most recent confirmation across reports. A re-submit bumps
  // confirmedAt (even with no value change), so re-confirming clears the
  // "outdated" badge; legacy reports without confirmedAt fall back to createdAt.
  const lastUpdated = reports.length
    ? new Date(
        Math.max(...reports.map((r) => (r.confirmedAt ?? r.createdAt).getTime())),
      ).toISOString()
    : null;

  // Only seed from the stored score when it's the current version. A stale one
  // (older algorithm — e.g. renamed category keys) would render raw i18n keys,
  // so we pass null instead and let the component fetch a fresh, recomputed
  // score from the API (which recomputes when version < SCORE_VERSION).
  const initialLocationScore =
    building.locationScore && building.locationScore.version >= SCORE_VERSION
      ? {
          overall: building.locationScore.overall,
          categories: building.locationScore.categories as Array<{
            key: string;
            score: number;
            nearestM: number | null;
            name: string | null;
          }>,
        }
      : null;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t(building.city.nameKey), path: `/${citySlug}` },
          ...(building.district
            ? [
                {
                  name: building.district.nameKey,
                  path: `/${citySlug}/${building.district.slug}`,
                },
              ]
            : []),
          { name: building.addressFull, path: `/${citySlug}/building/${building.slug}` },
        ])}
      />
      <BuildingCostsClient
        building={{
          id: building.id,
          slug: building.slug,
          address: building.addressFull,
          district: building.district?.nameKey ?? '',
          districtSlug: building.district?.slug ?? '',
          city: t(building.city.nameKey),
          placeId: building.placeId,
        }}
        reports={reportCount}
        lastUpdated={lastUpdated}
        costs={costs}
        comparison={{
          thisBuilding: buildingMedianTotal,
          thisBuildingRentPerM2: perM2?.rent?.median ?? null,
          thisBuildingTotalPerM2: perM2?.total?.median ?? null,
          thisBuildingExpenses: costs?.expenses?.median ?? null,
          district: districtBaseline,
          city: cityBaseline,
        }}
        includedCounts={includedCounts}
        depositReturn={depositReturn}
        tenure={tenure}
        depositMonths={depositMonths}
        periodicBreakdown={periodicBreakdown}
        utilitiesUnknown={utilitiesUnknown}
        leaseType={leaseTypeAgg}
        citySlug={citySlug}
        tenantTags={tenantTags}
        initialLocationScore={initialLocationScore}
      />
    </>
  );
}
