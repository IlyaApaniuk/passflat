import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MessagesClient } from './client';
import { getLocale } from 'next-intl/server';

export default async function MessagesPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Both the redirect and the `next` it carries must keep the locale:
    // an unprefixed path is re-resolved by next-intl from the browser's
    // Accept-Language, which drops a RU reader onto the English site.
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/messages`)}`);
  }

  return <MessagesClient userId={user.id} />;
}
