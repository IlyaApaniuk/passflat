'use client';

import { useState, useEffect, useRef } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
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
} from 'lucide-react';
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog';

type ListingType = 'replacement' | 'roommate' | 'sublet';

interface DashboardListing {
  id: string;
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

interface DashboardCostReport {
  id: string;
  address: string;
  citySlug: string;
  slug: string;
  district: string;
  total: number;
  status: 'flagged' | 'visible';
  periodicCount: number;
  createdAt: string;
}

interface Props {
  listings: DashboardListing[];
  savedListings: DashboardSavedListing[];
  costReports: DashboardCostReport[];
  userEmail: string;
  freeListingsUsed: number;
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
  costReports,
  userEmail,
  freeListingsUsed,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const promotedListingsEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PROMOTED_LISTINGS_ENABLED);
  const [typeFilter, setTypeFilter] = useState<ListingType | 'all'>('all');
  const [savedItems, setSavedItems] = useState(savedListings);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [myListings, setMyListings] = useState(listings);
  const [promoteListingId, setPromoteListingId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const initialTab = searchParams.get('tab') ?? 'listings';

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
    if (initialTab === 'billing') loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const totalViews = myListings.reduce((sum, l) => sum + l.views, 0);
  const activeListings = myListings.filter((l) => l.status === 'active').length;

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
            className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('dashboard.title')}</h1>
              <p className="mt-1 text-muted-foreground">{t('dashboard.subtitle')}</p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.freeListingsUsed', { used: freeListingsUsed, limit: 2 })}
              </p>
              <Button className="gap-2 transition-transform hover:scale-[1.02]" asChild>
                <Link href="/create-listing">
                  <Plus className="h-4 w-4" />
                  {t('dashboard.addListing')}
                </Link>
              </Button>
            </div>
          </motion.div>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={statCardVariants}
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 pt-6">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full ${stat.iconBg}`}
                    >
                      <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                    </div>
                    <div>
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        className="text-2xl font-bold"
                      >
                        {stat.value}
                      </motion.p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Tabs
              defaultValue={initialTab}
              onValueChange={(v) => {
                if (v === 'billing') loadPayments();
              }}
            >
              <TabsList className="w-full max-w-full justify-start overflow-x-auto">
                <TabsTrigger value="listings" className="shrink-0 gap-2">
                  <Home className="h-4 w-4" />
                  {t('dashboard.myListings')}
                </TabsTrigger>
                <TabsTrigger value="saved" className="shrink-0 gap-2">
                  <Heart className="h-4 w-4" />
                  {t('dashboard.savedListings')}
                  {savedItems.length > 0 && (
                    <span className="ml-1 text-xs opacity-70">{savedItems.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="costs" className="shrink-0 gap-2">
                  <Receipt className="h-4 w-4" />
                  {t('dashboard.costReportsTab')}
                  {costReports.length > 0 && (
                    <span className="ml-1 text-xs opacity-70">{costReports.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="billing" className="shrink-0 gap-2">
                  <CreditCard className="h-4 w-4" />
                  {t('dashboard.billing.title')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="listings" className="mt-6">
                {myListings.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button
                      variant={typeFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('all')}
                    >
                      {t('listings.filters.allTypes')}
                      <span className="ml-1.5 text-xs opacity-70">{myListings.length}</span>
                    </Button>
                    {(['replacement', 'roommate', 'sublet'] as const).map((type) => {
                      const count = myListings.filter((l) => l.type === type).length;
                      if (count === 0) return null;
                      const TypeIcon = typeConfig[type].icon;
                      return (
                        <Button
                          key={type}
                          variant={typeFilter === type ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTypeFilter(type)}
                          className="gap-1.5"
                        >
                          <TypeIcon className="h-3.5 w-3.5" />
                          {typeConfig[type].label}
                          <span className="ml-1 text-xs opacity-70">{count}</span>
                        </Button>
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
                      <p className="mt-1 text-muted-foreground">{t('dashboard.noListingsDesc')}</p>
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
                          href={`/${listing.citySlug}/${listing.type}/${listing.id}`}
                          className="block"
                        >
                          <Card className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20">
                            <CardContent className="p-4">
                              <div className="flex flex-col gap-4 sm:flex-row">
                                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:aspect-square sm:w-32">
                                  {listing.image ? (
                                    <img
                                      src={listing.image}
                                      alt={listing.title}
                                      loading="lazy"
                                      decoding="async"
                                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
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
                                        {listing.isPaid && listing.status !== 'pending_payment' && (
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
                                              href={`/${listing.citySlug}/${listing.type}/${listing.id}`}
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
                                          {new Date(listing.createdAt).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short',
                                          })}
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
                                          date: new Date(listing.promotedUntil).toLocaleDateString(
                                            'en-GB',
                                            {
                                              day: 'numeric',
                                              month: 'long',
                                            },
                                          ),
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
                                    <img
                                      src={saved.image}
                                      alt={saved.title}
                                      loading="lazy"
                                      decoding="async"
                                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
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

              <TabsContent value="costs" className="mt-6">
                {costReports.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-16 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Receipt className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">{t('dashboard.noCostReports')}</h3>
                      <p className="mt-1 text-muted-foreground">
                        {t('dashboard.noCostReportsDesc')}
                      </p>
                      <Button className="mt-6 gap-2" asChild>
                        <Link href="/warsaw/costs/submit">
                          <Plus className="h-4 w-4" />
                          {t('dashboard.addCostReport')}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button className="gap-2" asChild>
                        <Link href={`/${costReports[0]?.citySlug ?? 'warsaw'}/costs/submit`}>
                          <Plus className="h-4 w-4" />
                          {t('dashboard.addCostReport')}
                        </Link>
                      </Button>
                    </div>
                    {costReports.map((r, i) => (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Link href={`/${r.citySlug}/building/${r.slug}`} className="block">
                          <Card className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20">
                            <CardContent className="p-4">
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <Badge
                                    variant="outline"
                                    className={
                                      r.status === 'flagged'
                                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                        : statusConfig.active.className
                                    }
                                  >
                                    {r.status === 'flagged'
                                      ? t('dashboard.costReportFlagged')
                                      : t('dashboard.costReportVisible')}
                                  </Badge>
                                  <p className="mt-2 flex items-center gap-1 font-medium">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    {r.address}
                                  </p>
                                  {r.district && (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {r.district}
                                    </p>
                                  )}
                                  {r.periodicCount > 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {t('costs.building.periodic')} · {r.periodicCount}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-start gap-2 sm:items-end">
                                  <p className="text-lg font-bold text-primary">
                                    {r.total.toLocaleString()} PLN
                                    <span className="text-sm font-normal text-muted-foreground">
                                      {t('common.perMonth')}
                                    </span>
                                  </p>
                                  <div
                                    className="flex items-center gap-2"
                                    onClick={(e) => e.preventDefault()}
                                  >
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1.5"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        router.push(
                                          `/${r.citySlug}/costs/submit?edit=true&id=${r.id}`,
                                        );
                                      }}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                      {t('common.edit')}
                                    </Button>
                                  </div>
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

              <TabsContent value="billing" className="mt-6">
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
                      <p className="mt-1 text-muted-foreground">
                        {t('dashboard.billing.emptyDesc')}
                      </p>
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
              </TabsContent>
            </Tabs>
          </motion.div>

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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-16 border-t pt-8"
          >
            <h2 className="text-lg font-semibold text-destructive">{t('account.delete.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('account.delete.warning')}</p>
            <div className="mt-4">
              <DeleteAccountDialog userEmail={userEmail} />
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
