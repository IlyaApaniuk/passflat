import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { translateTexts } from '@/lib/deepl';

const SUPPORTED_LOCALES = ['en', 'pl', 'ru', 'uk'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { targetLocale } = body;

  if (!targetLocale || !SUPPORTED_LOCALES.includes(targetLocale)) {
    return NextResponse.json(
      { error: 'Invalid targetLocale. Must be one of: en, pl, ru, uk' },
      { status: 400 },
    );
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      locale: true,
      title: true,
      description: true,
      roommateDescription: true,
      subletRules: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.locale === targetLocale) {
    return NextResponse.json({
      title: listing.title,
      description: listing.description,
      roommateDescription: listing.roommateDescription,
      subletRules: listing.subletRules,
      fromCache: true,
    });
  }

  const cached = await prisma.listingTranslation.findUnique({
    where: { listingId_locale: { listingId: id, locale: targetLocale } },
  });

  if (cached) {
    return NextResponse.json({
      title: cached.title,
      description: cached.description,
      roommateDescription: cached.roommateDescription,
      subletRules: cached.subletRules,
      fromCache: true,
    });
  }

  const textsToTranslate: string[] = [];
  const fieldMap: string[] = [];

  if (listing.title) {
    textsToTranslate.push(listing.title);
    fieldMap.push('title');
  }
  if (listing.description) {
    textsToTranslate.push(listing.description);
    fieldMap.push('description');
  }
  if (listing.roommateDescription) {
    textsToTranslate.push(listing.roommateDescription);
    fieldMap.push('roommateDescription');
  }
  if (listing.subletRules) {
    textsToTranslate.push(listing.subletRules);
    fieldMap.push('subletRules');
  }

  if (textsToTranslate.length === 0) {
    return NextResponse.json({
      title: null,
      description: null,
      roommateDescription: null,
      subletRules: null,
      fromCache: false,
    });
  }

  try {
    const results = await translateTexts(
      textsToTranslate,
      targetLocale,
      listing.locale,
    );

    const translated: Record<string, string | null> = {
      title: null,
      description: null,
      roommateDescription: null,
      subletRules: null,
    };

    results.forEach((result, index) => {
      translated[fieldMap[index]] = result.text;
    });

    await prisma.listingTranslation.create({
      data: {
        listingId: id,
        locale: targetLocale,
        title: translated.title,
        description: translated.description,
        roommateDescription: translated.roommateDescription,
        subletRules: translated.subletRules,
      },
    });

    return NextResponse.json({ ...translated, fromCache: false });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Translation service unavailable' },
      { status: 503 },
    );
  }
}
