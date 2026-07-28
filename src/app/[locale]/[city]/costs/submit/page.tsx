import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import type { CityBounds } from '@/lib/listings-data';
import { isCostImportAdmin, getAdminImportMode } from '@/lib/import-constants';
import { CostSubmitClient } from './client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SubmitCostsPage({ params, searchParams }: PageProps) {
  const { city: citySlug } = await params;
  const search = await searchParams;
  const isEditMode = search.edit === 'true';
  const reportId = typeof search.id === 'string' ? search.id : undefined;
  // The checker, the building-review flow and the building page are the only
  // supported attribution sources. Never pass arbitrary query-string values
  // through to PostHog event properties.
  const source =
    search.source === 'checker' || search.source === 'review' || search.source === 'building'
      ? (search.source as 'checker' | 'review' | 'building')
      : undefined;
  const rawPlaceId = typeof search.p === 'string' ? search.p.trim() : '';
  const prefillPlaceId =
    !isEditMode && source != null && rawPlaceId.length > 0 && rawPlaceId.length <= 255
      ? rawPlaceId
      : undefined;
  // The building page links by id: a building can exist without a Google place
  // id, and re-resolving its address through autocomplete risks a different
  // place id splitting one building into two.
  const rawBuildingId = typeof search.b === 'string' ? search.b.trim() : '';
  const prefillBuildingId =
    !isEditMode && !prefillPlaceId && UUID_RE.test(rawBuildingId) ? rawBuildingId : undefined;

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    include: { country: true },
  });
  if (!city || !city.isActive) notFound();

  const t = await getTranslations();
  const cityName = t(city.nameKey);
  const cityBounds = (city.bounds as CityBounds | null) ?? undefined;
  // The city's name in the country's default locale (e.g. "Warszawa") — matches
  // what Google Places returns as the locality, so the client can reject a
  // neighbouring town picked from autocomplete right away (locale-agnostic: both
  // sides are the Polish spelling, unlike the user-facing localized cityName).
  const tCanonical = await getTranslations({ locale: city.country.defaultLocale });
  const cityCanonicalName = tCanonical(city.nameKey);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The form is open to logged-out visitors — anonymous submissions are owned by
  // a system profile and claimed on first login (no auth wall before data entry).
  const canFillOnBehalf = isCostImportAdmin(user?.email);
  const adminImportMode = getAdminImportMode();

  // Both flows persist a building before linking here, so prefill can be
  // reconstructed server-side from the opaque Google place id. Scope the
  // lookup to the route city to prevent a crafted URL prefilling another city.
  const prefillWhere = prefillPlaceId
    ? { cityId: city.id, placeId: prefillPlaceId }
    : prefillBuildingId
      ? { cityId: city.id, id: prefillBuildingId }
      : null;
  const prefillBuilding = prefillWhere
    ? await prisma.building.findFirst({
        where: prefillWhere,
        select: {
          id: true,
          street: true,
          buildingNumber: true,
          addressFull: true,
          placeId: true,
          lat: true,
          lng: true,
          district: { select: { slug: true } },
        },
      })
    : null;
  const prefill = prefillBuilding
    ? {
        buildingId: prefillBuilding.id,
        street: prefillBuilding.street,
        buildingNumber: prefillBuilding.buildingNumber,
        district: prefillBuilding.district?.slug ?? '',
        placeId: prefillBuilding.placeId ?? prefillPlaceId ?? '',
        lat: prefillBuilding.lat == null ? 0 : Number(prefillBuilding.lat),
        lng: prefillBuilding.lng == null ? 0 : Number(prefillBuilding.lng),
        addressFull: prefillBuilding.addressFull,
      }
    : null;

  let existingReport = null;
  // Editing an existing report is a logged-in action (matched by authorId); an
  // anonymous visitor only ever lands on a fresh submission.
  if (isEditMode && user) {
    const report = await prisma.costReport.findFirst({
      where: reportId ? { id: reportId, authorId: user.id } : { authorId: user.id },
      include: { building: true, periodicCharges: true },
      orderBy: { createdAt: 'desc' },
    });
    if (report) {
      existingReport = {
        id: report.id,
        street: report.building.street,
        buildingNumber: report.building.buildingNumber,
        district: '',
        placeId: report.building.placeId ?? '',
        lat: report.building.lat ? Number(report.building.lat) : 0,
        lng: report.building.lng ? Number(report.building.lng) : 0,
        rentalType: (report.rentalType ?? '') as '' | 'apartment' | 'room',
        leaseType: (report.leaseType ?? '') as '' | 'standard' | 'okazjonalny' | 'unknown',
        areaM2: report.areaM2 ? String(report.areaM2) : '',
        rooms: report.rooms ? String(report.rooms) : '',
        floor: report.floor ? String(report.floor) : '',
        rent: report.rent ? String(report.rent) : '',
        adminFee: report.adminFee ? String(report.adminFee) : '',
        deposit: report.depositAmount ? String(report.depositAmount) : '',
        electricity: report.electricityAvg ? String(report.electricityAvg) : '',
        electricityIncluded: report.electricityIncluded ?? false,
        electricityWinter: report.electricityWinter ? String(report.electricityWinter) : '',
        electricitySummer: report.electricitySummer ? String(report.electricitySummer) : '',
        gas: report.gas ? String(report.gas) : '',
        heating: report.heating ? String(report.heating) : '',
        heatingIncluded: report.heatingIncluded ?? false,
        heatingWinter: report.heatingWinter ? String(report.heatingWinter) : '',
        heatingSummer: report.heatingSummer ? String(report.heatingSummer) : '',
        water: report.water ? String(report.water) : '',
        waterIncluded: report.waterIncluded ?? false,
        internet: report.internet ? String(report.internet) : '',
        internetProvider: report.internetProvider ?? '',
        other: report.otherCosts ? String(report.otherCosts) : '',
        otherCostsNote: report.otherCostsNote ?? '',
        // Reconstruct the simple-mode utilities answer (ignored when a detailed
        // breakdown re-opens). A lump lives in adminFee → "amount"; otherwise the
        // completeness flag tells us "included" vs "don't know".
        utilitiesAnswer: (report.adminFee != null && Number(report.adminFee) > 0
          ? 'amount'
          : report.utilitiesComplete === false
            ? 'unknown'
            : report.utilitiesComplete === true
              ? 'included'
              : '') as '' | 'amount' | 'included' | 'unknown',
        isCurrentTenant: report.isCurrentTenant ?? true,
        livedFrom: report.livedFrom ? report.livedFrom.toISOString().slice(0, 7) : '',
        livedUntil: report.livedUntil ? report.livedUntil.toISOString().slice(0, 7) : '',
        depositReturned: (report.depositReturned === false
          ? 'no'
          : report.depositReturned === true
            ? report.depositReturnedAmount != null &&
              report.depositAmount != null &&
              Number(report.depositReturnedAmount) < Number(report.depositAmount)
              ? 'partial'
              : 'full'
            : '') as '' | 'full' | 'partial' | 'no',
        depositReturnedAmount:
          report.depositReturnedAmount != null ? String(report.depositReturnedAmount) : '',
        depositReturnDays: report.depositReturnDays ? String(report.depositReturnDays) : '',
        periodicCharges: report.periodicCharges.map((c) => ({
          category: c.category as 'water' | 'electricity' | 'gas' | 'heating' | 'other',
          amount: String(c.amount),
          frequency: c.frequency as 'bimonthly' | 'quarterly' | 'semiannual' | 'annual',
          note: c.note ?? '',
        })),
      };
    }
  }

  return (
    <CostSubmitClient
      citySlug={citySlug}
      cityName={cityName}
      cityCanonicalName={cityCanonicalName}
      cityBounds={cityBounds}
      userId={user?.id ?? null}
      editMode={isEditMode && existingReport != null}
      existingReport={existingReport}
      prefill={prefill}
      source={source}
      canFillOnBehalf={canFillOnBehalf}
      adminImportMode={adminImportMode}
    />
  );
}
