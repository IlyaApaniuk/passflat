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
