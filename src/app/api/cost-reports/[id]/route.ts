import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { validateCostReport, capFreeText } from '@/lib/cost-validation';
import { sanitizePeriodicCharges, periodicChargesMonthlyTotal } from '@/lib/periodic-charges';
import { isAccountDeleted, ACCOUNT_DELETED_RESPONSE } from '@/lib/active-user';
import { syncHasContributedCost } from '@/lib/contribution';
import { revalidateCostSurfaces } from '@/lib/revalidate-costs';

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from Server Component context
          }
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const costReport = await prisma.costReport.findFirst({
    where: { id, authorId: user.id },
    include: { building: true, periodicCharges: true },
  });

  if (!costReport) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ costReport });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (await isAccountDeleted(user.id)) {
    return NextResponse.json(ACCOUNT_DELETED_RESPONSE, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.costReport.findFirst({
    where: { id, authorId: user.id },
    select: {
      id: true,
      isVisible: true,
      verificationStatus: true,
      building: { select: { slug: true, city: { select: { slug: true } } } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // A moderator's hide has to survive an author edit. Admin hiding only flips
  // `isVisible` (it leaves `verificationStatus` alone), so "invisible but not
  // flagged" is the one signal that a human — not the auto-validator — pulled
  // this report; re-publishing it here would push moderated junk back into the
  // public medians.
  const hiddenByModerator = !existing.isVisible && existing.verificationStatus !== 'flagged';

  const body = await request.json();
  const {
    rent,
    adminFee,
    deposit,
    electricity,
    electricityIncluded,
    electricityWinter,
    electricitySummer,
    gas,
    heating,
    heatingIncluded,
    heatingWinter,
    heatingSummer,
    water,
    waterIncluded,
    internet,
    internetProvider,
    otherCosts,
    otherCostsNote,
    utilitiesComplete,
    rooms,
    areaM2,
    floor,
    rentalType,
    leaseType,
    isCurrentTenant,
    livedFrom,
    livedUntil,
    depositReturned,
    depositReturnedAmount,
    depositReturnDays,
    periodicCharges: periodicChargesInput,
  } = body;

  const periodicCharges = sanitizePeriodicCharges(periodicChargesInput);

  const validation = validateCostReport({
    rent,
    adminFee,
    deposit,
    areaM2,
    rooms,
    electricity,
    gas,
    heating,
    water,
    internet,
    otherCosts,
  });

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.hardErrors[0].message, errors: validation.hardErrors },
      { status: 400 },
    );
  }

  const wasFlagged = validation.shouldFlag;

  const electricityAvg = electricityIncluded
    ? null
    : electricity
      ? parseFloat(electricity)
      : electricityWinter && electricitySummer
        ? (parseFloat(electricityWinter) + parseFloat(electricitySummer)) / 2
        : null;

  const heatingAvg = heatingIncluded
    ? null
    : heating
      ? parseFloat(heating)
      : heatingWinter && heatingSummer
        ? (parseFloat(heatingWinter) + parseFloat(heatingSummer)) / 2
        : null;

  const totalMonthlyAvg =
    (parseFloat(rent) || 0) +
    (parseFloat(adminFee) || 0) +
    (electricityAvg || 0) +
    (parseFloat(gas) || 0) +
    (heatingAvg || 0) +
    (waterIncluded ? 0 : parseFloat(water) || 0) +
    (parseFloat(internet) || 0) +
    (parseFloat(otherCosts) || 0) +
    periodicChargesMonthlyTotal(periodicCharges);

  const costReport = await prisma.costReport.update({
    where: { id },
    data: {
      rent: rent ? parseFloat(rent) : null,
      adminFee: adminFee ? parseFloat(adminFee) : null,
      depositAmount: deposit ? parseFloat(deposit) : null,
      electricityAvg: electricityAvg ?? null,
      electricityWinter: electricityWinter ? parseFloat(electricityWinter) : null,
      electricitySummer: electricitySummer ? parseFloat(electricitySummer) : null,
      electricityIncluded: electricityIncluded ?? null,
      gas: gas ? parseFloat(gas) : null,
      heating: heatingAvg ?? null,
      heatingWinter: heatingWinter ? parseFloat(heatingWinter) : null,
      heatingSummer: heatingSummer ? parseFloat(heatingSummer) : null,
      heatingIncluded: heatingIncluded ?? null,
      water: waterIncluded ? null : water ? parseFloat(water) : null,
      waterIncluded: waterIncluded ?? null,
      internet: internet ? parseFloat(internet) : null,
      internetProvider: capFreeText(internetProvider),
      otherCosts: otherCosts ? parseFloat(otherCosts) : null,
      otherCostsNote: capFreeText(otherCostsNote),
      utilitiesComplete: typeof utilitiesComplete === 'boolean' ? utilitiesComplete : null,
      totalMonthlyAvg: totalMonthlyAvg || null,
      rooms: rooms ? parseInt(rooms, 10) : null,
      areaM2: areaM2 ? parseFloat(areaM2) : null,
      floor: floor ? parseInt(floor, 10) : null,
      rentalType: rentalType || null,
      leaseType: leaseType || null,
      isCurrentTenant: isCurrentTenant ?? null,
      livedFrom: livedFrom ? new Date(livedFrom) : null,
      livedUntil: livedUntil ? new Date(livedUntil) : null,
      depositReturned: typeof depositReturned === 'boolean' ? depositReturned : null,
      depositReturnedAmount: depositReturnedAmount ? parseFloat(depositReturnedAmount) : null,
      depositReturnDays: depositReturnDays ? parseInt(depositReturnDays, 10) : null,
      isVisible: hiddenByModerator ? false : !wasFlagged,
      // Left untouched while moderator-hidden: writing 'flagged' here would make
      // the hide look like an auto-flag, and the next clean edit would restore it.
      verificationStatus: hiddenByModerator
        ? existing.verificationStatus
        : wasFlagged
          ? 'flagged'
          : 'unverified',
      // Editing the report (even with no value change) re-confirms it as current
      // — refreshes the building "updated" badge and clears the re-engage nudge.
      confirmedAt: new Date(),
      periodicCharges: {
        deleteMany: {},
        ...(periodicCharges.length ? { create: periodicCharges } : {}),
      },
    },
    include: { building: true, periodicCharges: true },
  });

  // Re-derive from ALL of the user's reports: one flagged edit must not revoke
  // the status their other visible reports earned.
  await syncHasContributedCost(user.id);

  // The building page is ISR-cached for an hour — without this the author does
  // not see their own edit there.
  revalidateCostSurfaces({
    citySlug: existing.building.city.slug,
    buildingSlug: existing.building.slug,
  });

  return NextResponse.json({ costReport, wasFlagged });
}
