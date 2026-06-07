import { describe, expect, it } from 'vitest';

import { resolveDistrictByPoint } from './district';

describe('resolveDistrictByPoint', () => {
  it('resolves a Bemowo point that Places mislabels as the Chrzanów neighbourhood', () => {
    // Szeligowska 53B — the address that previously got a null district.
    expect(resolveDistrictByPoint('warsaw', 52.2253165, 20.8917485)).toBe('bemowo');
  });

  it('resolves a central Śródmieście point', () => {
    expect(resolveDistrictByPoint('warsaw', 52.2297, 21.0122)).toBe('srodmiescie');
  });

  it('returns null for a point outside every district (Gdańsk)', () => {
    expect(resolveDistrictByPoint('warsaw', 54.352, 18.6466)).toBeNull();
  });

  it('returns null for an unknown city', () => {
    expect(resolveDistrictByPoint('krakow', 52.2297, 21.0122)).toBeNull();
  });
});
