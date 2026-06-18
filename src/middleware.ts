import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { routing } from './i18n/routing';
import { captureReferralFromRequest } from './lib/referral';
import { captureAnonIdFromRequest } from './lib/anon-id';

const intlMiddleware = createIntlMiddleware(routing);

function isProtectedPath(pathWithoutLocale: string): boolean {
  if (pathWithoutLocale === '/dashboard' || pathWithoutLocale.startsWith('/dashboard/'))
    return true;
  if (pathWithoutLocale === '/create-listing' || pathWithoutLocale.startsWith('/create-listing/'))
    return true;
  if (pathWithoutLocale === '/messages' || pathWithoutLocale.startsWith('/messages/')) return true;
  // NOTE: `/costs/submit` is intentionally NOT protected — the cost form is open
  // to logged-out visitors (anonymous submission), the login wall before data
  // entry was a supply-killer on cold-start traffic. Login becomes a post-submit
  // hook to claim the report + unlock deeper stats (see lib/anon-id.ts).
  return false;
}

function isAccountDeletedPath(pathWithoutLocale: string): boolean {
  return (
    pathWithoutLocale === '/account-deleted' || pathWithoutLocale.startsWith('/account-deleted/')
  );
}

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  // First-touch referral capture: persist any `?ref=` before the early returns
  // below so it works on every matched path (public landing/cost pages included,
  // which never reach the auth branch). Cheap cookie write, no network.
  captureReferralFromRequest(request, response);

  // Ensure a stable anonymous id on every visit so a logged-out cost submission
  // can be claimed on the visitor's first login. Cheap cookie write, no network.
  captureAnonIdFromRequest(request, response);

  // If next-intl issued a locale redirect, return it as-is — no auth needed.
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  const { pathname } = request.nextUrl;
  const locale = routing.locales.find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`);
  const pathWithoutLocale = locale ? pathname.slice(locale.length + 1) || '/' : pathname;

  // Only public-page navigations (home, listings, locale switches, …) hit the
  // common case. Skip the Supabase auth network round-trip entirely for them;
  // it's only needed to gate protected routes and the account-deleted flow.
  const needsAuth = isProtectedPath(pathWithoutLocale) || isAccountDeletedPath(pathWithoutLocale);

  if (!needsAuth) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedPath(pathWithoutLocale) && !user) {
    const currentLocale = locale || routing.defaultLocale;
    const loginUrl = new URL(`/${currentLocale}/auth/login`, request.url);
    loginUrl.searchParams.set('next', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  if (user && isProtectedPath(pathWithoutLocale)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('deleted_at')
      .eq('id', user.id)
      .single();

    if (profile?.deleted_at) {
      const currentLocale = locale || routing.defaultLocale;
      const deletedUrl = new URL(`/${currentLocale}/account-deleted`, request.url);
      const redirectResponse = NextResponse.redirect(deletedUrl);
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  if (user && isAccountDeletedPath(pathWithoutLocale)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('deleted_at')
      .eq('id', user.id)
      .single();

    if (!profile?.deleted_at) {
      const currentLocale = locale || routing.defaultLocale;
      const dashboardUrl = new URL(`/${currentLocale}/dashboard`, request.url);
      const redirectResponse = NextResponse.redirect(dashboardUrl);
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: ['/', '/(en|ru|uk)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
