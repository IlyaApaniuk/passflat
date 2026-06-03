import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { DashboardClient } from './client';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/dashboard');
  }

  const [listings, savedListings, costReports] = await Promise.all([
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
  ]);

  const freeListingsUsed = listings.filter((l) => l.status === 'active' && !l.isPaid).length;

  const serializedListings = listings.map((l) => ({
    id: l.id,
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

  return (
    <DashboardClient
      listings={serializedListings}
      savedListings={serializedSaved}
      costReports={serializedCostReports}
      userEmail={user.email ?? ''}
      freeListingsUsed={freeListingsUsed}
    />
  );
}
