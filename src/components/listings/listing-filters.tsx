'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SlidersHorizontal, X, RotateCcw, CalendarIcon, Bed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useRouter } from '@/i18n/navigation';
import { AMENITY_CATEGORIES } from '@/lib/amenities';
import type { ListingFilters, ListingType } from '@/lib/listings-data';

const LISTING_TYPES: ListingType[] = ['replacement', 'roommate', 'sublet'];

const PRICE_RANGES: Record<ListingType | 'default', { min: number; max: number; step: number }> = {
  replacement: { min: 0, max: 10000, step: 100 },
  roommate: { min: 0, max: 5000, step: 100 },
  sublet: { min: 0, max: 15000, step: 100 },
  default: { min: 0, max: 10000, step: 100 },
};

function PriceRangeSlider({
  filters,
  onFiltersChange,
  listingType,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  listingType?: ListingType;
}) {
  const t = useTranslations();
  const range = PRICE_RANGES[listingType ?? 'default'];
  const currentMin = filters.priceMin ?? range.min;
  const currentMax = filters.priceMax ?? range.max;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [localValues, setLocalValues] = useState<[number, number]>([currentMin, currentMax]);

  useEffect(() => {
    // Mirror the committed filter props into the local (debounced) slider state
    // when they change externally, e.g. on reset or URL-driven updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValues([filters.priceMin ?? range.min, filters.priceMax ?? range.max]);
  }, [filters.priceMin, filters.priceMax, range.min, range.max]);

  const commitValues = useCallback(
    (min: number, max: number) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange({
          ...filters,
          priceMin: min <= range.min ? undefined : min,
          priceMax: max >= range.max ? undefined : max,
        });
      }, 200);
    },
    [filters, onFiltersChange, range.min, range.max],
  );

  const handleSliderChange = (values: number[]) => {
    const [min, max] = values as [number, number];
    setLocalValues([min, max]);
    commitValues(min, max);
  };

  const handleInputChange = (index: 0 | 1, raw: string) => {
    const num = raw === '' ? (index === 0 ? range.min : range.max) : Number(raw);
    if (isNaN(num)) return;
    const clamped = Math.min(Math.max(num, range.min), range.max);
    const next: [number, number] =
      index === 0
        ? [Math.min(clamped, localValues[1]), localValues[1]]
        : [localValues[0], Math.max(clamped, localValues[0])];
    setLocalValues(next);
    commitValues(next[0], next[1]);
  };

  const label = listingType
    ? t(`listings.filters.priceLabel_${listingType}`)
    : t('listings.filters.priceRange');

  const isFiltered =
    (filters.priceMin != null && filters.priceMin > range.min) ||
    (filters.priceMax != null && filters.priceMax < range.max);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {isFiltered && (
          <span className="text-xs font-medium tabular-nums text-primary">
            {localValues[0].toLocaleString()} – {localValues[1].toLocaleString()} PLN
          </span>
        )}
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={range.step}
        value={localValues}
        onValueChange={handleSliderChange}
        minStepsBetweenThumbs={1}
        thumbLabels={[t('listings.filters.min'), t('listings.filters.max')]}
        className="my-1"
      />
      <div className="flex items-center gap-2 mt-4">
        <Input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={localValues[0] || ''}
          onChange={(e) => handleInputChange(0, e.target.value)}
          className="h-8 bg-background/50 text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={t('listings.filters.min')}
        />
        <span className="text-muted-foreground">—</span>
        <Input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={localValues[1] || ''}
          onChange={(e) => handleInputChange(1, e.target.value)}
          className="h-8 bg-background/50 text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={t('listings.filters.max')}
        />
      </div>
    </div>
  );
}

interface ListingFiltersProps {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  districts?: string[];
  citySlug?: string;
  listingType?: ListingType;
}

function DatesFilter({
  filters,
  onFiltersChange,
  listingType,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  listingType?: ListingType;
}) {
  const t = useTranslations();
  const selectedFrom = filters.availableFrom ? new Date(filters.availableFrom) : undefined;
  const selectedTo = filters.availableTo ? new Date(filters.availableTo) : undefined;
  const showTo = listingType === 'sublet';

  // One date field — a compact popover trigger. `collisionPadding` keeps the
  // calendar fully on-screen when it's opened from inside the mobile sheet.
  const field = (
    labelKey: 'availableFrom' | 'availableTo',
    selected: Date | undefined,
    onChange: (iso: string | undefined) => void,
  ) => {
    const label = t(`listings.filters.${labelKey}` as Parameters<typeof t>[0]);
    return (
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-full justify-start gap-2 text-left text-sm font-normal hover:border-primary/40"
            >
              <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={`truncate ${selected ? '' : 'text-xs text-muted-foreground'}`}>
                {selected ? format(selected, 'dd.MM.yyyy') : t('listings.filters.selectDate')}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" collisionPadding={16}>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : undefined)}
            />
          </PopoverContent>
        </Popover>
        {selected && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => onChange(undefined)}
          >
            <X className="mr-1 h-3 w-3" />
            {t('listings.filters.clearAll')}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className={`grid gap-3 ${showTo ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {field('availableFrom', selectedFrom, (iso) =>
        onFiltersChange({ ...filters, availableFrom: iso }),
      )}
      {showTo &&
        field('availableTo', selectedTo, (iso) =>
          onFiltersChange({ ...filters, availableTo: iso }),
        )}
    </div>
  );
}

function BedroomsFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5].map((num) => {
        const isActive = filters.bedrooms?.includes(num) ?? false;
        return (
          <button
            key={num}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            onClick={() => {
              const current = filters.bedrooms || [];
              const updated = current.includes(num)
                ? current.filter((b) => b !== num)
                : [...current, num];
              onFiltersChange({
                ...filters,
                bedrooms: updated.length ? updated : undefined,
              });
            }}
          >
            <Bed className="h-3.5 w-3.5" />
            {num}+
          </button>
        );
      })}
    </div>
  );
}

function AmenitiesFilter({
  filters,
  onFiltersChange,
  searchable = false,
  idPrefix = 'amenity',
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  searchable?: boolean;
  idPrefix?: string;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  return (
    <div className="space-y-3">
      {searchable && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('listings.filters.searchAmenities')}
          className="h-9"
        />
      )}
      {AMENITY_CATEGORIES.map((category) => {
        const items = q
          ? category.items.filter((a) =>
              t(`listings.features.${a}` as Parameters<typeof t>[0])
                .toLowerCase()
                .includes(q),
            )
          : category.items;
        if (items.length === 0) return null;
        return (
          <div key={category.categoryKey}>
            <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
              {t(category.categoryKey)}
            </p>
            {items.map((amenity) => {
              const checked = filters.amenities?.includes(amenity) ?? false;
              return (
                <div
                  key={amenity}
                  className="flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    id={`${idPrefix}-${amenity}`}
                    checked={checked}
                    onCheckedChange={(isChecked) => {
                      const current = filters.amenities ?? [];
                      const updated = isChecked
                        ? [...current, amenity]
                        : current.filter((a) => a !== amenity);
                      onFiltersChange({
                        ...filters,
                        amenities: updated.length ? updated : undefined,
                      });
                    }}
                  />
                  <Label
                    htmlFor={`${idPrefix}-${amenity}`}
                    className="flex-1 cursor-pointer py-2.5 text-sm font-normal"
                  >
                    {t(`listings.features.${amenity}` as Parameters<typeof t>[0])}
                  </Label>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DistrictsFilter({
  filters,
  onFiltersChange,
  districts,
  idPrefix = 'district',
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
  districts?: string[];
  idPrefix?: string;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const all = districts ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((d) => d.toLowerCase().includes(q)) : all;
  const LIMIT = 8;
  const collapsed = !showAll && !q && filtered.length > LIMIT;
  const shown = collapsed ? filtered.slice(0, LIMIT) : filtered;

  return (
    <div className="space-y-2">
      {all.length > 10 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('listings.filters.searchDistricts')}
          className="h-9"
        />
      )}
      <div className="space-y-0.5">
        {shown.map((district) => {
          const checked = filters.districts?.includes(district) || false;
          return (
            <div
              key={district}
              className="flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors hover:bg-muted/50"
            >
              <Checkbox
                id={`${idPrefix}-${district}`}
                checked={checked}
                onCheckedChange={(c) => {
                  const current = filters.districts || [];
                  const updated = c
                    ? [...current, district]
                    : current.filter((d) => d !== district);
                  onFiltersChange({
                    ...filters,
                    districts: updated.length ? updated : undefined,
                  });
                }}
              />
              <Label
                htmlFor={`${idPrefix}-${district}`}
                className="flex-1 cursor-pointer py-2.5 text-sm font-normal"
              >
                {district}
              </Label>
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {t('listings.filters.noMatches')}
          </p>
        )}
      </div>
      {collapsed && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full text-xs text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          {t('listings.filters.showMore', { count: filtered.length - LIMIT })}
        </Button>
      )}
    </div>
  );
}

/**
 * Mobile-only horizontally scrollable quick-filter chips. Each chip opens the
 * full filter bottom sheet; the leading "All filters" chip carries the active
 * count. Chips show their current value so the most-used refinements are visible
 * and one tap away (Baymard/Airbnb two-tier pattern) instead of buried in the sheet.
 */
/**
 * Listing-type switcher for the results header. Changing type is a route change
 * (a top-level decision), not a filter — so it lives outside the filter
 * sheet/sidebar (OLX/Otodom present transaction type as a first-class choice).
 * `variant`: 'segmented' = full-width pill control (mobile); 'tabs' = compact
 * underline tabs (desktop).
 */
export function ListingTypeTabs({
  listingType,
  citySlug,
  variant = 'segmented',
}: {
  listingType: ListingType;
  citySlug?: string;
  variant?: 'segmented' | 'tabs';
}) {
  const t = useTranslations();
  const router = useRouter();
  const go = (typeOption: ListingType) => {
    if (typeOption !== listingType && citySlug) router.push(`/${citySlug}/${typeOption}`);
  };

  if (variant === 'tabs') {
    return (
      <div className="flex items-center gap-6">
        {LISTING_TYPES.map((typeOption) => {
          const isActive = listingType === typeOption;
          return (
            <button
              key={typeOption}
              type="button"
              aria-pressed={isActive}
              onClick={() => go(typeOption)}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`listings.types.${typeOption}`)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex w-full gap-1 rounded-lg border bg-muted/40 p-1">
      {LISTING_TYPES.map((typeOption) => {
        const isActive = listingType === typeOption;
        return (
          <button
            key={typeOption}
            type="button"
            aria-pressed={isActive}
            onClick={() => go(typeOption)}
            className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`listings.types.${typeOption}`)}
          </button>
        );
      })}
    </div>
  );
}

export function QuickFilters({
  filters,
  onOpen,
  activeCount,
}: {
  filters: ListingFilters;
  onOpen: (section?: string) => void;
  activeCount: number;
}) {
  const t = useTranslations();

  const chip = (key: string, section: string, label: string, active: boolean) => (
    <button
      key={key}
      type="button"
      onClick={() => onOpen(section)}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40'
      }`}
    >
      {label}
    </button>
  );

  const priceLabel =
    filters.priceMin || filters.priceMax
      ? filters.priceMin && filters.priceMax
        ? `${filters.priceMin.toLocaleString()}–${filters.priceMax.toLocaleString()}`
        : filters.priceMax
          ? `≤${filters.priceMax.toLocaleString()}`
          : `≥${filters.priceMin!.toLocaleString()}`
      : t('listings.filters.priceRange');
  const roomsLabel = filters.bedrooms?.length
    ? filters.bedrooms.map((b) => `${b}+`).join(', ')
    : t('listings.filters.bedrooms');
  const districtsLabel = filters.districts?.length
    ? filters.districts.length === 1
      ? filters.districts[0]
      : `${filters.districts[0]} +${filters.districts.length - 1}`
    : t('listings.filters.districts');
  const datesLabel = filters.availableFrom ?? t('listings.filters.dates');

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onOpen()}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t('listings.filters.title')}
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      {chip('price', 'price', priceLabel, !!(filters.priceMin || filters.priceMax))}
      {chip('rooms', 'bedrooms', roomsLabel, !!filters.bedrooms?.length)}
      {chip('districts', 'districts', districtsLabel, !!filters.districts?.length)}
      {chip('dates', 'dates', datesLabel, !!(filters.availableFrom || filters.availableTo))}
    </div>
  );
}

function RoomTypeFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();
  const options = [
    { value: undefined, label: t('listings.filters.roomTypeAll') },
    { value: 'private' as const, label: t('listings.filters.roomTypePrivate') },
    { value: 'shared' as const, label: t('listings.filters.roomTypeShared') },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option, idx) => {
        const isActive = filters.roomType === option.value;
        return (
          <Button
            key={idx}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className={`h-9 text-xs transition-all ${
              isActive ? 'shadow-sm shadow-primary/20' : 'hover:border-primary/40'
            }`}
            onClick={() => onFiltersChange({ ...filters, roomType: option.value })}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function PreferredGenderFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();
  const options = [
    { value: undefined, label: t('listings.filters.genderAny') },
    { value: 'male' as const, label: t('listings.filters.genderMale') },
    { value: 'female' as const, label: t('listings.filters.genderFemale') },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option, idx) => {
        const isActive =
          option.value === undefined
            ? filters.preferredGender === undefined
            : filters.preferredGender === option.value;
        return (
          <Button
            key={idx}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className={`h-9 text-xs transition-all ${
              isActive ? 'shadow-sm shadow-primary/20' : 'hover:border-primary/40'
            }`}
            onClick={() => onFiltersChange({ ...filters, preferredGender: option.value })}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function ApartmentParamsFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs text-muted-foreground mb-1.5 block">
          {t('listings.filters.area')}
        </span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder={t('listings.filters.min')}
            value={filters.areaMin || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                areaMin: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 bg-background/50"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            placeholder={t('listings.filters.max')}
            value={filters.areaMax || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                areaMax: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 bg-background/50"
          />
        </div>
      </div>
      <div>
        <span className="text-xs text-muted-foreground mb-1.5 block">
          {t('listings.filters.floor')}
        </span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder={t('listings.filters.min')}
            value={filters.floorMin ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                floorMin: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 bg-background/50"
            min={0}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            placeholder={t('listings.filters.max')}
            value={filters.floorMax ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                floorMax: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 bg-background/50"
            min={0}
          />
        </div>
      </div>
    </div>
  );
}

function WithPhotosFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="photos-toggle" className="text-sm font-normal cursor-pointer">
        {t('listings.filters.withPhotos')}
      </Label>
      <Switch
        id="photos-toggle"
        checked={filters.hasPhotos ?? false}
        onCheckedChange={(checked) =>
          onFiltersChange({
            ...filters,
            hasPhotos: checked || undefined,
          })
        }
      />
    </div>
  );
}

function UtilitiesIncludedFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="utilities-toggle" className="text-sm font-normal cursor-pointer">
        {t('listings.filters.utilitiesIncluded')}
      </Label>
      <Switch
        id="utilities-toggle"
        checked={filters.utilitiesIncluded ?? false}
        onCheckedChange={(checked) =>
          onFiltersChange({
            ...filters,
            utilitiesIncluded: checked || undefined,
          })
        }
      />
    </div>
  );
}

function InternetIncludedFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="internet-toggle" className="text-sm font-normal cursor-pointer">
        {t('listings.filters.internetIncluded')}
      </Label>
      <Switch
        id="internet-toggle"
        checked={filters.internetIncluded ?? false}
        onCheckedChange={(checked) =>
          onFiltersChange({
            ...filters,
            internetIncluded: checked || undefined,
          })
        }
      />
    </div>
  );
}

function RegistrationPossibleFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="registration-toggle" className="text-sm font-normal cursor-pointer">
        {t('listings.filters.registrationPossible')}
      </Label>
      <Switch
        id="registration-toggle"
        checked={filters.registrationPossible ?? false}
        onCheckedChange={(checked) =>
          onFiltersChange({
            ...filters,
            registrationPossible: checked || undefined,
          })
        }
      />
    </div>
  );
}

export function ListingFiltersDesktop({
  filters,
  onFiltersChange,
  districts,
  listingType,
}: ListingFiltersProps) {
  const t = useTranslations();
  return (
    <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-border/50 bg-card/50 backdrop-blur-sm p-5 xl:block">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('listings.filters.title')}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange({})}
          className="h-auto gap-1 p-1 text-xs text-muted-foreground hover:text-primary"
        >
          <RotateCcw className="h-3 w-3" />
          {t('listings.filters.clearAll')}
        </Button>
      </div>

      {/* Quick toggles */}
      <div className="mt-4 space-y-3">
        <WithPhotosFilter filters={filters} onFiltersChange={onFiltersChange} />
        <RegistrationPossibleFilter filters={filters} onFiltersChange={onFiltersChange} />
        {listingType === 'sublet' && (
          <>
            <UtilitiesIncludedFilter filters={filters} onFiltersChange={onFiltersChange} />
            <InternetIncludedFilter filters={filters} onFiltersChange={onFiltersChange} />
          </>
        )}
      </div>

      <Accordion
        type="multiple"
        defaultValue={[
          'price',
          'bedrooms',
          'dates',
          'params',
          'amenities',
          'roommate',
          'districts',
        ]}
        className="mt-4"
      >
        {/* 3. Price */}
        <AccordionItem value="price" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">
            {t('listings.filters.priceRange')}
          </AccordionTrigger>
          <AccordionContent>
            <PriceRangeSlider
              filters={filters}
              onFiltersChange={onFiltersChange}
              listingType={listingType}
            />
          </AccordionContent>
        </AccordionItem>

        {/* 4. Bedrooms — pill-chips with bed icon */}
        <AccordionItem value="bedrooms" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">
            {t('listings.filters.bedrooms')}
          </AccordionTrigger>
          <AccordionContent>
            <BedroomsFilter filters={filters} onFiltersChange={onFiltersChange} />
          </AccordionContent>
        </AccordionItem>

        {/* 5. Dates — combined from/to */}
        <AccordionItem value="dates" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">
            {t('listings.filters.dates')}
          </AccordionTrigger>
          <AccordionContent>
            <DatesFilter
              filters={filters}
              onFiltersChange={onFiltersChange}
              listingType={listingType}
            />
          </AccordionContent>
        </AccordionItem>

        {/* 6. Apartment params — area + floor */}
        <AccordionItem value="params" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">
            {t('listings.filters.apartmentParams')}
          </AccordionTrigger>
          <AccordionContent>
            <ApartmentParamsFilter filters={filters} onFiltersChange={onFiltersChange} />
          </AccordionContent>
        </AccordionItem>

        {/* 7. Amenities (grouped by category) */}
        <AccordionItem value="amenities" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">
            {t('listings.filters.amenities')}
          </AccordionTrigger>
          <AccordionContent>
            <div className="max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              <AmenitiesFilter filters={filters} onFiltersChange={onFiltersChange} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 8. Roommate-specific */}
        {listingType === 'roommate' && (
          <AccordionItem value="roommate" className="border-border/50">
            <AccordionTrigger className="text-sm font-medium">
              {t('listings.filters.roomType')}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <RoomTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
                <div>
                  <span className="text-xs text-muted-foreground mb-1.5 block">
                    {t('listings.filters.genderPreference')}
                  </span>
                  <PreferredGenderFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* 9. Districts */}
        <AccordionItem value="districts" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">
            {t('listings.filters.districts')}
          </AccordionTrigger>
          <AccordionContent>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {districts?.map((district) => (
                <div
                  key={district}
                  className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    id={`district-${district}`}
                    checked={filters.districts?.includes(district) || false}
                    onCheckedChange={(checked) => {
                      const current = filters.districts || [];
                      const updated = checked
                        ? [...current, district]
                        : current.filter((d) => d !== district);
                      onFiltersChange({
                        ...filters,
                        districts: updated.length ? updated : undefined,
                      });
                    }}
                  />
                  <Label
                    htmlFor={`district-${district}`}
                    className="flex-1 cursor-pointer text-sm font-normal"
                  >
                    {district}
                  </Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export function ListingFiltersMobile({
  filters,
  onFiltersChange,
  districts,
  listingType,
  resultCount,
  open: controlledOpen,
  onOpenChange,
  scrollToSection,
}: ListingFiltersProps & {
  resultCount?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  scrollToSection?: string;
}) {
  const t = useTranslations();
  // Controlled when the parent drives it (quick-filter chips); falls back to its
  // own state otherwise.
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Opened from a quick-filter chip → scroll that section into view (a beat after
  // the open animation, once the content is laid out).
  useEffect(() => {
    if (!open || !scrollToSection) return;
    const tid = setTimeout(() => {
      document
        .getElementById(`flt-${scrollToSection}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 160);
    return () => clearTimeout(tid);
  }, [open, scrollToSection]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 rounded-t-2xl p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{t('listings.filters.title')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('listings.filters.sheetDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4">
          {/* Quick toggles */}
          <div className="space-y-3">
            <WithPhotosFilter filters={filters} onFiltersChange={onFiltersChange} />
            <RegistrationPossibleFilter filters={filters} onFiltersChange={onFiltersChange} />
            {listingType === 'sublet' && (
              <>
                <UtilitiesIncludedFilter filters={filters} onFiltersChange={onFiltersChange} />
                <InternetIncludedFilter filters={filters} onFiltersChange={onFiltersChange} />
              </>
            )}
          </div>

          {/* Price */}
          <div id="flt-price" className="scroll-mt-4">
            <Label className="text-sm font-medium">{t('listings.filters.priceRange')}</Label>
            <div className="mt-2">
              <PriceRangeSlider
                filters={filters}
                onFiltersChange={onFiltersChange}
                listingType={listingType}
              />
            </div>
          </div>

          {/* Bedrooms — pill-chips */}
          <div id="flt-bedrooms" className="scroll-mt-4">
            <Label className="text-sm font-medium">{t('listings.filters.bedrooms')}</Label>
            <div className="mt-2">
              <BedroomsFilter filters={filters} onFiltersChange={onFiltersChange} />
            </div>
          </div>

          {/* Dates — combined */}
          <div id="flt-dates" className="scroll-mt-4">
            <Label className="text-sm font-medium">{t('listings.filters.dates')}</Label>
            <div className="mt-2">
              <DatesFilter
                filters={filters}
                onFiltersChange={onFiltersChange}
                listingType={listingType}
              />
            </div>
          </div>

          {/* Apartment params — area + floor */}
          <div>
            <Label className="text-sm font-medium">{t('listings.filters.apartmentParams')}</Label>
            <div className="mt-2">
              <ApartmentParamsFilter filters={filters} onFiltersChange={onFiltersChange} />
            </div>
          </div>

          {/* Amenities */}
          <div>
            <Label className="text-sm font-medium">{t('listings.filters.amenities')}</Label>
            <div className="mt-2">
              <AmenitiesFilter
                filters={filters}
                onFiltersChange={onFiltersChange}
                searchable
                idPrefix="m-amenity"
              />
            </div>
          </div>

          {/* Roommate-specific */}
          {listingType === 'roommate' && (
            <>
              <div>
                <Label className="text-sm font-medium">{t('listings.filters.roomType')}</Label>
                <div className="mt-2">
                  <RoomTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">
                  {t('listings.filters.genderPreference')}
                </Label>
                <div className="mt-2">
                  <PreferredGenderFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
            </>
          )}

          {/* Districts */}
          <div id="flt-districts" className="scroll-mt-4">
            <Label className="text-sm font-medium">{t('listings.filters.districts')}</Label>
            <div className="mt-2">
              <DistrictsFilter
                filters={filters}
                onFiltersChange={onFiltersChange}
                districts={districts}
                idPrefix="m-district"
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 mt-auto flex gap-3 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <Button variant="outline" className="h-11 flex-1" onClick={() => onFiltersChange({})}>
            {t('listings.filters.clearAll')}
          </Button>
          <Button className="h-11 flex-1" onClick={() => setOpen(false)}>
            <span aria-live="polite">
              {resultCount != null
                ? t('listings.filters.showResultsCount', { count: resultCount })
                : t('listings.filters.showResults')}
            </span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ActiveFilters({ filters, onFiltersChange }: ListingFiltersProps) {
  const t = useTranslations();
  const hasFilters = Object.values(filters).some(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true),
  );

  if (!hasFilters) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-wrap items-center gap-2"
    >
      <AnimatePresence mode="popLayout">
        {(filters.priceMin || filters.priceMax) && (
          <motion.div
            key="price"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                onFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined })
              }
            >
              {filters.priceMin && filters.priceMax
                ? `${filters.priceMin.toLocaleString()} – ${filters.priceMax.toLocaleString()} PLN`
                : filters.priceMin
                  ? `${t('listings.filters.min')}: ${filters.priceMin.toLocaleString()} PLN`
                  : `${t('listings.filters.max')}: ${filters.priceMax!.toLocaleString()} PLN`}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.bedrooms?.map((num) => (
          <motion.div
            key={`bed-${num}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                const updated = filters.bedrooms?.filter((b) => b !== num);
                onFiltersChange({
                  ...filters,
                  bedrooms: updated?.length ? updated : undefined,
                });
              }}
            >
              <Bed className="h-3 w-3" />
              {num}+
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        ))}
        {(filters.areaMin != null || filters.areaMax != null) && (
          <motion.div
            key="area"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                onFiltersChange({ ...filters, areaMin: undefined, areaMax: undefined })
              }
            >
              {t('listings.filters.area')}:{' '}
              {filters.areaMin != null && filters.areaMax != null
                ? `${filters.areaMin}–${filters.areaMax}`
                : filters.areaMin != null
                  ? `${filters.areaMin}+`
                  : `≤${filters.areaMax}`}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.districts?.map((district) => (
          <motion.div
            key={`dist-${district}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                const updated = filters.districts?.filter((d) => d !== district);
                onFiltersChange({
                  ...filters,
                  districts: updated?.length ? updated : undefined,
                });
              }}
            >
              {district}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        ))}
        {filters.availableFrom && (
          <motion.div
            key="availableFrom"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, availableFrom: undefined })}
            >
              {t('listings.filters.availableFrom')}: {filters.availableFrom}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.amenities?.map((amenity) => (
          <motion.div
            key={`amenity-${amenity}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                const updated = filters.amenities?.filter((a) => a !== amenity);
                onFiltersChange({
                  ...filters,
                  amenities: updated?.length ? updated : undefined,
                });
              }}
            >
              {t(`listings.features.${amenity}` as Parameters<typeof t>[0])}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        ))}
        {filters.roomType && (
          <motion.div
            key="roomType"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, roomType: undefined })}
            >
              {filters.roomType === 'private'
                ? t('listings.filters.roomTypePrivate')
                : t('listings.filters.roomTypeShared')}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.preferredGender && (
          <motion.div
            key="gender"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, preferredGender: undefined })}
            >
              {t('listings.filters.genderPreference')}:{' '}
              {t(
                `listings.filters.gender${filters.preferredGender.charAt(0).toUpperCase() + filters.preferredGender.slice(1)}` as Parameters<
                  typeof t
                >[0],
              )}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.availableTo && (
          <motion.div
            key="availableTo"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, availableTo: undefined })}
            >
              {t('listings.filters.availableTo')}: {filters.availableTo}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.utilitiesIncluded && (
          <motion.div
            key="utilities"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, utilitiesIncluded: undefined })}
            >
              {t('listings.filters.utilitiesIncluded')}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {(filters.floorMin != null || filters.floorMax != null) && (
          <motion.div
            key="floor"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                onFiltersChange({ ...filters, floorMin: undefined, floorMax: undefined })
              }
            >
              {t('listings.filters.floor')}:{' '}
              {filters.floorMin != null && filters.floorMax != null
                ? `${filters.floorMin}–${filters.floorMax}`
                : filters.floorMin != null
                  ? `${filters.floorMin}+`
                  : `≤${filters.floorMax}`}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.hasPhotos && (
          <motion.div
            key="photos"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, hasPhotos: undefined })}
            >
              {t('listings.filters.withPhotos')}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.internetIncluded && (
          <motion.div
            key="internet"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, internetIncluded: undefined })}
            >
              {t('listings.filters.internetIncluded')}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.registrationPossible && (
          <motion.div
            key="registration"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, registrationPossible: undefined })}
            >
              {t('listings.filters.registrationPossible')}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
