"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import MapGL, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
  type LayerProps,
} from "react-map-gl";
import type { GeoJSONSource } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import { Building2, MapPin, Users, X } from "lucide-react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";

export interface CostBuilding {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  address: string;
  district: string;
  reports: number;
  avgTotal: number;
  hasContributed: boolean;
}

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CostsMapProps {
  buildings: CostBuilding[];
  citySlug: string;
  bounds?: Bounds;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const WARSAW_CENTER = { longitude: 21.0122, latitude: 52.2297 };

function zoomForBounds(
  b: Bounds,
  mapWidth = 800,
  mapHeight = 600,
): number {
  const WORLD_PX = 512;
  const lngSpan = b.east - b.west;
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const mercY = (lat: number) =>
    Math.log(Math.tan(Math.PI / 4 + latRad(lat) / 2));
  const lngZoom = Math.log2((mapWidth * 360) / (lngSpan * WORLD_PX));
  const latZoom = Math.log2(
    (mapHeight * (2 * Math.PI)) /
      (Math.abs(mercY(b.north) - mercY(b.south)) * WORLD_PX),
  );
  return Math.min(lngZoom, latZoom) + 0.5;
}

const clusterLayer: LayerProps = {
  id: "cost-clusters",
  type: "circle",
  source: "cost-buildings",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#6366f1",
      5,
      "#4f46e5",
      10,
      "#4338ca",
    ],
    "circle-radius": ["step", ["get", "point_count"], 20, 5, 26, 10, 32],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

const clusterCountLayer: LayerProps = {
  id: "cost-cluster-count",
  type: "symbol",
  source: "cost-buildings",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 13,
  },
  paint: { "text-color": "#ffffff" },
};

const unclusteredLayer: LayerProps = {
  id: "cost-unclustered",
  type: "circle",
  source: "cost-buildings",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": 10,
    "circle-color": [
      "interpolate",
      ["linear"],
      ["get", "avgTotal"],
      1500,
      "#22c55e",
      3000,
      "#eab308",
      5000,
      "#ef4444",
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.9,
  },
};

export function CostsMap({ buildings, citySlug, bounds }: CostsMapProps) {
  const t = useTranslations("costs.overview");
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<CostBuilding | null>(null);
  const [cursor, setCursor] = useState("auto");

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

  const geojson = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: buildings.map((b) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
        properties: {
          id: b.id,
          address: b.address,
          district: b.district,
          reports: b.reports,
          avgTotal: b.avgTotal,
          hasContributed: b.hasContributed,
        },
      })),
    }),
    [buildings],
  );

  useEffect(() => {
    if (popupInfo && !buildings.some((b) => b.id === popupInfo.id)) {
      setPopupInfo(null);
    }
  }, [buildings, popupInfo]);

  const onMouseEnter = useCallback(() => setCursor("pointer"), []);
  const onMouseLeave = useCallback(() => setCursor("auto"), []);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) {
        setPopupInfo(null);
        return;
      }

      if (feature.properties?.cluster) {
        const clusterId = feature.properties.cluster_id as number;
        const source = mapRef.current?.getSource(
          "cost-buildings",
        ) as unknown as GeoJSONSource;
        source?.getClusterExpansionZoom(
          clusterId,
          (err?: Error | null, zoom?: number | null) => {
            if (err || zoom == null) return;
            const coords = (feature.geometry as Point).coordinates;
            mapRef.current?.easeTo({
              center: [coords[0], coords[1]],
              zoom,
              duration: 500,
            });
          },
        );
        return;
      }

      const props = feature.properties;
      if (props?.id) {
        const building = buildings.find((b) => b.id === props.id);
        if (building) setPopupInfo(building);
      }
    },
    [buildings],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        maxBounds={maxBounds}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={["cost-clusters", "cost-unclustered"]}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        cursor={cursor}
      >
        <NavigationControl position="top-right" />

        <Source
          id="cost-buildings"
          type="geojson"
          data={geojson}
          cluster
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLayer} />
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
            <div className="relative min-w-[200px] p-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setPopupInfo(null);
                }}
                className="absolute -right-0.5 -top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <Link
                href={`/${citySlug}/building/${popupInfo.slug}`}
                className="block cursor-pointer transition-opacity hover:opacity-80"
              >
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <h4 className="text-sm font-semibold leading-tight">
                    {popupInfo.address}
                  </h4>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {popupInfo.district}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {popupInfo.reports} {t("reports")}
                  </span>
                </div>
                {popupInfo.hasContributed && popupInfo.avgTotal > 0 && (
                  <p className="mt-2 text-base font-bold text-primary">
                    {popupInfo.avgTotal.toLocaleString()} PLN/mo
                  </p>
                )}
              </Link>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
