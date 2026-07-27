'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import MapGL, { Marker, NavigationControl, Popup } from 'react-map-gl';
import {
  Bus,
  GraduationCap,
  MapPin,
  Pill,
  ShoppingBasket,
  Store,
  TrainFront,
  Trees,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export interface PoiMarker {
  category: string;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface NeighbourMarker {
  id: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  distanceM: number;
  totalMedian: number | null;
  reportCount: number;
}

interface LocationPoiMapProps {
  citySlug: string;
  lat: number;
  lng: number;
  pois: PoiMarker[];
  neighbours: NeighbourMarker[];
  formatDistance: (meters: number) => string;
  formatMoney: (amount: number) => string;
}

/** The costs layer is ours alone, so it leads the list and defaults to on. */
const COSTS_LAYER = 'costs';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  supermarket: ShoppingBasket,
  transitRail: TrainFront,
  pharmacy: Pill,
  transitBasic: Bus,
  convenience: Store,
  dining: Utensils,
  education: GraduationCap,
  parks: Trees,
};

/** Grouped so the toggles stay readable: nine chips would out-clutter the map. */
const LAYERS: Array<{ key: string; icon: LucideIcon; categories: string[] }> = [
  { key: COSTS_LAYER, icon: Wallet, categories: [] },
  { key: 'transit', icon: Bus, categories: ['transitRail', 'transitBasic'] },
  { key: 'shops', icon: ShoppingBasket, categories: ['supermarket', 'convenience', 'pharmacy'] },
  { key: 'dining', icon: Utensils, categories: ['dining'] },
  { key: 'education', icon: GraduationCap, categories: ['education'] },
  { key: 'parks', icon: Trees, categories: ['parks'] },
];

const CATEGORY_COLORS: Record<string, string> = {
  supermarket: 'bg-emerald-500',
  convenience: 'bg-emerald-500',
  pharmacy: 'bg-rose-500',
  transitRail: 'bg-indigo-500',
  transitBasic: 'bg-indigo-500',
  dining: 'bg-amber-500',
  education: 'bg-sky-500',
  parks: 'bg-lime-600',
};

type Selection =
  | { kind: 'poi'; marker: PoiMarker }
  | { kind: 'neighbour'; marker: NeighbourMarker };

/**
 * The checked address with what surrounds it: imported OSM points plus — the
 * part no amenities map can copy — neighbouring buildings whose tenants have
 * reported what they pay.
 */
export default function LocationPoiMap({
  citySlug,
  lat,
  lng,
  pois,
  neighbours,
  formatDistance,
  formatMoney,
}: LocationPoiMapProps) {
  const t = useTranslations('checker.map');
  const [active, setActive] = useState<string[]>(() => LAYERS.map((layer) => layer.key));
  const [selected, setSelected] = useState<Selection | null>(null);

  const toggle = useCallback((key: string) => {
    setSelected(null);
    setActive((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }, []);

  const visibleCategories = useMemo(
    () => new Set(LAYERS.filter((l) => active.includes(l.key)).flatMap((l) => l.categories)),
    [active],
  );

  const visiblePois = useMemo(
    () => pois.filter((poi) => visibleCategories.has(poi.category)),
    [pois, visibleCategories],
  );
  const showNeighbours = active.includes(COSTS_LAYER);

  if (!MAPBOX_TOKEN) return null;

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-xl border">
      <MapGL
        initialViewState={{ latitude: lat, longitude: lng, zoom: 15 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* The checked address itself, always on top of its surroundings. */}
        <Marker latitude={lat} longitude={lng} anchor="bottom">
          <div className="flex flex-col items-center">
            <div className="rounded-full border-2 border-white bg-primary p-2 shadow-lg">
              <MapPin className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        </Marker>

        {showNeighbours &&
          neighbours.map((neighbour) => (
            <Marker
              key={neighbour.id}
              latitude={neighbour.lat}
              longitude={neighbour.lng}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelected({ kind: 'neighbour', marker: neighbour });
              }}
            >
              <button
                type="button"
                className="rounded-full border-2 border-white bg-foreground px-2 py-1 text-[11px] font-bold tabular-nums text-background shadow-md transition-transform hover:scale-110"
                aria-label={neighbour.address}
              >
                {neighbour.totalMedian == null ? '—' : formatMoney(neighbour.totalMedian)}
              </button>
            </Marker>
          ))}

        {visiblePois.map((poi) => {
          const Icon = CATEGORY_ICONS[poi.category] ?? MapPin;
          return (
            <Marker
              key={`${poi.category}-${poi.lat}-${poi.lng}-${poi.name}`}
              latitude={poi.lat}
              longitude={poi.lng}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelected({ kind: 'poi', marker: poi });
              }}
            >
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-md transition-transform hover:scale-110',
                  CATEGORY_COLORS[poi.category] ?? 'bg-muted-foreground',
                )}
                aria-label={poi.name}
              >
                <Icon className="h-3.5 w-3.5 text-white" />
              </button>
            </Marker>
          );
        })}

        {selected && (
          <Popup
            latitude={selected.marker.lat}
            longitude={selected.marker.lng}
            anchor="bottom"
            offset={16}
            closeButton={false}
            onClose={() => setSelected(null)}
            className="[&_.mapboxgl-popup-content]:rounded-xl [&_.mapboxgl-popup-content]:px-3 [&_.mapboxgl-popup-content]:py-2"
          >
            {selected.kind === 'poi' ? (
              <div className="max-w-[220px]">
                <p className="text-sm font-medium leading-snug">{selected.marker.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDistance(selected.marker.distanceM)}
                </p>
              </div>
            ) : (
              <div className="max-w-[240px]">
                <p className="text-sm font-medium leading-snug">{selected.marker.address}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.marker.totalMedian != null &&
                    `${formatMoney(selected.marker.totalMedian)} · `}
                  {t('reports', { count: selected.marker.reportCount })} ·{' '}
                  {formatDistance(selected.marker.distanceM)}
                </p>
                <Link
                  href={`/${citySlug}/building/${selected.marker.slug}`}
                  className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
                >
                  {t('openBuilding')}
                </Link>
              </div>
            )}
          </Popup>
        )}
      </MapGL>

      {/* Top-left: the Mapbox logo sits bottom-left and their terms require it
          to stay visible, and the zoom controls own the top-right. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-2 pr-12">
        <div className="pointer-events-auto flex flex-wrap gap-1.5 rounded-lg bg-background/90 p-1.5 shadow-sm backdrop-blur">
          {LAYERS.map(({ key, icon: Icon }) => {
            const isActive = active.includes(key);
            const isCosts = key === COSTS_LAYER;
            if (isCosts && neighbours.length === 0) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                aria-pressed={isActive}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? isCosts
                      ? 'bg-foreground text-background'
                      : 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`layers.${key}`)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 text-[9px] text-muted-foreground">
        {t('attribution')}
      </p>
    </div>
  );
}
