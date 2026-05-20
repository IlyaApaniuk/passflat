import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/dashboard");
  }

  const [listings, responses] = await Promise.all([
    prisma.listing.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        building: { include: { district: true } },
      },
    }),
    prisma.listingResponse.findMany({
      where: {
        listing: { authorId: user.id },
      },
      orderBy: { createdAt: "desc" },
      include: {
        listing: { select: { id: true, title: true, type: true } },
        responder: {
          select: { displayName: true, contactValue: true },
        },
      },
    }),
  ]);

  const serializedListings = listings.map((l) => ({
    id: l.id,
    title: l.title,
    type: l.type as "replacement" | "roommate" | "sublet",
    address: l.building.addressFull,
    district: l.building.district?.nameKey ?? "",
    price: Number(l.totalMonthly ?? l.pricePerPerson ?? l.priceTotal ?? 0),
    status: l.status as "active" | "pending" | "expired" | "closed",
    promoted: l.isPromoted,
    promotedUntil: l.promotedUntil?.toISOString() ?? null,
    views: l.viewsCount,
    inquiries: l.responsesCount,
    image: l.photos[0] ?? null,
    createdAt: l.createdAt.toISOString(),
  }));

  const serializedInquiries = responses.map((r) => ({
    id: r.id,
    listingId: r.listing.id,
    listingTitle: r.listing.title,
    listingType: r.listing.type as "replacement" | "roommate" | "sublet",
    from: r.responder?.displayName ?? r.responder?.contactValue ?? "Anonymous",
    message: r.message ?? "",
    date: r.createdAt.toISOString(),
    status: r.status,
  }));

  return (
    <DashboardClient
      listings={serializedListings}
      inquiries={serializedInquiries}
    />
  );
}
