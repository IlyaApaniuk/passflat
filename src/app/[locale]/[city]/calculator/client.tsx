'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ShareButton } from '@/components/costs/share-button';
import { ArrowRight, Calculator, Info, Plus } from 'lucide-react';
import {
  defaultOccupants,
  estimateTotal,
  ROOM_AREA_PRESETS,
  type CostLine,
} from '@/lib/cost-calculator';

export interface DistrictCalcData {
  slug: string;
  name: string;
  /** Real district median rent per m² (0 when none). */
  rentPerM2: number;
  /** Real district median czynsz/komunalka lump per m² (0 when none). */
  czynszPerM2: number;
  reportCount: number;
  /** Whether the district sample is dense enough to anchor czynsz to real data. */
  reliable: boolean;
}

interface Props {
  citySlug: string;
  cityName: string;
  districts: DistrictCalcData[];
  cityRentPerM2: number;
  initialDistrict: string | null;
}

const CITY_VALUE = '__city';
const OCCUPANT_OPTIONS = [1, 2, 3, 4];

// Deterministic thousands grouping (plain space) — identical on server and client,
// so the number never causes a hydration mismatch (unlike locale-dependent
// toLocaleString()).
const fmt = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fmtRange = (low: number, high: number) =>
  low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`;

/** One cell of a segmented (equal-width) chip group. */
function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className="flex-1"
    >
      {children}
    </Button>
  );
}

export function CalculatorClient({
  citySlug,
  cityName,
  districts,
  cityRentPerM2,
  initialDistrict,
}: Props) {
  const t = useTranslations();
  const posthog = usePostHog();

  const [districtValue, setDistrictValue] = useState<string>(initialDistrict ?? CITY_VALUE);
  const [area, setArea] = useState<number>(45);
  const [occupants, setOccupants] = useState<number>(defaultOccupants(45));
  const [hasGas, setHasGas] = useState<boolean>(false);

  useEffect(() => {
    posthog?.capture('calculator_viewed', { city: citySlug });
  }, [posthog, citySlug]);

  const selected = districts.find((d) => d.slug === districtValue) ?? null;

  const estimate = useMemo(
    () =>
      estimateTotal(
        {
          areaM2: area,
          districtRentPerM2: selected?.rentPerM2 ?? 0,
          cityRentPerM2,
        },
        {
          areaM2: area,
          occupants,
          hasGas,
          realCzynszPerM2: selected?.reliable ? selected.czynszPerM2 : 0,
        },
      ),
    [area, occupants, hasGas, selected, cityRentPerM2],
  );

  const { rent, komunalka } = estimate;
  const lineOf = (key: CostLine['key']) => komunalka.lines.find((l) => l.key === key);
  const czynsz = lineOf('czynsz');
  const electricity = lineOf('electricity');
  const internet = lineOf('internet');
  const gas = lineOf('gas');

  const onDistrictChange = (value: string) => {
    setDistrictValue(value);
    const d = districts.find((x) => x.slug === value) ?? null;
    posthog?.capture('calculator_estimated', {
      city: citySlug,
      district: value === CITY_VALUE ? null : value,
      rent_basis: d && d.rentPerM2 > 0 ? 'district' : cityRentPerM2 > 0 ? 'city' : 'none',
      czynsz_basis: d?.reliable ? 'data' : 'norm',
    });
  };

  const setRooms = (areaM2: number) => {
    setArea(areaM2);
    setOccupants(defaultOccupants(areaM2));
  };

  const ctaClick = (cta: string) =>
    posthog?.capture('calculator_cta_clicked', { city: citySlug, cta });

  // Where "see real data" should point: the district page when it has data, else the hub.
  const dataHref =
    selected && selected.reportCount > 0 ? `/${citySlug}/${selected.slug}` : `/${citySlug}/costs`;

  // "All districts" is an explicit city-wide choice, so a city-median rent reads
  // as expected there — only a *specific* district falling back to the city median
  // warrants the "little data in this district" caveat.
  const isCityWide = districtValue === CITY_VALUE;
  const rentBasisLabel =
    rent.basis === 'district'
      ? t('calculator.result.basisData', { count: selected?.reportCount ?? 0 })
      : rent.basis === 'city'
        ? t(isCityWide ? 'calculator.result.basisCityWide' : 'calculator.result.basisCityFallback')
        : t('calculator.result.basisNone');

  const breakdownRow = (line: CostLine | undefined, label: string, sub?: string) =>
    line ? (
      <div className="flex items-baseline justify-between gap-3 py-1.5">
        <div className="min-w-0">
          <span className="text-sm">{label}</span>
          {sub && <span className="ml-1 text-xs text-muted-foreground">{sub}</span>}
        </div>
        <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
          {fmtRange(line.low, line.high)}
        </span>
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2 text-primary">
        <Calculator className="h-5 w-5" />
        <span className="text-sm font-medium">{t('calculator.badge')}</span>
      </div>
      <h1 className="mt-2 text-3xl font-bold md:text-4xl">
        {t('calculator.h1', { city: cityName })}
      </h1>
      <p className="mt-3 text-muted-foreground">{t('calculator.intro')}</p>

      {/* ---- Controls ---- */}
      <Card className="mt-6">
        <CardContent className="space-y-5 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="calc-district">{t('calculator.controls.district')}</Label>
            <Select value={districtValue} onValueChange={onDistrictChange}>
              <SelectTrigger id="calc-district" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CITY_VALUE}>{t('calculator.controls.allDistricts')}</SelectItem>
                {districts.map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Rooms — preset chips that drive the area */}
            <div className="space-y-1.5">
              <Label>{t('calculator.controls.roomsLabel')}</Label>
              <div className="flex gap-1.5">
                {ROOM_AREA_PRESETS.map((p) => (
                  <Seg key={p.rooms} active={area === p.areaM2} onClick={() => setRooms(p.areaM2)}>
                    {p.rooms === 4 ? '4+' : p.rooms}
                  </Seg>
                ))}
              </div>
            </div>

            {/* Area — exact, editable */}
            <div className="space-y-1.5">
              <Label htmlFor="calc-area">{t('calculator.controls.area')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="calc-area"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={300}
                  value={area}
                  onChange={(e) => setArea(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">
                  {t('calculator.controls.areaUnit')}
                </span>
              </div>
            </div>

            {/* Occupants */}
            <div className="space-y-1.5">
              <Label>{t('calculator.controls.occupants')}</Label>
              <div className="flex gap-1.5">
                {OCCUPANT_OPTIONS.map((n) => (
                  <Seg key={n} active={occupants === n} onClick={() => setOccupants(n)}>
                    {n === 4 ? '4+' : n}
                  </Seg>
                ))}
              </div>
            </div>

            {/* Gas */}
            <div className="space-y-1.5">
              <Label>{t('calculator.controls.gas')}</Label>
              <div className="flex gap-1.5">
                <Seg active={!hasGas} onClick={() => setHasGas(false)}>
                  {t('calculator.controls.gasOff')}
                </Seg>
                <Seg active={hasGas} onClick={() => setHasGas(true)}>
                  {t('calculator.controls.gasOn')}
                </Seg>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Result ---- */}
      <Card className="mt-6 border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground">{t('calculator.result.rangeLabel')}</p>
          <p className="mt-1 text-3xl font-bold text-primary md:text-4xl">
            ≈ {fmtRange(estimate.low, estimate.high)} zł
            <span className="ml-1 text-base font-normal text-muted-foreground">
              {t('calculator.result.perMonth')}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected ? selected.name : cityName} · {t('calculator.result.areaSummary', { area })}
          </p>

          <div className="mt-5 divide-y">
            {/* Rent (from real data) */}
            <div className="flex items-baseline justify-between gap-3 pb-2.5">
              <div className="min-w-0">
                <p className="font-medium">{t('calculator.result.rent')}</p>
                <Badge variant="outline" className="mt-1 font-normal">
                  {rentBasisLabel}
                </Badge>
              </div>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {rent.basis === 'none' ? '—' : `≈ ${fmtRange(rent.low, rent.high)}`}
              </span>
            </div>

            {/* Komunalka (from norms) */}
            <div className="pt-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{t('calculator.result.komunalka')}</p>
                  <Badge variant="outline" className="mt-1 font-normal">
                    {t('calculator.result.basisNorm')}
                  </Badge>
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums">
                  ≈ {fmtRange(komunalka.low, komunalka.high)}
                </span>
              </div>

              <div className="mt-2 rounded-md bg-background/60 px-3">
                {/* Czynsz bundle + its educational breakdown */}
                <div className="border-b py-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{t('calculator.result.czynsz')}</span>
                    {czynsz && (
                      <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                        {fmtRange(czynsz.low, czynsz.high)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {komunalka.czynszBasis === 'data'
                      ? t('calculator.result.czynszData')
                      : t('calculator.result.czynszSub')}
                  </p>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="czynsz" className="border-0">
                      <AccordionTrigger className="py-1.5 text-xs text-muted-foreground hover:no-underline">
                        {t('calculator.result.breakdownToggle')}
                      </AccordionTrigger>
                      <AccordionContent className="pb-2">
                        {breakdownRow(
                          komunalka.czynszBreakdown.find((l) => l.key === 'maintenance'),
                          t('calculator.result.maintenance'),
                        )}
                        {breakdownRow(
                          komunalka.czynszBreakdown.find((l) => l.key === 'heating'),
                          t('calculator.result.heating'),
                        )}
                        {breakdownRow(
                          komunalka.czynszBreakdown.find((l) => l.key === 'water'),
                          t('calculator.result.water'),
                        )}
                        {breakdownRow(
                          komunalka.czynszBreakdown.find((l) => l.key === 'garbage'),
                          t('calculator.result.garbage'),
                        )}
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {t('calculator.result.breakdownNote')}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
                {breakdownRow(electricity, t('calculator.result.electricity'))}
                {breakdownRow(internet, t('calculator.result.internet'))}
                {hasGas && breakdownRow(gas, t('calculator.result.gas'))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>{t('calculator.disclaimer')}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild onClick={() => ctaClick('see_data')}>
              <Link href={dataHref}>
                {t('calculator.ctaDistrict')}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild onClick={() => ctaClick('submit')}>
              <Link href={`/${citySlug}/costs/submit`}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('calculator.ctaSubmit')}
              </Link>
            </Button>
            <ShareButton
              path={
                selected
                  ? `/${citySlug}/calculator?district=${selected.slug}`
                  : `/${citySlug}/calculator`
              }
              source="calculator"
              size="default"
              label={t('calculator.shareLabel')}
            />
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t('calculator.sourcesNote')}
      </p>
    </div>
  );
}
