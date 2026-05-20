"use client";

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
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
import "mapbox-gl/dist/mapbox-gl.css";

export interface MapListing {
  id: string;
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
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const WARSAW_CENTER = { longitude: 21.0122, latitude: 52.2297 };

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "listings",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#2b44ff",
      5,
      "#1a30e0",
      10,
      "#0f20c0",
    ],
    "circle-radius": [
      "step",
      ["get", "point_count"],
      18,
      5,
      22,
      10,
      28,
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "listings",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 13,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

export function ListingsMap({
  listings,
  hoveredId,
  onHover,
  bounds,
}: ListingsMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<MapListing | null>(null);
  const [cursor, setCursor] = useState("auto");
  const [mapLoaded, setMapLoaded] = useState(false);

  const geojson = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: listings.map((l) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [l.lng, l.lat] },
        properties: {
          id: l.id,
          title: l.title,
          address: l.address,
          totalCost: l.totalCost,
          image: l.images[0] ?? "",
          promoted: l.promoted,
        },
      })),
    }),
    [listings],
  );

  const unclusteredPointLayer: LayerProps = useMemo(
    () => ({
      id: "unclustered-point",
      type: "circle" as const,
      source: "listings",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "id"], hoveredId ?? ""],
          14,
          ["==", ["get", "promoted"], true],
          11,
          10,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "id"], hoveredId ?? ""],
          "#2b44ff",
          ["==", ["get", "promoted"], true],
          "#2b44ff",
          "#1a1a2e",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.95,
      },
    }),
    [hoveredId],
  );

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || listings.length === 0) return;
    const lngs = listings.map((l) => l.lng);
    const lats = listings.map((l) => l.lat);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 50, maxZoom: 14 },
    );
  }, [listings, mapLoaded]);

  useEffect(() => {
    if (popupInfo && !listings.some((l) => l.id === popupInfo.id)) {
      setPopupInfo(null);
    }
  }, [listings, popupInfo]);

  const onMouseEnter = useCallback(
    (e: MapLayerMouseEvent) => {
      setCursor("pointer");
      const feature = e.features?.[0];
      if (feature?.properties && !feature.properties.cluster) {
        onHover(feature.properties.id);
      }
    },
    [onHover],
  );

  const onMouseLeave = useCallback(() => {
    setCursor("auto");
    onHover(null);
  }, [onHover]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      if (feature.properties?.cluster) {
        const clusterId = feature.properties.cluster_id as number;
        const source = mapRef.current?.getSource(
          "listings",
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
        const listing = listings.find((l) => l.id === props.id);
        if (listing) setPopupInfo(listing);
      }
    },
    [listings],
  );

  const initialViewState = useMemo(() => {
    if (bounds) {
      return {
        longitude: (bounds.west + bounds.east) / 2,
        latitude: (bounds.south + bounds.north) / 2,
        zoom: 11.5,
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
      <div
        className="flex h-full w-full items-center justify-center bg-muted"
      >
        <p className="text-sm text-muted-foreground">
          Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        maxBounds={maxBounds}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={["clusters", "unclustered-point"]}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
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
            offset={15}
          >
            <div style={{ minWidth: 200 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={popupInfo.images[0]}
                alt={popupInfo.title}
                style={{
                  width: "100%",
                  height: 100,
                  objectFit: "cover",
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              />
              <h4 style={{ fontWeight: 600, fontSize: 14, margin: "0 0 4px" }}>
                {popupInfo.title}
              </h4>
              <p style={{ color: "#666", fontSize: 12, margin: "0 0 8px" }}>
                {popupInfo.address}
              </p>
              <p
                style={{
                  fontWeight: 700,
                  color: "#2b44ff",
                  fontSize: 16,
                  margin: 0,
                }}
              >
                {popupInfo.totalCost.toLocaleString()} PLN/mo
              </p>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
