import { afterEach, describe, expect, it, vi } from 'vitest';

import { isMatchingEnabled } from './switch';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isMatchingEnabled', () => {
  it('is off when ROOMMATE_MATCHING_ENABLED is unset', () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', undefined);
    expect(process.env.ROOMMATE_MATCHING_ENABLED).toBeUndefined();
    expect(isMatchingEnabled()).toBe(false);
  });

  it.each(['', 'TRUE', 'True', '1', 'false', 'yes', ' true', 'true '])('is off for %j', (value) => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', value);
    expect(isMatchingEnabled()).toBe(false);
  });

  it("is on only for the exact string 'true'", () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    expect(isMatchingEnabled()).toBe(true);
  });

  it('reads the variable on every call, not once at module load', () => {
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    expect(isMatchingEnabled()).toBe(true);
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'false');
    expect(isMatchingEnabled()).toBe(false);
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', undefined);
    expect(isMatchingEnabled()).toBe(false);
    vi.stubEnv('ROOMMATE_MATCHING_ENABLED', 'true');
    expect(isMatchingEnabled()).toBe(true);
  });
});
