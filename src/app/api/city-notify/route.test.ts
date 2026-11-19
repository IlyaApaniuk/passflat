import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  sessionEmail: null as string | null,
  cityFindUnique: vi.fn(),
  districtFindFirst: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  sendEmail: vi.fn(),
  trackServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
  captureServerException: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: h.sessionEmail ? { email: h.sessionEmail } : null },
      })),
    },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: { findUnique: h.cityFindUnique },
    district: { findFirst: h.districtFindFirst },
    cityNotifySubscription: { upsert: h.upsert, findUnique: h.findUnique },
  },
}));

// Tests never reach Resend or PostHog.
vi.mock('@/lib/email/send', () => ({ sendEmail: h.sendEmail }));

vi.mock('@/lib/posthog-server', () => ({
  trackServerEvent: h.trackServerEvent,
  flushPostHog: h.flushPostHog,
  captureServerException: h.captureServerException,
}));

import { resetRateLimits } from '@/lib/rate-limit';
import { verifyInterestRemovalToken } from '@/lib/email/unsubscribe';
import { POST } from './route';

const EMAIL = 'tenant@example.com';
const ROW_ID = '4b6f2a1e-9c3d-4e8f-a7b2-1c0d9e8f7a6b';

/** The row id signed into an absolute remove-interest link for `locale`, else a failure. */
function removeUrlRowId(removeUrl: unknown, locale: string): string | null {
  expect(typeof removeUrl).toBe('string');
  const url = new URL(removeUrl as string);
  expect(`${url.origin}${url.pathname}`).toBe(
    `https://passflat.com/${locale}/email/remove-interest`,
  );
  return verifyInterestRemovalToken(url.searchParams.get('token'));
}

let ipCounter = 0;

function req(body: unknown, ip = `10.0.0.${++ipCounter}`): NextRequest {
  return new NextRequest('http://localhost/api/city-notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function uniqueKey(listingType: string, districtSlug: string, cityNormalized = 'warsaw') {
  return {
    email_cityNormalized_districtSlug_listingType: {
      email: EMAIL,
      cityNormalized,
      districtSlug,
      listingType,
    },
  };
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const json = await res.json();
  expect(json.code).toBe(code);
  expect(typeof json.error).toBe('string');
  expect(json.error.length).toBeGreaterThan(0);
}

function expectNothingStored() {
  expect(h.upsert).not.toHaveBeenCalled();
  expect(h.sendEmail).not.toHaveBeenCalled();
  expect(h.trackServerEvent).not.toHaveBeenCalled();
}

const listings = (extra: Record<string, unknown>) => ({
  email: EMAIL,
  city: 'warsaw',
  consent: true,
  locale: 'ru',
  ...extra,
});

beforeEach(() => {
  resetRateLimits();
  h.sessionEmail = null;
  h.cityFindUnique.mockReset().mockResolvedValue({ id: 'city-warsaw' });
  h.districtFindFirst.mockReset().mockResolvedValue({ id: 'district-mokotow' });
  h.upsert.mockReset().mockResolvedValue({ id: ROW_ID });
  h.findUnique.mockReset().mockResolvedValue({ id: ROW_ID });
  h.sendEmail.mockReset().mockResolvedValue(undefined);
  h.trackServerEvent.mockReset();
  h.flushPostHog.mockReset().mockResolvedValue(undefined);
  h.captureServerException.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/city-notify · city launch', () => {
  it('stores the old city form body as a city-launch row and sends the confirmation', async () => {
    const res = await POST(req({ email: EMAIL, city: 'Kraków', consent: true, locale: 'pl' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(h.cityFindUnique).not.toHaveBeenCalled();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0]).toMatchObject({
      where: uniqueKey('', '', 'kraków'),
      create: {
        email: EMAIL,
        city: 'Kraków',
        cityNormalized: 'kraków',
        districtSlug: '',
        listingType: '',
        locale: 'pl',
        consent: true,
      },
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledWith({
      to: EMAIL,
      locale: 'pl',
      template: 'cityNotifyConfirmation',
      data: { cityName: 'Kraków' },
    });
    expect(h.trackServerEvent).toHaveBeenCalledTimes(1);
    expect(h.trackServerEvent).toHaveBeenCalledWith(EMAIL, 'city_notify_subscribed', {
      city: 'Kraków',
      locale: 'pl',
    });
  });

  it('treats empty listingType and districtSlug as the city-launch class', async () => {
    const res = await POST(
      req({ email: EMAIL, city: 'Gdańsk', consent: true, listingType: '', districtSlug: ' ' }),
    );

    expect(res.status).toBe(200);
    expect(h.upsert.mock.calls[0][0].where).toEqual(uniqueKey('', '', 'gdańsk'));
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.trackServerEvent.mock.calls[0][1]).toBe('city_notify_subscribed');
  });

  it('uses the session e-mail for a logged-in submit without an e-mail', async () => {
    h.sessionEmail = 'Tenant@Example.com';
    const res = await POST(req({ city: 'Kraków', consent: true }));

    expect(res.status).toBe(200);
    expect(h.upsert.mock.calls[0][0].where).toEqual(uniqueKey('', '', 'kraków'));
  });

  it('still answers 200 when the confirmation e-mail fails', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('resend down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(req({ email: EMAIL, city: 'Kraków', consent: true }));

    expect(res.status).toBe(200);
    expect(h.captureServerException).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/city-notify · listings interest', () => {
  it('stores a roommate request without a district as a whole-city listings row, no e-mail', async () => {
    const res = await POST(req(listings({ listingType: 'roommate', districtSlug: '' })));

    expect(res.status).toBe(200);
    expect(h.cityFindUnique).toHaveBeenCalledWith({
      where: { slug: 'warsaw' },
      select: { id: true },
    });
    expect(h.districtFindFirst).not.toHaveBeenCalled();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0]).toMatchObject({
      where: uniqueKey('roommate', ''),
      create: { listingType: 'roommate', districtSlug: '', city: 'warsaw', locale: 'ru' },
    });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.trackServerEvent).toHaveBeenCalledTimes(1);
    expect(h.trackServerEvent).toHaveBeenCalledWith(EMAIL, 'district_notify_subscribed', {
      city: 'warsaw',
      locale: 'ru',
      districtSlug: '',
      listingType: 'roommate',
    });
  });

  it('stores a whole-city request when districtSlug is missing altogether', async () => {
    const res = await POST(req(listings({ listingType: 'sublet' })));

    expect(res.status).toBe(200);
    expect(h.upsert.mock.calls[0][0].where).toEqual(uniqueKey('sublet', ''));
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('stores a district request after checking the district belongs to the city', async () => {
    const res = await POST(req(listings({ listingType: 'replacement', districtSlug: 'mokotow' })));

    expect(res.status).toBe(200);
    expect(h.districtFindFirst).toHaveBeenCalledWith({
      where: { cityId: 'city-warsaw', slug: 'mokotow' },
      select: { id: true },
    });
    expect(h.upsert.mock.calls[0][0].where).toEqual(uniqueKey('replacement', 'mokotow'));
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.trackServerEvent).toHaveBeenCalledWith(EMAIL, 'district_notify_subscribed', {
      city: 'warsaw',
      locale: 'ru',
      districtSlug: 'mokotow',
      listingType: 'replacement',
    });
  });

  it.each([
    ['a whole-city', { listingType: 'roommate' }, 'ru'],
    ['a district', { listingType: 'replacement', districtSlug: 'mokotow' }, 'ru'],
    ['an English district', { listingType: 'sublet', districtSlug: 'wola', locale: 'en' }, 'en'],
  ])('returns an absolute remove link for %s listings row', async (_label, extra, locale) => {
    const res = await POST(req(listings(extra)));

    expect(res.status).toBe(200);
    expect(h.upsert.mock.calls[0][0].select).toEqual({ id: true });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(removeUrlRowId(json.removeUrl, locale)).toBe(ROW_ID);
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns no remove link for a city-launch row', async () => {
    const res = await POST(req({ email: EMAIL, city: 'Kraków', consent: true, locale: 'ru' }));

    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('removeUrl');
  });

  it('still saves a listings row without a link when the token cannot be signed', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(req(listings({ listingType: 'roommate' })));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(h.upsert).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(EMAIL);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a whole-city listings request for an unknown city', async () => {
    h.cityFindUnique.mockResolvedValueOnce(null);
    const res = await POST(req(listings({ city: 'Kraków', listingType: 'roommate' })));

    await expectError(res, 400, 'unknown_city');
    expect(h.cityFindUnique).toHaveBeenCalledWith({
      where: { slug: 'kraków' },
      select: { id: true },
    });
    expectNothingStored();
  });

  it('rejects a district request for an unknown city', async () => {
    h.cityFindUnique.mockResolvedValueOnce(null);
    const res = await POST(
      req(listings({ city: 'atlantis', listingType: 'roommate', districtSlug: 'mokotow' })),
    );

    await expectError(res, 400, 'unknown_city');
    expect(h.districtFindFirst).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('rejects a district of another city', async () => {
    h.districtFindFirst.mockResolvedValueOnce(null);
    const res = await POST(req(listings({ listingType: 'roommate', districtSlug: 'podgorze' })));

    await expectError(res, 400, 'unknown_district');
    expect(h.districtFindFirst).toHaveBeenCalledWith({
      where: { cityId: 'city-warsaw', slug: 'podgorze' },
      select: { id: true },
    });
    expectNothingStored();
  });

  it('rejects a district without a listing type instead of storing a city-launch row', async () => {
    const res = await POST(req(listings({ districtSlug: 'mokotow' })));

    await expectError(res, 400, 'invalid_input');
    expect(h.cityFindUnique).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('rejects a district with an empty listing type', async () => {
    const res = await POST(req(listings({ listingType: '  ', districtSlug: 'mokotow' })));

    await expectError(res, 400, 'invalid_input');
    expectNothingStored();
  });

  it.each([
    ['an unknown type without a district', { listingType: 'house' }],
    ['an unknown type with a district', { listingType: 'house', districtSlug: 'mokotow' }],
    ['a non-string type', { listingType: 5 }],
    ['a non-string district', { listingType: 'roommate', districtSlug: ['mokotow'] }],
  ])('rejects %s as invalid_input', async (_label, extra) => {
    const res = await POST(req(listings(extra)));

    await expectError(res, 400, 'invalid_input');
    expect(h.cityFindUnique).not.toHaveBeenCalled();
    expectNothingStored();
  });
});

describe('POST /api/city-notify · repeats and races', () => {
  it('upserts a repeat submission onto the same unique key', async () => {
    const body = listings({ listingType: 'roommate', districtSlug: 'mokotow' });

    const first = await POST(req(body, '10.1.1.1'));
    const second = await POST(req(body, '10.1.1.1'));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(h.upsert).toHaveBeenCalledTimes(2);
    expect(h.upsert.mock.calls[0][0].where).toEqual(uniqueKey('roommate', 'mokotow'));
    expect(h.upsert.mock.calls[1][0].where).toEqual(h.upsert.mock.calls[0][0].where);
  });

  it('treats a P2002 unique violation on the upsert as success', async () => {
    h.upsert.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const res = await POST(req({ email: EMAIL, city: 'Kraków', consent: true }));

    expect(res.status).toBe(200);
    // A city-launch row gets no remove link, so it is not looked up either.
    expect(await res.json()).toEqual({ success: true });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.captureServerException).not.toHaveBeenCalled();
    // The winning request already tracked and confirmed this row.
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.trackServerEvent).not.toHaveBeenCalled();
  });

  it('still returns the remove link of a listings row after a P2002, found by its unique key', async () => {
    h.upsert.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const res = await POST(req(listings({ listingType: 'roommate', districtSlug: 'mokotow' })));

    expect(res.status).toBe(200);
    expect(h.findUnique).toHaveBeenCalledWith({
      where: uniqueKey('roommate', 'mokotow'),
      select: { id: true },
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(removeUrlRowId(json.removeUrl, 'ru')).toBe(ROW_ID);
    expect(h.captureServerException).not.toHaveBeenCalled();
  });

  it('answers a P2002 with plain success when the listings row cannot be found again', async () => {
    h.upsert.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    h.findUnique.mockResolvedValueOnce(null);

    const res = await POST(req(listings({ listingType: 'sublet' })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('answers any other database error with 500 server_error', async () => {
    h.upsert.mockRejectedValueOnce(new Error('connection lost'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(req(listings({ listingType: 'roommate' })));

    await expectError(res, 500, 'server_error');
    expect(h.captureServerException).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.trackServerEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/city-notify · request errors', () => {
  it('rate-limits the fourth request per IP within a minute', async () => {
    const body = { email: EMAIL, city: 'Kraków', consent: true };
    for (let i = 0; i < 3; i += 1) {
      expect((await POST(req(body, '10.2.2.2'))).status).toBe(200);
    }

    await expectError(await POST(req(body, '10.2.2.2')), 429, 'rate_limited');
  });

  it.each([
    ['bad JSON', 'not json'],
    ['a JSON null body', 'null'],
    ['a JSON array body', '[]'],
    ['a missing city', { email: EMAIL, consent: true }],
    ['a blank city', { email: EMAIL, city: '  ', consent: true }],
    ['a non-string city', { email: EMAIL, city: 42, consent: true }],
  ])('answers %s with invalid_input', async (_label, body) => {
    await expectError(await POST(req(body)), 400, 'invalid_input');
    expectNothingStored();
  });

  it('requires consent', async () => {
    await expectError(await POST(req({ email: EMAIL, city: 'Kraków' })), 400, 'consent_required');
    expectNothingStored();
  });

  it('rejects an invalid e-mail', async () => {
    await expectError(
      await POST(req({ email: 'not-an-email', city: 'Kraków', consent: true })),
      400,
      'invalid_email',
    );
    expectNothingStored();
  });

  it('rejects a submit without an e-mail and without a session', async () => {
    await expectError(await POST(req({ city: 'Kraków', consent: true })), 400, 'invalid_email');
    expectNothingStored();
  });
});
