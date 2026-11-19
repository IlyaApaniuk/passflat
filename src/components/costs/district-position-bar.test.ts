import { describe, expect, it } from 'vitest';

import { DistrictPositionBar } from './district-position-bar';

const band = { label: 'Rent', median: 3000, p25: 2800, p75: 3300, unit: 'PLN' };

/** The rendered element tree as text: class names, styles and the visible strings. */
function rendered(value: number): string {
  return JSON.stringify(DistrictPositionBar({ ...band, value }));
}

/** The visible strings only (no class names or inline styles). */
function visibleText(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(visibleText);
  if (node && typeof node === 'object' && 'props' in node) {
    return visibleText((node as { props: { children?: unknown } }).props.children);
  }
  return [];
}

describe('DistrictPositionBar (FR-29)', () => {
  it.each([
    ['below the band', 2000],
    ['inside the band', 3000],
    ['above the band', 4500],
  ])('draws no cheaper / pricier verdict %s', (_, value) => {
    // No zone tint or coloured marker.
    expect(rendered(value)).not.toMatch(/green|red-|amber|emerald|rose/);
    // No percentage badge and no copy beyond the label, the numbers and the unit.
    const text = visibleText(DistrictPositionBar({ ...band, value })).join(' ');
    expect(text).not.toMatch(/%|lower|higher|within|cheap|pric/i);
  });

  it('keeps the value, the band ends and the median as plain numbers', () => {
    const text = visibleText(DistrictPositionBar({ ...band, value: 4500 }));
    for (const part of ['Rent', '4,500', '2,800', '3,000', '3,300', 'PLN']) {
      expect(text).toContain(part);
    }
  });

  it('marks the building the same way wherever it sits', () => {
    const marker = (value: number) =>
      rendered(value).match(/rounded-full border-2 border-background [\w-]+/)?.[0];
    expect(marker(2000)).toBe(marker(4500));
    expect(marker(3000)).toBe(marker(4500));
  });
});
