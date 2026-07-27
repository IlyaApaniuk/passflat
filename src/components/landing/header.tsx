'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Home, Globe, User, LogOut, LayoutDashboard, MessageSquare } from 'lucide-react';
import { signOut } from '@/app/[locale]/auth/actions';
import { useUnreadCount } from '@/hooks/use-unread-count';
import { LANGUAGES as languages } from '@/i18n/languages';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const DEFAULT_CITY = 'warsaw';

interface HeaderProps {
  initialUser?: { email?: string; id?: string } | null;
}

export function Header({ initialUser }: HeaderProps = {}) {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const pathname = usePathname();

  // The Header is rendered once in the locale layout WITHOUT a server-resolved
  // user, so the layout stays free of auth cookies and public routes can render
  // statically. Auth is therefore normally resolved on the client (below). If a
  // caller does pass `initialUser` (even `null`), we trust it and skip the
  // client `getUser()` — `serverResolved` keeps that path working.
  const serverResolved = initialUser !== undefined;

  const [user, setUser] = useState<SupabaseUser | null>(
    initialUser ? (initialUser as SupabaseUser) : null,
  );
  const [loading, setLoading] = useState(!serverResolved);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    if (!serverResolved) {
      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user);
        setLoading(false);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore the initial replay when the server already hydrated us — it can
      // momentarily report no session and flip a logged-in header to logged-out.
      if (event === 'INITIAL_SESSION' && serverResolved) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [serverResolved]);

  const [isSigningOut, startSignOut] = useTransition();

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale as 'en' | 'pl' | 'ru' | 'uk' });
  }

  async function handleSignOut() {
    setMobileMenuOpen(false);
    // Clear the browser session first so GoTrue emits SIGNED_OUT and the header
    // updates immediately. The server action then clears the server cookie and
    // redirects. Without this, logout was server-only and the client header
    // never reacted until an unrelated remount.
    const supabase = createClient();
    await supabase.auth.signOut({ scope: 'local' });
    startSignOut(() => {
      void signOut(locale);
    });
  }

  const { unreadCount } = useUnreadCount(user?.id ?? null);
  const userInitial = user?.email?.[0]?.toUpperCase() ?? 'U';

  // Listings are strategically frozen (pivot 2026-06-20): costs lead the nav,
  // listing pages stay reachable by direct link only. The nav carries nouns —
  // people browsing, not acting; the hero carries the verbs.
  const navLinks = [
    { href: `/${DEFAULT_CITY}/costs` as const, label: t('costs.title') },
    // `common`, not `checker`: the checker namespace is deliberately kept out of
    // the shared client bundle, and the header ships on every page.
    { href: `/${DEFAULT_CITY}/check` as const, label: t('common.checkAddress') },
    { href: `/${DEFAULT_CITY}/review` as const, label: t('common.buildingReviews') },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="relative flex items-center justify-between rounded-full border border-border/50 bg-background/95 px-4 sm:px-6 py-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-8 w-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
              <Home className="h-4 w-4 text-primary-foreground" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-xl font-semibold tracking-tight">{t('common.appName')}</span>
          </Link>

          {/* Desktop Nav — absolutely centered so it stays in the middle
              regardless of the logo / right-actions widths */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-2">
            {/* Language Switcher */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 rounded-full">
                  <Globe className="h-4 w-4" />
                  <span className="uppercase text-xs">{locale}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {languages.map((lang) => (
                  <DropdownMenuItem key={lang.code} onClick={() => switchLocale(lang.code)}>
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Auth Actions */}
            {loading ? (
              // Calm, non-animated placeholder that reserves the avatar's space
              // until client auth resolves (no pulsing skeleton flash, no wrong
              // CTA shown).
              <div className="h-8 w-8 rounded-full bg-muted/40" />
            ) : user ? (
              <>
                <Link href="/messages" className="relative">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">
                      {user.email}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/messages" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        {t('chat.conversations')}
                        {unreadCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {unreadCount}
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="gap-2">
                        <LayoutDashboard className="h-4 w-4" />
                        {t('common.dashboard')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        void handleSignOut();
                      }}
                      disabled={isSigningOut}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      {isSigningOut ? t('common.loading') : t('common.logout')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm" className="rounded-full">
                    {t('common.login')}
                  </Button>
                </Link>
                <Link href={`/${DEFAULT_CITY}/costs/submit`}>
                  <Button
                    size="sm"
                    className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {t('dashboard.addCostReport')}
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button (animated hamburger) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden relative w-8 h-8 flex items-center justify-center"
            aria-label="Toggle menu"
          >
            <div className="flex flex-col gap-1.5">
              <motion.span
                animate={{ rotate: mobileMenuOpen ? 45 : 0, y: mobileMenuOpen ? 6 : 0 }}
                className="w-5 h-0.5 bg-foreground block origin-center"
              />
              <motion.span
                animate={{ opacity: mobileMenuOpen ? 0 : 1 }}
                className="w-5 h-0.5 bg-foreground block"
              />
              <motion.span
                animate={{ rotate: mobileMenuOpen ? -45 : 0, y: mobileMenuOpen ? -6 : 0 }}
                className="w-5 h-0.5 bg-foreground block origin-center"
              />
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ y: -10 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="lg:hidden mt-2 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl p-4"
            >
              <nav className="flex flex-col gap-1">
                {navLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-sm rounded-xl hover:bg-secondary transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Mobile Language Switcher */}
              <div className="flex gap-2 px-4 pt-3 pb-2">
                {languages.map((lang) => (
                  <Button
                    key={lang.code}
                    variant={locale === lang.code ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      switchLocale(lang.code);
                      setMobileMenuOpen(false);
                    }}
                    className="flex-1 text-xs rounded-full"
                  >
                    {lang.code.toUpperCase()}
                  </Button>
                ))}
              </div>

              {/* Mobile Auth */}
              <div className="border-t border-border/50 mt-2 pt-3 px-4">
                {loading ? (
                  <div className="h-10 w-full rounded-xl bg-muted/40" />
                ) : user ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    <Link href="/messages" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full rounded-xl gap-2">
                        <MessageSquare className="h-4 w-4" />
                        {t('chat.conversations')}
                        {unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {unreadCount}
                          </span>
                        )}
                      </Button>
                    </Link>
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      <Button className="mt-2 w-full rounded-xl">{t('common.dashboard')}</Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="mt-2 w-full rounded-xl"
                      disabled={isSigningOut}
                      onClick={() => {
                        void handleSignOut();
                      }}
                    >
                      {isSigningOut ? t('common.loading') : t('common.logout')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/${DEFAULT_CITY}/costs/submit`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Button className="w-full rounded-xl bg-accent text-accent-foreground hover:bg-accent/90">
                        {t('dashboard.addCostReport')}
                      </Button>
                    </Link>
                    <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" className="mt-2 w-full rounded-xl">
                        {t('common.login')}
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
