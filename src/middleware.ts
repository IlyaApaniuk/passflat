import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

function isProtectedPath(pathWithoutLocale: string): boolean {
  if (pathWithoutLocale === '/dashboard' || pathWithoutLocale.startsWith('/dashboard/'))
    return true;
  if (pathWithoutLocale === '/create-listing' || pathWithoutLocale.startsWith('/create-listing/'))
    return true;
  if (pathWithoutLocale === '/messages' || pathWithoutLocale.startsWith('/messages/')) return true;
  if (/\/costs\/submit(\/|$)/.test(pathWithoutLocale)) return true;
  if (/\/[^/]+\/costs\/submit(\/|$)/.test(pathWithoutLocale)) return true;
  return false;
}

function isAccountDeletedPath(pathWithoutLocale: string): boolean {
  return (
    pathWithoutLocale === '/account-deleted' || pathWithoutLocale.startsWith('/account-deleted/')
  );
}

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

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
