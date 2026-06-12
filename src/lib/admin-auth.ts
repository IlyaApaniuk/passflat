import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isCostImportAdmin } from '@/lib/import-constants';

/**
 * Returns the authenticated user iff they are a moderation admin (their email is
 * in COST_IMPORT_ADMIN_EMAILS), else null. Single gate shared by the admin
 * moderation page and the admin API routes — defense in depth, both check.
 */
export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isCostImportAdmin(user.email)) return null;
  return user;
}
