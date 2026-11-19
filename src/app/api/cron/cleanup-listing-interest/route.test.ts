import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; email: string; listingType: string; createdAt: Date };
type Where = { listingType: { not: string }; createdAt: { lt: Date } };

const h = vi.hoisted(() => ({
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { cityNotifySubscription: { deleteMany: h.deleteMany } },
}));

import {
  LISTING_INTEREST_RETENTION_MONTHS,
  listingInterestCutoff,
} from '@/lib/listing-interest-retention';

import { GET } from './route';

const SECRET = 'cron-test-secret';
const NOW = new Date('2026-11-19T04:30:00.000Z');

function req(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return new NextRequest('http://localhost/api/cron/cleanup-listing-interest', {
    headers: auth ? { authorization: auth } : {},
  });
}

/** An in-memory table whose `deleteMany` applies the route's `where`. */
function serveTable(rows: Row[]) {
  h.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
    const doomed = rows.filter(
      (row) => row.listingType !== where.listingType.not && row.createdAt < where.createdAt.lt,
    );
    for (const row of doomed) rows.splice(rows.indexOf(row), 1);
    return { count: doomed.length };
  });
  return rows;
}

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.deleteMany.mockResolvedValue({ count: 0 });
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  info.mockRestore();
});

describe('GET /api/cron/cleanup-listing-interest', () => {
  it('deletes only listings-interest rows created more than 12 months before now', async () => {
    await GET(req());

    expect(h.deleteMany).toHaveBeenCalledTimes(1);
    expect(h.deleteMany).toHaveBeenCalledWith({
      where: {
        listingType: { not: '' },
        createdAt: { lt: new Date('2025-11-19T04:30:00.000Z') },
      },
    });
  });

  it('returns and logs only the deleted count, never an e-mail', async () => {
    const rows = serveTable([
      {
        id: 'old-roommate',
        email: 'old-roommate@example.com',
        listingType: 'roommate',
        createdAt: new Date('2025-11-19T04:29:59.000Z'),
      },
      {
        id: 'old-sublet',
        email: 'old-sublet@example.com',
        listingType: 'sublet',
        createdAt: new Date('2024-03-01T10:00:00.000Z'),
      },
      {
        id: 'fresh-replacement',
        email: 'fresh@example.com',
        listingType: 'replacement',
        createdAt: new Date('2025-11-19T04:30:00.000Z'),
      },
      {
        id: 'old-city-launch',
        email: 'city@example.com',
        listingType: '',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
      },
    ]);

    const response = await GET(req());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ deletedCount: 2 });
    expect(rows.map((row) => row.id)).toEqual(['fresh-replacement', 'old-city-launch']);

    expect(info).toHaveBeenCalledTimes(1);
    const logged = info.mock.calls.flat().join(' ');
    expect(logged).toContain('2');
    expect(logged).not.toContain('@');
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('refuses a call without the cron secret and deletes nothing', async () => {
    const missing = await GET(req(null));
    const wrong = await GET(req('Bearer not-the-secret'));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
});

describe('listingInterestCutoff', () => {
  it('counts the retention period in calendar months', () => {
    expect(LISTING_INTEREST_RETENTION_MONTHS).toBe(12);
    expect(listingInterestCutoff(new Date('2028-02-29T12:00:00.000Z'))).toEqual(
      new Date('2027-02-28T12:00:00.000Z'),
    );
  });
});
