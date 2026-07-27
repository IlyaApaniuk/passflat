import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { routing } from '@/i18n/routing';
import { getAllPosts } from '@/lib/blog';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import { SITE_URL as baseUrl } from '@/lib/site-url';
import { LOCATION_CHECKER_CITY_SLUG } from '@/lib/location-checker';

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
    entry('/blog/warsaw-rent-prices', 'weekly', 0.7),
    entry('/contact', 'monthly', 0.4),
    entry('/help', 'monthly', 0.5),
    ...(isDocumentTemplatesEnabled() ? [entry('/resources', 'monthly', 0.6)] : []),
    entry('/how-it-works', 'monthly', 0.6),
    entry('/privacy', 'yearly', 0.3),
    entry('/terms', 'yearly', 0.3),
  ];

  let cityPages: MetadataRoute.Sitemap = [];
  let listingPages: MetadataRoute.Sitemap = [];
  let buildingPages: MetadataRoute.Sitemap = [];

  try {
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        // Only districts that actually have cost data — keeps thin/empty
        // district pages out of the sitemap.
        districts: {
          where: { buildings: { some: { costReports: { some: { isVisible: true } } } } },
          select: { slug: true },
        },
      },
    });

    cityPages = cities.flatMap((c) => [
      entry(`/${c.slug}`, 'weekly', 0.8),
      entry(`/${c.slug}/costs`, 'weekly', 0.8),
      ...(c.slug === LOCATION_CHECKER_CITY_SLUG
        ? [entry(`/${c.slug}/check`, 'weekly', 0.8), entry(`/${c.slug}/review`, 'weekly', 0.7)]
        : []),
      entry(`/${c.slug}/calculator`, 'weekly', 0.7),
      entry(`/${c.slug}/replacement`, 'weekly', 0.7),
      entry(`/${c.slug}/sublet`, 'weekly', 0.5),
      entry(`/${c.slug}/roommate`, 'weekly', 0.5),
      ...c.districts.map((d) => entry(`/${c.slug}/${d.slug}`, 'weekly', 0.6)),
    ]);

    const listings = await prisma.listing.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        slug: true,
        type: true,
        updatedAt: true,
        building: { select: { city: { select: { slug: true } } } },
      },
    });

    listingPages = listings.map((listing) => {
      const citySlug = listing.building.city.slug;
      const path = `/${citySlug}/${listing.type}/${listing.slug ?? listing.id}`;
      return {
        ...entry(path, 'weekly', 0.8),
        lastModified: listing.updatedAt,
      };
    });

    const buildings = await prisma.building.findMany({
      where: { costReports: { some: { isVisible: true } } },
      select: {
        id: true,
        slug: true,
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
      ...entry(`/${b.city.slug}/building/${b.slug}`, 'weekly', 0.7),
      lastModified: b.costReports[0]?.createdAt,
    }));
  } catch {
    // DB unavailable — return static pages only
  }

  const blogSlugs = new Set(getAllPosts().map((p) => p.slug));
  const blogPages: MetadataRoute.Sitemap = Array.from(blogSlugs).map((slug) =>
    entry(`/blog/${slug}`, 'monthly', 0.6),
  );

  return [...staticPages, ...cityPages, ...blogPages, ...listingPages, ...buildingPages];
}
