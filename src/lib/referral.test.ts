import { describe, expect, it } from 'vitest';

import { classifyRef, sanitizeRef } from './referral';

describe('sanitizeRef', () => {
  it('returns null for empty / missing input', () => {
    expect(sanitizeRef(null)).toBeNull();
    expect(sanitizeRef(undefined)).toBeNull();
    expect(sanitizeRef('')).toBeNull();
    expect(sanitizeRef('   ')).toBeNull();
  });

  it('accepts UUIDs (peer user ids) and campaign slugs, trimming whitespace', () => {
    const uuid = '3f1a2b3c-4d5e-6f70-8901-23456789abcd';
    expect(sanitizeRef(uuid)).toBe(uuid);
    expect(sanitizeRef('  dezhyty  ')).toBe('dezhyty');
    expect(sanitizeRef('tg_home_warszawa')).toBe('tg_home_warszawa');
  });

  it('rejects values with unsafe characters or over the length cap', () => {
    expect(sanitizeRef('drop;table')).toBeNull();
    expect(sanitizeRef('a b')).toBeNull();
    expect(sanitizeRef('код')).toBeNull();
    expect(sanitizeRef('x'.repeat(65))).toBeNull();
    expect(sanitizeRef('x'.repeat(64))).toBe('x'.repeat(64));
  });
});

describe('classifyRef', () => {
  it('classifies a UUID as a peer referral', () => {
    expect(classifyRef('3f1a2b3c-4d5e-6f70-8901-23456789abcd')).toBe('peer');
  });

  it('classifies a non-UUID code as a campaign referral', () => {
    expect(classifyRef('dezhyty')).toBe('campaign');
    expect(classifyRef('tg_home_warszawa')).toBe('campaign');
  });
});
