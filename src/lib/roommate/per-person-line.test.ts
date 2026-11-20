import { describe, expect, it } from 'vitest';

import { perPersonAmount, perPersonLineValues, perPersonSplitArea } from './per-person-line';
import type { PerPersonSplit } from './room-costs';

// Spec 08 §Per-person line (PRD 4 FR-13): the website words the bot's split; the golden cases of
// PRD 4 §5 run through the real loader in `per-person-consistency.test.ts`.

const WARSAW: PerPersonSplit = { value: 2_450, n: 5, level: 'city', name: 'city.warsaw' };
const MOKOTOW: PerPersonSplit = { value: 2_450, n: 5, level: 'district', name: 'Mokotów' };

const translate = (key: string) => (key === 'city.warsaw' ? 'Warsaw' : `missing ${key}`);

describe('perPersonLineValues', () => {
  it('the value, its N as the count, and the area the server resolved', () => {
    expect(perPersonLineValues(WARSAW, 'Warsaw')).toEqual({
      value: 2_450,
      count: 5,
      area: 'Warsaw',
    });
  });

  it('no split, a null split, or no area name → null (no line)', () => {
    expect(perPersonLineValues(null, 'Warsaw')).toBeNull();
    expect(perPersonLineValues(undefined, 'Warsaw')).toBeNull();
    expect(perPersonLineValues(WARSAW, undefined)).toBeNull();
    expect(perPersonLineValues(WARSAW, '')).toBeNull();
  });
});

describe('perPersonSplitArea', () => {
  it("the city's nameKey goes through the translator", () => {
    expect(perPersonSplitArea(WARSAW, translate)).toBe('Warsaw');
  });

  it("a district's nameKey is its display name as is (a district page can show a Warsaw split)", () => {
    expect(perPersonSplitArea(MOKOTOW, translate)).toBe('Mokotów');
  });
});

describe('perPersonAmount', () => {
  it.each([
    ['en', /^2,450 zł$/],
    ['pl', /^2450 zł$/],
    ['ru', /^2\s450 zł$/],
    ['uk', /^2\s450 zł$/],
  ])('%s: the locale grouping and "zł"', (locale, expected) => {
    expect(perPersonAmount(2_450, locale)).toMatch(expected);
  });

  it('never a percentage or a sign', () => {
    expect(perPersonAmount(12_340, 'en')).toBe('12,340 zł');
    expect(perPersonAmount(12_340, 'en')).not.toMatch(/[%+-]/);
  });
});
