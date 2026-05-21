"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SlidersHorizontal, X, RotateCcw, CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useRouter } from "@/i18n/navigation";
import type { ListingFilters, ListingType } from "@/lib/listings-data";

const LISTING_TYPES: ListingType[] = ["replacement", "roommate", "sublet"];

const PRICE_RANGES: Record<ListingType | "default", { min: number; max: number; step: number }> = {
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
  const range = PRICE_RANGES[listingType ?? "default"];
  const currentMin = filters.priceMin ?? range.min;
  const currentMax = filters.priceMax ?? range.max;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [localValues, setLocalValues] = useState<[number, number]>([currentMin, currentMax]);

  useEffect(() => {
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
    const num = raw === "" ? (index === 0 ? range.min : range.max) : Number(raw);
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
    : t("listings.filters.priceRange");

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
        className="my-1"
      />
      <div className="flex items-center gap-2 mt-4">
        <Input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={localValues[0] || ""}
          onChange={(e) => handleInputChange(0, e.target.value)}
          className="h-8 bg-background/50 text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={t("listings.filters.min")}
        />
        <span className="text-muted-foreground">—</span>
        <Input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={localValues[1] || ""}
          onChange={(e) => handleInputChange(1, e.target.value)}
          className="h-8 bg-background/50 text-xs tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={t("listings.filters.max")}
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

function DatePickerFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();
  const selected = filters.availableFrom ? new Date(filters.availableFrom) : undefined;

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full h-9 justify-start text-left text-sm font-normal hover:border-primary/40"
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {selected ? (
              format(selected, "PPP")
            ) : (
              <span className="text-muted-foreground">
                {t("listings.filters.availableFrom")}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) =>
              onFiltersChange({
                ...filters,
                availableFrom: date ? format(date, "yyyy-MM-dd") : undefined,
              })
            }
          />
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => onFiltersChange({ ...filters, availableFrom: undefined })}
        >
          <X className="mr-1 h-3 w-3" />
          {t("listings.filters.clearAll")}
        </Button>
      )}
    </div>
  );
}

function FurnishedFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();
  const options = [
    { value: undefined, label: t("listings.filters.furnishedAll") },
    { value: true, label: t("listings.filters.furnishedYes") },
    { value: false, label: t("listings.filters.furnishedNo") },
  ] as const;

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option, idx) => {
        const isActive = filters.furnished === option.value;
        return (
          <Button
            key={idx}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs transition-all ${
              isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
            }`}
            onClick={() =>
              onFiltersChange({ ...filters, furnished: option.value })
            }
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function PetsAllowedFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="pets-toggle" className="text-sm font-normal cursor-pointer">
        {t("listings.filters.petsAllowed")}
      </Label>
      <Switch
        id="pets-toggle"
        checked={filters.petsAllowed ?? false}
        onCheckedChange={(checked) =>
          onFiltersChange({
            ...filters,
            petsAllowed: checked || undefined,
          })
        }
      />
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
    { value: undefined, label: t("listings.filters.roomTypeAll") },
    { value: "private" as const, label: t("listings.filters.roomTypePrivate") },
    { value: "shared" as const, label: t("listings.filters.roomTypeShared") },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option, idx) => {
        const isActive = filters.roomType === option.value;
        return (
          <Button
            key={idx}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs transition-all ${
              isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
            }`}
            onClick={() =>
              onFiltersChange({ ...filters, roomType: option.value })
            }
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
    { value: undefined, label: t("listings.filters.genderAny") },
    { value: "male" as const, label: t("listings.filters.genderMale") },
    { value: "female" as const, label: t("listings.filters.genderFemale") },
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
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs transition-all ${
              isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
            }`}
            onClick={() =>
              onFiltersChange({ ...filters, preferredGender: option.value })
            }
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function AvailableToFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();
  const selected = filters.availableTo ? new Date(filters.availableTo) : undefined;

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full h-9 justify-start text-left text-sm font-normal hover:border-primary/40"
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {selected ? (
              format(selected, "PPP")
            ) : (
              <span className="text-muted-foreground">
                {t("listings.filters.availableTo")}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) =>
              onFiltersChange({
                ...filters,
                availableTo: date ? format(date, "yyyy-MM-dd") : undefined,
              })
            }
          />
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => onFiltersChange({ ...filters, availableTo: undefined })}
        >
          <X className="mr-1 h-3 w-3" />
          {t("listings.filters.clearAll")}
        </Button>
      )}
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
        {t("listings.filters.utilitiesIncluded")}
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

function FloorFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        placeholder={t("listings.filters.min")}
        value={filters.floorMin ?? ""}
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
        placeholder={t("listings.filters.max")}
        value={filters.floorMax ?? ""}
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
  );
}

function VerifiedOnlyFilter({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="verified-toggle" className="text-sm font-normal cursor-pointer">
        {t("listings.filters.verifiedOnly")}
      </Label>
      <Switch
        id="verified-toggle"
        checked={filters.isVerified ?? false}
        onCheckedChange={(checked) =>
          onFiltersChange({
            ...filters,
            isVerified: checked || undefined,
          })
        }
      />
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
        {t("listings.filters.withPhotos")}
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

export function ListingFiltersDesktop({
  filters,
  onFiltersChange,
  districts,
  citySlug,
  listingType,
}: ListingFiltersProps) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-border/50 bg-card/50 backdrop-blur-sm p-5 lg:block">
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

      <div className="mt-4">
        <Label className="text-sm font-medium">{t('listings.filters.type')}</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {LISTING_TYPES.map((typeOption) => {
            const isActive = listingType === typeOption;
            return (
              <Button
                key={typeOption}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs transition-all ${
                  isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
                }`}
                onClick={() => {
                  if (typeOption !== listingType && citySlug) {
                    router.push(`/${citySlug}/${typeOption}`);
                  }
                }}
              >
                {t(`listings.types.${typeOption}`)}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <PetsAllowedFilter filters={filters} onFiltersChange={onFiltersChange} />
        <VerifiedOnlyFilter filters={filters} onFiltersChange={onFiltersChange} />
        <WithPhotosFilter filters={filters} onFiltersChange={onFiltersChange} />
      </div>

      <Accordion
        type="multiple"
        defaultValue={["price", "bedrooms", "availability", "roommate", "sublet", "districts"]}
        className="mt-4"
      >
        <AccordionItem value="price" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.priceRange')}</AccordionTrigger>
          <AccordionContent>
            <PriceRangeSlider filters={filters} onFiltersChange={onFiltersChange} listingType={listingType} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bedrooms" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.bedrooms')}</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((num) => (
                <Button
                  key={num}
                  variant={filters.bedrooms?.includes(num) ? "default" : "outline"}
                  size="sm"
                  className={`h-9 w-14 transition-all ${
                    filters.bedrooms?.includes(num)
                      ? "shadow-sm shadow-primary/20"
                      : "hover:border-primary/40"
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
                  {num}+
                </Button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="area" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.area')}</AccordionTrigger>
          <AccordionContent>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder={t('listings.filters.min')}
                value={filters.areaMin || ""}
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
                value={filters.areaMax || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    areaMax: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-9 bg-background/50"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="availability" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.availableFrom')}</AccordionTrigger>
          <AccordionContent>
            <DatePickerFilter filters={filters} onFiltersChange={onFiltersChange} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="furnished" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.furnished')}</AccordionTrigger>
          <AccordionContent>
            <FurnishedFilter filters={filters} onFiltersChange={onFiltersChange} />
          </AccordionContent>
        </AccordionItem>

        {listingType === "roommate" && (
          <AccordionItem value="roommate" className="border-border/50">
            <AccordionTrigger className="text-sm font-medium">{t('listings.filters.roomType')}</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <RoomTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
                <div>
                  <span className="text-xs text-muted-foreground mb-1.5 block">
                    {t("listings.filters.genderPreference")}
                  </span>
                  <PreferredGenderFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {listingType === "sublet" && (
          <AccordionItem value="sublet" className="border-border/50">
            <AccordionTrigger className="text-sm font-medium">{t('listings.filters.availableTo')}</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <AvailableToFilter filters={filters} onFiltersChange={onFiltersChange} />
                <UtilitiesIncludedFilter filters={filters} onFiltersChange={onFiltersChange} />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="floor" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.floor')}</AccordionTrigger>
          <AccordionContent>
            <FloorFilter filters={filters} onFiltersChange={onFiltersChange} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="districts" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.districts')}</AccordionTrigger>
          <AccordionContent>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {districts?.map((district) => (
                <div key={district} className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50">
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
  citySlug,
  listingType,
}: ListingFiltersProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const activeCount = Object.values(filters).filter(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 lg:hidden hover:border-primary/40">
          <SlidersHorizontal className="h-4 w-4" />
          {t('listings.filters.title')}
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('listings.filters.title')}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div>
            <Label className="text-sm font-medium">{t('listings.filters.type')}</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LISTING_TYPES.map((typeOption) => {
                const isActive = listingType === typeOption;
                return (
                  <Button
                    key={typeOption}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className={`h-8 text-xs transition-all ${
                      isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
                    }`}
                    onClick={() => {
                      if (typeOption !== listingType && citySlug) {
                        setOpen(false);
                        router.push(`/${citySlug}/${typeOption}`);
                      }
                    }}
                  >
                    {t(`listings.types.${typeOption}`)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <PetsAllowedFilter filters={filters} onFiltersChange={onFiltersChange} />
            <VerifiedOnlyFilter filters={filters} onFiltersChange={onFiltersChange} />
            <WithPhotosFilter filters={filters} onFiltersChange={onFiltersChange} />
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.priceRange')}</Label>
            <div className="mt-2">
              <PriceRangeSlider filters={filters} onFiltersChange={onFiltersChange} listingType={listingType} />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.bedrooms')}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((num) => (
                <Button
                  key={num}
                  variant={filters.bedrooms?.includes(num) ? "default" : "outline"}
                  size="sm"
                  className={`transition-all ${
                    filters.bedrooms?.includes(num) ? "shadow-sm shadow-primary/20" : ""
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
                  {num}+ BR
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.area')}</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                placeholder={t('listings.filters.min')}
                value={filters.areaMin || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    areaMin: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="bg-background/50"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="number"
                placeholder={t('listings.filters.max')}
                value={filters.areaMax || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    areaMax: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="bg-background/50"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.availableFrom')}</Label>
            <div className="mt-2">
              <DatePickerFilter filters={filters} onFiltersChange={onFiltersChange} />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.furnished')}</Label>
            <div className="mt-2">
              <FurnishedFilter filters={filters} onFiltersChange={onFiltersChange} />
            </div>
          </div>

          {listingType === "roommate" && (
            <>
              <div>
                <Label className="text-sm font-medium">{t('listings.filters.roomType')}</Label>
                <div className="mt-2">
                  <RoomTypeFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">{t('listings.filters.genderPreference')}</Label>
                <div className="mt-2">
                  <PreferredGenderFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
            </>
          )}

          {listingType === "sublet" && (
            <>
              <div>
                <Label className="text-sm font-medium">{t('listings.filters.availableTo')}</Label>
                <div className="mt-2">
                  <AvailableToFilter filters={filters} onFiltersChange={onFiltersChange} />
                </div>
              </div>
              <div>
                <UtilitiesIncludedFilter filters={filters} onFiltersChange={onFiltersChange} />
              </div>
            </>
          )}

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.floor')}</Label>
            <div className="mt-2">
              <FloorFilter filters={filters} onFiltersChange={onFiltersChange} />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.districts')}</Label>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {districts?.map((district) => (
                <div key={district} className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50">
                  <Checkbox
                    id={`mobile-district-${district}`}
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
                    htmlFor={`mobile-district-${district}`}
                    className="flex-1 cursor-pointer text-sm font-normal"
                  >
                    {district}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onFiltersChange({})}
          >
            {t('listings.filters.clearAll')}
          </Button>
          <Button className="flex-1" onClick={() => setOpen(false)}>
            {t('listings.filters.showResults')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ActiveFilters({
  filters,
  onFiltersChange,
}: ListingFiltersProps) {
  const t = useTranslations();
  const hasFilters = Object.values(filters).some(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  );

  if (!hasFilters) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
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
              onClick={() => onFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined })}
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
              {num}+ BR
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
              onClick={() => onFiltersChange({ ...filters, areaMin: undefined, areaMax: undefined })}
            >
              {t("listings.filters.area")}:{" "}
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
              {t("listings.filters.availableFrom")}: {filters.availableFrom}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.furnished !== undefined && (
          <motion.div
            key="furnished"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, furnished: undefined })}
            >
              {filters.furnished
                ? t("listings.filters.furnishedYes")
                : t("listings.filters.furnishedNo")}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.petsAllowed && (
          <motion.div
            key="pets"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, petsAllowed: undefined })}
            >
              {t("listings.filters.petsAllowed")}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
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
              {filters.roomType === "private"
                ? t("listings.filters.roomTypePrivate")
                : t("listings.filters.roomTypeShared")}
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
              {t("listings.filters.genderPreference")}: {t(`listings.filters.gender${filters.preferredGender.charAt(0).toUpperCase() + filters.preferredGender.slice(1)}` as Parameters<typeof t>[0])}
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
              {t("listings.filters.availableTo")}: {filters.availableTo}
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
              {t("listings.filters.utilitiesIncluded")}
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
              onClick={() => onFiltersChange({ ...filters, floorMin: undefined, floorMax: undefined })}
            >
              {t("listings.filters.floor")}:{" "}
              {filters.floorMin != null && filters.floorMax != null
                ? `${filters.floorMin}–${filters.floorMax}`
                : filters.floorMin != null
                  ? `${filters.floorMin}+`
                  : `≤${filters.floorMax}`}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
        {filters.isVerified && (
          <motion.div
            key="verified"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, isVerified: undefined })}
            >
              {t("listings.filters.verifiedOnly")}
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
              {t("listings.filters.withPhotos")}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
