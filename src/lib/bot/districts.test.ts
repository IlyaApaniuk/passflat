import { describe, expect, it } from 'vitest';

import { matchDistrict } from './districts';
import { transliterateToPolish } from './geocode';

const DISTRICTS = [
  ['bemowo', 'Bemowo'],
  ['bialoleka', 'Białołęka'],
  ['bielany', 'Bielany'],
  ['mokotow', 'Mokotów'],
  ['ochota', 'Ochota'],
  ['praga-polnoc', 'Praga-Północ'],
  ['praga-poludnie', 'Praga-Południe'],
  ['rembertow', 'Rembertów'],
  ['srodmiescie', 'Śródmieście'],
  ['targowek', 'Targówek'],
  ['ursus', 'Ursus'],
  ['ursynow', 'Ursynów'],
  ['wawer', 'Wawer'],
  ['wesola', 'Wesoła'],
  ['wilanow', 'Wilanów'],
  ['wlochy', 'Włochy'],
  ['wola', 'Wola'],
  ['zoliborz', 'Żoliborz'],
].map(([slug, nameKey]) => ({ slug, nameKey }));

describe('transliterateToPolish', () => {
  it('spells Cyrillic street names the Polish way', () => {
    expect(transliterateToPolish('Груецкая 45')).toBe('Grujecka 45');
    expect(transliterateToPolish('Груєцька 45')).toBe('Grujecka 45');
    expect(transliterateToPolish('Пулавская 10')).toBe('Pulawska 10');
    expect(transliterateToPolish('Новый Свят 15')).toBe('Nowy Swiat 15');
    expect(transliterateToPolish('Красиньского 20')).toBe('Krasinskiego 20');
  });
});

describe('matchDistrict', () => {
  it.each([
    ['Wola', 'wola'],
    ['mokotow', 'mokotow'],
    ['Mokotów', 'mokotow'],
    ['Мокотов', 'mokotow'],
    ['Мокотув', 'mokotow'],
    ['Воля', 'wola'],
    ['район Воля', 'wola'],
    ['Жолибож', 'zoliborz'],
    ['Средместье', 'srodmiescie'],
    ['Прага Полудне', 'praga-poludnie'],
    ['Praga Północ', 'praga-polnoc'],
    ['Беляны', 'bielany'],
    ['Урсинов', 'ursynow'],
    ['Влохи', 'wlochy'],
    ['Білоленка', 'bialoleka'],
    ['Бялоленка', 'bialoleka'],
  ])('%s → %s', (query, slug) => {
    expect(matchDistrict(query, DISTRICTS)).toBe(slug);
  });

  it.each(['Wolska 12', 'Grójecka 45', 'Puławska', 'привет', 'ok', 'Marszałkowska'])(
    'leaves %s to the address lookup',
    (query) => {
      expect(matchDistrict(query, DISTRICTS)).toBeNull();
    },
  );
});
