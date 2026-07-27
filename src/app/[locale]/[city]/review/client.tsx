'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { AlertCircle, Loader2, MessageSquarePlus } from 'lucide-react';
import { useAnalyticsConsent } from '@/lib/consent';
import type { CityBounds } from '@/lib/listings-data';
import { type PlaceResult } from '@/components/listings/address-autocomplete';
import { AddressIntake } from '@/components/buildings/address-intake';
import { BuildingTagPicker } from '@/components/buildings/building-tag-picker';
import { TenantTags, type TenantTagsSummary } from '@/components/buildings/tenant-tags';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ResolvedBuilding {
  id: string;
  address: string;
  placeId: string | null;
}

interface ReviewClientProps {
  citySlug: string;
  cityName: string;
  cityCanonicalName: string;
  cityBounds: CityBounds | null;
  /** Arrives from the checker, so the address is never typed twice. */
  initialPlaceId: string | null;
}

function normalizeCity(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Where a building gets described.
 *
 * It deliberately does not repeat the checker: no score, no map, no nearby
 * breakdown. Its question is "what do people say about this building"; the
 * checker's is "what is this location like".
 */
export function ReviewClient({
  citySlug,
  cityName,
  cityCanonicalName,
  cityBounds,
  initialPlaceId,
}: ReviewClientProps) {
  const t = useTranslations('review');
  const posthog = usePostHog();
  const analyticsConsent = useAnalyticsConsent();
  const viewCaptured = useRef(false);

  const [building, setBuilding] = useState<ResolvedBuilding | null>(null);
  const [tenantTags, setTenantTags] = useState<TenantTagsSummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'outside'>(
    initialPlaceId ? 'loading' : 'idle',
  );

  useEffect(() => {
    if (!analyticsConsent || !posthog || viewCaptured.current) return;
    viewCaptured.current = true;
    posthog.capture('review_page_viewed', {
      city: citySlug,
      from_checker: Boolean(initialPlaceId),
    });
  }, [analyticsConsent, citySlug, initialPlaceId, posthog]);

  const applyPayload = useCallback((payload: unknown) => {
    const data = payload as {
      building: ResolvedBuilding;
      tenantTags: TenantTagsSummary | null;
    };
    setBuilding(data.building);
    setTenantTags(data.tenantTags ?? null);
    setStatus('idle');
  }, []);

  // Arriving from the checker: the building already exists, so this is a read.
  useEffect(() => {
    if (!initialPlaceId) return;
    let active = true;

    fetch(`/api/location-score?city=${citySlug}&p=${encodeURIComponent(initialPlaceId)}`)
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) throw new Error('lookup failed');
        applyPayload(await response.json());
      })
      .catch(() => {
        if (active) setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [applyPayload, citySlug, initialPlaceId]);

  const handlePlace = useCallback(
    async (place: PlaceResult) => {
      const insideBounds = cityBounds
        ? place.lat <= cityBounds.north &&
          place.lat >= cityBounds.south &&
          place.lng <= cityBounds.east &&
          place.lng >= cityBounds.west
        : true;
      const localityMatches = [citySlug, cityCanonicalName]
        .map(normalizeCity)
        .includes(normalizeCity(place.city));

      if (!insideBounds || !localityMatches) {
        setBuilding(null);
        setStatus('outside');
        return;
      }
      if (!place.placeId || !place.street.trim() || !place.buildingNumber.trim()) {
        setBuilding(null);
        setStatus('error');
        return;
      }

      setStatus('loading');
      try {
        // Reuses the checker endpoint purely as a find-or-create: it is the one
        // place that already resolves a Places result to a persisted building.
        const response = await fetch('/api/location-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citySlug, place }),
        });
        if (!response.ok) throw new Error('resolve failed');
        applyPayload(await response.json());

        if (analyticsConsent) {
          posthog?.capture('review_address_resolved', { city: citySlug });
        }
      } catch {
        setStatus('error');
      }
    },
    [analyticsConsent, applyPayload, cityBounds, cityCanonicalName, citySlug, posthog],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <AddressIntake
        badge={t('badge')}
        badgeIcon={MessageSquarePlus}
        title={t('title')}
        subtitle={t('subtitle')}
        label={t('addressLabel')}
        placeholder={t('addressPlaceholder')}
        hint={t('addressHint')}
        note={t('effort')}
        bounds={cityBounds ?? undefined}
        onPlaceSelect={handlePlace}
      >
        {status === 'loading' && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('resolving')}
          </p>
        )}

        {status === 'outside' && (
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('outsideCity', { city: cityName })}</AlertDescription>
          </Alert>
        )}

        {status === 'error' && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('error')}</AlertDescription>
          </Alert>
        )}
      </AddressIntake>

      {building && (
        <div className="mt-4 space-y-4">
          {/* When others have already spoken their chips lead: they deliver the
              page's promise and double as a prompt, which makes recalling your
              own experience easier than facing a blank list of 22. */}
          {tenantTags && tenantTags.tags.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-lg">{t('othersSaid')}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 sm:px-6">
                <TenantTags summary={tenantTags} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="px-5 sm:px-6">
              <BuildingTagPicker
                buildingId={building.id}
                citySlug={citySlug}
                address={building.address}
                source="review_page"
                showCostHook
                placeId={building.placeId}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
