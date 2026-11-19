import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = {
  id: string;
  email: string;
  city: string;
  cityNormalized: string;
  districtSlug: string;
  listingType: string;
  locale: string | null;
  consent: boolean;
  createdAt: Date;
  notifiedAt: Date | null;
};

type Where = { id?: string; notifiedAt?: Date | null };

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  sendEmail: vi.fn(),
  calls: [] as string[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cityNotifySubscription: {
      findMany: h.findMany,
      updateMany: h.updateMany,
      update: h.update,
    },
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

function row(id: string, email: string, locale: string | null = 'ru'): Row {
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

function matches(r: Row, where: Where): boolean {
  if (where.id !== undefined && r.id !== where.id) return false;
  if ('notifiedAt' in where) {
    const want = where.notifiedAt ?? null;
    const have = r.notifiedAt;
    if (want === null ? have !== null : have?.getTime() !== want.getTime()) return false;
  }
  return true;
}

function notifiedAt(id: string): Date | null {
  return h.rows.find((r) => r.id === id)?.notifiedAt ?? null;
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.rows = [];
  h.calls.length = 0;
  // The in-memory table: findMany returns copies of the unclaimed rows (the
  // route's selection is asserted separately); updateMany applies its where.
  h.findMany
    .mockReset()
    .mockImplementation(async () =>
      h.rows.filter((r) => r.notifiedAt === null).map((r) => ({ ...r })),
    );
  h.updateMany
    .mockReset()
    .mockImplementation(
      async ({ where, data }: { where: Where; data: { notifiedAt: Date | null } }) => {
        const hit = h.rows.filter((r) => matches(r, where));
        for (const r of hit) r.notifiedAt = data.notifiedAt;
        h.calls.push(`${data.notifiedAt === null ? 'release' : 'claim'}:${where.id}:${hit.length}`);
        return { count: hit.length };
      },
    );
  h.update.mockReset();
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
    h.rows = [row('a', 'a@example.com')];
    for (const auth of [null, 'Bearer wrong-secret', SECRET]) {
      const res = await POST(req(BODY, auth));
      expect(res.status).toBe(401);
    }
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(notifiedAt('a')).toBeNull();
  });

  it('links to the locale URL of the city costs page, not /replacement', async () => {
    h.rows = [row('a', 'a@example.com', 'ru'), row('b', 'b@example.com', 'pl')];

    await POST(req(BODY));

    expect(h.sendEmail).toHaveBeenCalledWith({
      to: 'a@example.com',
      locale: 'ru',
      template: 'cityLaunch',
      data: {
        cityName: 'Kraków',
        cityUrl: expect.stringMatching(/^https?:\/\/[^/]+\/ru\/krakow\/costs$/),
      },
    });
    expect(h.sendEmail.mock.calls[1][0].data.cityUrl).toMatch(/\/pl\/krakow\/costs$/);
    for (const [args] of h.sendEmail.mock.calls) {
      expect(args.data.cityUrl).not.toContain('replacement');
    }
  });

  it('claims each row before its send and keeps notifiedAt after a successful send', async () => {
    h.rows = [row('a', 'a@example.com'), row('b', 'b@example.com', 'xx')];

    const res = await POST(req(BODY));
    const json = await res.json();

    expect(json).toMatchObject({ success: true, matched: 2, sent: 2, failed: 0 });
    expect(h.calls).toEqual(['claim:a:1', 'send:a@example.com', 'claim:b:1', 'send:b@example.com']);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', notifiedAt: null },
      data: { notifiedAt: expect.any(Date) },
    });
    expect(notifiedAt('a')).toBeInstanceOf(Date);
    expect(notifiedAt('b')).toBeInstanceOf(Date);
    // An unknown stored locale falls back to the default e-mail locale.
    expect(h.sendEmail.mock.calls[1][0].locale).toBe('pl');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('sends once when two runs overlap on the same row', async () => {
    h.rows = [row('a', 'a@example.com')];
    // Both runs read the row before either claims it: each selection waits
    // until the other run has selected too.
    let releaseSelections: () => void = () => {};
    const bothSelected = new Promise<void>((resolve) => (releaseSelections = resolve));
    h.findMany.mockImplementation(async () => {
      const copies = h.rows.filter((r) => r.notifiedAt === null).map((r) => ({ ...r }));
      if (h.findMany.mock.calls.length === 2) releaseSelections();
      await bothSelected;
      return copies;
    });

    const [first, second] = await Promise.all([POST(req(BODY)), POST(req(BODY))]);
    const results = [await first.json(), await second.json()];

    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.matched)).toEqual([1, 1]);
    expect(results.map((r) => r.sent).sort()).toEqual([0, 1]);
    expect(results.map((r) => r.failed)).toEqual([0, 0]);
    expect(h.calls.filter((c) => c.startsWith('claim:a:'))).toEqual(['claim:a:1', 'claim:a:0']);
    expect(notifiedAt('a')).toBeInstanceOf(Date);
  });

  it('sends nothing on a second run after the first one finished', async () => {
    h.rows = [row('a', 'a@example.com')];

    await POST(req(BODY));
    const again = await (await POST(req(BODY))).json();

    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ matched: 0, sent: 0, failed: 0 });
  });

  it('restores notifiedAt to null when the send fails, so a later run retries', async () => {
    h.rows = [row('a', 'a@example.com'), row('b', 'b@example.com')];
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      h.calls.push(`send:${to}`);
      return to === 'a@example.com' ? { success: false, error: 'boom' } : { success: true };
    });

    const json = await (await POST(req(BODY))).json();

    expect(json).toMatchObject({ matched: 2, sent: 1, failed: 1 });
    expect(h.calls).toEqual([
      'claim:a:1',
      'send:a@example.com',
      'release:a:1',
      'claim:b:1',
      'send:b@example.com',
    ]);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', notifiedAt: expect.any(Date) },
      data: { notifiedAt: null },
    });
    expect(notifiedAt('a')).toBeNull();
    expect(notifiedAt('b')).toBeInstanceOf(Date);

    // The next run picks the released row up again and sends it.
    h.sendEmail.mockResolvedValue({ success: true });
    const retry = await (await POST(req(BODY))).json();
    expect(retry).toMatchObject({ matched: 1, sent: 1, failed: 0 });
    expect(h.sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'a@example.com' }));
    expect(notifiedAt('a')).toBeInstanceOf(Date);
  });

  it('rejects a missing city or citySlug with 400 before querying', async () => {
    for (const body of [{ citySlug: 'krakow' }, { city: 'Kraków' }, { city: ' ', citySlug: 'x' }]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    }
    const bad = await POST(req('{not json'));
    expect(bad.status).toBe(400);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
