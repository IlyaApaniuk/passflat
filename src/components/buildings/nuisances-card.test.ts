import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { formatDistanceM, NuisancesCard, nuisanceItems } from './nuisances-card';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const en = JSON.parse(
  readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'),
) as Record<string, unknown>;
const t = createTranslator({
  locale: 'en',
  messages: en as never,
  namespace: 'checker.nuisances' as never,
}) as unknown as Translate;

describe('formatDistanceM', () => {
  it('uses metres below a kilometre and one decimal of kilometres above', () => {
    expect(formatDistanceM('en', 420)).toBe('420 m');
    expect(formatDistanceM('en', 1234)).toBe('1.2 km');
    expect(formatDistanceM('pl', 1234)).toBe('1,2 km');
  });
});

describe('nuisanceItems', () => {
  it('renders the nearest one with its name and the counted ones with their number', () => {
    const items = nuisanceItems(
      [
        { key: 'fireStation', nearestM: 320, name: 'JRG 1', count: 1, report: 'nearest' },
        { key: 'bars', nearestM: 120, name: null, count: 6, report: 'count' },
      ],
      t,
      (distanceM) => formatDistanceM('en', distanceM),
    );
    expect(items).toEqual([
      {
        key: 'fireStation',
        label: 'Fire station',
        detail: 'JRG 1 · 320 m · sirens at night are likely',
      },
      {
        key: 'bars',
        label: 'Bars and pubs',
        detail: '6 venues nearby, closest 120 m · noisy in the evenings',
      },
    ]);
  });

  it('renders no card without nuisances', () => {
    expect(NuisancesCard({ title: 'T', subtitle: 'S', items: [] })).toBeNull();
  });
});
