import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { ABOUT_MAX_LENGTH, checkAboutText, type AboutTextFinding } from './text-filter';

const chr = (code: number) => String.fromCharCode(code);
const NBSP = chr(0xa0);
const IDEOGRAPHIC_SPACE = chr(0x3000);
const ZERO_WIDTH_SPACE = chr(0x200b);
const EN_DASH = chr(0x2013);
const COMBINING_OGONEK = chr(0x328);

// No input is ever logged: every test below fails if the filter writes to the console.
let consoleSpies: MockInstance[] = [];

beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('checkAboutText golden cases (spec 06 §Text filter)', () => {
  it.each(['Pracuję w IT, spokojna, nie palę', 'Мне 25, есть 2 кота'])('accepts %s', (text) => {
    expect(checkAboutText(text)).toEqual({ ok: true, value: text });
  });

  it.each<[string, AboutTextFinding]>([
    ['пиши @anna_w', 'handle'],
    ['zadzwoń 501 234 567', 'phone'],
    ['see https://x.pl', 'link'],
    ['PL61109010140000071219812874', 'iban'],
    ['anna@x.pl', 'email'],
  ])('refuses %s as %s', (text, found) => {
    expect(checkAboutText(text)).toEqual({ ok: false, found });
  });

  it('refuses 281 × a as too long and gives the length', () => {
    expect(checkAboutText('a'.repeat(281))).toEqual({ ok: false, found: 'too_long', length: 281 });
  });

  it('treats spaces only as a skip', () => {
    expect(checkAboutText('   ')).toEqual({ ok: true, value: null });
  });
});

describe('checkAboutText contact rules', () => {
  it.each<[string, string, AboutTextFinding]>([
    ['a phone with dashes', '501-234-567', 'phone'],
    ['a phone with dots', 'tel. 501.234.567', 'phone'],
    ['a phone with a plus and brackets', '+48 (22) 123 45 67', 'phone'],
    ['a phone with en dashes', `501${EN_DASH}234${EN_DASH}567`, 'phone'],
    [
      'a phone split by zero-width spaces',
      `501${ZERO_WIDTH_SPACE}234${ZERO_WIDTH_SPACE}567`,
      'phone',
    ],
    ['a phone with no-break spaces', `501${NBSP}234${NBSP}567`, 'phone'],
    ['seven digits', 'kod 501 23 45', 'phone'],
    ['fourteen digits in a row', '12345678901234', 'phone'],
    ['a t.me/ link', 'pisz t.me/anna_w', 'link'],
    ['a telegram.me/ link', 'telegram.me/anna_w', 'link'],
    ['a www. address', 'zobacz www.olx.pl', 'link'],
    ['an upper-case link', 'HTTP://X.PL', 'link'],
    ['an e-mail with dots and a plus', 'anna.w+flat@gmail.com', 'email'],
    ['a handle of three characters', 'tg @abc', 'handle'],
    ['a handle right after a word', 'пиши@anna_w', 'handle'],
    ['an IBAN with spaces', 'PL61 1090 1014 0000 0712 1981 2874', 'iban'],
    ['a lower-case IBAN', 'pl61109010140000071219812874', 'iban'],
    ['a 15-digit run', 'konto 123456789012345', 'iban'],
  ])('refuses %s', (_case, text, found) => {
    expect(checkAboutText(text)).toEqual({ ok: false, found });
  });

  it.each([
    ['six digits with spaces', 'kod 501 234'],
    ['a two-character handle', 'tg @ab'],
    ['an @ followed by a space', 'spotkanie @ 18'],
    ['numbers split by commas', 'Mam 2 koty, 1 psa, 3 rybki'],
  ])('accepts %s', (_case, text) => {
    expect(checkAboutText(text)).toEqual({ ok: true, value: text });
  });

  it('reports an IBAN before the phone rule that its digits also match', () => {
    expect(checkAboutText('PL61109010140000071219812874')).toEqual({ ok: false, found: 'iban' });
    expect(checkAboutText('123456789012345')).toEqual({ ok: false, found: 'iban' });
  });

  it('reports too_long before a contact in the same text', () => {
    expect(checkAboutText(`${'a'.repeat(280)} t.me/anna_w`)).toEqual({
      ok: false,
      found: 'too_long',
      length: 292,
    });
  });
});

describe('checkAboutText NFKC normalisation', () => {
  it.each<[string, string, AboutTextFinding]>([
    ['a phone in full-width digits', 'zadzwoń ５０１ ２３４ ５６７', 'phone'],
    ['a handle in full-width letters', 'пиши ＠ａｎｎａ＿ｗ', 'handle'],
    ['a link in full-width letters', 'ｗｗｗ．ｏｌｘ．ｐｌ', 'link'],
    ['an e-mail in full-width letters', 'ａｎｎａ＠ｘ．ｐｌ', 'email'],
    ['a 15-digit run in full-width digits', '１２３４５６７８９０１２３４５', 'iban'],
  ])('refuses %s', (_case, text, found) => {
    expect(checkAboutText(text)).toEqual({ ok: false, found });
  });

  it('stores the normalised text', () => {
    expect(checkAboutText('Ｍｎｅ ２５, есть ２ кота')).toEqual({
      ok: true,
      value: 'Mne 25, есть 2 кота',
    });
    expect(checkAboutText(`Pracuje${COMBINING_OGONEK} w IT`)).toEqual({
      ok: true,
      value: 'Pracuję w IT',
    });
  });
});

describe('checkAboutText length and skip', () => {
  it('limits the text to 280 characters', () => {
    expect(ABOUT_MAX_LENGTH).toBe(280);
  });

  it('accepts exactly 280 characters', () => {
    const text = 'a'.repeat(280);
    expect(checkAboutText(text)).toEqual({ ok: true, value: text });
  });

  it('counts the length after trimming and stores the trimmed text', () => {
    const text = 'a'.repeat(280);
    expect(checkAboutText(`  ${text}\n `)).toEqual({ ok: true, value: text });
    expect(checkAboutText('  Pracuję w IT  ')).toEqual({ ok: true, value: 'Pracuję w IT' });
  });

  it('counts characters, not UTF-16 units', () => {
    expect(checkAboutText('😀'.repeat(280))).toEqual({ ok: true, value: '😀'.repeat(280) });
    expect(checkAboutText('😀'.repeat(281))).toEqual({
      ok: false,
      found: 'too_long',
      length: 281,
    });
  });

  it.each([
    ['empty text', ''],
    ['tabs and new lines', '\n\t \n'],
    ['no-break spaces', `${NBSP}${NBSP}`],
    ['ideographic spaces', `${IDEOGRAPHIC_SPACE}${IDEOGRAPHIC_SPACE}`],
    ['zero-width spaces', ` ${ZERO_WIDTH_SPACE} `],
  ])('treats %s as a skip', (_case, text) => {
    expect(checkAboutText(text)).toEqual({ ok: true, value: null });
  });
});
