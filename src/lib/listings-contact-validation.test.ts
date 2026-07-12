import { describe, expect, it } from 'vitest';

import {
  normalizeTelegramHandle,
  normalizePhoneNumber,
  normalizeFacebookSlug,
} from './listings-validation';

describe('normalizeTelegramHandle', () => {
  it('treats empty input as valid null (contact removed)', () => {
    expect(normalizeTelegramHandle(null)).toEqual({ valid: true, handle: null });
    expect(normalizeTelegramHandle(undefined)).toEqual({ valid: true, handle: null });
    expect(normalizeTelegramHandle('')).toEqual({ valid: true, handle: null });
  });

  it('strips @, t.me/ and protocol prefixes', () => {
    expect(normalizeTelegramHandle('@some_user')).toEqual({ valid: true, handle: 'some_user' });
    expect(normalizeTelegramHandle('t.me/some_user')).toEqual({ valid: true, handle: 'some_user' });
    expect(normalizeTelegramHandle('https://t.me/some_user')).toEqual({
      valid: true,
      handle: 'some_user',
    });
    expect(normalizeTelegramHandle('  some_user  ')).toEqual({ valid: true, handle: 'some_user' });
  });

  it('rejects malformed handles', () => {
    expect(normalizeTelegramHandle('abc').valid).toBe(false); // too short
    expect(normalizeTelegramHandle('1abcde').valid).toBe(false); // starts with digit
    expect(normalizeTelegramHandle('has space').valid).toBe(false);
    expect(normalizeTelegramHandle('has-dash').valid).toBe(false);
    expect(normalizeTelegramHandle(42).valid).toBe(false);
  });
});

describe('normalizePhoneNumber', () => {
  it('treats empty input as valid null (contact removed)', () => {
    expect(normalizePhoneNumber('')).toEqual({ valid: true, phone: null });
    expect(normalizePhoneNumber(null)).toEqual({ valid: true, phone: null });
  });

  it('strips spaces, dashes and parentheses', () => {
    expect(normalizePhoneNumber('+48 600 000 000')).toEqual({ valid: true, phone: '+48600000000' });
    expect(normalizePhoneNumber('(48) 600-000-000')).toEqual({ valid: true, phone: '48600000000' });
  });

  it('rejects malformed numbers', () => {
    expect(normalizePhoneNumber('123').valid).toBe(false); // too short
    expect(normalizePhoneNumber('+48 600 000 000 000 000').valid).toBe(false); // too long
    expect(normalizePhoneNumber('600-ABC-000').valid).toBe(false);
  });
});

describe('normalizeFacebookSlug', () => {
  it('treats empty input as valid null (contact removed)', () => {
    expect(normalizeFacebookSlug('')).toEqual({ valid: true, slug: null });
  });

  it('strips facebook.com/, fb.com/, m.me/ and protocol prefixes', () => {
    expect(normalizeFacebookSlug('facebook.com/jan.kowalski')).toEqual({
      valid: true,
      slug: 'jan.kowalski',
    });
    expect(normalizeFacebookSlug('https://www.facebook.com/jan.kowalski')).toEqual({
      valid: true,
      slug: 'jan.kowalski',
    });
    expect(normalizeFacebookSlug('m.me/jan.kowalski')).toEqual({
      valid: true,
      slug: 'jan.kowalski',
    });
    expect(normalizeFacebookSlug('jan.kowalski/?mibextid=xyz')).toEqual({
      valid: true,
      slug: 'jan.kowalski',
    });
  });

  it('accepts numeric profile ids', () => {
    expect(normalizeFacebookSlug('100012345678901')).toEqual({
      valid: true,
      slug: '100012345678901',
    });
  });

  it('rejects malformed slugs', () => {
    expect(normalizeFacebookSlug('abc').valid).toBe(false); // too short
    expect(normalizeFacebookSlug('has space').valid).toBe(false);
    expect(normalizeFacebookSlug({}).valid).toBe(false);
  });
});
