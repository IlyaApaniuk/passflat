import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next-path';

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
