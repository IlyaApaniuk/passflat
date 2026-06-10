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
 */
const SECRET = process.env.CRON_SECRET ?? '';

function sign(userId: string): string {
  return createHmac('sha256', SECRET).update(userId).digest('base64url');
}

export function makeUnsubscribeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Returns the userId if the token is valid, else null. UUIDs contain no dots. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const userId = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return userId;
}
