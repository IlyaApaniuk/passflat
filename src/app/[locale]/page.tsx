import type { Metadata } from "next";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Marquee } from "@/components/landing/marquee";
import { BentoGrid } from "@/components/landing/bento-grid";
import { FeaturedListings } from "@/components/landing/featured-listings";
import type { FeaturedListingData } from "@/components/landing/featured-listings";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CostTransparency } from "@/components/landing/cost-transparency";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { LandingContent } from "@/components/landing/landing-content";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { ListingType } from "@/lib/listings-data";
import { getAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: 'Passflat — Find Your Next Flat in Poland',
  alternates: getAlternates('/'),
};

const DEFAULT_CITY = "warsaw";

async function getFeaturedListings(): Promise<FeaturedListingData[]> {
  const types: ListingType[] = ["replacement", "roommate", "sublet"];
  const results: FeaturedListingData[] = [];

  for (const type of types) {
    const listing = await prisma.listing.findFirst({
      where: { status: "active", type },
      orderBy: [{ isPromoted: "desc" }, { createdAt: "desc" }],
      include: { building: { include: { district: true } } },
    });

    if (listing) {
      results.push({
        id: listing.id,
        type: listing.type as ListingType,
        title: listing.title,
        address: listing.building.addressFull,
        totalCost: Number(listing.totalMonthly ?? 0),
        bedrooms: listing.rooms ?? 0,
        bathrooms: 1,
        area: Number(listing.areaM2 ?? 0),
        image: listing.photos[0] ?? "/placeholder.jpg",
        promoted: listing.isPromoted,
        availableFrom: listing.availableFrom?.toISOString() ?? "",
        pricePerPerson: listing.pricePerPerson ? Number(listing.pricePerPerson) : undefined,
        currentRoommates: listing.currentRoommates ?? undefined,
        roomType: (listing.roomType as "private" | "shared") ?? undefined,
        availableTo: listing.availableTo?.toISOString() ?? undefined,
        priceTotal: listing.priceTotal ? Number(listing.priceTotal) : undefined,
      });
    }
  }

  if (results.length < 3) {
    const existingIds = results.map((r) => r.id);
    const fill = await prisma.listing.findMany({
      where: { status: "active", id: { notIn: existingIds } },
      orderBy: [{ isPromoted: "desc" }, { createdAt: "desc" }],
      take: 3 - results.length,
      include: { building: { include: { district: true } } },
    });

    for (const listing of fill) {
      results.push({
        id: listing.id,
        type: (listing.type as ListingType) ?? "replacement",
        title: listing.title,
        address: listing.building.addressFull,
        totalCost: Number(listing.totalMonthly ?? 0),
        bedrooms: listing.rooms ?? 0,
        bathrooms: 1,
        area: Number(listing.areaM2 ?? 0),
        image: listing.photos[0] ?? "/placeholder.jpg",
        promoted: listing.isPromoted,
        availableFrom: listing.availableFrom?.toISOString() ?? "",
      });
    }
  }

  return results;
}

export default async function Home() {
  let featuredListings: FeaturedListingData[] = [];
  let hasContributed = false;

  try {
    featuredListings = await getFeaturedListings();
  } catch {
    // DB unavailable — component will use fallback mock data
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const report = await prisma.costReport.findFirst({
        where: { authorId: user.id, isVisible: true },
        select: { id: true },
      });
      if (report) hasContributed = true;
    }
  } catch {
    // Auth unavailable — default to not contributed
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <LandingContent>
        <main className="flex-1">
          <Hero />
          <Marquee />
          <BentoGrid />
          <FeaturedListings listings={featuredListings} citySlug={DEFAULT_CITY} />
          <HowItWorks />
          <CostTransparency hasContributed={hasContributed} />
          <CTA />
        </main>
      </LandingContent>
      <Footer />
    </div>
  );
}
