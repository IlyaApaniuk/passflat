import { headers } from "next/headers";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export async function trackView(listingId: string, authorId?: string) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headersList.get("x-real-ip")
    ?? "unknown";
  const ua = headersList.get("user-agent") ?? "";

  const viewerHash = createHash("sha256")
    .update(`${ip}:${ua}`)
    .digest("hex")
    .slice(0, 32);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await prisma.listingView.findFirst({
    where: {
      listingId,
      viewerHash,
      viewedAt: { gte: twentyFourHoursAgo },
    },
  });

  if (existing) return;

  try {
    await prisma.$transaction([
      prisma.listingView.create({
        data: { listingId, viewerHash },
      }),
      prisma.listing.update({
        where: { id: listingId },
        data: { viewsCount: { increment: 1 } },
      }),
    ]);
  } catch {
    // Unique constraint violation — concurrent request, safe to ignore
  }
}
