import { describe, expect, it } from 'vitest';

import { waitlistCitySlug } from './store';
import { peopleWord } from './texts';

describe('waitlistCitySlug', () => {
  it('collapses spellings of one city into one waitlist key', () => {
    expect(waitlistCitySlug('Kraków')).toBe('krakow');
    expect(waitlistCitySlug('Краков')).toBe('krakow');
    expect(waitlistCitySlug('krakow')).toBe('krakow');
    expect(waitlistCitySlug('Zielona Góra')).toBe('zielona-gora');
    expect(waitlistCitySlug('Łódź')).toBe('lodz');
  });
});

describe('peopleWord', () => {
  it('agrees with the count', () => {
    expect(peopleWord('ru', 1)).toBe('человек');
    expect(peopleWord('ru', 3)).toBe('человека');
    expect(peopleWord('uk', 5)).toBe('людей');
  });
});
