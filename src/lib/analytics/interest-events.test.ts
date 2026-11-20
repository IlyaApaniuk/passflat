import { describe, expect, it } from 'vitest';
import { interestOutcomeEvent, responseErrorCode } from './interest-events';

const district = { listingType: 'roommate' as const, districtSlug: 'mokotow' };
const city = { listingType: 'sublet' as const, districtSlug: '' };

describe('interestOutcomeEvent: saved', () => {
  it('reports district scope when a district slug was sent', () => {
    expect(interestOutcomeEvent({ ...district, status: 200 })).toEqual({
      event: 'listing_interest_saved',
      properties: { listing_type: 'roommate', district_scope: 'district' },
    });
  });

  it('reports city scope when no district slug was sent', () => {
    expect(interestOutcomeEvent({ ...city, status: 200 })).toEqual({
      event: 'listing_interest_saved',
      properties: { listing_type: 'sublet', district_scope: 'city' },
    });
  });

  it('adds intent only when the visitor chose a role', () => {
    expect(interestOutcomeEvent({ ...district, status: 200, intent: 'find_room' })).toEqual({
      event: 'listing_interest_saved',
      properties: { listing_type: 'roommate', district_scope: 'district', intent: 'find_room' },
    });
    expect(interestOutcomeEvent({ ...city, status: 201, intent: 'offer_room' })).toEqual({
      event: 'listing_interest_saved',
      properties: { listing_type: 'sublet', district_scope: 'city', intent: 'offer_room' },
    });
    const withoutIntent = interestOutcomeEvent({ ...district, status: 200, intent: undefined });
    expect(withoutIntent.properties).not.toHaveProperty('intent');
  });

  it('treats every 2xx as saved and a 3xx as failed', () => {
    expect(interestOutcomeEvent({ ...city, status: 204 }).event).toBe('listing_interest_saved');
    expect(interestOutcomeEvent({ ...city, status: 299 }).event).toBe('listing_interest_saved');
    expect(interestOutcomeEvent({ ...city, status: 302 }).event).toBe('listing_interest_failed');
  });

  it('ignores a code on a 2xx response', () => {
    expect(interestOutcomeEvent({ ...city, status: 200, code: 'rate_limited' }).event).toBe(
      'listing_interest_saved',
    );
  });
});

describe('interestOutcomeEvent: failed', () => {
  it.each([
    ['consent_required', 400],
    ['invalid_email', 400],
    ['invalid_input', 400],
    ['unknown_city', 400],
    ['unknown_district', 400],
    ['rate_limited', 429],
    ['server_error', 500],
  ])('takes error_code %s from the response code', (code, status) => {
    expect(interestOutcomeEvent({ ...district, status, code })).toEqual({
      event: 'listing_interest_failed',
      properties: { error_code: code },
    });
  });

  it('prefers the response code over the status', () => {
    expect(interestOutcomeEvent({ ...district, status: 400, code: 'unknown_district' })).toEqual({
      event: 'listing_interest_failed',
      properties: { error_code: 'unknown_district' },
    });
  });

  it.each([
    [429, 'rate_limited'],
    [400, 'invalid_input'],
    [500, 'server_error'],
    [502, 'server_error'],
    [503, 'server_error'],
    [404, 'server_error'],
    [403, 'server_error'],
  ])('falls back to the status without a code: %i → %s', (status, error_code) => {
    expect(interestOutcomeEvent({ ...city, status })).toEqual({
      event: 'listing_interest_failed',
      properties: { error_code },
    });
  });

  it('falls back to the status for an unknown or non-string code', () => {
    expect(interestOutcomeEvent({ ...city, status: 429, code: 'slow_down' }).properties).toEqual({
      error_code: 'rate_limited',
    });
    expect(interestOutcomeEvent({ ...city, status: 400, code: 42 }).properties).toEqual({
      error_code: 'invalid_input',
    });
    expect(
      interestOutcomeEvent({ ...city, status: 500, code: 'network_error' }).properties,
    ).toEqual({ error_code: 'server_error' });
  });

  it('reports network_error when fetch threw', () => {
    expect(interestOutcomeEvent({ ...district, networkError: true })).toEqual({
      event: 'listing_interest_failed',
      properties: { error_code: 'network_error' },
    });
  });

  it('sends only error_code, never the intent or scope', () => {
    const failed = interestOutcomeEvent({ ...district, status: 400, intent: 'find_room' });
    expect(Object.keys(failed.properties)).toEqual(['error_code']);
  });
});

describe('responseErrorCode', () => {
  it('returns the code field of a JSON error body', async () => {
    const res = Response.json({ error: 'Unknown city', code: 'unknown_city' }, { status: 400 });
    await expect(responseErrorCode(res)).resolves.toBe('unknown_city');
  });

  it('returns undefined for a body without a code', async () => {
    const res = Response.json({ error: 'Too many requests.' }, { status: 429 });
    await expect(responseErrorCode(res)).resolves.toBeUndefined();
  });

  it('returns undefined for a body that is not JSON or not an object', async () => {
    await expect(
      responseErrorCode(new Response('<html>Bad gateway</html>', { status: 502 })),
    ).resolves.toBeUndefined();
    await expect(responseErrorCode(Response.json(null, { status: 500 }))).resolves.toBeUndefined();
  });
});
