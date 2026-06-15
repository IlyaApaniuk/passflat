'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePostHog, useFeatureFlagEnabled } from 'posthog-js/react';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Footer } from '@/components/landing/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Home,
  Heart,
  MessageSquare,
  Eye,
  MoreVertical,
  Edit,
  Trash2,
  Sparkles,
  MapPin,
  Clock,
  TrendingUp,
  ArrowLeftRight,
  UserPlus,
  CalendarClock,
  CreditCard,
  Receipt,
  LifeBuoy,
  Loader2,
  Bell,
  BellOff,
  Pencil,
  Check,
  X,
  User,
  Languages,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog';
import { ShareButton } from '@/components/costs/share-button';
import { CostReportsPanel, type ReportComparison } from '@/components/costs/cost-reports-panel';
import { LANGUAGES } from '@/i18n/languages';

type ListingType = 'replacement' | 'roommate' | 'sublet';

interface DashboardListing {
  id: string;
  slug: string;
  title: string;
  type: ListingType;
  address: string;
  district: string;
  citySlug: string;
  price: number;
  status: 'active' | 'pending' | 'expired' | 'closed' | 'pending_payment';
  promoted: boolean;
  promotedUntil: string | null;
  isPaid: boolean;
  views: number;
  inquiries: number;
  image: string | null;
  createdAt: string;
}

interface DashboardSavedListing {
  id: string;
  title: string;
  type: ListingType;
  address: string;
  district: string;
  price: number;
  image: string | null;
  savedAt: string;
}

interface DashboardFollow {
  id: string;
  buildingId: string;
  address: string;
  citySlug: string;
  slug: string;
  district: string;
  createdAt: string;
}

interface Props {
  listings: DashboardListing[];
  savedListings: DashboardSavedListing[];
  followedBuildings: DashboardFollow[];
  userEmail: string;
  displayName: string | null;
  userLocale: string;
  hasContributedCost: boolean;
  costAccessUntil: string | null;
  emailsOptOut: boolean;
  userId: string;
  reportComparisons: ReportComparison[];
}

const statCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, delay: i * 0.08, ease: 'easeOut' as const },
  }),
};

interface PaymentRow {
  id: string;
  productType: string;
  reference: string | null;
  amount: number;
  currency: string;
  status: string;
  date: string;
  hasReceipt: boolean;
}

export function DashboardClient({
  listings,
  savedListings,
  followedBuildings,
  userEmail,
  displayName: initialDisplayName,
  userLocale,
  hasContributedCost,
  costAccessUntil,
  emailsOptOut,
  userId,
  reportComparisons,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const promotedListingsEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PROMOTED_LISTINGS_ENABLED);
  const [typeFilter, setTypeFilter] = useState<ListingType | 'all'>('all');
  const [savedItems, setSavedItems] = useState(savedListings);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [myListings, setMyListings] = useState(listings);
  const [follows, setFollows] = useState(followedBuildings);
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);
  const [emailsOptedOut, setEmailsOptedOut] = useState(emailsOptOut);
  const [savingEmailPref, setSavingEmailPref] = useState(false);
  const [promoteListingId, setPromoteListingId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState(initialDisplayName ?? '');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(initialDisplayName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [lang, setLang] = useState(userLocale);
  const [savingLang, setSavingLang] = useState(false);
  // Deep links (?tab=costs|billing|…) now scroll to the matching section.
  const tabParam = searchParams.get('tab');

  const loadPayments = async () => {
    if (payments !== null || paymentsLoading) return;
    setPaymentsLoading(true);
    try {
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments ?? []);
      } else {
        setPayments([]);
      }
    } catch {
      setPayments([]);
    }
    setPaymentsLoading(false);
  };

  const openReceipt = async (paymentId: string) => {
    setReceiptLoadingId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}/receipt`);
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(t('dashboard.billing.receiptError'));
      }
    } catch {
      toast.error(t('dashboard.billing.receiptError'));
    }
    setReceiptLoadingId(null);
  };

  const queryToastFired = useRef(false);
  useEffect(() => {
    if (queryToastFired.current) return;
    const paid = searchParams.get('paid');
    const published = searchParams.get('published');

    if (paid === 'success') {
      toast.success(t('dashboard.statusProcessing'));
      queryToastFired.current = true;
    } else if (paid === 'cancel') {
      toast.info(t('dashboard.statusPendingPayment'));
      queryToastFired.current = true;
    } else if (published === 'success') {
      toast.success(t('listings.create.publishedTitle'));
      queryToastFired.current = true;
    }

    if (paid || published) {
      const url = new URL(window.location.href);
      url.searchParams.delete('paid');
      url.searchParams.delete('published');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, t]);

  useEffect(() => {
    // Sections are always visible now, so load billing on mount (external fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPayments();
    // Preserve deep links: scroll to the requested section.
    if (tabParam) {
      const id =
        tabParam === 'billing'
          ? 'section-billing'
          : tabParam === 'listings' || tabParam === 'saved'
            ? 'section-listings'
            : tabParam === 'follows'
              ? 'section-follows'
              : 'section-costs';
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the preferred language to the profile (drives email language) AND
  // switch the UI locale immediately. The header switcher stays session-only.
  const handleLanguageChange = async (newLocale: string) => {
    if (newLocale === lang) return;
    setLang(newLocale);
    setSavingLang(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: newLocale }),
      });
      if (res.ok) {
        toast.success(t('dashboard.account.saveSuccess'));
        router.replace(pathname, { locale: newLocale as 'en' | 'pl' | 'ru' | 'uk' });
      } else {
        setLang(userLocale);
        toast.error(t('dashboard.account.saveError'));
      }
    } catch {
      setLang(userLocale);
      toast.error(t('dashboard.account.saveError'));
    }
    setSavingLang(false);
  };

  // Re-subscribe / unsubscribe from re-engagement emails (the same global flag
  // the email unsubscribe link sets). Switch on = receive; off = opted out.
  const handleEmailNotifsToggle = async (receive: boolean) => {
    const optOut = !receive;
    setEmailsOptedOut(optOut);
    setSavingEmailPref(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailsOptOut: optOut }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success(receive ? t('dashboard.emailNotifsOn') : t('dashboard.emailNotifsOff'));
    } catch {
      setEmailsOptedOut(!optOut); // rollback
      toast.error(t('dashboard.account.saveError'));
    } finally {
      setSavingEmailPref(false);
    }
  };

  const handleRemoveFavorite = async (listingId: string) => {
    try {
      await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      });
      setSavedItems((prev) => prev.filter((item) => item.id !== listingId));
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    }
    setRemovingId(null);
  };

  const handleDeleteListing = async (id: string) => {
    try {
      const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMyListings((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete listing:', error);
    }
    setDeletingId(null);
  };

  const typeConfig: Record<ListingType, { label: string; className: string; icon: typeof Home }> = {
    replacement: {
      label: t('listings.types.replacement'),
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      icon: ArrowLeftRight,
    },
    roommate: {
      label: t('listings.types.roommate'),
      className: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
      icon: UserPlus,
    },
    sublet: {
      label: t('listings.types.sublet'),
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      icon: CalendarClock,
    },
  };

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: {
      label: t('dashboard.statusActive'),
      className: 'bg-green-500/10 text-green-600 border-green-500/20',
    },
    pending: {
      label: t('dashboard.statusPending'),
      className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    },
    pending_payment: {
      label: t('dashboard.statusPendingPayment'),
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    expired: {
      label: t('dashboard.statusExpired'),
      className: 'bg-muted text-muted-foreground',
    },
    closed: {
      label: t('dashboard.statusClosed'),
      className: 'bg-muted text-muted-foreground',
    },
  };

  const filteredListings =
    typeFilter === 'all' ? myListings : myListings.filter((l) => l.type === typeFilter);

  // Only worth showing the type filter when more than one type is actually present.
  const presentListingTypes = (['replacement', 'roommate', 'sublet'] as const).filter((type) =>
    myListings.some((l) => l.type === type),
  );

  const totalViews = myListings.reduce((sum, l) => sum + l.views, 0);
  const activeListings = myListings.filter((l) => l.status === 'active').length;
  // Derive the free-listings count from live state so it updates the moment a
  // listing is deleted/closed client-side (the server-passed value went stale).
  const freeListingsUsed = myListings.filter((l) => l.status === 'active' && !l.isPaid).length;
  const listingsCitySlug = myListings[0]?.citySlug ?? 'warsaw';

  // Data-access state — the value loop: contributing costs unlocks the data.
  const paidAccessActive = !!costAccessUntil && new Date(costAccessUntil) > new Date();
  const hasDataAccess = hasContributedCost || paidAccessActive;
  const accessCitySlug = reportComparisons[0]?.citySlug ?? 'warsaw';

  const handleUnfollow = async (buildingId: string) => {
    setUnfollowingId(buildingId);
    const prev = follows;
    setFollows((list) => list.filter((f) => f.buildingId !== buildingId));
    try {
      const res = await fetch(`/api/buildings/${buildingId}/follow`, { method: 'DELETE' });
      if (!res.ok) throw new Error('unfollow failed');
    } catch {
      setFollows(prev); // rollback
      toast.error(t('costs.building.followError'));
    } finally {
      setUnfollowingId(null);
    }
  };

  const stats = [
    {
      icon: Home,
      value: myListings.length,
      label: t('dashboard.totalListings'),
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      icon: TrendingUp,
      value: activeListings,
      label: t('dashboard.activeListings'),
      iconBg: 'bg-green-500/10',
      iconColor: 'text-green-600',
    },
    {
      icon: Eye,
      value: totalViews,
      label: t('dashboard.totalViews'),
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            <h1 className="text-2xl font-bold md:text-3xl">{t('dashboard.title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('dashboard.subtitle')}</p>
          </motion.div>

          {/* Section anchor nav — quick jump (the page is a long stack of sections). */}
          <nav className="mb-8 flex flex-wrap gap-2">
            {(
              [
                { id: 'section-costs', label: t('dashboard.costsSectionTitle') },
                { id: 'section-follows', label: t('dashboard.followsSectionTitle') },
                { id: 'section-listings', label: t('dashboard.listingsSectionTitle') },
                { id: 'section-billing', label: t('dashboard.paymentsSectionTitle') },
                { id: 'section-account', label: t('dashboard.account.sectionTitle') },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  document
                    .getElementById(s.id)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* SECTION: Costs — current priority, leads the dashboard. */}
          <motion.section
            id="section-costs"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-12 scroll-mt-24"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{t('dashboard.costsSectionTitle')}</h2>
              {reportComparisons.length > 0 && (
                <Button variant="outline" className="gap-2" asChild>
                  <Link href={`/${accessCitySlug}/costs/submit`}>
                    <Plus className="h-4 w-4" />
                    {t('dashboard.addCostReport')}
                  </Link>
                </Button>
              )}
            </div>

            {hasDataAccess && (
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('dashboard.accessOpenTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {paidAccessActive && !hasContributedCost
                        ? t('dashboard.accessPaidUntil', {
                            date: new Date(costAccessUntil!).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            }),
                          })
                        : t('dashboard.accessForever')}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 gap-2" asChild>
                  <Link href={`/${accessCitySlug}/costs`}>{t('dashboard.accessBrowse')}</Link>
                </Button>
              </div>
            )}

            {reportComparisons.length > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('dashboard.inviteCostsTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('dashboard.inviteCostsDesc')}
                    </p>
                  </div>
                </div>
                <ShareButton
                  path={`/${accessCitySlug}/costs`}
                  source="dashboard-costs"
                  refToken={userId}
                  label={t('dashboard.inviteCostsCta')}
                  variant="default"
                  className="shrink-0"
                />
              </div>
            )}

            {reportComparisons.length === 0 ? (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Receipt className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('dashboard.noCostReports')}</h3>
                  <p className="mt-1 max-w-md text-muted-foreground">
                    {t('dashboard.noCostReportsDesc')}
                  </p>
                  <Button size="lg" className="mt-6 gap-2" asChild>
                    <Link href={`/${accessCitySlug}/costs/submit`}>
                      <Plus className="h-4 w-4" />
                      {t('dashboard.addCostReport')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <CostReportsPanel reports={reportComparisons} userId={userId} />
            )}
          </motion.section>

          {/* SECTION: Followed buildings — the retention loop (email on new reports). */}
          <motion.section
            id="section-follows"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mb-12 scroll-mt-24"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold">{t('dashboard.followsSectionTitle')}</h2>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Switch
                  checked={!emailsOptedOut}
                  onCheckedChange={handleEmailNotifsToggle}
                  disabled={savingEmailPref}
                />
                <span className="text-muted-foreground">{t('dashboard.emailNotifsLabel')}</span>
              </label>
            </div>
            {follows.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <Bell className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">{t('dashboard.noFollows')}</h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {t('dashboard.noFollowsDesc')}
                  </p>
                  <Button variant="outline" className="mt-5" asChild>
                    <Link href={`/${accessCitySlug}/costs`}>{t('dashboard.accessBrowse')}</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {follows.map((f, i) => (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="transition-all duration-200 hover:border-primary/20 hover:shadow-md">
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <Link href={`/${f.citySlug}/building/${f.slug}`} className="min-w-0">
                          <p className="flex items-center gap-1 font-medium">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {f.address}
                          </p>
                          {f.district && (
                            <p className="mt-1 text-sm text-muted-foreground">{f.district}</p>
                          )}
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1.5"
                          disabled={unfollowingId === f.buildingId}
                          onClick={() => handleUnfollow(f.buildingId)}
                        >
                          {unfollowingId === f.buildingId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BellOff className="h-3.5 w-3.5" />
                          )}
                          {t('dashboard.unfollow')}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>

          {/* SECTION: Listings + saved (one ecosystem). */}
          <motion.section
            id="section-listings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-12 scroll-mt-24"
          >
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold">{t('dashboard.listingsSectionTitle')}</h2>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {t('dashboard.freeListingsUsed', { used: freeListingsUsed, limit: 2 })}
                </p>
                {/* When there are no listings yet, the empty-state card below is the
                    single add CTA — avoid a duplicate button in the header. */}
                {myListings.length > 0 && (
                  <Button variant="outline" className="gap-2" asChild>
                    <Link href="/create-listing">
                      <Plus className="h-4 w-4" />
                      {t('dashboard.addListing')}
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Supply-side virality: a friend looking for a roommate / lease
                takeover / sublet is the most natural listing author. Broad invite
                landing on the public listings page, carrying ?ref=. */}
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <UserPlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t('dashboard.inviteListingTitle')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('dashboard.inviteListingDesc')}
                  </p>
                </div>
              </div>
              <ShareButton
                path={`/${listingsCitySlug}/replacement`}
                source="dashboard-listing"
                refToken={userId}
                label={t('dashboard.inviteListingCta')}
                variant="default"
                className="shrink-0"
              />
            </div>

            {myListings.length > 0 && (
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                {stats.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    variants={statCardVariants}
                  >
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center gap-4 pt-6">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${stat.iconBg}`}
                        >
                          <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-2xl font-bold leading-tight">{stat.value}</p>
                          <p className="text-sm leading-tight text-muted-foreground">
                            {stat.label}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {myListings.length === 0 && savedItems.length === 0 ? (
              <Card className="border-dashed bg-muted/30">
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.noListingsCompact')}
                  </p>
                  <Button variant="outline" size="sm" className="shrink-0 gap-2" asChild>
                    <Link href="/create-listing">
                      <Plus className="h-4 w-4" />
                      {t('dashboard.addListing')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="my">
                <TabsList className="mb-2 h-11 w-full">
                  <TabsTrigger
                    value="my"
                    className="group gap-1.5 px-3 data-[state=active]:text-primary"
                  >
                    <Home className="h-4 w-4" />
                    {t('dashboard.myListings')}
                    {myListings.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">
                        {myListings.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="saved"
                    className="group gap-1.5 px-3 data-[state=active]:text-primary"
                  >
                    <Heart className="h-4 w-4" />
                    {t('dashboard.savedListings')}
                    {savedItems.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">
                        {savedItems.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="my" className="mt-6">
                  {presentListingTypes.length > 1 && (
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTypeFilter('all')}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          typeFilter === 'all'
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        }`}
                      >
                        {t('listings.filters.allTypes')}
                        <span className="opacity-70">{myListings.length}</span>
                      </button>
                      {presentListingTypes.map((type) => {
                        const count = myListings.filter((l) => l.type === type).length;
                        const TypeIcon = typeConfig[type].icon;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTypeFilter(type)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                              typeFilter === type
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                            }`}
                          >
                            <TypeIcon className="h-3.5 w-3.5" />
                            {typeConfig[type].label}
                            <span className="opacity-70">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {myListings.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center py-16 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <Home className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">{t('dashboard.noListings')}</h3>
                        <p className="mt-1 text-muted-foreground">
                          {t('dashboard.noListingsDesc')}
                        </p>
                        <Button className="mt-6 gap-2" asChild>
                          <Link href="/create-listing">
                            <Plus className="h-4 w-4" />
                            {t('dashboard.addListing')}
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {filteredListings.map((listing, i) => (
                        <motion.div
                          key={listing.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <Link
                            href={`/${listing.citySlug}/${listing.type}/${listing.slug}`}
                            className="block"
                          >
                            <Card className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20">
                              <CardContent className="p-4">
                                <div className="flex flex-col gap-4 sm:flex-row">
                                  <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:aspect-square sm:w-32">
                                    {listing.image ? (
                                      <Image
                                        src={listing.image}
                                        alt={listing.title}
                                        fill
                                        sizes="(max-width: 640px) 100vw, 128px"
                                        className="object-cover transition-transform duration-300 hover:scale-105"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-muted">
                                        <Home className="h-8 w-8 text-muted-foreground" />
                                      </div>
                                    )}
                                    {promotedListingsEnabled && listing.promoted && (
                                      <Badge className="absolute left-2 top-2 gap-1 bg-primary text-xs">
                                        <Sparkles className="h-3 w-3" />
                                        {t('common.promoted')}
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex flex-1 flex-col">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={
                                              (statusConfig[listing.status] ?? statusConfig.active)
                                                .className
                                            }
                                          >
                                            {
                                              (statusConfig[listing.status] ?? statusConfig.active)
                                                .label
                                            }
                                          </Badge>
                                          {listing.isPaid &&
                                            listing.status !== 'pending_payment' && (
                                              <Badge
                                                variant="outline"
                                                className="bg-blue-500/10 text-blue-600 border-blue-500/20"
                                              >
                                                {t('dashboard.paidBadge')}
                                              </Badge>
                                            )}
                                          <Badge
                                            variant="outline"
                                            className={typeConfig[listing.type].className}
                                          >
                                            {typeConfig[listing.type].label}
                                          </Badge>
                                        </div>
                                        <h3 className="mt-2 font-semibold">{listing.title}</h3>
                                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                          <MapPin className="h-3.5 w-3.5" />
                                          {listing.address}
                                          {listing.district && `, ${listing.district}`}
                                        </p>
                                      </div>

                                      <div onClick={(e) => e.preventDefault()}>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem asChild>
                                              <Link
                                                href={`/${listing.citySlug}/${listing.type}/${listing.slug}`}
                                              >
                                                <Eye className="mr-2 h-4 w-4" />
                                                {t('dashboard.viewListing')}
                                              </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem asChild>
                                              <Link href={`/create-listing?edit=${listing.id}`}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                {t('common.edit')}
                                              </Link>
                                            </DropdownMenuItem>
                                            {promotedListingsEnabled && (
                                              <DropdownMenuItem
                                                onClick={() => setPromoteListingId(listing.id)}
                                              >
                                                <Sparkles className="mr-2 h-4 w-4" />
                                                {t('dashboard.promote')}
                                              </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem
                                              className="text-destructive"
                                              onClick={() => setDeletingId(listing.id)}
                                            >
                                              <Trash2 className="mr-2 h-4 w-4" />
                                              {t('common.delete')}
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>

                                    <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
                                      <div className="flex gap-6 text-sm">
                                        <div className="flex items-center gap-1.5">
                                          <Eye className="h-4 w-4 text-muted-foreground" />
                                          <span>
                                            {t('dashboard.views', {
                                              count: listing.views,
                                            })}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                          <span>
                                            {t('dashboard.inquiriesCount', {
                                              count: listing.inquiries,
                                            })}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-4 w-4 text-muted-foreground" />
                                          <span>
                                            {new Date(listing.createdAt).toLocaleDateString(
                                              'en-GB',
                                              {
                                                day: 'numeric',
                                                month: 'short',
                                              },
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-lg font-bold text-primary">
                                        {listing.price.toLocaleString()} PLN
                                        <span className="text-sm font-normal text-muted-foreground">
                                          {listing.type === 'sublet' ? '' : t('common.perMonth')}
                                        </span>
                                      </p>
                                    </div>

                                    {listing.status === 'pending_payment' && (
                                      <div
                                        className="mt-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
                                        onClick={(e) => e.preventDefault()}
                                      >
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                            {t('dashboard.statusPendingPayment')}
                                          </p>
                                          <p className="text-xs text-amber-600 dark:text-amber-400">
                                            {t('dashboard.completePaymentHint')}
                                          </p>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={async () => {
                                            posthog?.capture('checkout_initiated', {
                                              productType: 'listing',
                                              listingId: listing.id,
                                              paidListing: true,
                                              promoteDays: 0,
                                              source: 'dashboard_complete_payment',
                                            });
                                            const res = await fetch('/api/checkout/listing', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                listingId: listing.id,
                                                paidListing: true,
                                                promoteDays: 0,
                                                locale,
                                              }),
                                            });
                                            if (res.ok) {
                                              const { url } = await res.json();
                                              if (url) window.location.href = url;
                                            }
                                          }}
                                        >
                                          {t('dashboard.completePayment')}
                                        </Button>
                                      </div>
                                    )}

                                    {promotedListingsEnabled &&
                                      listing.promoted &&
                                      listing.promotedUntil && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                          {t('dashboard.promotionEnds', {
                                            date: new Date(
                                              listing.promotedUntil,
                                            ).toLocaleDateString('en-GB', {
                                              day: 'numeric',
                                              month: 'long',
                                            }),
                                          })}
                                        </p>
                                      )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <AlertDialog
                  open={!!deletingId}
                  onOpenChange={(open) => !open && setDeletingId(null)}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('dashboard.confirmDeleteTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('dashboard.confirmDeleteDesc')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deletingId && handleDeleteListing(deletingId)}
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <TabsContent value="saved" className="mt-6">
                  {savedItems.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center py-16 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <Heart className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">{t('dashboard.noSavedListings')}</h3>
                        <p className="mt-1 text-muted-foreground">
                          {t('dashboard.noSavedListingsDesc')}
                        </p>
                        <Button className="mt-6 gap-2" asChild>
                          <Link href="/warsaw/replacement">{t('dashboard.browseListings')}</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <AnimatePresence>
                      <div className="space-y-4">
                        {savedItems.map((saved, i) => (
                          <motion.div
                            key={saved.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ delay: i * 0.05 }}
                          >
                            <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/20">
                              <CardContent className="p-4">
                                <div className="flex flex-col gap-4 sm:flex-row">
                                  <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:aspect-square sm:w-32">
                                    {saved.image ? (
                                      <Image
                                        src={saved.image}
                                        alt={saved.title}
                                        fill
                                        sizes="(max-width: 640px) 100vw, 128px"
                                        className="object-cover transition-transform duration-300 hover:scale-105"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-muted">
                                        <Home className="h-8 w-8 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-1 flex-col">
                                    <div>
                                      <Badge
                                        variant="outline"
                                        className={typeConfig[saved.type].className}
                                      >
                                        {typeConfig[saved.type].label}
                                      </Badge>
                                      <h3 className="mt-2 font-semibold">{saved.title}</h3>
                                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {saved.address}
                                        {saved.district && `, ${saved.district}`}
                                      </p>
                                    </div>

                                    <div className="mt-auto flex items-end justify-between pt-4">
                                      <p className="text-lg font-bold text-primary">
                                        {saved.price.toLocaleString()} PLN
                                        <span className="text-sm font-normal text-muted-foreground">
                                          {saved.type === 'sublet' ? '' : t('common.perMonth')}
                                        </span>
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" asChild>
                                          <Link href={`/warsaw/${saved.type}/${saved.id}`}>
                                            {t('dashboard.viewListing')}
                                          </Link>
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                          onClick={() => setRemovingId(saved.id)}
                                        >
                                          <Heart className="h-4 w-4 fill-current" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    </AnimatePresence>
                  )}

                  <AlertDialog
                    open={!!removingId}
                    onOpenChange={(open) => !open && setRemovingId(null)}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('favorites.removeFromFavorites')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('dashboard.confirmRemoveFavorite')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removingId && handleRemoveFavorite(removingId)}
                        >
                          {t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TabsContent>
              </Tabs>
            )}
          </motion.section>

          {/* SECTION: Payments. */}
          <motion.section
            id="section-billing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-12 scroll-mt-24"
          >
            <h2 className="mb-4 text-xl font-semibold">{t('dashboard.paymentsSectionTitle')}</h2>
            {paymentsLoading || payments === null ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : payments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <CreditCard className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('dashboard.billing.empty')}</h3>
                  <p className="mt-1 text-muted-foreground">{t('dashboard.billing.emptyDesc')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => {
                  const itemLabel =
                    p.productType === 'cost_access'
                      ? t('dashboard.billing.itemCostAccess')
                      : (p.reference ?? t('dashboard.billing.itemListing'));
                  const statusKey = `dashboard.billing.status.${p.status}`;
                  const statusLabel = t.has(statusKey) ? t(statusKey) : p.status;
                  const supportHref = `/contact?subject=general&message=${encodeURIComponent(
                    t('dashboard.billing.supportSubject', { ref: p.id }),
                  )}`;
                  return (
                    <Card key={p.id}>
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{itemLabel}</p>
                            <Badge
                              variant="outline"
                              className={
                                p.status === 'completed'
                                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                  : p.status === 'refunded'
                                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                    : 'bg-muted text-muted-foreground'
                              }
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {new Date(p.date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {' · '}
                            {(p.amount / 100).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            {p.currency.toUpperCase()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {p.hasReceipt && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={receiptLoadingId === p.id}
                              onClick={() => openReceipt(p.id)}
                            >
                              {receiptLoadingId === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Receipt className="h-3.5 w-3.5" />
                              )}
                              {t('dashboard.billing.viewReceipt')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                            <Link href={supportHref as '/'}>
                              <LifeBuoy className="h-3.5 w-3.5" />
                              {t('dashboard.billing.support')}
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </motion.section>

          <AlertDialog
            open={!!promoteListingId && !!promotedListingsEnabled}
            onOpenChange={(open) => !open && setPromoteListingId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  {t('listings.create.promoteTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>{t('listings.create.promoteDesc')}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2 sm:grid-cols-3 py-4">
                {([7, 14, 30] as const).map((days) => (
                  <Button
                    key={days}
                    variant="outline"
                    onClick={async () => {
                      if (!promoteListingId) return;
                      posthog?.capture('checkout_initiated', {
                        productType: 'listing',
                        listingId: promoteListingId,
                        paidListing: false,
                        promoteDays: days,
                        source: 'dashboard_promote',
                      });
                      const res = await fetch('/api/checkout/listing', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          listingId: promoteListingId,
                          paidListing: false,
                          promoteDays: days,
                          locale,
                        }),
                      });
                      if (res.ok) {
                        const { url } = await res.json();
                        if (url) window.location.href = url;
                      }
                      setPromoteListingId(null);
                    }}
                  >
                    {t(`listings.create.promote${days}days`)}
                  </Button>
                ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <motion.div
            id="section-account"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-12 scroll-mt-24"
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">{t('dashboard.account.sectionTitle')}</h2>
                </div>

                <Separator className="my-5" />

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('dashboard.account.displayNameLabel')}
                    </p>
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder={t('dashboard.account.displayNamePlaceholder')}
                          className="h-9 max-w-xs"
                          maxLength={100}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700"
                          disabled={nameSaving}
                          onClick={async () => {
                            const trimmed = nameInput.trim();
                            if (!trimmed || trimmed.length > 100) return;
                            setNameSaving(true);
                            try {
                              const res = await fetch('/api/account', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ displayName: trimmed }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setCurrentDisplayName(data.displayName);
                                setEditingName(false);
                                toast.success(t('dashboard.account.saveSuccess'));
                              } else {
                                toast.error(t('dashboard.account.saveError'));
                              }
                            } catch {
                              toast.error(t('dashboard.account.saveError'));
                            }
                            setNameSaving(false);
                          }}
                        >
                          {nameSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={nameSaving}
                          onClick={() => {
                            setNameInput(currentDisplayName);
                            setEditingName(false);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {currentDisplayName || (
                            <span className="italic font-normal text-muted-foreground">
                              {t('dashboard.account.displayNamePlaceholder')}
                            </span>
                          )}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setNameInput(currentDisplayName);
                            setEditingName(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('dashboard.account.emailLabel')}
                    </p>
                    <p className="text-sm font-medium">{userEmail}</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('dashboard.account.languageLabel')}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <select
                          value={lang}
                          disabled={savingLang}
                          onChange={(e) => handleLanguageChange(e.target.value)}
                          className="h-9 rounded-md border border-input bg-background pr-8 pl-9 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                        >
                          {LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {savingLang && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                <Separator className="my-5" />

                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <h3 className="text-sm font-semibold text-destructive">
                    {t('account.delete.title')}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('account.delete.warning')}
                  </p>
                  <div className="mt-3">
                    <DeleteAccountDialog userEmail={userEmail} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
