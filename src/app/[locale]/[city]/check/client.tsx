'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Ambulance,
  Beer,
  Flame,
  TrainTrack,
  MessageSquarePlus,
  Music,
  CheckCircle2,
  Loader2,
  MapPin,
  MapPinned,
  RefreshCw,
  Send,
  Share2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { CityBounds } from '@/lib/listings-data';
import type { CategoryResult } from '@/lib/location-score';
import { type PlaceResult } from '@/components/listings/address-autocomplete';
import { AddressIntake } from '@/components/buildings/address-intake';
import {
  LocationScoreBlock,
  LocationScoreSkeleton,
  useDistanceFormatter,
} from '@/components/buildings/location-score-block';
import { FollowBuildingButton } from '@/components/costs/follow-building-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Neighbour {
  id: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  distanceM: number;
  totalMedian: number | null;
  reportCount: number;
}

interface Nuisance {
  key: string;
  nearestM: number;
  name: string | null;
  count: number;
  report: 'nearest' | 'count';
}

interface TenantTag {
  key: string;
  sentiment: 'good' | 'neutral' | 'bad';
  votes: number;
  costReportVotes: number;
}

interface CheckerPayload {
  building: {
    id: string;
    slug: string;
    address: string;
    district: string | null;
    citySlug: string;
    placeId: string;
    lat: number | null;
    lng: number | null;
  };
  score: {
    overall: number;
    categories: CategoryResult[];
    computedAt: string;
  };
  costs: null | {
    totalMedian: number | null;
    districtMedian: number | null;
    districtName: string | null;
    rentMedian: number | null;
    expensesMedian: number | null;
    reportCount: number;
    tenantReportCount: number;
    sourceKind: 'tenant' | 'mixed' | 'scraped';
    depositReturned: number;
    depositAnswered: number;
  };
  neighbours?: Neighbour[];
  nuisances?: Nuisance[];
  tenantTags?: {
    tags: TenantTag[];
    voters: number;
    costReportVoters: number;
  } | null;
}

type ErrorKind = 'generic' | 'rateLimited' | 'notFound' | 'completeAddress';
type LastAttempt = { kind: 'get'; placeId: string } | { kind: 'post'; place: PlaceResult };

interface SuccessfulCheck {
  sequence: number;
  buildingId: string;
  hasData: boolean;
  source: 'shared_url' | 'address_search';
}

interface CheckerClientProps {
  citySlug: string;
  cityName: string;
  cityCanonicalName: string;
  cityBounds: CityBounds | null;
  initialPlaceId: string | null;
}

const NUISANCE_ICONS: Record<string, LucideIcon> = {
  fireStation: Flame,
  hospital: Ambulance,
  railway: TrainTrack,
  nightclub: Music,
  bars: Beer,
};

function isInsideBounds(lat: number, lng: number, bounds: CityBounds) {
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

function normalizeCity(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function OutsideCityCard({ selectedCity }: { selectedCity: string }) {
  const t = useTranslations('checker');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !selectedCity) return;
    if (!consent) {
      setConsentError(true);
      return;
    }

    setStatus('loading');
    try {
      const response = await fetch('/api/city-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, city: selectedCity, consent: true, locale }),
      });
      if (!response.ok) throw new Error('city notify failed');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Card className="mt-6 border-primary/20 shadow-lg">
      <CardContent className="p-5 sm:p-6">
        {status === 'success' ? (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-3 font-semibold">{t('outside.successTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('outside.successBody')}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">{t('outside.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('outside.description')}</p>
                <p className="mt-2 text-xs font-medium text-primary">
                  {t('outside.selectedCity', { city: selectedCity })}
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-5 space-y-3">
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('outside.emailPlaceholder')}
                className="h-11"
              />
              <div className="flex items-start gap-2">
                <Checkbox
                  id="checker-city-consent"
                  checked={consent}
                  onCheckedChange={(checked) => {
                    setConsent(checked === true);
                    if (checked) setConsentError(false);
                  }}
                  aria-invalid={consentError}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="checker-city-consent"
                  className="text-xs font-normal leading-snug text-muted-foreground"
                >
                  {t('outside.consent')}
                </Label>
              </div>
              {consentError && (
                <p className="text-xs text-destructive">{t('outside.consentRequired')}</p>
              )}
              <Button
                type="submit"
                disabled={status === 'loading' || !consent}
                className="h-11 w-full"
              >
                {status === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t('outside.submit')}
              </Button>
              {status === 'error' && (
                <p className="text-xs text-destructive">{t('outside.error')}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t.rich('outside.privacy', {
                  privacyLink: (chunks) => (
                    <Link href="/privacy" className="text-primary hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function CheckerClient({
  citySlug,
  cityName,
  cityCanonicalName,
  cityBounds,
  initialPlaceId,
}: CheckerClientProps) {
  const t = useTranslations('checker');
  const locale = useLocale();
  // Shared with the location-score block, so a nuisance and a supermarket are
  // never a metre apart in how far away they read.
  const formatDistance = useDistanceFormatter();
  const posthog = usePostHog();
  const viewCapturedRef = useRef(false);
  const capturedCheckSequenceRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const initialLoadStartedRef = useRef(false);
  const lastAttemptRef = useRef<LastAttempt | null>(null);

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    initialPlaceId ? 'loading' : 'idle',
  );
  const [result, setResult] = useState<CheckerPayload | null>(null);
  const [outsideCity, setOutsideCity] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');
  const [canRetry, setCanRetry] = useState(false);
  const [inputDefault, setInputDefault] = useState('');
  // Use a distinct loading key so an initial `?p=` response remounts the
  // uncontrolled autocomplete with the resolved human-readable address.
  const [autocompleteKey, setAutocompleteKey] = useState(
    initialPlaceId ? `loading-${initialPlaceId}` : 'empty',
  );
  const [successfulCheck, setSuccessfulCheck] = useState<SuccessfulCheck | null>(null);

  useEffect(() => {
    if (!posthog || viewCapturedRef.current) return;
    viewCapturedRef.current = true;
    posthog.capture('checker_viewed', { city: citySlug });
  }, [citySlug, posthog]);

  // A first-time Overpass lookup can finish before the visitor answers the
  // analytics-consent banner. Keep the completed check pending and capture it
  // once consent becomes available instead of silently losing the funnel step.
  useEffect(() => {
    if (
      !posthog ||
      !successfulCheck ||
      capturedCheckSequenceRef.current === successfulCheck.sequence
    ) {
      return;
    }
    capturedCheckSequenceRef.current = successfulCheck.sequence;
    posthog.capture('address_checked', {
      city: citySlug,
      building_id: successfulCheck.buildingId,
      has_data: successfulCheck.hasData,
      source: successfulCheck.source,
    });
  }, [citySlug, posthog, successfulCheck]);

  const updateUrl = useCallback((placeId: string | null) => {
    const url = new URL(window.location.href);
    if (placeId) url.searchParams.set('p', placeId);
    else url.searchParams.delete('p');
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const loadScore = useCallback(
    async (attempt: LastAttempt) => {
      const sequence = ++requestSequenceRef.current;
      lastAttemptRef.current = attempt;
      setCanRetry(true);
      setStatus('loading');
      setResult(null);
      setOutsideCity(null);

      try {
        const response =
          attempt.kind === 'get'
            ? await fetch(
                `/api/location-score?city=${encodeURIComponent(citySlug)}&p=${encodeURIComponent(attempt.placeId)}`,
              )
            : await fetch('/api/location-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ citySlug, place: attempt.place }),
              });

        if (sequence !== requestSequenceRef.current) return;
        if (response.status === 204) {
          setErrorKind('notFound');
          setCanRetry(false);
          setStatus('error');
          return;
        }
        if (!response.ok) {
          const notFound = response.status === 404;
          setErrorKind(response.status === 429 ? 'rateLimited' : notFound ? 'notFound' : 'generic');
          setCanRetry(!notFound);
          setStatus('error');
          return;
        }

        const payload = (await response.json()) as CheckerPayload;
        if (!payload?.building?.id || !payload?.building?.placeId || !payload?.score) {
          throw new Error('Invalid checker response');
        }

        setResult(payload);
        setInputDefault(payload.building.address);
        setAutocompleteKey(payload.building.placeId);
        setStatus('ready');
        updateUrl(payload.building.placeId);
        setSuccessfulCheck({
          sequence,
          buildingId: payload.building.id,
          hasData: payload.costs !== null,
          source: attempt.kind === 'get' ? 'shared_url' : 'address_search',
        });
      } catch {
        if (sequence !== requestSequenceRef.current) return;
        setErrorKind('generic');
        setStatus('error');
      }
    },
    [citySlug, updateUrl],
  );

  useEffect(() => {
    if (!initialPlaceId || initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    void loadScore({ kind: 'get', placeId: initialPlaceId });
  }, [initialPlaceId, loadScore]);

  const selectPlace = (place: PlaceResult) => {
    const normalizedCandidates = [citySlug, cityCanonicalName].map(normalizeCity).filter(Boolean);
    const outsideBounds =
      !place.lat ||
      !place.lng ||
      (!!cityBounds && !isInsideBounds(place.lat, place.lng, cityBounds));
    const outsideLocality =
      place.city.trim() !== '' &&
      normalizedCandidates.length > 0 &&
      !normalizedCandidates.includes(normalizeCity(place.city));

    setInputDefault(place.formattedAddress);
    setAutocompleteKey(place.placeId || place.formattedAddress);

    if (outsideBounds || outsideLocality) {
      ++requestSequenceRef.current;
      setResult(null);
      setStatus('idle');
      setOutsideCity(place.city || place.formattedAddress);
      updateUrl(null);
      posthog?.capture('address_checked', {
        city: citySlug,
        selected_city: place.city || null,
        has_data: false,
        outside_city: true,
      });
      return;
    }

    if (
      !place.placeId ||
      !place.street.trim() ||
      !place.buildingNumber.trim() ||
      !place.lat ||
      !place.lng
    ) {
      ++requestSequenceRef.current;
      setResult(null);
      setOutsideCity(null);
      setErrorKind('completeAddress');
      setCanRetry(false);
      setStatus('error');
      updateUrl(null);
      return;
    }

    void loadScore({ kind: 'post', place });
  };

  const retry = () => {
    if (lastAttemptRef.current) void loadScore(lastAttemptRef.current);
  };

  const captureCta = (cta: 'form' | 'follow' | 'building' | 'share' | 'tell_us') => {
    posthog?.capture('checker_cta_clicked', {
      source: 'checker',
      city: citySlug,
      building_id: result?.building.id,
      has_data: result?.costs !== null,
      cta,
    });
  };

  const share = async () => {
    if (!result) return;
    captureCta('share');
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('p', result.building.placeId);
    url.searchParams.set('utm_source', 'share');
    url.searchParams.set('utm_medium', 'checker');
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success(t('shareCopied'));
    } catch {
      toast.error(t('shareError'));
    }
  };

  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  /**
   * The building against its district, as a verdict. Withheld under 3% — at that
   * distance "pricier" is noise dressed up as a finding.
   */
  const districtVerdict = (() => {
    const costs = result?.costs;
    if (!costs?.totalMedian || !costs.districtMedian || !costs.districtName) return null;
    const delta = (costs.totalMedian - costs.districtMedian) / costs.districtMedian;
    if (Math.abs(delta) < 0.03) return null;
    return {
      cheaper: delta < 0,
      percent: Math.round(Math.abs(delta) * 100),
      district: costs.districtName,
    };
  })();

  return (
    <div className="mx-auto max-w-3xl">
      <AddressIntake
        badge={t('badge')}
        badgeIcon={MapPinned}
        title={t('title', { city: cityName })}
        subtitle={t('subtitle')}
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        hint={t('searchHint')}
        inputKey={autocompleteKey}
        defaultValue={inputDefault}
        onPlaceSelect={selectPlace}
      />

      <div aria-live="polite">
        {status === 'loading' && (
          <>
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{t('loading')}</span>
            </div>
            <LocationScoreSkeleton className="mt-6" />
          </>
        )}

        {status === 'error' && (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle />
            <AlertTitle>{t('errors.title')}</AlertTitle>
            <AlertDescription>
              <p>{t(`errors.${errorKind}`)}</p>
              {canRetry && errorKind !== 'completeAddress' && (
                <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
                  <RefreshCw className="h-4 w-4" />
                  {t('errors.retry')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {outsideCity && <OutsideCityCard key={outsideCity} selectedCity={outsideCity} />}

        {status === 'ready' && result && (
          <div className="mt-6 space-y-4">
            <div className="flex items-start justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {t('result.checkedAddress')}
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold">
                  {result.building.address}
                  {result.building.district && (
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      {result.building.district}
                    </span>
                  )}
                </h2>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={share}>
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t('share')}</span>
              </Button>
            </div>

            <LocationScoreBlock
              overall={result.score.overall}
              categories={result.score.categories}
              citySlug={citySlug}
              lat={result.building.lat}
              lng={result.building.lng}
              neighbours={result.neighbours}
            />

            {/* Noise sources. Needs no tenant input, so unlike the tag block
                below it has something to say on the very first check. */}
            {result.nuisances && result.nuisances.length > 0 && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-lg">{t('nuisances.title')}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t('nuisances.subtitle')}</p>
                </CardHeader>
                <CardContent className="grid gap-3 px-4 sm:grid-cols-2 sm:px-6">
                  {result.nuisances.map((nuisance) => {
                    const Icon = NUISANCE_ICONS[nuisance.key] ?? AlertCircle;
                    return (
                      <div
                        key={nuisance.key}
                        className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3.5"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                          <Icon className="h-[18px] w-[18px] text-amber-600 dark:text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t(`nuisances.${nuisance.key}`)}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {nuisance.report === 'count'
                              ? t('nuisances.count', {
                                  count: nuisance.count,
                                  distance: formatDistance(nuisance.nearestM),
                                })
                              : `${nuisance.name ? `${nuisance.name} · ` : ''}${formatDistance(nuisance.nearestM)}`}
                            {' · '}
                            {t(`nuisances.${nuisance.key}Note`)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium">{t('tellUs.title')}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {result.tenantTags && result.tenantTags.voters > 0
                      ? t('tellUs.existing', { count: result.tenantTags.voters })
                      : t('tellUs.body')}
                  </p>
                </div>
                <Button variant="outline" className="rounded-full" asChild>
                  <Link
                    href={`/${citySlug}/review?p=${encodeURIComponent(result.building.placeId)}`}
                    onClick={() => captureCta('tell_us')}
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    {t('tellUs.cta')}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {result.costs ? (
              <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <WalletCards className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t('costs.availableTitle')}</p>
                      {result.costs.totalMedian != null && (
                        <p className="mt-2 text-3xl font-bold tabular-nums text-primary">
                          ≈ {numberFormatter.format(result.costs.totalMedian)} zł
                          <span className="ml-1 text-sm font-medium text-muted-foreground">
                            / {t('costs.month')}
                          </span>
                        </p>
                      )}
                      {districtVerdict && (
                        <p className="mt-1 text-sm font-medium">
                          {districtVerdict.cheaper ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {t('costs.cheaperThanDistrict', {
                                percent: districtVerdict.percent,
                                district: districtVerdict.district,
                              })}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-500">
                              {t('costs.pricierThanDistrict', {
                                percent: districtVerdict.percent,
                                district: districtVerdict.district,
                              })}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {(result.costs.rentMedian != null || result.costs.expensesMedian != null) && (
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {result.costs.rentMedian != null && (
                        <div className="rounded-xl border bg-background/70 p-3">
                          <p className="text-xs text-muted-foreground">{t('costs.rent')}</p>
                          <p className="mt-1 font-semibold tabular-nums">
                            ≈ {numberFormatter.format(result.costs.rentMedian)} zł
                          </p>
                        </div>
                      )}
                      {result.costs.expensesMedian != null && (
                        <div className="rounded-xl border bg-background/70 p-3">
                          <p className="text-xs text-muted-foreground">{t('costs.expenses')}</p>
                          <p className="mt-1 font-semibold tabular-nums">
                            ≈ {numberFormatter.format(result.costs.expensesMedian)} zł
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-muted-foreground">
                    {result.costs.sourceKind === 'tenant'
                      ? t('costs.sourceTenant', { count: result.costs.tenantReportCount })
                      : result.costs.sourceKind === 'mixed'
                        ? t('costs.sourceMixed', {
                            tenantCount: result.costs.tenantReportCount,
                            listingCount: result.costs.reportCount - result.costs.tenantReportCount,
                          })
                        : t('costs.sourceScraped', { count: result.costs.reportCount })}
                    {result.costs.depositAnswered > 0 && (
                      <>
                        {' · '}
                        <span className="font-medium text-foreground">
                          {t('costs.depositReturned', {
                            returned: result.costs.depositReturned,
                            answered: result.costs.depositAnswered,
                          })}
                        </span>
                      </>
                    )}
                  </p>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button asChild className="w-full sm:w-auto">
                      <Link
                        href={`/${citySlug}/building/${result.building.slug}`}
                        onClick={() => captureCta('building')}
                      >
                        {t('costs.viewBuilding')}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    {/* Someone checking an address that already has data is the
                        likeliest contributor there is — they live there and can
                        confirm or refresh the figures. The empty state asks;
                        this one used to end the conversation. */}
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                      <Link
                        href={`/${citySlug}/costs/submit?p=${encodeURIComponent(result.building.placeId)}&source=checker`}
                        onClick={() => captureCta('form')}
                      >
                        {t('costs.contribute')}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-primary/30 shadow-lg">
                <CardContent className="flex flex-col items-center p-6 text-center sm:p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <WalletCards className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{t('costs.emptyTitle')}</h3>
                  <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                    {t('costs.emptyDescription', { city: cityName })}
                  </p>
                  <Button asChild size="lg" className="mt-5 w-full sm:w-auto">
                    <Link
                      href={`/${citySlug}/costs/submit?p=${encodeURIComponent(result.building.placeId)}&source=checker`}
                      onClick={() => captureCta('form')}
                    >
                      {t('costs.contribute')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground">{t('costs.followHint')}</p>
                    <div onClickCapture={() => captureCta('follow')}>
                      <FollowBuildingButton
                        buildingId={result.building.id}
                        citySlug={citySlug}
                        returnTo={`/${citySlug}/check?p=${encodeURIComponent(result.building.placeId)}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
