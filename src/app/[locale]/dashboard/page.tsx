import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { DashboardClient } from './client';
import { getDistrictCostStats, getCityCostStats } from '@/lib/cost-baselines';
import type { ReportComparison } from '@/components/costs/cost-reports-panel';

export default async function DashboardPage() {
  const supabase = await createClient();
  const currentLocale = await getLocale();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/dashboard');
  }

  const [listings, savedListings, costReports, buildingFollows, profile] = await Promise.all([
    prisma.listing.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        building: { include: { district: true, city: true } },
      },
    }),
    prisma.savedListing.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            building: { include: { district: true } },
          },
        },
      },
    }),
    prisma.costReport.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        building: { include: { city: true, district: true } },
        periodicCharges: true,
      },
    }),
    prisma.buildingFollow.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { building: { include: { city: true, district: true } } },
    }),
    prisma.profile.findUnique({
      where: { id: user.id },
      select: {
        displayName: true,
        locale: true,
        hasContributedCost: true,
        costAccessUntil: true,
        emailsOptOut: true,
      },
    }),
  ]);

  const serializedListings = listings.map((l) => ({
    id: l.id,
    slug: l.slug ?? l.id,
    title: l.title,
    type: l.type as 'replacement' | 'roommate' | 'sublet',
    address: l.building.addressFull,
    district: l.building.district?.nameKey ?? '',
    citySlug: l.building.city.slug,
    price: Number(l.totalMonthly ?? l.pricePerPerson ?? l.priceTotal ?? 0),
    status: l.status as 'active' | 'pending' | 'expired' | 'closed' | 'pending_payment',
    promoted: l.isPromoted,
    promotedUntil: l.promotedUntil?.toISOString() ?? null,
    isPaid: l.isPaid,
    views: l.viewsCount,
    inquiries: l.responsesCount,
    image: l.photos[0] ?? null,
    createdAt: l.createdAt.toISOString(),
  }));

  const serializedSaved = savedListings
    .filter((s) => s.listing.status === 'active')
    .map((s) => ({
      id: s.listing.id,
      slug: s.listing.slug ?? s.listing.id,
      title: s.listing.title,
      type: s.listing.type as 'replacement' | 'roommate' | 'sublet',
      address: s.listing.building.addressFull,
      district: s.listing.building.district?.nameKey ?? '',
      price: Number(
        s.listing.totalMonthly ?? s.listing.pricePerPerson ?? s.listing.priceTotal ?? 0,
      ),
      image: s.listing.photos[0] ?? null,
      savedAt: s.createdAt.toISOString(),
    }));

  const serializedFollows = buildingFollows.map((f) => ({
    id: f.id,
    buildingId: f.buildingId,
    address: f.building.addressFull,
    citySlug: f.building.city.slug,
    slug: f.building.slug,
    district: f.building.district?.nameKey ?? '',
    createdAt: f.createdAt.toISOString(),
  }));

  // "You vs your area" — one comparison per report (most recent first, since the
  // query is ordered desc). District/city stats are React-cached so reports that
  // share a district resolve to a single query.
  const reportComparisons: ReportComparison[] = await Promise.all(
    costReports
      .filter((r) => r.totalMonthlyAvg != null)
      .map(async (r) => {
        const area = r.areaM2 != null ? Number(r.areaM2) : null;
        const rentNum = r.rent != null ? Number(r.rent) : null;
        const totalNum = Number(r.totalMonthlyAvg);
        const perM2 = (v: number | null) =>
          v != null && area != null && area > 0 ? Math.round(v / area) : null;

        const [districtStats, cityStats] = await Promise.all([
          r.building.districtId
            ? getDistrictCostStats(r.building.districtId)
            : Promise.resolve(null),
          getCityCostStats(r.building.cityId),
        ]);

        return {
          reportId: r.id,
          address: r.building.addressFull,
          districtName: r.building.district?.nameKey ?? null,
          districtSlug: r.building.district?.slug ?? null,
          citySlug: r.building.city.slug,
          buildingSlug: r.building.slug,
          createdAt: r.createdAt.toISOString(),
          status:
            r.verificationStatus === 'flagged' && !r.isVisible
              ? ('flagged' as const)
              : ('visible' as const),
          periodicCount: r.periodicCharges.length,
          user: {
            total: Math.round(totalNum),
            rentPerM2: perM2(rentNum),
            totalPerM2: perM2(totalNum),
          },
          districtStats,
          cityStats,
        };
      }),
  );

  return (
    <DashboardClient
      listings={serializedListings}
      savedListings={serializedSaved}
      followedBuildings={serializedFollows}
      userEmail={user.email ?? ''}
      displayName={profile?.displayName ?? null}
      userLocale={profile?.locale ?? currentLocale}
      hasContributedCost={profile?.hasContributedCost ?? false}
      costAccessUntil={profile?.costAccessUntil?.toISOString() ?? null}
      emailsOptOut={profile?.emailsOptOut ?? false}
      userId={user.id}
      reportComparisons={reportComparisons}
    />
  );
}
