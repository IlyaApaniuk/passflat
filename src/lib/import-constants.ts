/**
 * System profile that owns cost reports imported from external sources
 * (e.g. the early Google Form) until they are claimed by a real user.
 *
 * Profile.id in Prisma is a plain UUID with no FK to auth.users, so this
 * placeholder profile can exist without a corresponding Supabase auth user.
 */
export const IMPORT_AUTHOR_ID = '00000000-0000-4000-8000-000000000001';
export const IMPORT_AUTHOR_DISPLAY_NAME = 'Imported';

/**
 * System profile that owns cost reports entered from scraped external listings
 * (e.g. Otodom). Unlike imported reports, these have no owner email and are
 * never claimed by a real user. Keeping them under a single dedicated profile
 * means the whole batch can be removed later with one cascading delete.
 */
export const SCRAPED_AUTHOR_ID = '00000000-0000-4000-8000-000000000002';
export const SCRAPED_AUTHOR_DISPLAY_NAME = 'Scraped';

/**
 * Which admin behaviour the cost form's admin section performs. Selected by the
 * ADMIN_IMPORT_MODE env var (server-only), sharing the COST_IMPORT_ADMIN_EMAILS
 * allowlist:
 *   'fill_on_behalf' (default) — owner-email, auto-claims on that user's login
 *   'scraped' — owned by the system "Scraped" profile, never claimed
 */
export type AdminImportMode = 'fill_on_behalf' | 'scraped';

export function getAdminImportMode(): AdminImportMode {
  return process.env.ADMIN_IMPORT_MODE === 'scraped' ? 'scraped' : 'fill_on_behalf';
}

/**
 * Server-only allowlist of admin emails permitted to use the cost form's
 * "fill on behalf" mode (create reports under the system import profile with
 * email-claim semantics). Read from COST_IMPORT_ADMIN_EMAILS (comma-separated).
 * This is a plain config value, NOT a secret/API key.
 */
export function getCostImportAdminEmails(): string[] {
  return (process.env.COST_IMPORT_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isCostImportAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getCostImportAdminEmails().includes(email.trim().toLowerCase());
}
