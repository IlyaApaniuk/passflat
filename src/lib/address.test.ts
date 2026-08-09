import { describe, expect, it } from 'vitest';

import { formatAddressDisplay } from './address';

describe('formatAddressDisplay', () => {
  it('capitalises addresses the scraped import stored lower-cased', () => {
    expect(formatAddressDisplay('siedmiogrodzka 3')).toBe('Siedmiogrodzka 3');
    expect(formatAddressDisplay('aleja armii ludowej 12')).toBe('Aleja Armii Ludowej 12');
  });

  it('leaves an address that already carries its own casing untouched', () => {
    expect(formatAddressDisplay('al. Jana Pawła II 25')).toBe('al. Jana Pawła II 25');
    expect(formatAddressDisplay('Pańska 96')).toBe('Pańska 96');
  });

  it('keeps a building number whole', () => {
    expect(formatAddressDisplay('przy forcie 12a')).toBe('Przy Forcie 12a');
  });

  it('capitalises Polish diacritics', () => {
    expect(formatAddressDisplay('świętokrzyska 30')).toBe('Świętokrzyska 30');
    expect(formatAddressDisplay('żelazna 59')).toBe('Żelazna 59');
  });
});
