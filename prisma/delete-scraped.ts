/**
 * One-off cleanup: remove ALL scraped cost reports by deleting the system
 * "Scraped" profile. CostReport.author has onDelete: Cascade, so every report
 * owned by SCRAPED_AUTHOR_ID (and its periodic charges) is removed in one go.
 * Buildings created for them are left in place (other reports may reference them).
 *
 * Usage:
 *   tsx prisma/delete-scraped.ts [--dry-run]
 *
 * Run against an explicit env, e.g.:
 *   dotenv -e .env.prod -- tsx prisma/delete-scraped.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { SCRAPED_AUTHOR_ID } from '../src/lib/import-constants';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const count = await prisma.costReport.count({ where: { authorId: SCRAPED_AUTHOR_ID } });
  const profile = await prisma.profile.findUnique({ where: { id: SCRAPED_AUTHOR_ID } });

  if (!profile) {
    console.log('No "Scraped" profile found — nothing to delete.');
    return;
  }

  if (DRY_RUN) {
    console.log(
      `[dry-run] Would delete the "Scraped" profile and cascade ${count} cost report(s).`,
    );
    return;
  }

  await prisma.profile.delete({ where: { id: SCRAPED_AUTHOR_ID } });
  console.log(`Deleted the "Scraped" profile and cascaded ${count} cost report(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
