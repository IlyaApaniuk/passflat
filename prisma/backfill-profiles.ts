/**
 * One-off backfill: create a `profiles` row for every auth.users that lacks one.
 *
 * Historically profiles were only created in the /auth/callback route, so users
 * who authenticated by other means (password login, cross-browser email confirm
 * in a webview, etc.) ended up authenticated without a profile and hit the
 * cost_reports_author_id_fkey / listings_author_id_fkey constraint on first write.
 *
 * Usage:
 *   tsx prisma/backfill-profiles.ts [--dry-run]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env
 * (e.g. run with: `dotenv -e .env.prod -- tsx prisma/backfill-profiles.ts`).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;

type AuthUser = {
  id: string;
  email: string | null;
  user_metadata?: { full_name?: string } | null;
};

/**
 * Calls the GoTrue admin REST API directly so we don't pull in supabase-js
 * (whose client eagerly inits a Realtime websocket, unsupported on Node < 22).
 */
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

  const defaultCity = await prisma.city.findUnique({
    where: { slug: 'warsaw' },
    select: { id: true },
  });

  let page = 1;
  let scanned = 0;
  let created = 0;

  for (;;) {
    const users = await listUsers(url, serviceKey, page);
    if (users.length === 0) break;

    for (const user of users) {
      scanned += 1;

      const existing = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { id: true },
      });
      if (existing) continue;

      const displayName =
        (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || null;

      console.log(`${DRY_RUN ? '[dry-run] ' : ''}creating profile for ${user.email ?? user.id}`);

      if (!DRY_RUN) {
        await prisma.profile.create({
          data: {
            id: user.id,
            displayName,
            cityId: defaultCity?.id,
          },
        });
      }
      created += 1;
    }

    if (users.length < PAGE_SIZE) break;
    page += 1;
  }

  console.log(
    `\nDone. Scanned ${scanned} auth users, ${DRY_RUN ? 'would create' : 'created'} ${created} profile(s).`,
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
