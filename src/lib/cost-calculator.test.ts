import { describe, expect, it } from 'vitest';

import {
  WARSAW_NORMS,
  defaultOccupants,
  estimateKomunalka,
  estimateRent,
  estimateTotal,
} from './cost-calculator';

describe('estimateKomunalka', () => {
  const base = { areaM2: 50, occupants: 2, hasGas: false };

  it('outputs a non-degenerate range (high > low)', () => {
    const k = estimateKomunalka(base);
    expect(k.high).toBeGreaterThan(k.low);
    expect(k.low).toBeGreaterThan(0);
  });

  it('bundle lines (czynsz + electricity + internet) sum exactly to the total', () => {
    const k = estimateKomunalka(base);
    const low = k.lines.reduce((s, l) => s + l.low, 0);
    const high = k.lines.reduce((s, l) => s + l.high, 0);
    expect(low).toBe(k.low);
    expect(high).toBe(k.high);
  });

  it('uses norms by default and exposes the czynsz breakdown', () => {
    const k = estimateKomunalka(base);
    expect(k.czynszBasis).toBe('norm');
    expect(k.czynszBreakdown.map((l) => l.key)).toEqual([
      'maintenance',
      'heating',
      'water',
      'garbage',
    ]);
  });

  it('norm czynsz equals the sum of its breakdown components (no double count)', () => {
    const k = estimateKomunalka(base);
    const czynsz = k.lines.find((l) => l.key === 'czynsz')!;
    const sumLow = k.czynszBreakdown.reduce((s, l) => s + l.low, 0);
    const sumHigh = k.czynszBreakdown.reduce((s, l) => s + l.high, 0);
    expect(czynsz.low).toBe(sumLow);
    expect(czynsz.high).toBe(sumHigh);
  });

  it('anchors czynsz to real data when a reliable per-m² figure is given', () => {
    const k = estimateKomunalka({ ...base, realCzynszPerM2: 15 });
    expect(k.czynszBasis).toBe('data');
    const czynsz = k.lines.find((l) => l.key === 'czynsz')!;
    // 50 m² × 15 = 750, ±12% band
    expect(czynsz.low).toBe(Math.round(750 * (1 - WARSAW_NORMS.dataBandPct)));
    expect(czynsz.high).toBe(Math.round(750 * (1 + WARSAW_NORMS.dataBandPct)));
    // breakdown is still the norm composition (educational)
    expect(k.czynszBreakdown).toHaveLength(4);
  });

  it('ignores a zero/empty real czynsz and falls back to norms', () => {
    expect(estimateKomunalka({ ...base, realCzynszPerM2: 0 }).czynszBasis).toBe('norm');
    expect(estimateKomunalka({ ...base, realCzynszPerM2: null }).czynszBasis).toBe('norm');
  });

  it('adds a gas line only when the flat has gas', () => {
    expect(estimateKomunalka(base).lines.some((l) => l.key === 'gas')).toBe(false);
    const withGas = estimateKomunalka({ ...base, hasGas: true });
    expect(withGas.lines.some((l) => l.key === 'gas')).toBe(true);
    expect(withGas.high).toBeGreaterThan(estimateKomunalka(base).high);
  });

  it('caps the garbage line at the per-household maximum', () => {
    const k = estimateKomunalka({ ...base, occupants: 6 });
    const garbage = k.czynszBreakdown.find((l) => l.key === 'garbage')!;
    expect(garbage.high).toBeLessThanOrEqual(WARSAW_NORMS.garbageCapPerHousehold);
  });

  it('scales czynsz with area and electricity/water with occupants', () => {
    const small = estimateKomunalka({ ...base, areaM2: 30 });
    const large = estimateKomunalka({ ...base, areaM2: 80 });
    const czynszOf = (k: ReturnType<typeof estimateKomunalka>) =>
      k.lines.find((l) => l.key === 'czynsz')!.high;
    expect(czynszOf(large)).toBeGreaterThan(czynszOf(small));

    const solo = estimateKomunalka({ ...base, occupants: 1 });
    const elecOf = (k: ReturnType<typeof estimateKomunalka>) =>
      k.lines.find((l) => l.key === 'electricity')!.high;
    expect(elecOf(estimateKomunalka(base))).toBeGreaterThan(elecOf(solo));
  });
});

describe('estimateRent', () => {
  it('prefers district data, then city, then none', () => {
    expect(estimateRent({ areaM2: 50, districtRentPerM2: 80, cityRentPerM2: 70 }).basis).toBe(
      'district',
    );
    expect(estimateRent({ areaM2: 50, districtRentPerM2: 0, cityRentPerM2: 70 }).basis).toBe(
      'city',
    );
    expect(estimateRent({ areaM2: 50, districtRentPerM2: 0, cityRentPerM2: 0 }).basis).toBe('none');
  });

  it('builds a band around perM2 × area', () => {
    const r = estimateRent({ areaM2: 50, districtRentPerM2: 80 });
    expect(r.perM2).toBe(80);
    expect(r.low).toBe(Math.round(4000 * (1 - WARSAW_NORMS.dataBandPct)));
    expect(r.high).toBe(Math.round(4000 * (1 + WARSAW_NORMS.dataBandPct)));
  });

  it('returns a zero range when there is no per-m² data', () => {
    const r = estimateRent({ areaM2: 50 });
    expect(r).toMatchObject({ low: 0, high: 0, basis: 'none', perM2: 0 });
  });
});

describe('estimateTotal', () => {
  it('sums rent and komunalka ranges', () => {
    const t = estimateTotal(
      { areaM2: 50, districtRentPerM2: 80 },
      { areaM2: 50, occupants: 2, hasGas: false },
    );
    expect(t.low).toBe(t.rent.low + t.komunalka.low);
    expect(t.high).toBe(t.rent.high + t.komunalka.high);
    expect(t.high).toBeGreaterThan(t.low);
  });
});

describe('defaultOccupants', () => {
  it('grows with area', () => {
    expect(defaultOccupants(28)).toBe(1);
    expect(defaultOccupants(50)).toBe(2);
    expect(defaultOccupants(90)).toBe(3);
  });
});
