import { createBrowserClient } from '@supabase/ssr';

type BrowserClient = ReturnType<typeof createBrowserClient>;

// Reuse a single browser client across the app. Creating a new client per
// `createClient()` call spins up duplicate GoTrue auth listeners and Realtime
// connections (one per hook/component mount), which adds memory pressure and
// redundant network/event work. A module-level singleton is the pattern
// recommended by @supabase/ssr for the browser.
let browserClient: BrowserClient | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return browserClient;
}
