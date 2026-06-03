import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import type { CityBounds } from '@/lib/listings-data';
import { isCostImportAdmin } from '@/lib/import-constants';
import { CostSubmitClient } from './client';

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SubmitCostsPage({ params, searchParams }: PageProps) {
  const { city: citySlug, locale } = await params;
  const search = await searchParams;
  const isEditMode = search.edit === 'true';
  const reportId = typeof search.id === 'string' ? search.id : undefined;

  const city = await prisma.city.findUnique({ where: { slug: citySlug } });
  if (!city || !city.isActive) notFound();

  const t = await getTranslations();
  const cityName = t(city.nameKey);
  const cityBounds = (city.bounds as CityBounds | null) ?? undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login?next=/${locale}/${citySlug}/costs/submit`);
  }

  const canFillOnBehalf = isCostImportAdmin(user.email);

  let existingReport = null;
  if (isEditMode) {
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
        areaM2: report.areaM2 ? String(report.areaM2) : '',
        rooms: report.rooms ? String(report.rooms) : '',
        floor: report.floor ? String(report.floor) : '',
        rent: report.rent ? String(report.rent) : '',
        adminFee: report.adminFee ? String(report.adminFee) : '',
        deposit: report.depositAmount ? String(report.depositAmount) : '',
        extraBills: '',
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
      cityBounds={cityBounds}
      editMode={isEditMode && existingReport != null}
      existingReport={existingReport}
      canFillOnBehalf={canFillOnBehalf}
    />
  );
}
