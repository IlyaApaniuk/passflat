import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateProfile } from '@/lib/profile';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { trackServerEvent, flushPostHog, captureServerException } from '@/lib/posthog-server';
import { validateCostReport, capFreeText } from '@/lib/cost-validation';
import { median, perAreaValues } from '@/lib/cost-stats';
import { classifyRef } from '@/lib/referral';
import { generateBuildingSlug, transliterate } from '@/lib/slugify';
import { normalizeAddress, cleanStreet } from '@/lib/address';
import { resolveDistrictByPoint } from '@/lib/geo/district';
import { sanitizePeriodicCharges, periodicChargesMonthlyTotal } from '@/lib/periodic-charges';
import {
  IMPORT_AUTHOR_ID,
  IMPORT_AUTHOR_DISPLAY_NAME,
  SCRAPED_AUTHOR_ID,
  SCRAPED_AUTHOR_DISPLAY_NAME,
  ANON_AUTHOR_ID,
  ANON_AUTHOR_DISPLAY_NAME,
  isCostImportAdmin,
  getAdminImportMode,
} from '@/lib/import-constants';
import { ensureAnonId } from '@/lib/anon-id';
import { isAccountDeleted, ACCOUNT_DELETED_RESPONSE } from '@/lib/active-user';
import { revalidateCostSurfaces } from '@/lib/revalidate-costs';

// Submit rate limit (anti-spam): at most N reports per rolling window per user.
// Generous enough for someone genuinely filling several flats in one sitting,
// low enough to stop a flood.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_PER_WINDOW = 10;
// Platform-wide circuit breaker (genuine user submissions only). Set far above
// normal volume so only a coordinated multi-account flood trips it — caps how
// fast the medians can be poisoned regardless of how many accounts are used.
// NOTE: a slow distributed attack under this ceiling still needs IP/device-level
// limiting (shared store, e.g. Upstash) — a deliberate follow-up, not here.
const GLOBAL_RATE_LIMIT_MAX_PER_WINDOW = 200;

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
    if (user && (await isAccountDeleted(user.id))) {
      return NextResponse.json(ACCOUNT_DELETED_RESPONSE, { status: 403 });
    }
    // The cost form is open to logged-out visitors. An anonymous submission is
    // owned by the system ANON_AUTHOR_ID profile and tagged with a per-browser id
    // so it can be claimed on the visitor's first login (see lib/anon-id.ts).
    const isAnon = !user;
    const isAdmin = user ? isCostImportAdmin(user.email) : false;
    const anonId = isAnon ? await ensureAnonId() : null;

    // Anti-spam rate limit: cap how many reports one submitter can file per hour
    // so they can't flood (and poison) the medians — the only asset. For accounts
    // it's per-user; for anonymous submitters it's per-`anonymousId` (a cookie, so
    // resettable — the platform-wide guard below is the real backstop). Admins
    // doing bulk imports are exempt.
    if (!isAdmin) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
      const [recentCount, recentGlobal] = await Promise.all([
        prisma.costReport.count({
          where: isAnon
            ? { anonymousId: anonId, createdAt: { gt: windowStart } }
            : { authorId: user!.id, createdAt: { gt: windowStart } },
        }),
        // Platform-wide flood guard: many fresh accounts/browsers, each under the
        // per-submitter cap, could still bypass it — so also bound total user
        // submissions/hour.
        prisma.costReport.count({
          where: { source: 'user', createdAt: { gt: windowStart } },
        }),
      ]);
      if (
        recentCount >= RATE_LIMIT_MAX_PER_WINDOW ||
        recentGlobal >= GLOBAL_RATE_LIMIT_MAX_PER_WINDOW
      ) {
        return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
      }
    }

    // Guarantee a profile exists before any write that FKs to author_id (logged-in
    // only — anonymous reports are owned by the system ANON_AUTHOR_ID profile).
    // Snapshot is taken BEFORE this submission flips hasContributedCost, so we
    // can tell a first contribution from a repeat one for referral attribution.
    const profileBefore = user ? await getOrCreateProfile(user) : null;

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
      utilitiesComplete,
      rooms,
      areaM2,
      floor,
      rentalType,
      leaseType,
      depositMonths,
      depositReturned,
      depositReturnedAmount,
      depositReturnDays,
      isCurrentTenant,
      livedFrom,
      livedUntil,
      periodicCharges: periodicChargesInput,
      fillOnBehalf: fillOnBehalfInput,
      importedEmail: importedEmailInput,
      scrapedImport: scrapedImportInput,
      companyWebsite, // honeypot — hidden from humans, only bots fill it
    } = body;

    // Honeypot: the form renders an off-screen field no human sees. If it carries
    // a value the submitter is a bot — ACK with a success-shaped response and
    // write nothing, so the bot can't tell it was rejected. Cheap spam guard on
    // the now-open (logged-out) form.
    if (typeof companyWebsite === 'string' && companyWebsite.trim() !== '') {
      return NextResponse.json(
        { costReport: null, wasFlagged: false, comparison: null },
        { status: 201 },
      );
    }

    // Admin import modes: an authorized admin enters data through the normal
    // form, but the report is owned by a system profile rather than the admin.
    // ADMIN_IMPORT_MODE (env) selects which behaviour the admin section performs:
    //   'fill_on_behalf' — report is owned by the system "Imported" profile. The
    //      owner email is OPTIONAL: when given, the report auto-claims to that
    //      account on login (see auth/callback); when omitted it stays on
    //      Imported, unclaimed.
    //   'scraped' — report is owned by the system "Scraped" profile, has no
    //      owner email and is never claimed (used for scraped listings).
    // Coordinates still come from Places either way.
    const adminMode = getAdminImportMode();
    // Explicit flag is the signal (email is optional now); also treat a bare
    // importedEmail as a request for backward compatibility.
    const fillOnBehalfRequested = fillOnBehalfInput === true || importedEmailInput !== undefined;
    const scrapedRequested = scrapedImportInput === true;
    if ((fillOnBehalfRequested || scrapedRequested) && !isAdmin) {
      // Never let a non-admin (or anonymous) request attribute a report to a
      // system profile. Ignore the field and fall back to a normal submission.
      console.warn(
        `[cost-reports POST] non-admin submitter ${
          user?.id ?? `anon:${anonId}`
        } sent admin import fields; ignoring`,
      );
    }

    const fillOnBehalf = isAdmin && adminMode === 'fill_on_behalf' && fillOnBehalfRequested;
    const scrapedImport = isAdmin && adminMode === 'scraped' && scrapedRequested;
    const adminImport = fillOnBehalf || scrapedImport;

    // Fail loud instead of silently falling back. If an admin sent an import
    // signal that the active ADMIN_IMPORT_MODE can't honour, refuse the request
    // rather than quietly saving the report under the admin's own account — that
    // silent fallback is exactly how a batch once got mis-attributed and lost.
    if (isAdmin && (fillOnBehalfRequested || scrapedRequested) && !adminImport) {
      return NextResponse.json(
        {
          error: 'ADMIN_IMPORT_MODE_MISMATCH',
          message: `Admin import was requested but ADMIN_IMPORT_MODE is "${adminMode}". Set the matching mode (or remove the import field) — refusing to save under your own account.`,
        },
        { status: 400 },
      );
    }

    const normalizedImportedEmail =
      fillOnBehalf && typeof importedEmailInput === 'string' && importedEmailInput.trim()
        ? importedEmailInput.trim().toLowerCase()
        : null;
    const effectiveAuthorId = scrapedImport
      ? SCRAPED_AUTHOR_ID
      : fillOnBehalf
        ? IMPORT_AUTHOR_ID
        : isAnon
          ? ANON_AUTHOR_ID
          : user!.id;
    // Anonymous reports stay source 'user' so they count in the medians and the
    // North-Star supply metric; claimed/unclaimed is distinguished by authorId.
    const reportSource = scrapedImport ? 'scraped' : fillOnBehalf ? 'import' : 'user';

    const periodicCharges = sanitizePeriodicCharges(periodicChargesInput);

    // Core cost is rent (always required) plus utilities (collected via the form's
    // utilities block, not a separate czynsz field). Deposit is OPTIONAL — many
    // tenants don't recall the exact kaucja, and requiring it cost real submissions;
    // it stays a quality signal, not a gate. Area is required for whole apartments
    // but optional for a room (often an all-in price, exact m² unknown). adminFee
    // carries the lump-sum utilities ("komunalka") amount from the utilities block's
    // "enter amount" path; it stays nullable for the other utilities answers and for
    // legacy / admin-imported data.
    const isRoom = rentalType === 'room';
    const isEmpty = (v: unknown) => v == null || v === '';
    if (
      !street ||
      !buildingNumber ||
      isEmpty(rent) ||
      !rentalType ||
      (!isRoom && isEmpty(areaM2))
    ) {
      return NextResponse.json(
        {
          error: isRoom
            ? 'Missing required fields: street, buildingNumber, rent, rentalType'
            : 'Missing required fields: street, buildingNumber, rent, rentalType, areaM2',
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

    if (typeof citySlug !== 'string' || !citySlug.trim()) {
      return NextResponse.json({ error: 'Missing city' }, { status: 400 });
    }

    const city = await prisma.city.findUnique({
      where: { slug: citySlug },
      include: { districts: true, country: true },
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

    // Bounds are the authoritative location check and every active city must have
    // them. Surface the misconfiguration loudly so a new city can't ship without.
    if (city.isActive && !cityBounds) {
      console.error(
        `[cost-reports] active city "${city.slug}" has no bounds — cannot validate address`,
      );
    }

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
    }

    // Locality (city-name) check — runs IN ADDITION to the bounds box. The box is
    // a loose rectangle, so a neighbouring town (Pruszków, Ząbki…) can sit inside
    // it; Places returns that town's own locality, not "Warszawa", so this is what
    // actually rejects suburbs. Compare against the city's own names — its slug and
    // its localized name in the country's default locale (e.g. "Warszawa") — never
    // the slug alone (which would reject "Warszawa" != "warsaw").
    if (typeof placeCity === 'string' && placeCity.trim()) {
      const norm = (s: string) =>
        transliterate(s)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '');
      const tCity = await getTranslations({ locale: city.country.defaultLocale });
      const candidates = [city.slug, tCity(city.nameKey)].map(norm).filter(Boolean);
      const placeCityNorm = norm(placeCity);
      if (placeCityNorm && candidates.length && !candidates.includes(placeCityNorm)) {
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

    // Prefer matching the Google Places district name against known districts.
    // When that fails (e.g. Places returns a sub-neighbourhood like "Chrzanów"
    // instead of the dzielnica "Bemowo"), fall back to point-in-polygon on the
    // coordinates so the building still gets a district instead of null.
    let matchedDistrict = district
      ? city.districts.find((d) => d.slug === district.toLowerCase() || d.nameKey === district)
      : null;

    if (!matchedDistrict && latNum != null && lngNum != null) {
      const resolvedSlug = resolveDistrictByPoint(city.slug, latNum, lngNum);
      if (resolvedSlug) {
        matchedDistrict = city.districts.find((d) => d.slug === resolvedSlug) ?? null;
      }
    }

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
        where: isAnon
          ? { anonymousId: anonId, buildingId: building.id }
          : { authorId: user!.id, buildingId: building.id },
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

    // The system profile must exist before we point a report's FK at it.
    if (adminImport) {
      const [systemId, systemName] = scrapedImport
        ? [SCRAPED_AUTHOR_ID, SCRAPED_AUTHOR_DISPLAY_NAME]
        : [IMPORT_AUTHOR_ID, IMPORT_AUTHOR_DISPLAY_NAME];
      await prisma.profile.upsert({
        where: { id: systemId },
        create: { id: systemId, displayName: systemName },
        update: {},
      });
    }

    // Anonymous reports are owned by the system Anonymous profile until a login
    // claims them; ensure it exists before the report FKs to it.
    if (isAnon) {
      await prisma.profile.upsert({
        where: { id: ANON_AUTHOR_ID },
        create: { id: ANON_AUTHOR_ID, displayName: ANON_AUTHOR_DISPLAY_NAME },
        update: {},
      });
    }

    const costReport = await prisma.costReport.create({
      data: {
        buildingId: building.id,
        authorId: effectiveAuthorId,
        source: reportSource,
        importedEmail: fillOnBehalf ? normalizedImportedEmail : null,
        anonymousId: isAnon ? anonId : null,
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
        depositMonths: depositMonths ? parseFloat(depositMonths) : null,
        depositReturned: typeof depositReturned === 'boolean' ? depositReturned : null,
        depositReturnedAmount: depositReturnedAmount ? parseFloat(depositReturnedAmount) : null,
        depositReturnDays: depositReturnDays ? parseInt(depositReturnDays, 10) : null,
        isCurrentTenant: isCurrentTenant ?? null,
        livedFrom: livedFrom ? new Date(livedFrom) : null,
        livedUntil: livedUntil ? new Date(livedUntil) : null,
        isVisible: !wasFlagged,
        verificationStatus: wasFlagged ? 'flagged' : 'unverified',
        periodicCharges: periodicCharges.length ? { create: periodicCharges } : undefined,
      },
      include: { building: true, periodicCharges: true },
    });

    // Drop the cost caches now. The success screen links straight to the
    // building page, which is ISR-cached for an hour — without this the report
    // the visitor just filed is not there when they land on it.
    revalidateCostSurfaces({ citySlug: city.slug, buildingSlug: building.slug });

    // Only mark hasContributed for genuine self-submissions (not flagged, not an
    // admin import, and not anonymous). For anonymous reports this happens on the
    // visitor's first login, when the report is claimed (see lib/claim-reports.ts).
    if (!wasFlagged && !adminImport && user && profileBefore) {
      await prisma.profile.update({
        where: { id: user.id },
        data: { hasContributedCost: true },
      });

      // The conversion that actually matters for attribution: a referred user
      // making their FIRST real contribution. Fires once (only when this flips
      // false→true), letting PostHog measure which channel drives contributors,
      // not just sign-ups.
      if (!profileBefore.hasContributedCost && profileBefore.referredBy) {
        trackServerEvent(user.id, 'referred_contribution', {
          referred_by: profileBefore.referredBy,
          referral_type: classifyRef(profileBefore.referredBy),
          building_id: building.id,
        });
      }
    }

    trackServerEvent(user?.id ?? anonId!, 'cost_report_submitted', {
      building_id: building.id,
      city: citySlug,
      // The report's provenance (user | import | scraped) so PostHog cohorts can
      // separate organic contributions from seeded data — the North-Star signal.
      source: reportSource,
      was_flagged: wasFlagged,
      fill_on_behalf: fillOnBehalf,
      scraped_import: scrapedImport,
      anonymous: isAnon,
    });

    // Post-submit payload for the "you vs your district" comparison + the
    // district-fill share nudge (the share trigger). The just-created report is
    // included in the district median. District filling is the realistic viral
    // unit — reachable via area chats, no fragile apartment-count denominator.
    const [buildingReportCount, bldgDistrict, districtReports] = await Promise.all([
      prisma.costReport.count({ where: { buildingId: building.id, isVisible: true } }),
      building.districtId
        ? prisma.district.findUnique({
            where: { id: building.districtId },
            select: { nameKey: true, slug: true },
          })
        : Promise.resolve(null),
      building.districtId
        ? prisma.costReport.findMany({
            where: {
              building: { districtId: building.districtId },
              isVisible: true,
              totalMonthlyAvg: { not: null },
            },
            select: { totalMonthlyAvg: true, rent: true, areaM2: true },
            take: 5000,
          })
        : Promise.resolve([]),
    ]);

    // Per-m² figures (rent + total) for both the user and the district median,
    // so the comparison holds across different flat sizes — not just headline rent.
    const toNum = (v: unknown) => (v == null ? null : Number(v));
    const userArea = areaM2 ? parseFloat(areaM2) : null;
    const userRentNum = rent ? parseFloat(rent) : null;
    const perM2 = (value: number | null) =>
      value != null && userArea != null && userArea > 0 ? Math.round(value / userArea) : null;
    const roundOrNull = (v: number | null) => (v == null ? null : Math.round(v));

    const comparison = {
      userTotal: totalMonthlyAvg || null,
      buildingReportCount,
      buildingSlug: building.slug,
      districtName: bldgDistrict?.nameKey ?? null,
      districtSlug: bldgDistrict?.slug ?? null,
      districtMedian: median(districtReports.map((r) => Number(r.totalMonthlyAvg))),
      districtReportCount: districtReports.length,
      userRentPerM2: perM2(userRentNum),
      userTotalPerM2: perM2(totalMonthlyAvg || null),
      districtMedianRentPerM2: roundOrNull(
        median(
          perAreaValues(
            districtReports.map((r) => ({ value: toNum(r.rent), areaM2: toNum(r.areaM2) })),
          ),
        ),
      ),
      districtMedianTotalPerM2: roundOrNull(
        median(
          perAreaValues(
            districtReports.map((r) => ({
              value: toNum(r.totalMonthlyAvg),
              areaM2: toNum(r.areaM2),
            })),
          ),
        ),
      ),
    };

    return NextResponse.json({ costReport, wasFlagged, comparison }, { status: 201 });
  } catch (err: unknown) {
    console.error('[cost-reports POST]', err);
    captureServerException(err, {
      properties: { source: 'cost_reports', method: 'POST' },
    });
    await flushPostHog();
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Buildings returned by GET. Bounded because this endpoint is public and
 *  uncached, and its per-building join grows with every report we collect. */
const GET_BUILDINGS_LIMIT = 200;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const citySlug = searchParams.get('city') || 'warsaw';
  const district = searchParams.get('district');
  const search = searchParams.get('search')?.trim().slice(0, 64) || null;

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
    take: GET_BUILDINGS_LIMIT,
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
