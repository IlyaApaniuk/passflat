'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { AlertCircle, Loader2, MapPin, MessageSquarePlus } from 'lucide-react';
import { useAnalyticsConsent } from '@/lib/consent';
import type { CityBounds } from '@/lib/listings-data';
import { AddressAutocomplete, type PlaceResult } from '@/components/listings/address-autocomplete';
import { BuildingTagPicker } from '@/components/buildings/building-tag-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

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
}

function normalizeCity(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Standalone entry for describing a building.
 *
 * It deliberately does not repeat the checker: no score, no map, no nearby
 * breakdown. The address is resolved through the same endpoint only to get a
 * building to attach tags to, and the score becomes a follow-up hook rather
 * than the headline. Its own job is the review framing the hero button
 * promises.
 */
export function ReviewClient({
  citySlug,
  cityName,
  cityCanonicalName,
  cityBounds,
}: ReviewClientProps) {
  const t = useTranslations('review');
  const posthog = usePostHog();
  const analyticsConsent = useAnalyticsConsent();
  const viewCaptured = useRef(false);

  const [building, setBuilding] = useState<ResolvedBuilding | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'outside'>('idle');

  useEffect(() => {
    if (!analyticsConsent || !posthog || viewCaptured.current) return;
    viewCaptured.current = true;
    posthog.capture('review_page_viewed', { city: citySlug });
  }, [analyticsConsent, citySlug, posthog]);

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
        const payload = (await response.json()) as {
          building: { id: string; address: string; placeId: string | null };
        };

        setBuilding(payload.building);
        setStatus('idle');
        if (analyticsConsent) {
          posthog?.capture('review_address_resolved', {
            city: citySlug,
            building_id: payload.building.id,
          });
        }
      } catch {
        setStatus('error');
      }
    },
    [analyticsConsent, cityBounds, cityCanonicalName, citySlug, posthog],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <MessageSquarePlus className="h-4 w-4" />
          {t('badge')}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('title', { city: cityName })}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card className="mt-8">
        <CardContent className="px-5 sm:px-6">
          <Label className="text-sm font-medium">{t('addressLabel')}</Label>
          <div className="mt-2">
            <AddressAutocomplete
              onPlaceSelect={handlePlace}
              placeholder={t('addressPlaceholder')}
              bounds={cityBounds ?? undefined}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('addressHint')}</p>

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
        </CardContent>
      </Card>

      {building && (
        <Card className="mt-4">
          <CardContent className="px-5 sm:px-6">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              {building.address}
            </p>
            <div className="mt-4">
              <BuildingTagPicker
                buildingId={building.id}
                citySlug={citySlug}
                address={building.address}
                source="review_page"
                showCostHook
                placeId={building.placeId}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
