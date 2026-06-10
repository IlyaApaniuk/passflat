'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { AdminImportMode } from '@/lib/import-constants';
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
  CalendarClock,
  Save,
} from 'lucide-react';
import { AddressAutocomplete, type PlaceResult } from '@/components/listings/address-autocomplete';
import { MonthYearPicker } from '@/components/costs/month-year-picker';
import { ShareButton } from '@/components/costs/share-button';
import type { CityBounds } from '@/lib/listings-data';
import { FIELD_RANGES } from '@/lib/cost-validation';
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
  leaseType: '' | 'standard' | 'okazjonalny' | 'unknown';
  areaM2: string;
  rooms: string;
  floor: string;
  rent: string;
  adminFee: string;
  deposit: string;
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
  utilitiesAnswer: '' | 'amount' | 'included' | 'unknown';
  isCurrentTenant: boolean;
  livedFrom: string;
  livedUntil: string;
  depositReturned: '' | 'full' | 'partial' | 'no';
  depositReturnedAmount: string;
  depositReturnDays: string;
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
  /** The submitter's user id — appended as `?ref=` to the post-submit share so a
   *  friend who signs up + contributes is attributed to them (peer virality). */
  userId: string;
  editMode?: boolean;
  existingReport?: ExistingReport | null;
  canFillOnBehalf?: boolean;
  adminImportMode?: AdminImportMode;
}

function isInsideBounds(lat: number, lng: number, bounds: CityBounds): boolean {
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

// Blank form — used for a fresh submission and to reset when discarding a draft.
function makeEmptyForm() {
  return {
    rentalType: '' as '' | 'apartment' | 'room',
    leaseType: '' as '' | 'standard' | 'okazjonalny' | 'unknown',
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
    utilitiesAnswer: '' as '' | 'amount' | 'included' | 'unknown',
    isCurrentTenant: true,
    livedFrom: '',
    livedUntil: '',
    depositReturned: '' as '' | 'full' | 'partial' | 'no',
    depositReturnedAmount: '',
    depositReturnDays: '',
    periodicCharges: [] as PeriodicChargeRow[],
  };
}

export function CostSubmitClient({
  citySlug,
  cityName,
  cityBounds,
  userId,
  editMode = false,
  existingReport = null,
  canFillOnBehalf = false,
  adminImportMode = 'fill_on_behalf',
}: CostSubmitClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const posthog = usePostHog();
  // Current month ("YYYY-MM") — tenancy dates can't be in the future.
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Soft, pre-submit warning when a value is outside the accepted range.
  const rangeWarning = (field: string, value: string): string | null => {
    if (!value) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    const r = FIELD_RANGES[field];
    if (!r) return null;
    if (r.min != null && n < r.min) return t('costs.submit.warnMin', { min: r.min });
    if (n > r.max) return t('costs.submit.warnMax', { max: r.max });
    return null;
  };
  const placeCityRef = useRef('');
  // Admin-only import controls, available only for new submissions (never edits).
  // ADMIN_IMPORT_MODE (server) decides which one is shown:
  //   fill_on_behalf — owner email links the report to that account on login.
  //   scraped — report is owned by the system "Scraped" profile, never claimed.
  const showFillOnBehalf = canFillOnBehalf && !editMode && adminImportMode === 'fill_on_behalf';
  const showScrapedImport = canFillOnBehalf && !editMode && adminImportMode === 'scraped';
  // Default on: the admin is doing batch entry, so attribute to the system
  // profile (Imported / Scraped) unless they explicitly opt out of a given
  // submission. The owner email is optional — when set it lets the report
  // auto-claim on that person's login; when empty it stays on Imported.
  const [fillOnBehalf, setFillOnBehalf] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [scrapedImport, setScrapedImport] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [wasFlagged, setWasFlagged] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [submittedBuildingSlug, setSubmittedBuildingSlug] = useState<string | null>(null);
  const [submittedComparison, setSubmittedComparison] = useState<{
    userTotal: number | null;
    buildingReportCount: number;
    districtName: string | null;
    districtSlug: string | null;
    districtMedian: number | null;
    districtReportCount: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rentalTypeError, setRentalTypeError] = useState(false);
  const rentalTypeRef = useRef<HTMLDivElement>(null);
  const [leaseTypeError, setLeaseTypeError] = useState(false);
  const leaseTypeRef = useRef<HTMLDivElement>(null);
  const [utilitiesError, setUtilitiesError] = useState(false);
  const utilitiesRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState(
    existingReport ? { ...existingReport } : makeEmptyForm(),
  );
  const [draftRestored, setDraftRestored] = useState(false);

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
  // Tenancy (length-of-stay + deposit return) is optional, so it lives behind a
  // disclosure to keep the default form short. Auto-open when editing a report
  // that already carries any tenancy data.
  const [showTenancy, setShowTenancy] = useState(
    () =>
      !!(
        existingReport &&
        (existingReport.livedFrom ||
          existingReport.isCurrentTenant === false ||
          existingReport.depositReturned)
      ),
  );

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Draft autosave (new submissions only) — the whole form is saved, including
  // the address, so an interrupted submission is fully recoverable. A restored
  // draft is surfaced explicitly via a banner (draftRestored) so it's never a
  // surprise, with a one-tap "start fresh" reset.
  const draftKey = `costs-draft:${citySlug}`;
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (editMode || existingReport || draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        // One-time hydration from a saved draft (external store → state).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData((prev) => ({ ...prev, ...JSON.parse(raw) }));
        setDraftRestored(true);
      }
    } catch {
      /* ignore malformed draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (editMode) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(formData));
    } catch {
      /* ignore quota errors */
    }
  }, [formData, editMode, draftKey]);

  // Funnel: form opened (new submissions only). Pairs with the client submit
  // events below so we can see the landing → start → submit drop-off.
  useEffect(() => {
    if (editMode) return;
    posthog?.capture('cost_form_started', { city: citySlug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setFormData(makeEmptyForm());
    setShowDetailedUtilities(false);
    setShowElectricitySeasonal(false);
    setShowHeatingSeasonal(false);
    setShowPeriodic(false);
    setShowTenancy(false);
    setDraftRestored(false);
    setUtilitiesError(false);
    setRentalTypeError(false);
    placeCityRef.current = '';
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
    posthog?.capture('cost_form_address_selected', { city: citySlug });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rentalType) {
      setRentalTypeError(true);
      posthog?.capture('cost_form_validation_error', { city: citySlug, field: 'rentalType' });
      rentalTypeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setRentalTypeError(false);
    if (!formData.leaseType) {
      setLeaseTypeError(true);
      posthog?.capture('cost_form_validation_error', { city: citySlug, field: 'leaseType' });
      leaseTypeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setLeaseTypeError(false);
    // Utilities must be explicitly answered (amount / included / don't-know) in
    // simple mode — a detailed breakdown already counts as answered. This is what
    // makes an empty utilities value meaningful for the headline "Total".
    if (!showDetailedUtilities && !formData.utilitiesAnswer) {
      setUtilitiesError(true);
      posthog?.capture('cost_form_validation_error', { city: citySlug, field: 'utilities' });
      utilitiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setUtilitiesError(false);
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
        : // Simple mode: the whole utilities lump lives in adminFee (sent via
          // sharedFields). No detailed/other lines.
          {};

      const sharedFields = {
        rent: formData.rent || undefined,
        adminFee: formData.adminFee || undefined,
        deposit: formData.deposit || undefined,
        ...utilityFields,
        // Completeness of the utilities portion of the total (see schema comment).
        utilitiesComplete: showDetailedUtilities
          ? true
          : formData.utilitiesAnswer === 'included'
            ? true
            : formData.utilitiesAnswer === 'amount'
              ? !!formData.adminFee
              : formData.utilitiesAnswer === 'unknown'
                ? false
                : undefined,
        rooms: formData.rooms || undefined,
        areaM2: formData.areaM2 || undefined,
        floor: formData.floor || undefined,
        rentalType: formData.rentalType || undefined,
        leaseType: formData.leaseType || undefined,
        isCurrentTenant: formData.isCurrentTenant,
        livedFrom: formData.livedFrom || undefined,
        livedUntil: formData.isCurrentTenant ? undefined : formData.livedUntil || undefined,
        depositReturned:
          formData.isCurrentTenant || formData.depositReturned === ''
            ? undefined
            : formData.depositReturned !== 'no',
        depositReturnedAmount:
          formData.isCurrentTenant || formData.depositReturned === ''
            ? undefined
            : formData.depositReturned === 'full'
              ? formData.deposit || undefined
              : formData.depositReturned === 'partial'
                ? formData.depositReturnedAmount || undefined
                : '0',
        depositReturnDays:
          !formData.isCurrentTenant &&
          (formData.depositReturned === 'full' || formData.depositReturned === 'partial')
            ? formData.depositReturnDays || undefined
            : undefined,
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
            ...(showFillOnBehalf && fillOnBehalf
              ? {
                  fillOnBehalf: true,
                  ...(ownerEmail.trim() ? { importedEmail: ownerEmail.trim() } : {}),
                }
              : {}),
            ...(showScrapedImport && scrapedImport ? { scrapedImport: true } : {}),
            ...sharedFields,
          };

      posthog?.capture('cost_form_submit_attempt', { city: citySlug, edit: editMode });
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
        throw new Error((data.message as string) || (data.error as string) || 'Failed to submit');
      }

      const costReport = data.costReport as
        | { id?: string; building?: { slug?: string } }
        | undefined;
      setSubmittedReportId(costReport?.id ?? null);
      setSubmittedBuildingSlug(costReport?.building?.slug ?? null);
      setSubmittedComparison((data.comparison as typeof submittedComparison) ?? null);
      setWasFlagged((data.wasFlagged as boolean) ?? false);
      setSubmitted(true);
      posthog?.capture('cost_form_submit_success', {
        city: citySlug,
        was_flagged: (data.wasFlagged as boolean) ?? false,
        edit: editMode,
      });
      if (!editMode) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      posthog?.capture('cost_form_submit_error', { city: citySlug });
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

  // In simple mode the lump is counted via the adminFee term in totalMonthly, so
  // the "utilities" line here is only the detailed breakdown.
  const totalUtilities = showDetailedUtilities ? detailedUtilities : 0;

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

  // For a rented room, area is optional (often unknown / all-in price).
  const isRoom = formData.rentalType === 'room';

  // Required-to-submit fields, for the sticky bar's progress hint.
  const utilitiesAnswered =
    showDetailedUtilities || (!!formData.utilitiesAnswer && formData.utilitiesAnswer !== 'unknown');
  const coreFields = [
    formData.rentalType,
    formData.street,
    formData.buildingNumber,
    formData.rent,
    formData.deposit,
    ...(isRoom ? [] : [formData.areaM2]),
  ];
  const coreFilled = coreFields.filter(Boolean).length;
  const coreComplete = coreFilled === coreFields.length;

  // Report "completeness" — the value-priming meter shown once the core is ready.
  // Weighs the signals that make a report genuinely useful to other tenants.
  const qualitySignals = [
    !!formData.rentalType,
    !!formData.rent,
    !!formData.deposit,
    isRoom || !!formData.areaM2,
    utilitiesAnswered,
    !!formData.livedFrom,
    formData.isCurrentTenant || formData.depositReturned !== '',
  ];
  const completeness = Math.round(
    (qualitySignals.filter(Boolean).length / qualitySignals.length) * 100,
  );

  if (submitted && wasFlagged) {
    return (
      <div className="flex min-h-screen flex-col">
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
                {submittedComparison && (
                  <div className="mt-5 space-y-4 text-left">
                    {/* You vs your district — the personal hook that makes the
                        result worth sharing ("am I overpaying?"). Neutral framing. */}
                    {submittedComparison.userTotal != null &&
                      submittedComparison.districtMedian != null &&
                      submittedComparison.districtName && (
                        <div className="rounded-lg border bg-muted/40 p-4">
                          <p className="text-sm font-semibold">
                            {t('costs.submit.comparisonHeading')}
                          </p>
                          <div className="mt-2 flex items-end justify-between gap-2">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {t('costs.submit.yourCosts')}
                              </p>
                              <p className="text-lg font-bold text-primary">
                                ≈ {submittedComparison.userTotal.toLocaleString()} PLN
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {t('costs.building.districtMedian', {
                                  district: submittedComparison.districtName,
                                })}
                              </p>
                              <p className="text-lg font-semibold">
                                ≈ {submittedComparison.districtMedian.toLocaleString()} PLN
                              </p>
                            </div>
                          </div>
                          {(() => {
                            const u = submittedComparison.userTotal!;
                            const m = submittedComparison.districtMedian!;
                            const pct = Math.round(((u - m) / m) * 100);
                            const label =
                              pct === 0
                                ? t('costs.building.matchesMedian')
                                : pct > 0
                                  ? t('costs.building.percentHigher', { percent: pct })
                                  : t('costs.building.percentLower', { percent: Math.abs(pct) });
                            const cls =
                              pct === 0
                                ? 'bg-muted text-muted-foreground'
                                : pct > 0
                                  ? 'bg-red-500/10 text-red-600'
                                  : 'bg-green-500/10 text-green-600';
                            return (
                              <span
                                className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      )}

                    {/* Fill the district — the realistic viral unit (reachable via
                        area chats, no fragile apartment-count denominator). */}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <p className="font-semibold">
                        {submittedComparison.districtName
                          ? t('costs.submit.fillDistrictTitle', {
                              district: submittedComparison.districtName,
                            })
                          : t('costs.submit.completeBuildingTitle')}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('costs.submit.fillDistrictDesc')}
                      </p>
                      {submittedComparison.districtName && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {submittedComparison.districtName} ·{' '}
                          {t('costs.overview.nReports', {
                            count: submittedComparison.districtReportCount,
                          })}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {submittedComparison.districtSlug && (
                          <ShareButton
                            path={`/${citySlug}/${submittedComparison.districtSlug}`}
                            source="submit-district"
                            refToken={userId}
                            label={t('costs.submit.shareDistrict')}
                            variant="default"
                          />
                        )}
                        {submittedBuildingSlug && (
                          <ShareButton
                            path={`/${citySlug}/building/${submittedBuildingSlug}`}
                            source="submit-building"
                            refToken={userId}
                            label={t('costs.submit.shareBuilding')}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
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
              <p className="mt-2 text-xs text-muted-foreground">
                {t('costs.submit.requiredLegend')} · {t('costs.submit.completenessNudge')}
              </p>
              {!editMode && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Save className="h-3.5 w-3.5" />
                  {t('costs.submit.draftAutosave')}
                </p>
              )}
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

            <AnimatePresence>
              {draftRestored && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2 text-sm">
                    <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">{t('costs.submit.draftRestored')}</p>
                      <p className="text-muted-foreground">{t('costs.submit.draftRestoredDesc')}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2"
                    onClick={discardDraft}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('costs.submit.draftDiscard')}
                  </Button>
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

                    <div ref={leaseTypeRef} className="space-y-2">
                      <Label>{t('costs.submit.leaseType')} *</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {(['standard', 'okazjonalny', 'unknown'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              updateFormData({ leaseType: type });
                              setLeaseTypeError(false);
                            }}
                            className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors sm:flex-1 ${
                              formData.leaseType === type
                                ? 'border-primary bg-primary/10 text-primary'
                                : leaseTypeError
                                  ? 'border-destructive/50 bg-background text-muted-foreground hover:bg-muted/50'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                            }`}
                          >
                            {type === 'standard'
                              ? t('costs.submit.leaseStandard')
                              : type === 'okazjonalny'
                                ? t('costs.submit.leaseOccasional')
                                : t('costs.submit.leaseUnknown')}
                          </button>
                        ))}
                      </div>
                      {leaseTypeError && (
                        <p className="text-xs text-destructive">
                          {t('costs.submit.leaseTypeRequired')}
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
                        <p className="text-xs text-muted-foreground">
                          {t('costs.submit.addressNotFoundHint')}
                        </p>
                      </div>
                    )}

                    {showFillOnBehalf && (
                      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="fillOnBehalf"
                            checked={fillOnBehalf}
                            onCheckedChange={(v) => setFillOnBehalf(v === true)}
                          />
                          <Label htmlFor="fillOnBehalf">Fill on behalf (save under Imported)</Label>
                        </div>
                        {fillOnBehalf && (
                          <>
                            <Label htmlFor="ownerEmail">{t('costs.submit.ownerEmail')}</Label>
                            <Input
                              id="ownerEmail"
                              type="email"
                              placeholder="owner@example.com (optional)"
                              value={ownerEmail}
                              onChange={(e) => setOwnerEmail(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              {t('costs.submit.ownerEmailHint')}
                            </p>
                          </>
                        )}
                        {fillOnBehalf ? (
                          ownerEmail.trim() ? (
                            <p className="text-xs font-medium text-foreground">
                              → Saved under <span className="font-semibold">Imported</span>,
                              auto-claims to {ownerEmail.trim()} on first login.
                            </p>
                          ) : (
                            <p className="text-xs font-medium text-foreground">
                              → Saved under <span className="font-semibold">Imported</span> (no
                              owner email — stays unclaimed).
                            </p>
                          )
                        ) : (
                          <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                            → This will be saved under{' '}
                            <span className="font-semibold">your own account</span>.
                          </p>
                        )}
                      </div>
                    )}

                    {showScrapedImport && (
                      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="scrapedImport"
                            checked={scrapedImport}
                            onCheckedChange={(v) => setScrapedImport(v === true)}
                          />
                          <Label htmlFor="scrapedImport">Import as scraped</Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Admin only. Saves this report under the system &ldquo;Scraped&rdquo;
                          profile (no owner email, never claimed). Uncheck to submit as your own
                          report.
                        </p>
                        {scrapedImport ? (
                          <p className="text-xs font-medium text-foreground">
                            → Saved under the <span className="font-semibold">Scraped</span> system
                            profile.
                          </p>
                        ) : (
                          <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                            → Unchecked: this will be saved under{' '}
                            <span className="font-semibold">your own account</span>.
                          </p>
                        )}
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
                        <Label htmlFor="areaM2">
                          {t('costs.submit.size')}
                          {!isRoom && ' *'}
                        </Label>
                        <Input
                          id="areaM2"
                          type="number"
                          min="0"
                          required={!isRoom}
                          placeholder="e.g., 45"
                          value={formData.areaM2}
                          onChange={(e) => updateFormData({ areaM2: e.target.value })}
                        />
                        {isRoom && (
                          <p className="text-xs text-muted-foreground">
                            {t('costs.submit.optionalIfKnown')}
                          </p>
                        )}
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
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="rent">{t('costs.submit.rent')} *</Label>
                        <Input
                          id="rent"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          required
                          placeholder="e.g., 3200"
                          value={formData.rent}
                          onChange={(e) => updateFormData({ rent: e.target.value })}
                        />
                        {rangeWarning('rent', formData.rent) && (
                          <p className="text-xs text-amber-600">
                            {rangeWarning('rent', formData.rent)}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="deposit" className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          {t('costs.submit.deposit')}
                          <span className="text-xs font-normal text-muted-foreground">
                            {t('costs.submit.optionalLabel')}
                          </span>
                        </Label>
                        <Input
                          id="deposit"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          placeholder="e.g., 5000"
                          value={formData.deposit}
                          onChange={(e) => updateFormData({ deposit: e.target.value })}
                        />
                        {rangeWarning('deposit', formData.deposit) && (
                          <p className="text-xs text-amber-600">
                            {rangeWarning('deposit', formData.deposit)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t('costs.submit.depositOneTime')}
                        </p>
                      </div>
                    </div>

                    {!showDetailedUtilities && (
                      <div ref={utilitiesRef} className="space-y-3 border-t pt-4">
                        <Label>{t('costs.submit.utilitiesQuestion')} *</Label>
                        <div className="flex gap-2">
                          {(['amount', 'included', 'unknown'] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setUtilitiesError(false);
                                updateFormData({
                                  utilitiesAnswer: opt,
                                  ...(opt !== 'amount' ? { adminFee: '' } : {}),
                                });
                              }}
                              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                                formData.utilitiesAnswer === opt
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : utilitiesError
                                    ? 'border-destructive/50 bg-background text-muted-foreground hover:bg-muted/50'
                                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                              }`}
                            >
                              {opt === 'amount'
                                ? t('costs.submit.utilitiesAmount')
                                : opt === 'included'
                                  ? t('costs.submit.utilitiesIncludedOpt')
                                  : t('costs.submit.utilitiesUnknown')}
                            </button>
                          ))}
                        </div>
                        {utilitiesError && (
                          <p className="text-xs text-destructive">
                            {t('costs.submit.utilitiesRequired')}
                          </p>
                        )}

                        {formData.utilitiesAnswer === 'amount' && (
                          <div className="space-y-2">
                            <Input
                              id="adminFee"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              placeholder="e.g., 600"
                              value={formData.adminFee}
                              onChange={(e) => updateFormData({ adminFee: e.target.value })}
                            />
                            {rangeWarning('adminFee', formData.adminFee) && (
                              <p className="text-xs text-amber-600">
                                {rangeWarning('adminFee', formData.adminFee)}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {t('costs.submit.extraBillsHint')}
                            </p>
                            <button
                              type="button"
                              className="text-xs text-primary underline-offset-2 hover:underline"
                              onClick={() => {
                                posthog?.capture('cost_form_utilities_detailed', {
                                  city: citySlug,
                                });
                                setShowDetailedUtilities(true);
                                updateFormData({ adminFee: '' });
                              }}
                            >
                              {t('costs.submit.breakItDown')}
                            </button>
                          </div>
                        )}
                        {formData.utilitiesAnswer === 'included' && (
                          <p className="text-xs text-muted-foreground">
                            {t('costs.submit.utilitiesIncludedNote')}
                          </p>
                        )}
                        {formData.utilitiesAnswer === 'unknown' && (
                          <p className="text-xs text-muted-foreground">
                            {t('costs.submit.utilitiesUnknownNote')}
                          </p>
                        )}
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
                                utilitiesAnswer: 'amount',
                                adminFee: sum > 0 ? String(sum) : '',
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

              <motion.div custom={2} initial="hidden" animate="visible" variants={fadeUp}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CalendarClock className="h-5 w-5" />
                      {t('costs.submit.tenancyTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t('costs.submit.tenancyHint')}</p>

                    {!showTenancy ? (
                      <button
                        type="button"
                        onClick={() => setShowTenancy(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <Plus className="h-4 w-4" />
                        {t('costs.submit.addTenancyDetails')}
                      </button>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          {([true, false] as const).map((current) => (
                            <button
                              key={String(current)}
                              type="button"
                              onClick={() =>
                                updateFormData(
                                  current
                                    ? {
                                        isCurrentTenant: true,
                                        livedUntil: '',
                                        depositReturned: '',
                                        depositReturnDays: '',
                                      }
                                    : { isCurrentTenant: false },
                                )
                              }
                              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                                formData.isCurrentTenant === current
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                              }`}
                            >
                              {current
                                ? t('costs.submit.currentTenant')
                                : t('costs.submit.pastTenant')}
                            </button>
                          ))}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="livedFrom" className="flex items-center gap-2">
                              {t('costs.submit.livedFrom')}
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {t('costs.submit.recommended')}
                              </span>
                            </Label>
                            <MonthYearPicker
                              id="livedFrom"
                              value={formData.livedFrom}
                              onChange={(v) =>
                                updateFormData({
                                  livedFrom: v,
                                  // Keep move-out on/after move-in.
                                  ...(formData.livedUntil && v && formData.livedUntil < v
                                    ? { livedUntil: '' }
                                    : {}),
                                })
                              }
                              locale={locale}
                              placeholder={t('costs.submit.livedFrom')}
                              max={
                                formData.isCurrentTenant
                                  ? currentMonth
                                  : formData.livedUntil || currentMonth
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              {t('costs.submit.livedFromHint')}
                            </p>
                          </div>
                          {!formData.isCurrentTenant && (
                            <div className="space-y-2">
                              <Label htmlFor="livedUntil">{t('costs.submit.livedUntil')}</Label>
                              <MonthYearPicker
                                id="livedUntil"
                                value={formData.livedUntil}
                                onChange={(v) => updateFormData({ livedUntil: v })}
                                locale={locale}
                                placeholder={t('costs.submit.livedUntil')}
                                min={formData.livedFrom || undefined}
                                max={currentMonth}
                              />
                            </div>
                          )}
                        </div>

                        {!formData.isCurrentTenant && (
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-primary" />
                              {t('costs.submit.depositReturnedQuestion')}
                            </Label>
                            <div className="flex gap-2">
                              {(['full', 'partial', 'no'] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    updateFormData({
                                      depositReturned: formData.depositReturned === v ? '' : v,
                                      ...(v !== 'partial' ? { depositReturnedAmount: '' } : {}),
                                      ...(v === 'no' ? { depositReturnDays: '' } : {}),
                                    })
                                  }
                                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                                    formData.depositReturned === v
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                                  }`}
                                >
                                  {v === 'full'
                                    ? t('costs.submit.depositFull')
                                    : v === 'partial'
                                      ? t('costs.submit.depositPartial')
                                      : t('common.no')}
                                </button>
                              ))}
                            </div>
                            {formData.depositReturned === 'partial' && (
                              <div className="space-y-2 pt-2">
                                <Label htmlFor="depositReturnedAmount">
                                  {t('costs.submit.depositReturnedAmount')}
                                </Label>
                                <Input
                                  id="depositReturnedAmount"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  placeholder="e.g., 1000"
                                  value={formData.depositReturnedAmount}
                                  onChange={(e) =>
                                    updateFormData({ depositReturnedAmount: e.target.value })
                                  }
                                />
                              </div>
                            )}
                            {(formData.depositReturned === 'full' ||
                              formData.depositReturned === 'partial') && (
                              <div className="space-y-2 pt-2">
                                <Label htmlFor="depositReturnDays">
                                  {t('costs.submit.depositReturnDays')}
                                </Label>
                                <Input
                                  id="depositReturnDays"
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  placeholder="e.g., 14"
                                  value={formData.depositReturnDays}
                                  onChange={(e) =>
                                    updateFormData({ depositReturnDays: e.target.value })
                                  }
                                />
                                <p className="text-xs text-muted-foreground">
                                  {t('costs.submit.depositReturnDaysHint')}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
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
                            <span className="text-muted-foreground">{t('costs.submit.rent')}</span>
                            <span>{(parseInt(formData.rent) || 0).toLocaleString()} PLN</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t('costs.submit.expensesLabel')}
                            </span>
                            <span>
                              {Math.max(
                                0,
                                totalMonthly - (parseInt(formData.rent) || 0),
                              ).toLocaleString()}{' '}
                              PLN
                            </span>
                          </div>
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

              <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-6 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t('common.totalMonthly')}</p>
                    <p className="truncate text-lg font-bold text-primary">
                      {totalMonthly > 0 ? `≈ ${totalMonthly.toLocaleString()} PLN` : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {!coreComplete
                        ? t('costs.submit.coreProgress', {
                            filled: coreFilled,
                            total: coreFields.length,
                          })
                        : completeness >= 100
                          ? t('costs.submit.completenessFull')
                          : t('costs.submit.completenessMeter', { percent: completeness })}
                    </span>
                    <Button type="submit" size="lg" disabled={submitting}>
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
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
