import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateProfile } from '@/lib/profile';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { trackServerEvent, flushPostHog, captureServerException } from '@/lib/posthog-server';
import { validateCostReport } from '@/lib/cost-validation';
import { generateBuildingSlug, transliterate } from '@/lib/slugify';
import { normalizeAddress, cleanStreet } from '@/lib/address';
import { sanitizePeriodicCharges, periodicChargesMonthlyTotal } from '@/lib/periodic-charges';
import {
  IMPORT_AUTHOR_ID,
  IMPORT_AUTHOR_DISPLAY_NAME,
  isCostImportAdmin,
} from '@/lib/import-constants';

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

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Guarantee a profile exists before any write that FKs to author_id.
    await getOrCreateProfile(user);

    const body = await request.json();
    const {
      street,
      buildingNumber,
      district,
      placeId,
      lat,
      lng,
      citySlug,
      placeCity,
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
      rooms,
      areaM2,
      floor,
      rentalType,
      leaseType,
      depositMonths,
      isCurrentTenant,
      livedFrom,
      livedUntil,
      periodicCharges: periodicChargesInput,
      importedEmail: importedEmailInput,
    } = body;

    // Admin "fill on behalf" mode: an authorized admin enters a friend's data
    // through the normal form. The report is owned by the system import profile
    // and tagged with an optional owner email, so it auto-claims when that
    // person logs in (see auth/callback). Coordinates still come from Places.
    const isAdmin = isCostImportAdmin(user.email);
    const fillOnBehalfRequested = importedEmailInput !== undefined;
    if (fillOnBehalfRequested && !isAdmin) {
      // Never let a non-admin attribute a report to someone else. Ignore the
      // field and fall back to a normal self-submission.
      console.warn(
        `[cost-reports POST] non-admin user ${user.id} sent importedEmail; ignoring fill-on-behalf`,
      );
    }
    const fillOnBehalf = fillOnBehalfRequested && isAdmin;
    const normalizedImportedEmail =
      fillOnBehalf && typeof importedEmailInput === 'string' && importedEmailInput.trim()
        ? importedEmailInput.trim().toLowerCase()
        : null;
    const effectiveAuthorId = fillOnBehalf ? IMPORT_AUTHOR_ID : user.id;

    const periodicCharges = sanitizePeriodicCharges(periodicChargesInput);

    if (
      !street ||
      !buildingNumber ||
      rent == null ||
      rent === '' ||
      !rentalType ||
      adminFee == null ||
      adminFee === '' ||
      deposit == null ||
      deposit === '' ||
      areaM2 == null ||
      areaM2 === ''
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: street, buildingNumber, rent, rentalType, adminFee, deposit, areaM2',
        },
        { status: 400 },
      );
    }

    // Validate ranges (strict + soft)
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

    const city = await prisma.city.findUnique({
      where: { slug: citySlug || 'warsaw' },
      include: { districts: true },
    });

    if (!city) {
      return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    // Reject addresses that don't belong to the route's city, before any building
    // create/attach (runs regardless of the placeId match below).
    type CityBoundsShape = { north: number; south: number; east: number; west: number };
    const cityBounds = (city.bounds ?? null) as CityBoundsShape | null;
    const latNum = lat != null && lat !== '' ? Number(lat) : null;
    const lngNum = lng != null && lng !== '' ? Number(lng) : null;

    if (
      cityBounds &&
      latNum != null &&
      lngNum != null &&
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum)
    ) {
      const insideCity =
        latNum <= cityBounds.north &&
        latNum >= cityBounds.south &&
        lngNum <= cityBounds.east &&
        lngNum >= cityBounds.west;
      if (!insideCity) {
        return NextResponse.json(
          { error: 'ADDRESS_OUTSIDE_CITY', message: 'The selected address is outside this city.' },
          { status: 400 },
        );
      }
    } else if (typeof placeCity === 'string' && placeCity.trim()) {
      const norm = (s: string) =>
        transliterate(s)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '');
      const placeCityNorm = norm(placeCity);
      const slugNorm = norm(citySlug || 'warsaw');
      if (placeCityNorm && slugNorm && placeCityNorm !== slugNorm) {
        return NextResponse.json(
          { error: 'ADDRESS_OUTSIDE_CITY', message: 'The selected address is outside this city.' },
          { status: 400 },
        );
      }
    }
    // When bounds/coords are missing and no place city name was provided, we cannot
    // reliably determine the location, so we let it through to avoid false rejections.

    const cleanedStreet = cleanStreet(street);
    const addressNormalized = normalizeAddress(cleanedStreet, buildingNumber);
    const addressFull = `${cleanedStreet} ${buildingNumber}`;

    const matchedDistrict = district
      ? city.districts.find((d) => d.slug === district.toLowerCase() || d.nameKey === district)
      : null;

    let building = placeId ? await prisma.building.findFirst({ where: { placeId } }) : null;

    if (!building) {
      building = await prisma.building.findUnique({
        where: { cityId_addressNormalized: { cityId: city.id, addressNormalized } },
      });

      if (building && placeId && !building.placeId) {
        building = await prisma.building.update({
          where: { id: building.id },
          data: { placeId },
        });
      }
    }

    if (!building) {
      let slug = generateBuildingSlug(street, buildingNumber);
      const existing = await prisma.building.findUnique({
        where: { cityId_slug: { cityId: city.id, slug } },
        select: { id: true },
      });
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      building = await prisma.building.create({
        data: {
          cityId: city.id,
          slug,
          districtId: matchedDistrict?.id ?? null,
          street: cleanedStreet,
          buildingNumber,
          addressFull,
          addressNormalized,
          lat: lat ?? null,
          lng: lng ?? null,
          placeId: placeId ?? null,
        },
      });
    }

    // One report per user PER BUILDING. A user may report for several buildings,
    // but a duplicate for the same building should be edited instead of recreated.
    // Skipped in fill-on-behalf mode: the system import profile legitimately owns
    // many reports per building (one per friend), like the bulk CSV import.
    if (!fillOnBehalf) {
      const existingReport = await prisma.costReport.findFirst({
        where: { authorId: user.id, buildingId: building.id },
        select: { id: true },
      });
      if (existingReport) {
        return NextResponse.json(
          {
            error:
              'You already have a cost report for this building. Please edit your existing one.',
            code: 'ALREADY_EXISTS',
            reportId: existingReport.id,
          },
          { status: 409 },
        );
      }
    }

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

    // The system import profile must exist before we point a report's FK at it.
    if (fillOnBehalf) {
      await prisma.profile.upsert({
        where: { id: IMPORT_AUTHOR_ID },
        create: { id: IMPORT_AUTHOR_ID, displayName: IMPORT_AUTHOR_DISPLAY_NAME },
        update: {},
      });
    }

    const costReport = await prisma.costReport.create({
      data: {
        buildingId: building.id,
        authorId: effectiveAuthorId,
        source: fillOnBehalf ? 'import' : 'user',
        importedEmail: fillOnBehalf ? normalizedImportedEmail : null,
        claimedAt: null,
        currency: 'PLN',
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
        water: water ? parseFloat(water) : null,
        waterIncluded: waterIncluded ?? null,
        internet: internet ? parseFloat(internet) : null,
        internetProvider: internetProvider || null,
        otherCosts: otherCosts ? parseFloat(otherCosts) : null,
        otherCostsNote: otherCostsNote || null,
        totalMonthlyAvg: totalMonthlyAvg || null,
        rooms: rooms ? parseInt(rooms, 10) : null,
        areaM2: areaM2 ? parseFloat(areaM2) : null,
        floor: floor ? parseInt(floor, 10) : null,
        rentalType: rentalType || null,
        leaseType: leaseType || null,
        depositMonths: depositMonths ? parseFloat(depositMonths) : null,
        isCurrentTenant: isCurrentTenant ?? null,
        livedFrom: livedFrom ? new Date(livedFrom) : null,
        livedUntil: livedUntil ? new Date(livedUntil) : null,
        isVisible: !wasFlagged,
        verificationStatus: wasFlagged ? 'flagged' : 'unverified',
        periodicCharges: periodicCharges.length ? { create: periodicCharges } : undefined,
      },
      include: { building: true, periodicCharges: true },
    });

    // Only mark hasContributed for genuine self-submissions (not flagged, and
    // not fill-on-behalf where the admin is entering someone else's data).
    if (!wasFlagged && !fillOnBehalf) {
      await prisma.profile.update({
        where: { id: user.id },
        data: { hasContributedCost: true },
      });
    }

    trackServerEvent(user.id, 'cost_report_submitted', {
      building_id: building.id,
      city: citySlug || 'warsaw',
      was_flagged: wasFlagged,
      fill_on_behalf: fillOnBehalf,
    });

    return NextResponse.json({ costReport, wasFlagged }, { status: 201 });
  } catch (err: unknown) {
    console.error('[cost-reports POST]', err);
    captureServerException(err, {
      properties: { source: 'cost_reports', method: 'POST' },
    });
    await flushPostHog();
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const citySlug = searchParams.get('city') || 'warsaw';
  const district = searchParams.get('district');
  const search = searchParams.get('search');

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    include: { districts: true },
  });

  if (!city) {
    return NextResponse.json({ error: 'City not found' }, { status: 404 });
  }

  const buildingWhere: Record<string, unknown> = { cityId: city.id };

  if (district) {
    buildingWhere.district = { slug: district };
  }

  if (search) {
    buildingWhere.addressFull = { contains: search, mode: 'insensitive' };
  }

  const buildings = await prisma.building.findMany({
    where: {
      ...buildingWhere,
      costReports: { some: { isVisible: true } },
    },
    include: {
      district: true,
      costReports: {
        where: { isVisible: true },
        select: {
          rent: true,
          adminFee: true,
          totalMonthlyAvg: true,
          electricityAvg: true,
          gas: true,
          heating: true,
          water: true,
          internet: true,
          rentalType: true,
        },
      },
    },
    orderBy: { costReports: { _count: 'desc' } },
  });

  const result = buildings.map((b) => {
    const reports = b.costReports;
    const count = reports.length;

    const avg = (field: keyof (typeof reports)[0]) => {
      const values = reports
        .map((r) => r[field])
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .map(Number);
      if (values.length === 0) return null;
      return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    };

    const rentalTypes = reports.map((r) => r.rentalType).filter((v): v is string => v !== null);
    const dominantRentalType =
      rentalTypes.length > 0
        ? rentalTypes.sort(
            (a, b) =>
              rentalTypes.filter((v) => v === b).length - rentalTypes.filter((v) => v === a).length,
          )[0]
        : null;

    return {
      id: b.id,
      slug: b.slug,
      address: b.addressFull,
      district: b.district?.nameKey ?? '',
      districtSlug: b.district?.slug ?? '',
      reports: count,
      avgTotal: avg('totalMonthlyAvg'),
      avgRent: avg('rent'),
      avgUtilities:
        (avg('electricityAvg') || 0) +
        (avg('gas') || 0) +
        (avg('heating') || 0) +
        (avg('water') || 0) +
        (avg('internet') || 0),
      rentalType: dominantRentalType,
    };
  });

  return NextResponse.json({
    buildings: result,
    districts: city.districts.map((d) => ({ slug: d.slug, name: d.nameKey })),
  });
}
