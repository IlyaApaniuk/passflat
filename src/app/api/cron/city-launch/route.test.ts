import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  sendEmail: vi.fn(),
  calls: [] as string[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cityNotifySubscription: { findMany: h.findMany, update: h.update },
  },
}));

// Tests never reach Resend.
vi.mock('@/lib/email/send', () => ({ sendEmail: h.sendEmail }));

import { POST } from './route';

const SECRET = 'cron-test-secret';
const originalSecret = process.env.CRON_SECRET;

function req(body: unknown, auth: string | null = `Bearer ${SECRET}`): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== null) headers.authorization = auth;
  return new NextRequest('http://localhost/api/cron/city-launch', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const BODY = { city: ' Kraków ', citySlug: 'krakow', cityName: 'Kraków' };

function row(id: string, email: string, locale: string | null = 'ru') {
  return {
    id,
    email,
    city: 'Kraków',
    cityNormalized: 'kraków',
    districtSlug: '',
    listingType: '',
    locale,
    consent: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    notifiedAt: null,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.calls.length = 0;
  h.findMany.mockReset().mockResolvedValue([]);
  h.update.mockReset().mockImplementation(async ({ where }: { where: { id: string } }) => {
    h.calls.push(`update:${where.id}`);
    return {};
  });
  h.sendEmail.mockReset().mockImplementation(async ({ to }: { to: string }) => {
    h.calls.push(`send:${to}`);
    return { success: true, id: 'email-id' };
  });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe('POST /api/cron/city-launch', () => {
  it('selects only consenting, not yet notified city-launch rows of the city', async () => {
    const res = await POST(req(BODY));

    expect(res.status).toBe(200);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(h.findMany).toHaveBeenCalledWith({
      where: {
        cityNormalized: 'kraków',
        listingType: '',
        districtSlug: '',
        consent: true,
        notifiedAt: null,
      },
    });
  });

  it('never selects listings-interest rows (whole city or district)', async () => {
    await POST(req(BODY));

    const { where } = h.findMany.mock.calls[0][0];
    expect(where.listingType).toBe('');
    expect(where.districtSlug).toBe('');
    // No OR / NOT branch that could widen the selection to listings rows.
    expect(Object.keys(where).sort()).toEqual(
      ['cityNormalized', 'consent', 'districtSlug', 'listingType', 'notifiedAt'].sort(),
    );
  });

  it('returns 401 without the cron secret and touches nothing', async () => {
    for (const auth of [null, 'Bearer wrong-secret', SECRET]) {
      const res = await POST(req(BODY, auth));
      expect(res.status).toBe(401);
    }
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('sends the city-launch e-mail and sets notifiedAt after each successful send', async () => {
    h.findMany.mockResolvedValue([row('a', 'a@example.com'), row('b', 'b@example.com', 'xx')]);

    const res = await POST(req(BODY));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, matched: 2, sent: 2, failed: 0 });
    expect(h.calls).toEqual(['send:a@example.com', 'update:a', 'send:b@example.com', 'update:b']);
    expect(h.sendEmail).toHaveBeenCalledWith({
      to: 'a@example.com',
      locale: 'ru',
      template: 'cityLaunch',
      data: { cityName: 'Kraków', cityUrl: expect.stringMatching(/\/ru\/krakow\/replacement$/) },
    });
    expect(h.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { notifiedAt: expect.any(Date) },
    });
  });

  it('leaves notifiedAt unset when the send fails', async () => {
    h.findMany.mockResolvedValue([row('a', 'a@example.com'), row('b', 'b@example.com')]);
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      h.calls.push(`send:${to}`);
      return to === 'a@example.com' ? { success: false, error: 'boom' } : { success: true };
    });

    const res = await POST(req(BODY));
    const json = await res.json();

    expect(json).toMatchObject({ matched: 2, sent: 1, failed: 1 });
    expect(h.calls).toEqual(['send:a@example.com', 'send:b@example.com', 'update:b']);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing city or citySlug with 400 before querying', async () => {
    for (const body of [{ citySlug: 'krakow' }, { city: 'Kraków' }, { city: ' ', citySlug: 'x' }]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    }
    const bad = await POST(req('{not json'));
    expect(bad.status).toBe(400);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
