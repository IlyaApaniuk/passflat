/**
 * System profile that owns cost reports imported from external sources
 * (e.g. the early Google Form) until they are claimed by a real user.
 *
 * Profile.id in Prisma is a plain UUID with no FK to auth.users, so this
 * placeholder profile can exist without a corresponding Supabase auth user.
 */
export const IMPORT_AUTHOR_ID = '00000000-0000-4000-8000-000000000001';
export const IMPORT_AUTHOR_DISPLAY_NAME = 'Imported';
