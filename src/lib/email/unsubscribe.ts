import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, tamper-proof one-click tokens for links a (usually logged-out) recipient opens:
 * they must let that person act without exposing or trusting a bare id, which anyone could
 * forge to act on someone else. Format: `<id>.<hmac>`.
 *
 * Two purposes share one key:
 *   - profile unsubscribe: `<userId>.<hmac(userId)>` (building-activity and reminder e-mails);
 *   - interest removal: `<rowId>.<hmac("interest:" + rowId)>` (one listings-interest
 *     `city_notify_subscriptions` row, spec 02 §Remove-interest link).
 * The signed payloads differ, so a token of one purpose never verifies as the other.
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

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function issue(id: string, payload: string, purpose: string): string {
  const key = secret();
  if (key === null) {
    throw new Error(`CRON_SECRET is not set — refusing to issue an unsigned ${purpose} token`);
  }
  return `${id}.${sign(payload, key)}`;
}

/** The id of a valid `<id>.<hmac(payloadOf(id))>` token, else null. Ids contain no dots. */
function verify(
  token: string | null | undefined,
  payloadOf: (id: string) => string,
): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const key = secret();
  if (key === null) return null;

  const id = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payloadOf(id), key));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return id;
}

export function makeUnsubscribeToken(userId: string): string {
  return issue(userId, userId, 'unsubscribe');
}

/** Returns the userId if the token is valid, else null. UUIDs contain no dots. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  return verify(token, (userId) => userId);
}

const interestPayload = (rowId: string) => `interest:${rowId}`;

/** Token for the remove-interest link of one listings-interest row (its UUID). */
export function makeInterestRemovalToken(rowId: string): string {
  return issue(rowId, interestPayload(rowId), 'interest-removal');
}

/** Returns the row id if the token is a valid interest-removal token, else null. */
export function verifyInterestRemovalToken(token: string | null | undefined): string | null {
  return verify(token, interestPayload);
}
