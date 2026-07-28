import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SCORE_VERSION, type LocationScoreResult } from '@/lib/location-score';
import { computeLocationScoreFromDb } from '@/lib/poi-lookup';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const building = await prisma.building.findUnique({
    where: { id },
    select: {
      lat: true,
      lng: true,
      locationScore: true,
      city: { select: { slug: true, lat: true, lng: true } },
    },
  });

  if (!building) {
    return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  }

  // The building's own coordinates, so the client can centre a map on it
  // without a second round-trip. Decimal → number for JSON.
  const coords = {
    lat: building.lat == null ? null : Number(building.lat),
    lng: building.lng == null ? null : Number(building.lng),
  };

  if (building.locationScore && building.locationScore.version >= SCORE_VERSION) {
    return NextResponse.json({
      ...coords,
      overall: building.locationScore.overall,
      categories: building.locationScore.categories,
      computedAt: building.locationScore.computedAt,
    });
  }

  if (building.lat == null || building.lng == null) {
    return new NextResponse(null, { status: 204 });
  }

  const origin = { lat: Number(building.lat), lng: Number(building.lng) };
  const centerCoord =
    building.city.lat != null && building.city.lng != null
      ? { lat: Number(building.city.lat), lng: Number(building.city.lng) }
      : undefined;

  let result: LocationScoreResult | null;
  try {
    result = await computeLocationScoreFromDb(building.city.slug, origin, centerCoord);
  } catch {
    return NextResponse.json({ error: 'Location score unavailable' }, { status: 503 });
  }
  if (!result) {
    return NextResponse.json({ error: 'Location score unavailable' }, { status: 503 });
  }

  const categories = result.categories as unknown as Prisma.InputJsonValue;
  const saved = await prisma.buildingLocationScore.upsert({
    where: { buildingId: id },
    create: {
      buildingId: id,
      overall: result.overall,
      categories,
      version: SCORE_VERSION,
    },
    update: {
      overall: result.overall,
      categories,
      computedAt: new Date(),
      version: SCORE_VERSION,
    },
  });

  return NextResponse.json({
    ...coords,
    overall: saved.overall,
    categories: saved.categories,
    computedAt: saved.computedAt,
  });
}
