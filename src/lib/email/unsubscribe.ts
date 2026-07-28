import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, tamper-proof one-click unsubscribe tokens for outgoing emails. The
 * token travels in the unsubscribe link, so it must let a logged-out recipient
 * opt out without exposing or trusting a bare user id (which anyone could forge
 * to unsubscribe someone else). Format: `<userId>.<hmac>`.
 *
 * HMAC keyed on CRON_SECRET — already a server-only secret present in prod, so
 * no new env var is needed. (Empty key in local dev without CRON_SECRET still
 * round-trips; it just isn't secret there.)
 *
 * In production a missing CRON_SECRET is refused rather than silently falling
 * back to an empty key: an empty key is public knowledge, so anyone could forge
 * a token and unsubscribe someone else.
 */
function secret(): string | null {
  const value = process.env.CRON_SECRET;
  if (value) return value;
  return process.env.NODE_ENV === 'production' ? null : '';
}

function sign(userId: string, key: string): string {
  return createHmac('sha256', key).update(userId).digest('base64url');
}

export function makeUnsubscribeToken(userId: string): string {
  const key = secret();
  if (key === null) {
    throw new Error('CRON_SECRET is not set — refusing to issue an unsigned unsubscribe token');
  }
  return `${userId}.${sign(userId, key)}`;
}

/** Returns the userId if the token is valid, else null. UUIDs contain no dots. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const key = secret();
  if (key === null) return null;

  const userId = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId, key));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return userId;
}
