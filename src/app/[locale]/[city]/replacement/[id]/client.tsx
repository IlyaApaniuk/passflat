'use client';

import { useState, useEffect, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Link, useRouter } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { PhotoGallery } from '@/components/listings/photo-gallery';
import { InterestModal } from '@/components/listings/interest-modal';
import { FavoriteButton } from '@/components/listings/favorite-button';
import { ReportButton } from '@/components/listings/report-button';
import { TranslateButton } from '@/components/listings/translate-button';
import { TemplateDownload } from '@/components/documents/template-download';
import { LocationScore } from '@/components/listings/location-score';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import { useFavorites } from '@/hooks/use-favorites';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  ArrowLeft,
  MapPin,
  Bed,
  Maximize2,
  Building2,
  Calendar,
  CalendarRange,
  Share2,
  Sparkles,
  CheckCircle,
  Info,
  FileText,
  Users,
  Wifi,
  Zap as ZapIcon,
  MessageSquare,
  Edit,
  Trash2,
} from 'lucide-react';
import type { ListingType } from '@/lib/listings-data';
import { AMENITY_CATEGORIES, getThingsToKnowSentiment } from '@/lib/amenities';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: 'easeOut' as const },
  }),
};

const TYPE_BADGE_STYLES: Record<ListingType, string> = {
  replacement: 'bg-blue-500/90 text-white',
  roommate: 'bg-violet-500/90 text-white',
  sublet: 'bg-amber-500/90 text-white',
};

const TYPE_ROUTE: Record<ListingType, string> = {
  replacement: 'replacement',
  roommate: 'roommate',
  sublet: 'sublet',
};

export interface ListingDetailData {
  id: string;
  type: ListingType;
  title: string;
  address: string;
  district: string;
  districtSlug: string;
  citySlug: string;
  buildingId: string;
  buildingSlug: string;
  buildingHasCosts: boolean;
  price: number;
  adminFee: number;
  utilities: number;
  totalCost: number;
  bedrooms: number;
  area: number;
  floor: number;
  totalFloors: number;
  images: string[];
  lat: number;
  lng: number;
  promoted: boolean;
  availableFrom: string;
  features: string[];
  thingsToKnow: string[];
  registrationPossible?: boolean;
  description: string;
  locale: string | null;
  createdAt: string;
  author: string | null;
  // Roommate-specific
  pricePerPerson?: number;
  totalApartmentRent?: number;
  currentRoommates?: number;
  totalRooms?: number;
  roomType?: 'private' | 'shared';
  preferredGender?: 'any' | 'male' | 'female';
  preferredAgeMin?: number;
  preferredAgeMax?: number;
  roommateDescription?: string;
  // Sublet-specific
  availableTo?: string;
  priceTotal?: number;
  durationDays?: number;
  utilitiesIncluded?: boolean;
  internetIncluded?: boolean;
  subletRules?: string;
  depositAmount?: number;
  // Flexible recurring charges (replacement + sublet)
  periodicCharges?: {
    id: string;
    category: string;
    amount: number;
    frequency: string;
    note?: string;
    monthlyEquivalent: number;
  }[];
}

const PERIODIC_CATEGORY_LABEL_KEY: Record<string, string> = {
  water: 'catWater',
  electricity: 'catElectricity',
  gas: 'catGas',
  heating: 'catHeating',
  other: 'catOther',
};

const PERIODIC_FREQUENCY_LABEL_KEY: Record<string, string> = {
  bimonthly: 'freqBimonthly',
  quarterly: 'freqQuarterly',
  semiannual: 'freqSemiannual',
  annual: 'freqAnnual',
};

interface Props {
  listing: ListingDetailData;
  isLoggedIn: boolean;
  isOwner?: boolean;
}

interface TranslatedFields {
  title: string | null;
  description: string | null;
  roommateDescription: string | null;
  subletRules: string | null;
}

/** One key fact in the hero band: muted icon + bold value over a small label. */
function HeroFact({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

export function ListingDetailClient({ listing, isLoggedIn, isOwner = false }: Props) {
  const t = useTranslations();
  const currentLocale = useLocale();
  const posthog = usePostHog();
  const router = useRouter();
  const [interestModalOpen, setInterestModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [translated, setTranslated] = useState<TranslatedFields | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites(isLoggedIn);
  const listingType = listing.type ?? 'replacement';
  const backRoute = TYPE_ROUTE[listingType];

  const showTranslateButton =
    !isOwner && listing.locale !== null && listing.locale !== currentLocale;

  const displayTitle = showTranslated && translated?.title ? translated.title : listing.title;
  const displayDescription =
    showTranslated && translated?.description ? translated.description : listing.description;
  const displayRoommateDescription =
    showTranslated && translated?.roommateDescription
      ? translated.roommateDescription
      : listing.roommateDescription;
  const displaySubletRules =
    showTranslated && translated?.subletRules ? translated.subletRules : listing.subletRules;

  const handleDeleteListing = async () => {
    try {
      const res = await fetch(`/api/listings/${listing.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('dashboard.listingDeleted'));
        router.push('/dashboard');
      } else {
        toast.error(t('common.error'));
      }
    } catch {
      toast.error(t('common.error'));
    }
    setDeleteDialogOpen(false);
  };

  useEffect(() => {
    posthog?.capture('listing_detail_viewed', {
      listing_id: listing.id,
      type: listingType,
      city: listing.citySlug,
      source:
        document.referrer.includes('/replacement') ||
        document.referrer.includes('/roommate') ||
        document.referrer.includes('/sublet')
          ? 'search'
          : 'direct',
    });
  }, [listing.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hero price band: headline figure + label per listing type.
  const heroPriceValue =
    listingType === 'roommate'
      ? (listing.pricePerPerson ?? listing.totalCost)
      : listingType === 'sublet'
        ? (listing.priceTotal ?? listing.totalCost)
        : listing.totalCost;
  const heroPriceLabel =
    listingType === 'roommate'
      ? t('listings.detail.pricePerPerson')
      : listingType === 'sublet'
        ? t('listings.detail.totalPrice')
        : t('listings.detail.monthlyCosts');
  const heroAvailability =
    listingType === 'sublet' && listing.availableFrom && listing.availableTo
      ? `${new Date(listing.availableFrom).toLocaleDateString(currentLocale, {
          day: 'numeric',
          month: 'short',
        })} – ${new Date(listing.availableTo).toLocaleDateString(currentLocale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`
      : listing.availableFrom
        ? `${t('listings.create.availableFrom')} ${new Date(
            listing.availableFrom,
          ).toLocaleDateString(currentLocale, { day: 'numeric', month: 'long', year: 'numeric' })}`
        : null;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pt-24">
        <div className="container mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4"
          >
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link href={`/${listing.citySlug}/${backRoute}`}>
                <ArrowLeft className="h-4 w-4" />
                {t('listings.detail.backToListings')}
              </Link>
            </Button>
          </motion.div>

          {listing.images.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <PhotoGallery images={listing.images} title={listing.title} />
            </motion.div>
          )}

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                <Card className="overflow-hidden gap-0 py-0">
                  <div className="px-6 pb-5 pt-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {listing.promoted && (
                          <Badge className="gap-1 bg-primary">
                            <Sparkles className="h-3 w-3" />
                            {t('common.promoted')}
                          </Badge>
                        )}
                        {listingType !== 'replacement' && (
                          <Badge className={`border-0 ${TYPE_BADGE_STYLES[listingType]}`}>
                            {t(`listings.types.${listingType}`)}
                          </Badge>
                        )}
                        {listing.district && <Badge variant="secondary">{listing.district}</Badge>}
                      </div>
                      <h1 className="mt-2 text-2xl font-bold md:text-3xl">{displayTitle}</h1>
                      <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span>
                          {listing.buildingHasCosts ? (
                            <Link
                              href={`/${listing.citySlug}/building/${listing.buildingSlug}`}
                              className="font-medium underline-offset-2 hover:text-primary hover:underline"
                            >
                              {listing.address}
                            </Link>
                          ) : (
                            listing.address
                          )}
                          {listing.district && (
                            <>
                              {', '}
                              {listing.districtSlug ? (
                                <Link
                                  href={`/${listing.citySlug}/${listing.districtSlug}`}
                                  className="font-medium underline-offset-2 hover:text-primary hover:underline"
                                >
                                  {listing.district}
                                </Link>
                              ) : (
                                listing.district
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {listing.author && (
                            <>{t('listings.detail.postedBy', { name: listing.author })} · </>
                          )}
                          {new Date(listing.createdAt).toLocaleDateString(currentLocale, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      {showTranslateButton ? (
                        <TranslateButton
                          listingId={listing.id}
                          listingLocale={listing.locale}
                          isTranslated={showTranslated}
                          onTranslated={(fields) => {
                            setTranslated(fields);
                            setShowTranslated(true);
                          }}
                          onShowOriginal={() => setShowTranslated(false)}
                        />
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="transition-transform hover:scale-105"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(window.location.href);
                              toast.success(t('common.linkCopied'));
                            } catch {
                              toast.error(t('common.copyFailed'));
                            }
                          }}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <FavoriteButton
                          isFavorite={isFavorite(listing.id)}
                          onToggle={() => toggleFavorite(listing.id)}
                        />
                        {!isOwner && (
                          <ReportButton
                            targetType="listing"
                            targetId={listing.id}
                            isLoggedIn={isLoggedIn}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t bg-gradient-to-br from-primary/5 to-transparent px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {heroPriceValue > 0 && (
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-primary md:text-3xl">
                              {heroPriceValue.toLocaleString()} PLN
                            </span>
                            {listingType !== 'sublet' && (
                              <span className="text-sm text-muted-foreground">
                                {t('common.perMonth')}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{heroPriceLabel}</span>
                        </div>
                      )}
                      {heroAvailability && (
                        <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                          <Calendar className="h-4 w-4 shrink-0" />
                          {heroAvailability}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                      {listing.bedrooms > 0 && (
                        <HeroFact
                          icon={Bed}
                          value={listing.bedrooms}
                          label={
                            listingType === 'roommate'
                              ? t('listings.detail.totalRooms')
                              : t('listings.detail.bedrooms')
                          }
                        />
                      )}
                      {listing.area > 0 && (
                        <HeroFact
                          icon={Maximize2}
                          value={`${listing.area} m²`}
                          label={t('listings.detail.area')}
                        />
                      )}
                      {listing.floor > 0 && (
                        <HeroFact
                          icon={Building2}
                          value={listing.floor}
                          label={t('listings.detail.floor')}
                        />
                      )}
                      {listingType === 'roommate' && listing.roomType && (
                        <HeroFact
                          icon={Users}
                          value={
                            listing.roomType === 'private'
                              ? t('listings.card.privateRoom')
                              : t('listings.card.sharedRoom')
                          }
                          label={t('listings.detail.roomType')}
                        />
                      )}
                    </div>

                    {listingType === 'sublet' &&
                      (listing.utilitiesIncluded || listing.internetIncluded) && (
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                          {listing.utilitiesIncluded && (
                            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                              <ZapIcon className="h-4 w-4" />
                              {t('listings.detail.utilitiesIncluded')}
                            </span>
                          )}
                          {listing.internetIncluded && (
                            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                              <Wifi className="h-4 w-4" />
                              {t('listings.detail.internetIncluded')}
                            </span>
                          )}
                        </div>
                      )}
                  </div>
                </Card>
              </motion.div>

              {(displayDescription ||
                listing.features.length > 0 ||
                listing.thingsToKnow?.length > 0) && (
                <motion.div
                  custom={2}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <Card className="transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FileText className="h-5 w-5" />
                        {listingType === 'roommate'
                          ? t('listings.detail.aboutRoom')
                          : listingType === 'sublet'
                            ? t('listings.detail.aboutSublet')
                            : t('listings.detail.aboutApartment')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {displayDescription && (
                        <p className="leading-relaxed text-muted-foreground">
                          {displayDescription}
                        </p>
                      )}

                      {listing.features.length > 0 && (
                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                            {t('listings.detail.featuresAmenities')}
                          </h3>
                          {listing.registrationPossible && (
                            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                              <CheckCircle className="h-4 w-4" />
                              {t('listings.registrationPossible')}
                            </div>
                          )}
                          <div className="space-y-4">
                            {AMENITY_CATEGORIES.map((category) => {
                              const matched = category.items.filter((item) =>
                                listing.features.includes(item),
                              );
                              if (matched.length === 0) return null;
                              return (
                                <div key={category.categoryKey}>
                                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                                    {t(category.categoryKey)}
                                  </p>
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {matched.map((feature, i) => (
                                      <motion.div
                                        key={feature}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 + i * 0.03 }}
                                        className="flex items-center gap-2"
                                      >
                                        <CheckCircle className="h-4 w-4 text-primary" />
                                        <span className="text-sm">
                                          {t(`listings.features.${feature}`)}
                                        </span>
                                      </motion.div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {listing.thingsToKnow?.length > 0 && (
                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                            <Info className="h-4 w-4 text-muted-foreground" />
                            {t('listings.detail.thingsToKnow')}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {listing.thingsToKnow.map((key, i) => {
                              const sentiment = getThingsToKnowSentiment(key);
                              return (
                                <motion.span
                                  key={key}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.4 + i * 0.03 }}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                                    sentiment === 'good'
                                      ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {t(`listings.thingsToKnow.${key}`)}
                                </motion.span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="border-t pt-4">
                        <Button variant="link" className="h-auto gap-2 p-0 text-primary" asChild>
                          <Link href={`/${listing.citySlug}/building/${listing.buildingSlug}`}>
                            <Building2 className="h-4 w-4" />
                            {t('listings.detail.viewBuildingCosts')}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {listingType === 'roommate' && (
                <motion.div
                  custom={3.5}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5" />
                        {t('listings.detail.roommateInfo')}
                        {listing.currentRoommates != null && (
                          <span className="font-normal text-muted-foreground">
                            · {listing.currentRoommates}
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Room count, room type and the flatmate count are shown in the
                          hero key-facts band / this card's title — not repeated here. */}
                      {listing.preferredGender && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {t('listings.detail.preferredGender')}
                          </span>
                          <span className="font-medium">
                            {t(`listings.detail.gender_${listing.preferredGender}`)}
                          </span>
                        </div>
                      )}
                      {(listing.preferredAgeMin != null || listing.preferredAgeMax != null) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {t('listings.detail.preferredAge')}
                          </span>
                          <span className="font-medium">
                            {listing.preferredAgeMin != null && listing.preferredAgeMax != null
                              ? `${listing.preferredAgeMin} – ${listing.preferredAgeMax}`
                              : listing.preferredAgeMax != null
                                ? `${t('listings.detail.ageUpTo')} ${listing.preferredAgeMax}`
                                : `${t('listings.detail.ageFrom')} ${listing.preferredAgeMin}`}
                          </span>
                        </div>
                      )}
                      {displayRoommateDescription &&
                        displayRoommateDescription !== displayDescription && (
                          <div className="mt-2 rounded-lg bg-muted/50 p-3">
                            <p className="text-sm text-muted-foreground">
                              {displayRoommateDescription}
                            </p>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {listingType === 'sublet' && (
                <motion.div
                  custom={3.5}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CalendarRange className="h-5 w-5" />
                        {t('listings.detail.subletInfo')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {listing.availableFrom && listing.availableTo && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {t('listings.detail.subletPeriod')}
                          </span>
                          <span className="font-medium">
                            {new Date(listing.availableFrom).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                            {' – '}
                            {new Date(listing.availableTo).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      )}
                      {listing.durationDays != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {t('listings.detail.duration')}
                          </span>
                          <span className="font-medium">
                            {t('listings.detail.daysCount', { count: listing.durationDays })}
                          </span>
                        </div>
                      )}
                      {listing.utilitiesIncluded != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <ZapIcon className="h-3.5 w-3.5" />
                            {t('listings.detail.utilitiesIncluded')}
                          </span>
                          <span className="font-medium">
                            {listing.utilitiesIncluded ? t('common.yes') : t('common.no')}
                          </span>
                        </div>
                      )}
                      {listing.internetIncluded != null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Wifi className="h-3.5 w-3.5" />
                            {t('listings.detail.internetIncluded')}
                          </span>
                          <span className="font-medium">
                            {listing.internetIncluded ? t('common.yes') : t('common.no')}
                          </span>
                        </div>
                      )}
                      {displaySubletRules && (
                        <div className="mt-2 rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            {t('listings.detail.houseRules')}
                          </p>
                          <p className="text-sm">{displaySubletRules}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {isDocumentTemplatesEnabled() && (
                <motion.div
                  custom={5}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-8"
                >
                  <TemplateDownload listingType={listingType} source="listing" showDescription />
                </motion.div>
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:sticky lg:top-24 lg:self-start"
            >
              <Card className="overflow-hidden shadow-lg">
                <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
                  <CardTitle className="text-lg">
                    {listingType === 'sublet'
                      ? t('listings.detail.subletCosts')
                      : listingType === 'roommate'
                        ? t('listings.detail.costPerPerson')
                        : t('listings.detail.monthlyCosts')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {listingType === 'sublet' ? (
                      <>
                        <div className="flex items-center justify-between bg-primary/5 px-6 py-4">
                          <span className="font-semibold">
                            {listing.durationDays
                              ? t('listings.card.forDays', { days: listing.durationDays })
                              : t('listings.detail.totalPrice')}
                          </span>
                          <span className="text-xl font-bold text-primary">
                            {(listing.priceTotal ?? listing.totalCost).toLocaleString()} PLN
                          </span>
                        </div>
                        {listing.durationDays && listing.priceTotal ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t('listings.detail.perDay')}
                            </span>
                            <span className="font-medium">
                              ~
                              {Math.round(
                                listing.priceTotal / listing.durationDays,
                              ).toLocaleString()}{' '}
                              PLN
                            </span>
                          </div>
                        ) : null}
                        {listing.depositAmount ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t('listings.detail.deposit')}
                            </span>
                            <span className="font-medium">
                              {listing.depositAmount.toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : listingType === 'roommate' ? (
                      <>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">
                            {t('listings.detail.pricePerPerson')}
                          </span>
                          <span className="font-medium">
                            {(listing.pricePerPerson ?? listing.totalCost).toLocaleString()} PLN
                          </span>
                        </div>
                        {listing.totalApartmentRent ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t('listings.detail.totalApartmentRent')}
                            </span>
                            <span className="font-medium">
                              {listing.totalApartmentRent.toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                        {listing.depositAmount ? (
                          <div className="flex items-center justify-between px-6 py-3">
                            <span className="text-muted-foreground">
                              {t('listings.detail.deposit')}
                            </span>
                            <span className="font-medium">
                              {listing.depositAmount.toLocaleString()} PLN
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between bg-primary/5 px-6 py-4">
                          <span className="font-semibold">{t('listings.detail.yourShare')}</span>
                          <span className="text-xl font-bold text-primary">
                            ~{(listing.pricePerPerson ?? listing.totalCost).toLocaleString()} PLN
                            {t('common.perMonth')}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">{t('common.rent')}</span>
                          <span className="font-medium">{listing.price.toLocaleString()} PLN</span>
                        </div>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">{t('common.adminFee')}</span>
                          <span className="font-medium">
                            {listing.adminFee.toLocaleString()} PLN
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-6 py-3">
                          <span className="text-muted-foreground">{t('common.utilitiesAvg')}</span>
                          <span className="font-medium">
                            ~{listing.utilities.toLocaleString()} PLN
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-primary/5 px-6 py-4">
                          <span className="font-semibold">{t('common.totalMonthly')}</span>
                          <span className="text-xl font-bold text-primary">
                            ~{listing.totalCost.toLocaleString()} PLN
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  {listingType !== 'roommate' &&
                    listing.periodicCharges &&
                    listing.periodicCharges.length > 0 && (
                      <div className="border-t px-6 py-4">
                        <p className="mb-2 text-sm font-medium text-muted-foreground">
                          {t('costs.submit.periodicSectionTitle')}
                        </p>
                        <div className="space-y-2">
                          {listing.periodicCharges.map((charge) => (
                            <div
                              key={charge.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                {t(
                                  `costs.submit.${PERIODIC_CATEGORY_LABEL_KEY[charge.category] ?? 'catOther'}`,
                                )}
                                {charge.note ? ` · ${charge.note}` : ''}
                                <span className="ml-1 text-xs">
                                  (
                                  {t(
                                    `costs.submit.${PERIODIC_FREQUENCY_LABEL_KEY[charge.frequency] ?? 'freqAnnual'}`,
                                  )}
                                  )
                                </span>
                              </span>
                              <span className="text-right font-medium">
                                {charge.amount.toLocaleString()} PLN
                                <span className="ml-1 block text-xs font-normal text-muted-foreground">
                                  ≈ {charge.monthlyEquivalent.toLocaleString()} PLN/
                                  {t('costs.submit.periodicPerMonth')}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>

              <div className="mt-4">
                <LocationScore buildingId={listing.buildingId} />
              </div>

              {isOwner ? (
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    size="lg"
                    className="w-full gap-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    asChild
                  >
                    <Link href={`/create-listing?edit=${listing.id}`}>
                      <Edit className="h-4 w-4" />
                      {t('listings.detail.editListing')}
                    </Link>
                  </Button>
                  {!listing.promoted && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full gap-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('listings.detail.promoteListing')}
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('listings.detail.deleteListing')}
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="mt-4 w-full gap-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => {
                      setInterestModalOpen(true);
                      posthog?.capture('interest_modal_opened', {
                        listing_id: listing.id,
                        type: listingType,
                      });
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {listingType === 'roommate'
                      ? t('listings.detail.imInterestedRoom')
                      : listingType === 'sublet'
                        ? t('listings.detail.imInterestedSublet')
                        : t('listings.detail.imInterested')}
                  </Button>

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {listingType === 'roommate'
                      ? t('listings.detail.contactHintRoommate')
                      : listingType === 'sublet'
                        ? t('listings.detail.contactHintSublet')
                        : t('listings.detail.contactHint')}
                  </p>
                </>
              )}
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />

      {!isOwner && (
        <InterestModal
          open={interestModalOpen}
          onOpenChange={setInterestModalOpen}
          listingTitle={listing.title}
          listingId={listing.id}
          isLoggedIn={isLoggedIn}
        />
      )}

      {isOwner && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('dashboard.confirmDeleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('dashboard.confirmDeleteDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteListing}
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
