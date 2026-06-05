/**
 * One-off backfill: populate `profiles.email` from Supabase auth.users.
 *
 * After adding the `email` column to profiles, existing rows have NULL email.
 * This script fetches every auth user via the GoTrue admin API and sets the
 * corresponding profile's email field.
 *
 * Usage:
 *   tsx prisma/backfill-emails.ts [--dry-run]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env
 * (e.g. run with: `dotenv -e .env.local -- tsx prisma/backfill-emails.ts`).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;

type AuthUser = {
  id: string;
  email: string | null;
};

async function listUsers(url: string, serviceKey: string, page: number): Promise<AuthUser[]> {
  const endpoint = new URL('/auth/v1/admin/users', url);
  endpoint.searchParams.set('page', String(page));
  endpoint.searchParams.set('per_page', String(PAGE_SIZE));

  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`GoTrue admin listUsers failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { users?: AuthUser[] };
  return body.users ?? [];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  let page = 1;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const users = await listUsers(url, serviceKey, page);
    if (users.length === 0) break;

    for (const user of users) {
      scanned += 1;

      if (!user.email) {
        skipped += 1;
        continue;
      }

      const profile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { email: true },
      });

      if (!profile) {
        skipped += 1;
        continue;
      }

      if (profile.email) {
        skipped += 1;
        continue;
      }

      console.log(`${DRY_RUN ? '[dry-run] ' : ''}setting email for ${user.id} -> ${user.email}`);

      if (!DRY_RUN) {
        await prisma.profile.update({
          where: { id: user.id },
          data: { email: user.email },
        });
      }
      updated += 1;
    }

    if (users.length < PAGE_SIZE) break;
    page += 1;
  }

  console.log(
    `\nDone. Scanned ${scanned} auth users, ${DRY_RUN ? 'would update' : 'updated'} ${updated} profile(s), skipped ${skipped}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
