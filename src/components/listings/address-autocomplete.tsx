'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

export interface PlaceResult {
  street: string;
  buildingNumber: string;
  district: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  placeId: string;
  formattedAddress: string;
}

interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface AddressAutocompleteProps {
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  defaultValue?: string;
  bounds?: CityBounds;
  /** Search-box activity, for callers that measure a funnel: it separates "never
   *  typed" from "typed, saw results, picked nothing". Must be referentially
   *  stable — it is a dependency of the debounced fetch. */
  onSearchActivity?: (activity: { typed: boolean; suggestionsShown: number }) => void;
}

/** Tallest the list ever gets (`max-h-60`), when there is room for it. */
const LIST_MAX_PX = 240;
/** Below this much free space the list is not worth opening downwards — flip it
 *  above the input instead. Two rows plus the attribution line. */
const LIST_FLIP_BELOW_PX = 128;
/** Never shrink past this: a 1-row list reads as a glitch, not as a menu. */
const LIST_MIN_PX = 96;
const LIST_GAP_PX = 8;

let placesLibPromise: Promise<void> | null = null;

function bootstrapGoogleMaps() {
  // Dynamic shim that augments the global window with Google Maps' lazy loader.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const g = (w.google = w.google || {});
  const m = (g.maps = g.maps || {});
  if (typeof m.importLibrary === 'function') return;

  const pending = new Set<string>();
  let coreReady: Promise<void> | null = null;

  m.importLibrary = (name: string) => {
    pending.add(name);
    if (!coreReady) {
      coreReady = new Promise<void>((resolve, reject) => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY!;
        const params = new URLSearchParams({
          key: apiKey,
          v: 'weekly',
          libraries: [...pending].join(','),
          loading: 'async',
          callback: '__gmcb',
        });
        w.__gmcb = resolve;
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
        s.async = true;
        s.onerror = () => reject(new Error('Failed to load Google Maps'));
        document.head.appendChild(s);
      });
    }
    return coreReady.then(() => m.importLibrary(name));
  };
}

function ensureMapsLoaded(): Promise<void> {
  if (placesLibPromise) return placesLibPromise;
  bootstrapGoogleMaps();
  placesLibPromise = google.maps.importLibrary('places').then(() => {});
  return placesLibPromise;
}

export function AddressAutocomplete({
  onPlaceSelect,
  placeholder = 'Start typing address...',
  defaultValue = '',
  bounds,
  onSearchActivity,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<{ drop: 'up' | 'down'; maxHeight: number }>({
    drop: 'down',
    maxHeight: LIST_MAX_PX,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ensureMapsLoaded().then(() => {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      setIsLoading(false);
    });
  }, []);

  // On a phone the list opens into the space the on-screen keyboard is about to
  // take: the field sits mid-form, the browser scrolls only the INPUT into view,
  // and a 240px list below it lands under the keyboard. Measured at 390x844 with
  // the keyboard up, 64px of 240 stayed visible — one clipped row out of five.
  // visualViewport is the only API that sees the keyboard at all; on iOS
  // window.innerHeight keeps reporting the full screen.
  const measurePlacement = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const below = viewBottom - rect.bottom - LIST_GAP_PX;
    const above = rect.top - viewTop - LIST_GAP_PX;
    const drop = below < LIST_FLIP_BELOW_PX && above > below ? 'up' : 'down';
    const space = drop === 'up' ? above : below;
    const maxHeight = Math.min(LIST_MAX_PX, Math.max(LIST_MIN_PX, Math.floor(space)));
    setPlacement((prev) =>
      prev.drop === drop && prev.maxHeight === maxHeight ? prev : { drop, maxHeight },
    );
  }, []);

  // Re-measure while the list is open: the keyboard animates in after focus, and
  // scrolling moves the field through the visible band.
  useEffect(() => {
    if (!isOpen) return;
    measurePlacement();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measurePlacement);
    vv?.addEventListener('scroll', measurePlacement);
    window.addEventListener('resize', measurePlacement);
    window.addEventListener('scroll', measurePlacement, true);
    return () => {
      vv?.removeEventListener('resize', measurePlacement);
      vv?.removeEventListener('scroll', measurePlacement);
      window.removeEventListener('resize', measurePlacement);
      window.removeEventListener('scroll', measurePlacement, true);
    };
  }, [isOpen, measurePlacement, suggestions.length]);

  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (!input || input.length < 3) {
        setSuggestions([]);
        setIsOpen(false);
        onSearchActivity?.({ typed: input.length > 0, suggestionsShown: 0 });
        return;
      }

      try {
        const request: google.maps.places.AutocompleteRequest = {
          input,
          includedRegionCodes: ['pl'],
          sessionToken: sessionTokenRef.current!,
        };
        if (bounds) {
          request.locationRestriction = {
            north: bounds.north,
            south: bounds.south,
            east: bounds.east,
            west: bounds.west,
          };
        }

        const { suggestions: results } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

        setSuggestions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
        onSearchActivity?.({ typed: true, suggestionsShown: results.length });
      } catch {
        setSuggestions([]);
        setIsOpen(false);
        onSearchActivity?.({ typed: true, suggestionsShown: 0 });
      }
    },
    [bounds, onSearchActivity],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setValue(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    },
    [fetchSuggestions],
  );

  const handleSelect = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) return;

      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['addressComponents', 'location', 'formattedAddress', 'id'],
      });

      const components = place.addressComponents ?? [];
      const get = (type: string) => components.find((c) => c.types.includes(type))?.longText ?? '';

      const loc = place.location;
      const result: PlaceResult = {
        street: get('route'),
        buildingNumber: get('street_number'),
        district: get('sublocality_level_1') || get('locality') || '',
        city:
          get('locality') ||
          get('administrative_area_level_2') ||
          get('administrative_area_level_1') ||
          '',
        postalCode: get('postal_code'),
        lat: loc?.lat() ?? 0,
        lng: loc?.lng() ?? 0,
        placeId: place.id ?? '',
        formattedAddress: place.formattedAddress ?? '',
      };

      setValue(result.formattedAddress);
      setSuggestions([]);
      setIsOpen(false);
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      onPlaceSelect(result);
    },
    [onPlaceSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        handleSelect(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [isOpen, suggestions, activeIndex, handleSelect],
  );

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onFocus={() => {
          measurePlacement();
          if (suggestions.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        className="pl-9"
        disabled={isLoading}
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        // z-[60] clears the cookie banner: it is also z-50 and paints later in
        // the document, so at z-50 it swallowed taps on the lower suggestions.
        <ul
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute z-[60] w-full overflow-auto overscroll-contain rounded-md border bg-popover p-1 shadow-md ${
            placement.drop === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {suggestions.map((suggestion, i) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;
            return (
              <li
                key={prediction.placeId}
                onMouseDown={() => handleSelect(suggestion)}
                className={`cursor-pointer rounded-sm px-3 py-3 text-sm transition-colors sm:py-2 ${
                  i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
              >
                <span className="font-medium">{prediction.mainText?.text ?? ''}</span>
                {prediction.secondaryText?.text && (
                  <span className="ml-1 text-muted-foreground">
                    {prediction.secondaryText.text}
                  </span>
                )}
              </li>
            );
          })}
          <li className="px-3 py-1.5 text-[10px] text-muted-foreground">Powered by Google</li>
        </ul>
      )}
    </div>
  );
}
