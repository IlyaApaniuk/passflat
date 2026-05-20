"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin } from "lucide-react";

export interface PlaceResult {
  street: string;
  buildingNumber: string;
  district: string;
  postalCode: string;
  lat: number;
  lng: number;
  placeId: string;
  formattedAddress: string;
}

interface AddressAutocompleteProps {
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  defaultValue?: string;
}

let googleMapsLoaded = false;
let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const loader = new Loader({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY!,
    version: "weekly",
    libraries: ["places"],
  });

  loadPromise = loader.load().then(() => {
    googleMapsLoaded = true;
  });

  return loadPromise;
}

export function AddressAutocomplete({
  onPlaceSelect,
  placeholder = "Start typing address...",
  defaultValue = "",
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.address_components || !place.geometry?.location) return;

    const components = place.address_components;
    const get = (type: string) =>
      components.find((c) => c.types.includes(type))?.long_name ?? "";

    const result: PlaceResult = {
      street: `${get("route")}`,
      buildingNumber: get("street_number"),
      district: get("sublocality_level_1") || get("locality") || "",
      postalCode: get("postal_code"),
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      placeId: place.place_id ?? "",
      formattedAddress: place.formatted_address ?? "",
    };

    setValue(result.formattedAddress);
    onPlaceSelect(result);
  }, [onPlaceSelect]);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !inputRef.current) return;

      autocompleteRef.current = new google.maps.places.Autocomplete(
        inputRef.current,
        {
          componentRestrictions: { country: "pl" },
          types: ["address"],
          fields: [
            "address_components",
            "geometry",
            "formatted_address",
            "place_id",
          ],
        },
      );

      autocompleteRef.current.addListener("place_changed", handlePlaceChanged);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [handlePlaceChanged]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        disabled={isLoading}
      />
    </div>
  );
}
