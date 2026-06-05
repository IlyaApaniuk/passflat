import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  computeLocationScore,
  SCORE_VERSION,
  type LocationScoreResult,
} from '@/lib/location-score';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const building = await prisma.building.findUnique({
    where: { id },
    select: {
      lat: true,
      lng: true,
      locationScore: true,
      city: { select: { lat: true, lng: true } },
    },
  });

  if (!building) {
    return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  }

  if (building.locationScore && building.locationScore.version >= SCORE_VERSION) {
    return NextResponse.json({
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

  let result: LocationScoreResult;
  try {
    result = await computeLocationScore(origin, centerCoord);
  } catch {
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
    overall: saved.overall,
    categories: saved.categories,
    computedAt: saved.computedAt,
  });
}
