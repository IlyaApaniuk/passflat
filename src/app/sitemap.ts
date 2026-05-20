import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { routing } from '@/i18n/routing';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://passflat.pl';

function buildAlternates(pathname: string) {
  return Object.fromEntries(
    routing.locales.map((locale) => [
      locale,
      locale === routing.defaultLocale
        ? `${baseUrl}${pathname}`
        : `${baseUrl}/${locale}${pathname}`,
    ]),
  );
}

function entry(
  pathname: string,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] = 'monthly',
  priority?: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${pathname}`,
    alternates: { languages: buildAlternates(pathname) },
    changeFrequency,
    ...(priority !== undefined && { priority }),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    entry('/', 'daily', 1.0),
    entry('/about', 'monthly', 0.5),
    entry('/blog', 'weekly', 0.6),
    entry('/contact', 'monthly', 0.4),
    entry('/help', 'monthly', 0.5),
    entry('/how-it-works', 'monthly', 0.6),
    entry('/privacy', 'yearly', 0.3),
    entry('/terms', 'yearly', 0.3),
  ];

  let listingPages: MetadataRoute.Sitemap = [];
  let buildingPages: MetadataRoute.Sitemap = [];

  try {
    const listings = await prisma.listing.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        type: true,
        updatedAt: true,
        building: { select: { city: { select: { slug: true } } } },
      },
    });

    listingPages = listings.map((listing) => {
      const citySlug = listing.building.city.slug;
      const path = `/${citySlug}/${listing.type}/${listing.id}`;
      return {
        ...entry(path, 'weekly', 0.8),
        lastModified: listing.updatedAt,
      };
    });

    const buildings = await prisma.building.findMany({
      where: { costReports: { some: { isVisible: true } } },
      select: {
        id: true,
        city: { select: { slug: true } },
        costReports: {
          where: { isVisible: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    buildingPages = buildings.map((b) => ({
      ...entry(`/${b.city.slug}/building/${b.id}`, 'weekly', 0.7),
      lastModified: b.costReports[0]?.createdAt,
    }));
  } catch {
    // DB unavailable — return static pages only
  }

  return [...staticPages, ...listingPages, ...buildingPages];
}
