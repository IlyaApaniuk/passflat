/**
 * One-off: backfill Listing.slug for rows created before the slug column existed.
 *
 * slug = generateListingSlug(title, id) — the suffix derives from the row's own
 * id, so it is unique and there are no collisions. Idempotent: only touches rows
 * where slug IS NULL, so it is safe to re-run.
 *
 * Run AFTER applying the migration that adds the column:
 *   ( set -a; source .env.local; set +a; npx tsx scripts/backfill-listing-slugs.ts )
 */
import { PrismaClient } from '@prisma/client';
import { generateListingSlug } from '../src/lib/slugify';

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.listing.findMany({
    where: { slug: null },
    select: { id: true, title: true },
  });

  let updated = 0;
  for (const l of listings) {
    await prisma.listing.update({
      where: { id: l.id },
      data: { slug: generateListingSlug(l.title, l.id) },
    });
    updated += 1;
  }

  console.log(JSON.stringify({ found: listings.length, updated }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
