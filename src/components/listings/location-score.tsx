'use client';

import { useEffect, useState } from 'react';
import {
  LocationScoreBlock,
  LocationScoreSkeleton,
} from '@/components/buildings/location-score-block';
import type { CategoryResult } from '@/lib/location-score';

interface LocationScoreResponse {
  overall: number;
  categories: CategoryResult[];
  /** The building itself — the map has nothing to centre on without it. */
  lat?: number | null;
  lng?: number | null;
}

/**
 * The location score of a building on a page that is *about* that building:
 * fetches the score when the server could not hand one over, then renders the
 * same block the address checker does.
 */
export function LocationScore({
  buildingId,
  citySlug,
  initialData,
}: {
  buildingId: string;
  /** Passed through to the block; without it the map tab stays hidden. */
  citySlug?: string;
  initialData?: LocationScoreResponse | null;
}) {
  const [data, setData] = useState<LocationScoreResponse | null>(initialData ?? null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    initialData ? 'ready' : 'loading',
  );

  useEffect(() => {
    if (initialData) return;

    let active = true;

    fetch(`/api/buildings/${buildingId}/location-score`)
      .then(async (res) => {
        if (!active) return;
        if (res.status === 204 || !res.ok) {
          setStatus('unavailable');
          return;
        }
        const json = (await res.json()) as LocationScoreResponse;
        setData(json);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      });

    return () => {
      active = false;
    };
  }, [buildingId, initialData]);

  // Buildings with no coordinates (the scraped import has plenty) never get a
  // score. Nothing to say beats an empty card.
  if (status === 'unavailable') return null;

  if (status === 'loading' || !data) return <LocationScoreSkeleton />;

  return (
    <LocationScoreBlock
      overall={data.overall}
      categories={data.categories}
      citySlug={citySlug}
      lat={data.lat}
      lng={data.lng}
      // No "buildings nearby with known costs" query stands behind these pages,
      // so the costs layer stays empty and the map hides its chip on its own.
      neighbours={[]}
    />
  );
}
