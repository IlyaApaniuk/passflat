import { NextRequest, NextResponse } from 'next/server';

import { ensureAnonId } from '@/lib/anon-id';
import { BUILDING_TAGS, isBuildingTagKey, findTagConflict } from '@/lib/building-tags';
import { prisma } from '@/lib/prisma';
import { revalidateBuildingPage } from '@/lib/revalidate-costs';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_MAX_IPS = 10_000;
const ipTimestamps = new Map<string, number[]>();

/** First-line, per-instance protection; the unique constraint is the real guard. */
function isRateLimited(ip: string, now = Date.now()): boolean {
  if (!ipTimestamps.has(ip) && ipTimestamps.size >= RATE_LIMIT_MAX_IPS) {
    for (const [knownIp, stamps] of ipTimestamps) {
      if (stamps.every((stamp) => now - stamp >= RATE_LIMIT_WINDOW_MS))
        ipTimestamps.delete(knownIp);
    }
    while (ipTimestamps.size >= RATE_LIMIT_MAX_IPS) {
      const oldest = ipTimestamps.keys().next().value as string | undefined;
      if (!oldest) break;
      ipTimestamps.delete(oldest);
    }
  }

  const recent = (ipTimestamps.get(ip) ?? []).filter((stamp) => now - stamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipTimestamps.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipTimestamps.set(ip, recent);
  return false;
}

export function resetBuildingTagRateLimit(): void {
  ipTimestamps.clear();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

interface ParsedInput {
  buildingId: string;
  tagKeys: string[];
}

function parseInput(value: unknown): ParsedInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const body = value as Record<string, unknown>;

  if (typeof body.buildingId !== 'string' || !UUID.test(body.buildingId)) return null;
  if (!Array.isArray(body.tags)) return null;

  // Unknown keys are dropped rather than rejected: the vocabulary can shrink
  // between a page load and its submit, and losing one chip beats losing the
  // whole contribution.
  const tagKeys = [
    ...new Set(
      body.tags.filter((tag): tag is string => typeof tag === 'string' && isBuildingTagKey(tag)),
    ),
  ];
  if (tagKeys.length > BUILDING_TAGS.length) return null;

  return { buildingId: body.buildingId, tagKeys };
}

/**
 * Records what one person says about one building.
 *
 * The submitted set replaces that voter's previous set for the building, so
 * re-submitting is idempotent and unticking a chip removes it. Provenance is
 * derived here rather than trusted from the client: a voter counts as
 * cost-report-backed only if a visible report of theirs exists for this exact
 * building.
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';
  if (isRateLimited(ip)) return jsonError('RATE_LIMITED', 429);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('INVALID_REQUEST', 400);
  }

  const input = parseInput(raw);
  if (!input) return jsonError('INVALID_REQUEST', 400);

  // The picker cannot produce a contradictory pair, so one here means a stale
  // tab or a script. Rejecting beats storing "easy parking" and "hard parking"
  // from the same voter.
  const conflict = findTagConflict(input.tagKeys);
  if (conflict) return jsonError('CONFLICTING_TAGS', 400);

  const building = await prisma.building.findUnique({
    where: { id: input.buildingId },
    select: { id: true, slug: true, city: { select: { slug: true } } },
  });
  if (!building) return jsonError('NOT_FOUND', 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const anonId = await ensureAnonId();
  const voterKey = user?.id ?? anonId;

  const costReport = await prisma.costReport.findFirst({
    where: {
      buildingId: building.id,
      isVisible: true,
      ...(user ? { authorId: user.id } : { anonymousId: anonId }),
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  const source = costReport ? 'cost_report' : 'standalone';

  await prisma.$transaction([
    prisma.buildingTag.deleteMany({
      where: { buildingId: building.id, voterKey, tagKey: { notIn: input.tagKeys } },
    }),
    ...input.tagKeys.map((tagKey) =>
      prisma.buildingTag.upsert({
        where: { buildingId_tagKey_voterKey: { buildingId: building.id, tagKey, voterKey } },
        create: {
          buildingId: building.id,
          tagKey,
          voterKey,
          source,
          authorId: user?.id ?? null,
          costReportId: costReport?.id ?? null,
        },
        update: {
          source,
          authorId: user?.id ?? null,
          costReportId: costReport?.id ?? null,
        },
      }),
    ),
  ]);

  // The building page is ISR-cached for an hour; without this the voter's own
  // tags are missing when they land on it.
  revalidateBuildingPage(building.city.slug, building.slug);

  return NextResponse.json({ saved: input.tagKeys.length, source });
}
