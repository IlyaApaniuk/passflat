'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/landing/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Check,
  Building2,
  Zap,
  Flame,
  Wifi,
  Droplets,
  Home,
  Lock,
  Loader2,
  Shield,
  AlertTriangle,
  Pencil,
  Mail,
  RefreshCw,
  Plus,
  X,
} from 'lucide-react';
import { AddressAutocomplete, type PlaceResult } from '@/components/listings/address-autocomplete';
import type { CityBounds } from '@/lib/listings-data';
import {
  PERIODIC_CATEGORIES,
  PERIODIC_FREQUENCIES,
  monthlyEquivalent,
  type PeriodicCategory,
  type PeriodicFrequency,
} from '@/lib/periodic-charges';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: 'easeOut' as const },
  }),
};

const CATEGORY_LABEL_KEY: Record<PeriodicCategory, string> = {
  water: 'catWater',
  electricity: 'catElectricity',
  gas: 'catGas',
  heating: 'catHeating',
  other: 'catOther',
};

const FREQUENCY_LABEL_KEY: Record<PeriodicFrequency, string> = {
  bimonthly: 'freqBimonthly',
  quarterly: 'freqQuarterly',
  semiannual: 'freqSemiannual',
  annual: 'freqAnnual',
};

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface ExistingReport {
  id: string;
  street: string;
  buildingNumber: string;
  district: string;
  placeId: string;
  lat: number;
  lng: number;
  rentalType: '' | 'apartment' | 'room';
  areaM2: string;
  rooms: string;
  floor: string;
  rent: string;
  adminFee: string;
  deposit: string;
  extraBills: string;
  electricity: string;
  electricityIncluded: boolean;
  electricityWinter: string;
  electricitySummer: string;
  gas: string;
  heating: string;
  heatingIncluded: boolean;
  heatingWinter: string;
  heatingSummer: string;
  water: string;
  waterIncluded: boolean;
  internet: string;
  internetProvider: string;
  other: string;
  otherCostsNote: string;
  periodicCharges: PeriodicChargeRow[];
}

interface PeriodicChargeRow {
  category: PeriodicCategory;
  amount: string;
  frequency: PeriodicFrequency;
  note: string;
}

function hasDetailedUtilities(report: ExistingReport): boolean {
  return !!(
    report.electricity ||
    report.electricityIncluded ||
    report.electricityWinter ||
    report.electricitySummer ||
    report.gas ||
    report.heating ||
    report.heatingIncluded ||
    report.heatingWinter ||
    report.heatingSummer ||
    report.water ||
    report.waterIncluded ||
    report.internet ||
    report.other
  );
}

interface CostSubmitClientProps {
  citySlug: string;
  cityName: string;
  cityBounds?: CityBounds;
  editMode?: boolean;
  existingReport?: ExistingReport | null;
  canFillOnBehalf?: boolean;
}

function isInsideBounds(lat: number, lng: number, bounds: CityBounds): boolean {
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

export function CostSubmitClient({
  citySlug,
  cityName,
  cityBounds,
  editMode = false,
  existingReport = null,
  canFillOnBehalf = false,
}: CostSubmitClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const placeCityRef = useRef('');
  // Admin-only "fill on behalf": owner email links the report to that account
  // when they log in. Only available for new submissions, never edits.
  const showFillOnBehalf = canFillOnBehalf && !editMode;
  const [ownerEmail, setOwnerEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [wasFlagged, setWasFlagged] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rentalTypeError, setRentalTypeError] = useState(false);
  const rentalTypeRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState(
    existingReport
      ? { ...existingReport }
      : {
          rentalType: '' as '' | 'apartment' | 'room',
          street: '',
          buildingNumber: '',
          district: '',
          placeId: '',
          lat: 0,
          lng: 0,
          areaM2: '',
          rooms: '',
          floor: '',
          rent: '',
          adminFee: '',
          deposit: '',
          extraBills: '',
          electricity: '',
          electricityIncluded: false,
          electricityWinter: '',
          electricitySummer: '',
          gas: '',
          heating: '',
          heatingIncluded: false,
          heatingWinter: '',
          heatingSummer: '',
          water: '',
          waterIncluded: false,
          internet: '',
          internetProvider: '',
          other: '',
          otherCostsNote: '',
          periodicCharges: [] as PeriodicChargeRow[],
        },
  );

  const [showDetailedUtilities, setShowDetailedUtilities] = useState(
    () => !!(existingReport && hasDetailedUtilities(existingReport)),
  );
  const [showElectricitySeasonal, setShowElectricitySeasonal] = useState(
    () => !!(existingReport?.electricityWinter || existingReport?.electricitySummer),
  );
  const [showHeatingSeasonal, setShowHeatingSeasonal] = useState(
    () => !!(existingReport?.heatingWinter || existingReport?.heatingSummer),
  );
  const [showPeriodic, setShowPeriodic] = useState(() => !!existingReport?.periodicCharges?.length);

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const addPeriodicRow = () => {
    setShowPeriodic(true);
    setFormData((prev) => ({
      ...prev,
      periodicCharges: [
        ...prev.periodicCharges,
        { category: 'water', amount: '', frequency: 'semiannual', note: '' },
      ],
    }));
  };

  const updatePeriodicRow = (index: number, patch: Partial<PeriodicChargeRow>) => {
    setFormData((prev) => ({
      ...prev,
      periodicCharges: prev.periodicCharges.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const removePeriodicRow = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      periodicCharges: prev.periodicCharges.filter((_, i) => i !== index),
    }));
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    if (cityBounds && place.lat && place.lng && !isInsideBounds(place.lat, place.lng, cityBounds)) {
      setError(t('costs.submit.addressOutsideCity', { city: cityName }));
      return;
    }
    setError(null);
    placeCityRef.current = place.city;
    updateFormData({
      street: place.street,
      buildingNumber: place.buildingNumber,
      district: place.district,
      placeId: place.placeId,
      lat: place.lat,
      lng: place.lng,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rentalType) {
      setRentalTypeError(true);
      rentalTypeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setRentalTypeError(false);
    setSubmitting(true);
    setError(null);

    try {
      const url =
        editMode && existingReport ? `/api/cost-reports/${existingReport.id}` : '/api/cost-reports';
      const method = editMode && existingReport ? 'PATCH' : 'POST';

      const utilityFields = showDetailedUtilities
        ? {
            electricity: formData.electricityIncluded
              ? undefined
              : formData.electricity || undefined,
            electricityIncluded: formData.electricityIncluded || undefined,
            electricityWinter:
              (!formData.electricityIncluded &&
                showElectricitySeasonal &&
                formData.electricityWinter) ||
              undefined,
            electricitySummer:
              (!formData.electricityIncluded &&
                showElectricitySeasonal &&
                formData.electricitySummer) ||
              undefined,
            gas: formData.gas || undefined,
            heating: formData.heatingIncluded ? undefined : formData.heating || undefined,
            heatingIncluded: formData.heatingIncluded || undefined,
            heatingWinter:
              (!formData.heatingIncluded && showHeatingSeasonal && formData.heatingWinter) ||
              undefined,
            heatingSummer:
              (!formData.heatingIncluded && showHeatingSeasonal && formData.heatingSummer) ||
              undefined,
            water: formData.waterIncluded ? undefined : formData.water || undefined,
            waterIncluded: formData.waterIncluded || undefined,
            internet: formData.internet || undefined,
            internetProvider: formData.internetProvider || undefined,
            otherCosts: formData.other || undefined,
            otherCostsNote: formData.otherCostsNote || undefined,
          }
        : {
            otherCosts: formData.extraBills || undefined,
          };

      const sharedFields = {
        rent: formData.rent || undefined,
        adminFee: formData.adminFee || undefined,
        deposit: formData.deposit || undefined,
        ...utilityFields,
        rooms: formData.rooms || undefined,
        areaM2: formData.areaM2 || undefined,
        floor: formData.floor || undefined,
        rentalType: formData.rentalType || undefined,
        periodicCharges: formData.periodicCharges
          .map((c) => ({
            category: c.category,
            amount: c.amount ? parseFloat(c.amount) : NaN,
            frequency: c.frequency,
            note: c.note || undefined,
          }))
          .filter((c) => Number.isFinite(c.amount) && c.amount > 0),
      };

      const requestBody = editMode
        ? sharedFields
        : {
            street: formData.street,
            buildingNumber: formData.buildingNumber,
            district: formData.district,
            placeId: formData.placeId || undefined,
            lat: formData.lat || undefined,
            lng: formData.lng || undefined,
            citySlug,
            placeCity: placeCityRef.current || undefined,
            isCurrentTenant: true,
            ...(showFillOnBehalf && ownerEmail.trim() ? { importedEmail: ownerEmail.trim() } : {}),
            ...sharedFields,
          };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server error (${response.status})`);
      }

      if (!response.ok) {
        if (data.error === 'ADDRESS_OUTSIDE_CITY') {
          throw new Error(t('costs.submit.addressOutsideCity', { city: cityName }));
        }
        throw new Error((data.error as string) || 'Failed to submit');
      }

      const costReport = data.costReport as { id?: string } | undefined;
      setSubmittedReportId(costReport?.id ?? null);
      setWasFlagged((data.wasFlagged as boolean) ?? false);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveElectricity = formData.electricityIncluded
    ? 0
    : showElectricitySeasonal && (formData.electricityWinter || formData.electricitySummer)
      ? Math.round(
          ((parseInt(formData.electricityWinter) || 0) +
            (parseInt(formData.electricitySummer) || 0)) /
            2,
        )
      : parseInt(formData.electricity) || 0;

  const effectiveHeating = formData.heatingIncluded
    ? 0
    : showHeatingSeasonal && (formData.heatingWinter || formData.heatingSummer)
      ? Math.round(
          ((parseInt(formData.heatingWinter) || 0) + (parseInt(formData.heatingSummer) || 0)) / 2,
        )
      : parseInt(formData.heating) || 0;

  const effectiveWater = formData.waterIncluded ? 0 : parseInt(formData.water) || 0;

  const detailedUtilities =
    effectiveElectricity +
    (parseInt(formData.gas) || 0) +
    effectiveHeating +
    effectiveWater +
    (parseInt(formData.internet) || 0) +
    (parseInt(formData.other) || 0);

  const totalUtilities = showDetailedUtilities
    ? detailedUtilities
    : parseInt(formData.extraBills) || 0;

  const periodicMonthly = Math.round(
    formData.periodicCharges.reduce((sum, c) => {
      const amt = parseFloat(c.amount);
      if (!Number.isFinite(amt) || amt <= 0) return sum;
      return sum + monthlyEquivalent(amt, c.frequency);
    }, 0),
  );

  const totalMonthly =
    (parseInt(formData.rent) || 0) +
    (parseInt(formData.adminFee) || 0) +
    totalUtilities +
    periodicMonthly;

  if (submitted && wasFlagged) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center p-8 pt-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
          >
            <Card className="w-full max-w-md text-center">
              <CardContent className="pt-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', bounce: 0.5 }}
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
                >
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </motion.div>
                <h1 className="text-2xl font-bold">{t('costs.submit.flaggedTitle')}</h1>
                <p className="mt-2 text-muted-foreground">{t('costs.submit.flaggedDesc')}</p>
                <div className="mt-6 flex flex-col gap-3">
                  <Button asChild>
                    <Link
                      href={`/${citySlug}/costs/submit?edit=true${
                        submittedReportId ? `&id=${submittedReportId}` : ''
                      }`}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('costs.submit.editReport')}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={'/contact?subject=costs' as '/'}>
                      <Mail className="mr-2 h-4 w-4" />
                      {t('costs.submit.contactUs')}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center p-8 pt-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
          >
            <Card className="w-full max-w-md text-center">
              <CardContent className="pt-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', bounce: 0.5 }}
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                >
                  <Check className="h-8 w-8 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-bold">{t('costs.submit.thankYou')}</h1>
                <p className="mt-2 text-muted-foreground">{t('costs.submit.thankYouDesc')}</p>
                <div className="mt-6 flex flex-col gap-3">
                  <Button asChild>
                    <Link href={{ pathname: '/dashboard', query: { tab: 'costs' } }}>
                      {t('costs.submit.viewMyReports')}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/${citySlug}/costs`}>{t('costs.submit.viewCostReports')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link href={`/${citySlug}/costs`}>
                <ArrowLeft className="h-4 w-4" />
                {t('costs.submit.backToCosts')}
              </Link>
            </Button>
          </motion.div>

          <div className="mx-auto max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8 text-center"
            >
              <h1 className="text-2xl font-bold md:text-3xl">
                {editMode ? t('costs.submit.editPageTitle') : t('costs.submit.pageTitle')}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {editMode ? t('costs.submit.editPageSubtitle') : t('costs.submit.pageSubtitle')}
              </p>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-6">
              <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Building2 className="h-5 w-5" />
                      {t('costs.submit.yourAddress')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div ref={rentalTypeRef} className="space-y-2">
                      <Label>{t('costs.submit.rentalType')} *</Label>
                      <div className="flex gap-2">
                        {(['apartment', 'room'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              updateFormData({ rentalType: type });
                              setRentalTypeError(false);
                            }}
                            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                              formData.rentalType === type
                                ? 'border-primary bg-primary/10 text-primary'
                                : rentalTypeError
                                  ? 'border-destructive/50 bg-background text-muted-foreground hover:bg-muted/50'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                            }`}
                          >
                            {type === 'apartment'
                              ? t('costs.submit.wholeApartment')
                              : t('costs.submit.room')}
                          </button>
                        ))}
                      </div>
                      {rentalTypeError && (
                        <p className="text-xs text-destructive">
                          {t('costs.submit.rentalTypeRequired')}
                        </p>
                      )}
                    </div>

                    {!editMode && (
                      <div className="space-y-2">
                        <Label>{t('listings.create.searchAddress')}</Label>
                        <AddressAutocomplete
                          onPlaceSelect={handlePlaceSelect}
                          placeholder={t('listings.create.addressPlaceholder')}
                          bounds={cityBounds}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('listings.create.addressHint')}
                        </p>
                      </div>
                    )}

                    {showFillOnBehalf && (
                      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                        <Label htmlFor="ownerEmail">{t('costs.submit.ownerEmail')}</Label>
                        <Input
                          id="ownerEmail"
                          type="email"
                          placeholder="owner@example.com"
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('costs.submit.ownerEmailHint')}
                        </p>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="street">{t('costs.submit.street')} *</Label>
                        <Input
                          id="street"
                          required
                          readOnly
                          className="bg-muted"
                          placeholder="e.g., Marszałkowska"
                          value={formData.street}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="buildingNumber">{t('costs.submit.buildingNo')} *</Label>
                        <Input
                          id="buildingNumber"
                          required
                          readOnly={editMode}
                          className={editMode ? 'bg-muted' : ''}
                          placeholder="e.g., 45"
                          value={formData.buildingNumber}
                          onChange={(e) =>
                            updateFormData({
                              buildingNumber: e.target.value,
                              placeId: '',
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="areaM2">{t('costs.submit.size')} *</Label>
                        <Input
                          id="areaM2"
                          type="number"
                          min="0"
                          required
                          placeholder="e.g., 45"
                          value={formData.areaM2}
                          onChange={(e) => updateFormData({ areaM2: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rooms">{t('costs.submit.rooms')}</Label>
                        <Input
                          id="rooms"
                          type="number"
                          min="1"
                          placeholder="e.g., 2"
                          value={formData.rooms}
                          onChange={(e) => updateFormData({ rooms: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="floor">{t('costs.submit.floor')}</Label>
                        <Input
                          id="floor"
                          type="number"
                          min="0"
                          placeholder="e.g., 3"
                          value={formData.floor}
                          onChange={(e) => updateFormData({ floor: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Home className="h-5 w-5" />
                      {t('costs.submit.baseCosts')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="rent">{t('costs.submit.rent')} *</Label>
                        <Input
                          id="rent"
                          type="number"
                          min="0"
                          required
                          placeholder="e.g., 3200"
                          value={formData.rent}
                          onChange={(e) => updateFormData({ rent: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminFee">{t('costs.submit.adminFeeCzynsz')} *</Label>
                        <Input
                          id="adminFee"
                          type="number"
                          min="0"
                          required
                          placeholder="e.g., 350"
                          value={formData.adminFee}
                          onChange={(e) => updateFormData({ adminFee: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="deposit" className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          {t('costs.submit.deposit')} *
                        </Label>
                        <Input
                          id="deposit"
                          type="number"
                          min="0"
                          required
                          placeholder="e.g., 5000"
                          value={formData.deposit}
                          onChange={(e) => updateFormData({ deposit: e.target.value })}
                        />
                      </div>
                    </div>

                    {!showDetailedUtilities && (
                      <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="extraBills">{t('costs.submit.extraBills')}</Label>
                        <Input
                          id="extraBills"
                          type="number"
                          min="0"
                          placeholder="e.g., 300"
                          value={formData.extraBills}
                          onChange={(e) => updateFormData({ extraBills: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('costs.submit.extraBillsHint')}
                        </p>
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => {
                            setShowDetailedUtilities(true);
                            updateFormData({ extraBills: '' });
                          }}
                        >
                          {t('costs.submit.breakItDown')}
                        </button>
                      </div>
                    )}

                    {showDetailedUtilities && (
                      <div className="space-y-5 border-t pt-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-muted-foreground">
                            {t('costs.submit.utilitiesTitle')}
                          </p>
                          <button
                            type="button"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() => {
                              const sum = detailedUtilities;
                              setShowDetailedUtilities(false);
                              setShowElectricitySeasonal(false);
                              setShowHeatingSeasonal(false);
                              updateFormData({
                                extraBills: sum > 0 ? String(sum) : '',
                                electricity: '',
                                electricityIncluded: false,
                                electricityWinter: '',
                                electricitySummer: '',
                                gas: '',
                                heating: '',
                                heatingIncluded: false,
                                heatingWinter: '',
                                heatingSummer: '',
                                water: '',
                                waterIncluded: false,
                                internet: '',
                                internetProvider: '',
                                other: '',
                                otherCostsNote: '',
                              });
                            }}
                          >
                            {t('costs.submit.backToSimple')}
                          </button>
                        </div>

                        {/* Electricity */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="electricity" className="flex items-center gap-2">
                              <Zap className="h-4 w-4 text-yellow-500" />
                              {t('costs.submit.electricity')}
                            </Label>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                                checked={formData.electricityIncluded}
                                onChange={(e) => {
                                  updateFormData({
                                    electricityIncluded: e.target.checked,
                                    ...(e.target.checked
                                      ? {
                                          electricity: '',
                                          electricityWinter: '',
                                          electricitySummer: '',
                                        }
                                      : {}),
                                  });
                                  if (e.target.checked) setShowElectricitySeasonal(false);
                                }}
                              />
                              {t('costs.submit.includedInRent')}
                            </label>
                          </div>
                          {!formData.electricityIncluded && !showElectricitySeasonal && (
                            <Input
                              id="electricity"
                              type="number"
                              min="0"
                              placeholder="e.g., 150"
                              value={formData.electricity}
                              onChange={(e) => updateFormData({ electricity: e.target.value })}
                            />
                          )}
                          {!formData.electricityIncluded && showElectricitySeasonal && (
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min="0"
                                placeholder={t('costs.submit.winter')}
                                value={formData.electricityWinter}
                                onChange={(e) =>
                                  updateFormData({ electricityWinter: e.target.value })
                                }
                              />
                              <Input
                                type="number"
                                min="0"
                                placeholder={t('costs.submit.summer')}
                                value={formData.electricitySummer}
                                onChange={(e) =>
                                  updateFormData({ electricitySummer: e.target.value })
                                }
                              />
                            </div>
                          )}
                          {!formData.electricityIncluded && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              onClick={() => {
                                setShowElectricitySeasonal((v) => !v);
                                updateFormData({
                                  electricity: '',
                                  electricityWinter: '',
                                  electricitySummer: '',
                                });
                              }}
                            >
                              {showElectricitySeasonal
                                ? t('costs.submit.electricity')
                                : t('costs.submit.specifySeasonally')}
                            </button>
                          )}
                          {formData.electricityIncluded && (
                            <p className="text-xs text-muted-foreground italic">
                              {t('costs.submit.includedInRent')}
                            </p>
                          )}
                        </div>

                        {/* Gas */}
                        <div className="space-y-2">
                          <Label htmlFor="gas" className="flex items-center gap-2">
                            <Flame className="h-4 w-4 text-orange-500" />
                            {t('costs.submit.gas')}
                          </Label>
                          <Input
                            id="gas"
                            type="number"
                            min="0"
                            placeholder="e.g., 80"
                            value={formData.gas}
                            onChange={(e) => updateFormData({ gas: e.target.value })}
                          />
                        </div>

                        {/* Heating */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="heating" className="flex items-center gap-2">
                              <Flame className="h-4 w-4 text-red-500" />
                              {t('costs.submit.heating')}
                            </Label>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                                checked={formData.heatingIncluded}
                                onChange={(e) => {
                                  updateFormData({
                                    heatingIncluded: e.target.checked,
                                    ...(e.target.checked
                                      ? { heating: '', heatingWinter: '', heatingSummer: '' }
                                      : {}),
                                  });
                                  if (e.target.checked) setShowHeatingSeasonal(false);
                                }}
                              />
                              {t('costs.submit.includedInRent')}
                            </label>
                          </div>
                          {!formData.heatingIncluded && !showHeatingSeasonal && (
                            <Input
                              id="heating"
                              type="number"
                              min="0"
                              placeholder="e.g., 200"
                              value={formData.heating}
                              onChange={(e) => updateFormData({ heating: e.target.value })}
                            />
                          )}
                          {!formData.heatingIncluded && showHeatingSeasonal && (
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min="0"
                                placeholder={t('costs.submit.winter')}
                                value={formData.heatingWinter}
                                onChange={(e) => updateFormData({ heatingWinter: e.target.value })}
                              />
                              <Input
                                type="number"
                                min="0"
                                placeholder={t('costs.submit.summer')}
                                value={formData.heatingSummer}
                                onChange={(e) => updateFormData({ heatingSummer: e.target.value })}
                              />
                            </div>
                          )}
                          {!formData.heatingIncluded && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              onClick={() => {
                                setShowHeatingSeasonal((v) => !v);
                                updateFormData({
                                  heating: '',
                                  heatingWinter: '',
                                  heatingSummer: '',
                                });
                              }}
                            >
                              {showHeatingSeasonal
                                ? t('costs.submit.heating')
                                : t('costs.submit.specifySeasonally')}
                            </button>
                          )}
                          {formData.heatingIncluded && (
                            <p className="text-xs text-muted-foreground italic">
                              {t('costs.submit.includedInRent')}
                            </p>
                          )}
                        </div>

                        {/* Water */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="water" className="flex items-center gap-2">
                              <Droplets className="h-4 w-4 text-blue-500" />
                              {t('costs.submit.water')}
                            </Label>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-primary"
                                checked={formData.waterIncluded}
                                onChange={(e) => {
                                  updateFormData({
                                    waterIncluded: e.target.checked,
                                    ...(e.target.checked ? { water: '' } : {}),
                                  });
                                }}
                              />
                              {t('costs.submit.includedInRent')}
                            </label>
                          </div>
                          {!formData.waterIncluded && (
                            <Input
                              id="water"
                              type="number"
                              min="0"
                              placeholder="e.g., 50"
                              value={formData.water}
                              onChange={(e) => updateFormData({ water: e.target.value })}
                            />
                          )}
                          {formData.waterIncluded && (
                            <p className="text-xs text-muted-foreground italic">
                              {t('costs.submit.includedInRent')}
                            </p>
                          )}
                        </div>

                        {/* Internet */}
                        <div className="space-y-2">
                          <Label htmlFor="internet" className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-primary" />
                            {t('costs.submit.internet')}
                          </Label>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              id="internet"
                              type="number"
                              min="0"
                              placeholder="e.g., 79"
                              value={formData.internet}
                              onChange={(e) => updateFormData({ internet: e.target.value })}
                            />
                            <Input
                              type="text"
                              placeholder={t('costs.submit.internetProviderPlaceholder')}
                              value={formData.internetProvider}
                              onChange={(e) => updateFormData({ internetProvider: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Other */}
                        <div className="space-y-2">
                          <Label htmlFor="other">{t('costs.submit.other')}</Label>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              id="other"
                              type="number"
                              min="0"
                              placeholder="e.g., 30"
                              value={formData.other}
                              onChange={(e) => updateFormData({ other: e.target.value })}
                            />
                            <Input
                              type="text"
                              placeholder={t('costs.submit.otherCostsNotePlaceholder')}
                              value={formData.otherCostsNote}
                              onChange={(e) => updateFormData({ otherCostsNote: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Periodic surcharges / recalculations */}
                    <div className="border-t pt-4">
                      {!showPeriodic && formData.periodicCharges.length === 0 ? (
                        <button
                          type="button"
                          onClick={addPeriodicRow}
                          className="flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {t('costs.submit.periodicAddButton')}
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <RefreshCw className="h-4 w-4" />
                              {t('costs.submit.periodicSectionTitle')}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('costs.submit.periodicSectionHint')}
                            </p>
                          </div>

                          {formData.periodicCharges.map((row, i) => {
                            const amt = parseFloat(row.amount);
                            const perMonth =
                              Number.isFinite(amt) && amt > 0
                                ? Math.round(monthlyEquivalent(amt, row.frequency))
                                : null;
                            return (
                              <div
                                key={i}
                                className="space-y-2 rounded-lg border border-border bg-background p-3"
                              >
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <select
                                    className={selectClass}
                                    value={row.category}
                                    onChange={(e) =>
                                      updatePeriodicRow(i, {
                                        category: e.target.value as PeriodicCategory,
                                      })
                                    }
                                  >
                                    {PERIODIC_CATEGORIES.map((c) => (
                                      <option key={c} value={c}>
                                        {t(`costs.submit.${CATEGORY_LABEL_KEY[c]}`)}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    className={selectClass}
                                    value={row.frequency}
                                    onChange={(e) =>
                                      updatePeriodicRow(i, {
                                        frequency: e.target.value as PeriodicFrequency,
                                      })
                                    }
                                  >
                                    {PERIODIC_FREQUENCIES.map((f) => (
                                      <option key={f} value={f}>
                                        {t(`costs.submit.${FREQUENCY_LABEL_KEY[f]}`)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder={t('costs.submit.periodicAmountPlaceholder')}
                                    value={row.amount}
                                    onChange={(e) =>
                                      updatePeriodicRow(i, { amount: e.target.value })
                                    }
                                  />
                                  <Input
                                    type="text"
                                    placeholder={t('costs.submit.periodicNotePlaceholder')}
                                    value={row.note}
                                    onChange={(e) => updatePeriodicRow(i, { note: e.target.value })}
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {perMonth != null
                                      ? `≈ ${perMonth.toLocaleString()} PLN/${t('costs.submit.periodicPerMonth')}`
                                      : ''}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removePeriodicRow(i)}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    {t('costs.submit.periodicRemove')}
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            onClick={addPeriodicRow}
                            className="flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t('costs.submit.periodicAddRow')}
                          </button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <AnimatePresence>
                {totalMonthly > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t('costs.submit.baseRentAdmin')}
                            </span>
                            <span>
                              {(
                                (parseInt(formData.rent) || 0) + (parseInt(formData.adminFee) || 0)
                              ).toLocaleString()}{' '}
                              PLN
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t('costs.submit.utilitiesLabel')}
                            </span>
                            <span>{totalUtilities.toLocaleString()} PLN</span>
                          </div>
                          {periodicMonthly > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                {t('costs.submit.periodicSummaryLabel')}
                              </span>
                              <span>{periodicMonthly.toLocaleString()} PLN</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t pt-2">
                            <span className="font-semibold">{t('common.totalMonthly')}</span>
                            <span className="text-xl font-bold text-primary">
                              {totalMonthly.toLocaleString()} PLN
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="flex items-start gap-3 pt-6">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">{t('costs.submit.privacyTitle')}</p>
                      <p className="mt-1 text-muted-foreground">{t('costs.submit.privacyDesc')}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  type="submit"
                  size="lg"
                  className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : editMode ? (
                    t('costs.submit.saveChanges')
                  ) : (
                    t('costs.submit.submitButton')
                  )}
                </Button>
              </motion.div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
