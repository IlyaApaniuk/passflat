/**
 * Public "how much does renting really cost" calculator — a NORM-based estimate,
 * deliberately separate from the crowdsourced tenant reports.
 *
 * Two honest sources are combined and never conflated:
 *   - RENT comes from the real per-m² median of tenant reports for the district
 *     (or the city, as a fallback). See `estimateRent`.
 *   - KOMUNALKA (utilities) is an estimate built from public Warsaw tariffs/norms,
 *     presented as a ballpark "по нормам", not as "от жильцов". See `estimateKomunalka`.
 *
 * Anti-double-count design: in Poland the building `czynsz administracyjny` ALREADY
 * bundles cold water + heating + garbage + maintenance as advances. So the komunalka
 * total is `czynsz (bundle) + electricity (own meter) + internet [+ gas]` — the
 * water/heating/garbage figures are shown only as the *breakdown of czynsz*, never
 * added again on top. Where a district has reliable real data, the czynsz bundle is
 * anchored to the actual median czynsz/m² instead of the norm.
 *
 * All amounts are PLN per month. Functions are pure and unit-tested.
 */

/**
 * Warsaw tariffs / consumption norms, 2025–2026. Each value is a [low, high] band
 * so the calculator outputs a range (an estimate, not a precise bill). Sources are
 * cited inline; refresh when MPWiK / energy / garbage tariffs change.
 */
export const WARSAW_NORMS = {
  /** Maintenance, admin, cleaning, repair fund — the non-utility part of czynsz. */
  maintenancePerM2: [6, 9] as const,
  /** District heating (ciepło systemowe) ~8–11 zł/m² in season, averaged over the
   *  year (≈7-month season). Source: pomoc-ogrzewanie.pl 2025. */
  heatingPerM2: [3, 4.5] as const,
  /** Water + sewage 5.90 + 9.00 = 14.90 zł/m³. Source: MPWiK tariff Jul 2025–Jul 2026. */
  waterPricePerM3: 14.9,
  /** Cold+hot water use per person/month. */
  waterM3PerPerson: [2.5, 3.5] as const,
  /** Garbage 12.73 zł per m³ of water used. Source: UM Warszawa (until Mar 2026). */
  garbagePricePerM3: 12.73,
  /** Monthly garbage cap per household, multi-family dwellings. Source: UM Warszawa. */
  garbageCapPerHousehold: 60,
  /** Electricity all-in (energy + distribution), tariff G11. Source: rachuneo 2025. */
  electricityPricePerKwh: [1.05, 1.2] as const,
  /** Apartment electricity use: a base load + per person, no electric heating. */
  electricityBaseKwh: 60,
  electricityPerPersonKwh: 55,
  /** Home internet, flat monthly (basic plan up to faster fibre). */
  internetFlat: [50, 120] as const,
  /** Gas (cooking/water), only when the flat has a gas connection. */
  gasFlat: [30, 80] as const,
  /** ± band applied around a point estimate that has no natural low/high of its own
   *  (real-data anchors: district czynsz/m² and rent/m²). */
  dataBandPct: 0.12,
} as const;

export type Range = { low: number; high: number };

const round = (n: number) => Math.round(n);
const band = (point: number, pct: number): Range => ({
  low: round(point * (1 - pct)),
  high: round(point * (1 + pct)),
});
const addRange = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high });

export type CostLineKey =
  | 'czynsz'
  | 'electricity'
  | 'internet'
  | 'gas'
  | 'maintenance'
  | 'heating'
  | 'water'
  | 'garbage';

export interface CostLine extends Range {
  key: CostLineKey;
}

export interface KomunalkaInput {
  areaM2: number;
  occupants: number;
  hasGas: boolean;
  /** Real district median czynsz/komunalka lump per m² (PLN). When present and the
   *  district sample is reliable, it anchors the czynsz bundle instead of norms. */
  realCzynszPerM2?: number | null;
}

export interface KomunalkaEstimate extends Range {
  /** Bundle lines that SUM to the komunalka total (czynsz + electricity + internet [+ gas]). */
  lines: CostLine[];
  /** Educational decomposition of the czynsz bundle (water/heating/garbage/maintenance).
   *  These are what *makes up* czynsz — NOT added on top of it. */
  czynszBreakdown: CostLine[];
  /** Whether the czynsz line is anchored to real district data or to norms. */
  czynszBasis: 'data' | 'norm';
}

/** Norm-based breakdown of the czynsz bundle for the given flat. */
function czynszComponents(areaM2: number, occupants: number): CostLine[] {
  const {
    maintenancePerM2,
    heatingPerM2,
    waterM3PerPerson,
    waterPricePerM3,
    garbagePricePerM3,
    garbageCapPerHousehold,
  } = WARSAW_NORMS;

  const maintenance: CostLine = {
    key: 'maintenance',
    low: round(areaM2 * maintenancePerM2[0]),
    high: round(areaM2 * maintenancePerM2[1]),
  };
  const heating: CostLine = {
    key: 'heating',
    low: round(areaM2 * heatingPerM2[0]),
    high: round(areaM2 * heatingPerM2[1]),
  };
  const water: CostLine = {
    key: 'water',
    low: round(occupants * waterM3PerPerson[0] * waterPricePerM3),
    high: round(occupants * waterM3PerPerson[1] * waterPricePerM3),
  };
  const garbage: CostLine = {
    key: 'garbage',
    low: Math.min(
      round(occupants * waterM3PerPerson[0] * garbagePricePerM3),
      garbageCapPerHousehold,
    ),
    high: Math.min(
      round(occupants * waterM3PerPerson[1] * garbagePricePerM3),
      garbageCapPerHousehold,
    ),
  };
  return [maintenance, heating, water, garbage];
}

/**
 * Estimate monthly komunalka (utilities) for a flat from Warsaw norms, optionally
 * anchoring the czynsz bundle to real district data. Electricity, internet and gas
 * are billed separately (own meters/contracts), so they are added to the czynsz
 * bundle without double counting.
 */
export function estimateKomunalka(input: KomunalkaInput): KomunalkaEstimate {
  const area = Math.max(0, input.areaM2 || 0);
  const occupants = Math.max(1, Math.round(input.occupants || 1));
  const {
    electricityPricePerKwh,
    electricityBaseKwh,
    electricityPerPersonKwh,
    internetFlat,
    gasFlat,
    dataBandPct,
  } = WARSAW_NORMS;

  const breakdown = czynszComponents(area, occupants);
  const normCzynsz: Range = breakdown.reduce((acc, l) => addRange(acc, l), { low: 0, high: 0 });

  // Anchor czynsz to real district data when available; else use the norm sum.
  const useData = input.realCzynszPerM2 != null && input.realCzynszPerM2 > 0 && area > 0;
  const czynszRange = useData
    ? band(area * (input.realCzynszPerM2 as number), dataBandPct)
    : normCzynsz;
  const czynsz: CostLine = { key: 'czynsz', low: czynszRange.low, high: czynszRange.high };

  // Electricity: a consumption band × a tariff band.
  const nominalKwh = electricityBaseKwh + occupants * electricityPerPersonKwh;
  const electricity: CostLine = {
    key: 'electricity',
    low: round(nominalKwh * 0.85 * electricityPricePerKwh[0]),
    high: round(nominalKwh * 1.15 * electricityPricePerKwh[1]),
  };

  const internet: CostLine = { key: 'internet', low: internetFlat[0], high: internetFlat[1] };

  const lines: CostLine[] = [czynsz, electricity, internet];
  if (input.hasGas) lines.push({ key: 'gas', low: gasFlat[0], high: gasFlat[1] });

  const total = lines.reduce((acc, l) => addRange(acc, l), { low: 0, high: 0 });

  return {
    lines,
    czynszBreakdown: breakdown,
    czynszBasis: useData ? 'data' : 'norm',
    low: total.low,
    high: total.high,
  };
}

export interface RentInput {
  areaM2: number;
  /** Real district median rent per m² (PLN); 0/null when the district has no data. */
  districtRentPerM2?: number | null;
  /** City-wide median rent per m² used when the district has no usable data. */
  cityRentPerM2?: number | null;
}

export interface RentEstimate extends Range {
  basis: 'district' | 'city' | 'none';
  /** The per-m² rent the estimate was built from (0 when basis is 'none'). */
  perM2: number;
}

/** Estimate monthly rent from the real per-m² median (district first, then city). */
export function estimateRent(input: RentInput): RentEstimate {
  const area = Math.max(0, input.areaM2 || 0);
  const district = input.districtRentPerM2 ?? 0;
  const city = input.cityRentPerM2 ?? 0;

  const perM2 = district > 0 ? district : city > 0 ? city : 0;
  const basis: RentEstimate['basis'] = district > 0 ? 'district' : city > 0 ? 'city' : 'none';
  if (perM2 === 0 || area === 0) return { low: 0, high: 0, basis, perM2: 0 };

  return { ...band(area * perM2, WARSAW_NORMS.dataBandPct), basis, perM2 };
}

export interface TotalEstimate extends Range {
  rent: RentEstimate;
  komunalka: KomunalkaEstimate;
}

/** Combine rent (data) + komunalka (norms) into a single monthly range. */
export function estimateTotal(rentInput: RentInput, komunalkaInput: KomunalkaInput): TotalEstimate {
  const rent = estimateRent(rentInput);
  const komunalka = estimateKomunalka(komunalkaInput);
  return {
    rent,
    komunalka,
    low: rent.low + komunalka.low,
    high: rent.high + komunalka.high,
  };
}

/** A sensible default occupant count for a flat of the given area. */
export function defaultOccupants(areaM2: number): number {
  if (areaM2 <= 34) return 1;
  if (areaM2 <= 60) return 2;
  return 3;
}

/** Quick room → typical area (m²) presets for the area input chips. */
export const ROOM_AREA_PRESETS: { rooms: number; areaM2: number }[] = [
  { rooms: 1, areaM2: 30 },
  { rooms: 2, areaM2: 45 },
  { rooms: 3, areaM2: 62 },
  { rooms: 4, areaM2: 85 },
];
