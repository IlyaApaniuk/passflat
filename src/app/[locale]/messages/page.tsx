import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MessagesClient } from './client';

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/messages');
  }

  return <MessagesClient userId={user.id} />;
}
