import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeInterestRemovalToken,
  makeUnsubscribeToken,
  verifyInterestRemovalToken,
  verifyUnsubscribeToken,
} from './unsubscribe';

const ROW_ID = '4b6f2a1e-9c3d-4e8f-a7b2-1c0d9e8f7a6b';
const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/** Flips the last signature character, keeping the token well-formed. */
function tamperSignature(token: string): string {
  const last = token.at(-1) === 'A' ? 'B' : 'A';
  return `${token.slice(0, -1)}${last}`;
}

describe('signed link tokens', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips an interest-removal token to its row id', () => {
    const token = makeInterestRemovalToken(ROW_ID);
    expect(token.startsWith(`${ROW_ID}.`)).toBe(true);
    expect(verifyInterestRemovalToken(token)).toBe(ROW_ID);
  });

  it('keeps the profile unsubscribe round trip', () => {
    expect(verifyUnsubscribeToken(makeUnsubscribeToken(USER_ID))).toBe(USER_ID);
  });

  it('only uses URL-safe characters', () => {
    expect(makeInterestRemovalToken(ROW_ID)).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('rejects a tampered signature or a swapped row id', () => {
    const token = makeInterestRemovalToken(ROW_ID);
    expect(verifyInterestRemovalToken(tamperSignature(token))).toBeNull();

    const signature = token.slice(token.lastIndexOf('.') + 1);
    expect(verifyInterestRemovalToken(`${USER_ID}.${signature}`)).toBeNull();
  });

  it.each([undefined, null, '', 'no-dot', `.${'x'.repeat(43)}`, `${ROW_ID}.`])(
    'rejects a malformed token %j',
    (token) => {
      expect(verifyInterestRemovalToken(token)).toBeNull();
    },
  );

  it('never accepts a profile unsubscribe token as an interest token, or the reverse', () => {
    expect(verifyInterestRemovalToken(makeUnsubscribeToken(ROW_ID))).toBeNull();
    expect(verifyUnsubscribeToken(makeInterestRemovalToken(USER_ID))).toBeNull();
    // A profile token over the interest payload itself does not cross over either.
    expect(verifyInterestRemovalToken(makeUnsubscribeToken(`interest:${ROW_ID}`))).toBeNull();
  });

  it('rejects a token signed with another key', () => {
    const token = makeInterestRemovalToken(ROW_ID);
    vi.stubEnv('CRON_SECRET', 'another-secret');
    expect(verifyInterestRemovalToken(token)).toBeNull();
  });

  it('refuses to issue and verifies nothing in production without CRON_SECRET', () => {
    const token = makeInterestRemovalToken(ROW_ID);
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => makeInterestRemovalToken(ROW_ID)).toThrow(/CRON_SECRET is not set/);
    expect(() => makeUnsubscribeToken(USER_ID)).toThrow(/CRON_SECRET is not set/);
    expect(verifyInterestRemovalToken(token)).toBeNull();
  });

  it('round-trips with an empty key outside production (local dev)', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(verifyInterestRemovalToken(makeInterestRemovalToken(ROW_ID))).toBe(ROW_ID);
  });
});
