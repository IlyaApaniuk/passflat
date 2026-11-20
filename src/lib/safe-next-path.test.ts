import { describe, expect, it } from 'vitest';
import { loginNextPath, safeNextPath } from './safe-next-path';

describe('safeNextPath', () => {
  it('keeps internal checker paths with locale and query parameters', () => {
    expect(safeNextPath('/ru/warsaw/check?p=ChIJ-test&utm_source=share')).toBe(
      '/ru/warsaw/check?p=ChIJ-test&utm_source=share',
    );
  });

  it.each([
    'https://evil.example/path',
    '//evil.example/path',
    '/\\evil.example/path',
    '/%5Cevil.example/path',
    '/%2F%2Fevil.example/path',
    '/%252F%252Fevil.example/path',
    '/..//evil.example',
    '/.//evil.example',
    '/a/..//evil.example',
    '/%2e%2e//evil.example',
    '/safe\nSet-Cookie: bad=1',
    '',
  ])('rejects unsafe return target %j', (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('rejects non-string and excessively long values', () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(`/${'a'.repeat(2_048)}`)).toBeNull();
  });
});

describe('loginNextPath', () => {
  it('keeps the query string of a protected path', () => {
    expect(loginNextPath('/ru/create-listing', '?type=roommate')).toBe(
      '/ru/create-listing?type=roommate',
    );
    expect(loginNextPath('/create-listing', '?type=roommate')).toBe(
      '/create-listing?type=roommate',
    );
  });

  it('leaves a path without a query unchanged', () => {
    expect(loginNextPath('/ru/create-listing', '')).toBe('/ru/create-listing');
    expect(loginNextPath('/en/dashboard', '')).toBe('/en/dashboard');
    expect(loginNextPath('/messages/abc', '')).toBe('/messages/abc');
  });

  it.each([
    '//evil.example/dashboard',
    '/\\evil.example/dashboard',
    '/%2F%2Fevil.example/dashboard',
    '/a/..//evil.example',
  ])('rejects an unsafe path %j', (pathname) => {
    expect(loginNextPath(pathname, '')).toBeNull();
    expect(loginNextPath(pathname, '?type=roommate')).toBeNull();
  });

  it('drops a query that safeNextPath rejects and keeps the safe path', () => {
    expect(loginNextPath('/ru/create-listing', '?type=%0ASet-Cookie:%20bad=1')).toBe(
      '/ru/create-listing',
    );
    expect(loginNextPath('/ru/create-listing', `?q=${'a'.repeat(2_048)}`)).toBe(
      '/ru/create-listing',
    );
  });
});
