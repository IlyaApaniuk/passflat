"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
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
import { SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import type { ListingFilters, ListingType } from "@/lib/listings-data";

const LISTING_TYPES: (ListingType | "all")[] = ["all", "replacement", "roommate", "sublet"];

const PRICE_RANGES: Record<ListingType | "default", { min: number; max: number; step: number }> = {
  replacement: { min: 0, max: 10000, step: 100 },
  roommate: { min: 0, max: 5000, step: 100 },
  sublet: { min: 0, max: 15000, step: 100 },
  default: { min: 0, max: 10000, step: 100 },
};

function PriceRangeSlider({
  filters,
  onFiltersChange,
}: {
  filters: ListingFilters;
  onFiltersChange: (filters: ListingFilters) => void;
}) {
  const t = useTranslations();
  const range = PRICE_RANGES[filters.type ?? "default"];
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

  const label = filters.type
    ? t(`listings.filters.priceLabel_${filters.type}`)
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
}

export function ListingFiltersDesktop({
  filters,
  onFiltersChange,
  districts,
}: ListingFiltersProps) {
  const t = useTranslations();
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
            const isActive = typeOption === "all" ? !filters.type : filters.type === typeOption;
            return (
              <Button
                key={typeOption}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs transition-all ${
                  isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
                }`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    type: typeOption === "all" ? undefined : typeOption,
                  })
                }
              >
                {typeOption === "all"
                  ? t('listings.filters.allTypes')
                  : t(`listings.types.${typeOption}`)}
              </Button>
            );
          })}
        </div>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["price", "bedrooms", "districts"]}
        className="mt-4"
      >
        <AccordionItem value="price" className="border-border/50">
          <AccordionTrigger className="text-sm font-medium">{t('listings.filters.priceRange')}</AccordionTrigger>
          <AccordionContent>
            <PriceRangeSlider filters={filters} onFiltersChange={onFiltersChange} />
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
}: ListingFiltersProps) {
  const t = useTranslations();
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
                const isActive = typeOption === "all" ? !filters.type : filters.type === typeOption;
                return (
                  <Button
                    key={typeOption}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className={`h-8 text-xs transition-all ${
                      isActive ? "shadow-sm shadow-primary/20" : "hover:border-primary/40"
                    }`}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        type: typeOption === "all" ? undefined : typeOption,
                      })
                    }
                  >
                    {typeOption === "all"
                      ? t('listings.filters.allTypes')
                      : t(`listings.types.${typeOption}`)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">{t('listings.filters.priceRange')}</Label>
            <div className="mt-2">
              <PriceRangeSlider filters={filters} onFiltersChange={onFiltersChange} />
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
        {filters.type && (
          <motion.div
            key="type"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            layout
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onFiltersChange({ ...filters, type: undefined })}
            >
              {t(`listings.types.${filters.type}`)}
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
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
      </AnimatePresence>
    </motion.div>
  );
}
