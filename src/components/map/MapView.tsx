'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import MapGL, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
  type ViewStateChangeEvent,
  type LayerProps,
} from 'react-map-gl';
import type { GeoJSONSource } from 'mapbox-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { ListingType, MapBounds } from '@/lib/listings-data';
import Link from 'next/link';
import { X } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

const TYPE_ROUTE: Record<ListingType, string> = {
  replacement: 'replacement',
  roommate: 'roommate',
  sublet: 'sublet',
};

export interface MapListing {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  title: string;
  address: string;
  totalCost: number;
  images: string[];
  promoted: boolean;
}

export interface ListingsMapProps {
  listings: MapListing[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  bounds?: { north: number; south: number; east: number; west: number };
  onBoundsChange?: (bounds: MapBounds) => void;
  citySlug: string;
  listingType: ListingType;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const WARSAW_CENTER = { longitude: 21.0122, latitude: 52.2297 };

function zoomForBounds(
  bounds: { north: number; south: number; east: number; west: number },
  mapWidth = 800,
  mapHeight = 600,
): number {
  const WORLD_PX = 512;
  const lngSpan = bounds.east - bounds.west;

  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + latRad(lat) / 2));

  const lngZoom = Math.log2((mapWidth * 360) / (lngSpan * WORLD_PX));
  const latZoom = Math.log2(
    (mapHeight * (2 * Math.PI)) / (Math.abs(mercY(bounds.north) - mercY(bounds.south)) * WORLD_PX),
  );

  return Math.min(lngZoom, latZoom) + 0.5;
}

const clusterLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  source: 'listings',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': ['step', ['get', 'point_count'], '#2b44ff', 5, '#1a30e0', 10, '#0f20c0'],
    'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 28],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
};

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'listings',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 13,
  },
  paint: {
    'text-color': '#ffffff',
  },
};

export function ListingsMap({
  listings,
  hoveredId,
  onHover,
  bounds,
  onBoundsChange,
  citySlug,
  listingType,
}: ListingsMapProps) {
  const mapRef = useRef<MapRef>(null);
  const posthog = usePostHog();
  const [popupInfo, setPopupInfo] = useState<MapListing | null>(null);
  const [cursor, setCursor] = useState('auto');
  const [mapLoaded, setMapLoaded] = useState(false);

  const geojson = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: listings.map((l) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [l.lng, l.lat] },
        properties: {
          id: l.id,
          title: l.title,
          address: l.address,
          totalCost: l.totalCost,
          image: l.images[0] ?? '',
          promoted: l.promoted,
        },
      })),
    }),
    [listings],
  );

  const unclusteredPointLayer: LayerProps = useMemo(
    () => ({
      id: 'unclustered-point',
      type: 'circle' as const,
      source: 'listings',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'id'], hoveredId ?? ''],
          14,
          ['==', ['get', 'promoted'], true],
          11,
          10,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'id'], hoveredId ?? ''],
          '#2b44ff',
          ['==', ['get', 'promoted'], true],
          '#2b44ff',
          '#1a1a2e',
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    }),
    [hoveredId],
  );

  useEffect(() => {
    if (popupInfo && !listings.some((l) => l.id === popupInfo.id)) {
      // Reconcile the open popup with the (externally) changed listing set.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPopupInfo(null);
    }
  }, [listings, popupInfo]);

  const onMouseEnter = useCallback(
    (e: MapLayerMouseEvent) => {
      setCursor('pointer');
      const feature = e.features?.[0];
      if (feature?.properties && !feature.properties.cluster) {
        onHover(feature.properties.id);
      }
    },
    [onHover],
  );

  const onMouseLeave = useCallback(() => {
    setCursor('auto');
    onHover(null);
  }, [onHover]);

  const emitBounds = useCallback(() => {
    if (!onBoundsChange || !mapRef.current) return;
    const b = mapRef.current.getBounds();
    if (!b) return;
    onBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }, [onBoundsChange]);

  const onMoveEnd = useCallback(
    (_e: ViewStateChangeEvent) => {
      emitBounds();
    },
    [emitBounds],
  );

  useEffect(() => {
    if (mapLoaded) emitBounds();
  }, [mapLoaded, emitBounds]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) {
        setPopupInfo(null);
        return;
      }

      if (feature.properties?.cluster) {
        const clusterId = feature.properties.cluster_id as number;
        const pointCount = feature.properties.point_count as number;

        posthog?.capture('map_marker_clicked', {
          is_cluster: true,
          cluster_size: pointCount,
        });

        const source = mapRef.current?.getSource('listings') as unknown as GeoJSONSource;
        source?.getClusterExpansionZoom(clusterId, (err?: Error | null, zoom?: number | null) => {
          if (err || zoom == null) return;
          const coords = (feature.geometry as Point).coordinates;
          mapRef.current?.easeTo({
            center: [coords[0], coords[1]],
            zoom,
            duration: 500,
          });
        });
        return;
      }

      const props = feature.properties;
      if (props?.id) {
        posthog?.capture('map_marker_clicked', {
          is_cluster: false,
        });

        const listing = listings.find((l) => l.id === props.id);
        if (listing) setPopupInfo(listing);
      }
    },
    [listings, posthog],
  );

  const initialViewState = useMemo(() => {
    if (bounds) {
      return {
        longitude: (bounds.west + bounds.east) / 2,
        latitude: (bounds.south + bounds.north) / 2,
        zoom: zoomForBounds(bounds),
      };
    }
    return { ...WARSAW_CENTER, zoom: 11.5 };
  }, [bounds]);

  const maxBounds = useMemo(() => {
    if (!bounds) return undefined;
    const lngPad = (bounds.east - bounds.west) * 0.15;
    const latPad = (bounds.north - bounds.south) * 0.15;
    return [
      [bounds.west - lngPad, bounds.south - latPad],
      [bounds.east + lngPad, bounds.north + latPad],
    ] as [[number, number], [number, number]];
  }, [bounds]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">
          Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        maxBounds={maxBounds}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={['clusters', 'unclustered-point']}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onMoveEnd={onMoveEnd}
        onLoad={() => setMapLoaded(true)}
        cursor={cursor}
      >
        <NavigationControl position="top-right" />

        <Source
          id="listings"
          type="geojson"
          data={geojson}
          cluster
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredPointLayer} />
        </Source>

        {popupInfo && (
          <Popup
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            anchor="bottom"
            onClose={() => setPopupInfo(null)}
            closeOnClick={false}
            closeButton={false}
            offset={15}
          >
            <div className="relative min-w-[200px]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setPopupInfo(null);
                }}
                className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <Link
                href={`/${citySlug}/${TYPE_ROUTE[listingType]}/${popupInfo.slug}`}
                className="block cursor-pointer transition-opacity hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={popupInfo.images[0]}
                  alt={popupInfo.title}
                  loading="lazy"
                  decoding="async"
                  className="mb-2 h-[100px] w-full rounded object-cover"
                />
                <h4 className="mb-1 text-sm font-semibold">{popupInfo.title}</h4>
                <p className="mb-2 text-xs text-muted-foreground">{popupInfo.address}</p>
                <p className="text-base font-bold text-primary">
                  {popupInfo.totalCost.toLocaleString()} PLN/mo
                </p>
              </Link>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
