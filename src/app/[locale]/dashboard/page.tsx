import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { DashboardClient } from './client';
import { getDistrictCostMedians, getCityCostMedians } from '@/lib/cost-baselines';
import type { CostComparison } from '@/components/costs/cost-comparison-card';

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

  const serializedCostReports = costReports.map((r) => ({
    id: r.id,
    address: r.building.addressFull,
    citySlug: r.building.city.slug,
    slug: r.building.slug,
    district: r.building.district?.nameKey ?? '',
    total: Number(r.totalMonthlyAvg ?? 0),
    status:
      r.verificationStatus === 'flagged' && !r.isVisible
        ? ('flagged' as const)
        : ('visible' as const),
    periodicCount: r.periodicCharges.length,
    createdAt: r.createdAt.toISOString(),
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

  // "You vs your area" comparison, anchored on the most recent visible report.
  const anchor = costReports.find((r) => r.isVisible && r.totalMonthlyAvg != null);
  let costComparison: CostComparison | null = null;
  if (anchor) {
    const area = anchor.areaM2 != null ? Number(anchor.areaM2) : null;
    const rentNum = anchor.rent != null ? Number(anchor.rent) : null;
    const totalNum = Number(anchor.totalMonthlyAvg);
    const perM2 = (v: number | null) =>
      v != null && area != null && area > 0 ? Math.round(v / area) : null;

    const [districtMedians, cityMedians] = await Promise.all([
      anchor.building.districtId
        ? getDistrictCostMedians(anchor.building.districtId)
        : Promise.resolve(null),
      getCityCostMedians(anchor.building.cityId),
    ]);

    costComparison = {
      districtName: anchor.building.district?.nameKey ?? null,
      districtSlug: anchor.building.district?.slug ?? null,
      citySlug: anchor.building.city.slug,
      user: {
        total: Math.round(totalNum),
        rentPerM2: perM2(rentNum),
        totalPerM2: perM2(totalNum),
      },
      district: districtMedians
        ? {
            total: districtMedians.total,
            rentPerM2: districtMedians.rentPerM2,
            totalPerM2: districtMedians.totalPerM2,
          }
        : null,
      city: {
        total: cityMedians.total,
        rentPerM2: cityMedians.rentPerM2,
        totalPerM2: cityMedians.totalPerM2,
      },
    };
  }

  return (
    <DashboardClient
      listings={serializedListings}
      savedListings={serializedSaved}
      costReports={serializedCostReports}
      followedBuildings={serializedFollows}
      userEmail={user.email ?? ''}
      displayName={profile?.displayName ?? null}
      userLocale={profile?.locale ?? currentLocale}
      hasContributedCost={profile?.hasContributedCost ?? false}
      costAccessUntil={profile?.costAccessUntil?.toISOString() ?? null}
      emailsOptOut={profile?.emailsOptOut ?? false}
      userId={user.id}
      costComparison={costComparison}
    />
  );
}
