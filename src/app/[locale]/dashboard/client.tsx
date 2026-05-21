"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Users,
  ArrowLeftRight,
  UserPlus,
  CalendarClock,
} from "lucide-react";

type ListingType = "replacement" | "roommate" | "sublet";

interface DashboardListing {
  id: string;
  title: string;
  type: ListingType;
  address: string;
  district: string;
  price: number;
  status: "active" | "pending" | "expired" | "closed";
  promoted: boolean;
  promotedUntil: string | null;
  views: number;
  inquiries: number;
  image: string | null;
  createdAt: string;
}

interface DashboardInquiry {
  id: string;
  listingId: string;
  listingTitle: string;
  listingType: ListingType;
  from: string;
  message: string;
  date: string;
  status: string;
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

interface Props {
  listings: DashboardListing[];
  inquiries: DashboardInquiry[];
  savedListings: DashboardSavedListing[];
}

const statCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export function DashboardClient({ listings, inquiries, savedListings }: Props) {
  const t = useTranslations();
  const [typeFilter, setTypeFilter] = useState<ListingType | "all">("all");

  const typeConfig: Record<ListingType, { label: string; className: string; icon: typeof Home }> = {
    replacement: {
      label: t("listings.types.replacement"),
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      icon: ArrowLeftRight,
    },
    roommate: {
      label: t("listings.types.roommate"),
      className: "bg-violet-500/10 text-violet-600 border-violet-500/20",
      icon: UserPlus,
    },
    sublet: {
      label: t("listings.types.sublet"),
      className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      icon: CalendarClock,
    },
  };

  const statusConfig = {
    active: {
      label: t("dashboard.statusActive"),
      className: "bg-green-500/10 text-green-600 border-green-500/20",
    },
    pending: {
      label: t("dashboard.statusPending"),
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    },
    expired: {
      label: t("dashboard.statusExpired"),
      className: "bg-muted text-muted-foreground",
    },
    closed: {
      label: t("dashboard.statusClosed"),
      className: "bg-muted text-muted-foreground",
    },
  };

  const filteredListings = typeFilter === "all"
    ? listings
    : listings.filter((l) => l.type === typeFilter);

  const totalViews = listings.reduce((sum, l) => sum + l.views, 0);
  const totalInquiries = listings.reduce((sum, l) => sum + l.inquiries, 0);
  const activeListings = listings.filter((l) => l.status === "active").length;
  const unreadInquiries = inquiries.filter((i) => i.status === "pending").length;

  const stats = [
    {
      icon: Home,
      value: listings.length,
      label: t("dashboard.totalListings"),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      icon: TrendingUp,
      value: activeListings,
      label: t("dashboard.activeListings"),
      iconBg: "bg-green-500/10",
      iconColor: "text-green-600",
    },
    {
      icon: Eye,
      value: totalViews,
      label: t("dashboard.totalViews"),
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
    },
    {
      icon: Users,
      value: totalInquiries,
      label: t("dashboard.inquiries"),
      iconBg: "bg-accent/20",
      iconColor: "text-accent-foreground",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30 pt-20">
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">
                {t("dashboard.title")}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {t("dashboard.subtitle")}
              </p>
            </div>
            <Button className="gap-2 transition-transform hover:scale-[1.02]" asChild>
              <Link href="/create-listing">
                <Plus className="h-4 w-4" />
                {t("dashboard.addListing")}
              </Link>
            </Button>
          </motion.div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full ${stat.iconBg}`}>
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
                      <p className="text-sm text-muted-foreground">
                        {stat.label}
                      </p>
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
            <Tabs defaultValue="listings">
              <TabsList>
                <TabsTrigger value="listings" className="gap-2">
                  <Home className="h-4 w-4" />
                  {t("dashboard.myListings")}
                </TabsTrigger>
                <TabsTrigger value="inquiries" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {t("dashboard.inquiries")}
                  {unreadInquiries > 0 && (
                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                      {unreadInquiries}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="saved" className="gap-2">
                  <Heart className="h-4 w-4" />
                  {t("dashboard.savedListings")}
                  {savedListings.length > 0 && (
                    <span className="ml-1 text-xs opacity-70">
                      {savedListings.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="listings" className="mt-6">
                {listings.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button
                      variant={typeFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTypeFilter("all")}
                    >
                      {t("listings.filters.allTypes")}
                      <span className="ml-1.5 text-xs opacity-70">
                        {listings.length}
                      </span>
                    </Button>
                    {(["replacement", "roommate", "sublet"] as const).map((type) => {
                      const count = listings.filter((l) => l.type === type).length;
                      if (count === 0) return null;
                      const TypeIcon = typeConfig[type].icon;
                      return (
                        <Button
                          key={type}
                          variant={typeFilter === type ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTypeFilter(type)}
                          className="gap-1.5"
                        >
                          <TypeIcon className="h-3.5 w-3.5" />
                          {typeConfig[type].label}
                          <span className="ml-1 text-xs opacity-70">
                            {count}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                )}

                {listings.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-16 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Home className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">
                        {t("dashboard.noListings")}
                      </h3>
                      <p className="mt-1 text-muted-foreground">
                        {t("dashboard.noListingsDesc")}
                      </p>
                      <Button className="mt-6 gap-2" asChild>
                        <Link href="/create-listing">
                          <Plus className="h-4 w-4" />
                          {t("dashboard.addListing")}
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
                        <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/20">
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-4 sm:flex-row">
                              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:aspect-square sm:w-32">
                                {listing.image ? (
                                  <img
                                    src={listing.image}
                                    alt={listing.title}
                                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-muted">
                                    <Home className="h-8 w-8 text-muted-foreground" />
                                  </div>
                                )}
                                {listing.promoted && (
                                  <Badge className="absolute left-2 top-2 gap-1 bg-primary text-xs">
                                    <Sparkles className="h-3 w-3" />
                                    {t("common.promoted")}
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
                                          statusConfig[listing.status].className
                                        }
                                      >
                                        {statusConfig[listing.status].label}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={typeConfig[listing.type].className}
                                      >
                                        {typeConfig[listing.type].label}
                                      </Badge>
                                    </div>
                                    <h3 className="mt-2 font-semibold">
                                      {listing.title}
                                    </h3>
                                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                      <MapPin className="h-3.5 w-3.5" />
                                      {listing.address}
                                      {listing.district &&
                                        `, ${listing.district}`}
                                    </p>
                                  </div>

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem asChild>
                                        <Link
                                          href={`/warsaw/${listing.type}/${listing.id}`}
                                        >
                                          <Eye className="mr-2 h-4 w-4" />
                                          {t("dashboard.viewListing")}
                                        </Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Edit className="mr-2 h-4 w-4" />
                                        {t("common.edit")}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        {t("dashboard.promote")}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {t("common.delete")}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
                                  <div className="flex gap-6 text-sm">
                                    <div className="flex items-center gap-1.5">
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                      <span>
                                        {t("dashboard.views", {
                                          count: listing.views,
                                        })}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                      <span>
                                        {t("dashboard.inquiriesCount", {
                                          count: listing.inquiries,
                                        })}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="h-4 w-4 text-muted-foreground" />
                                      <span>
                                        {new Date(
                                          listing.createdAt,
                                        ).toLocaleDateString("en-GB", {
                                          day: "numeric",
                                          month: "short",
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-lg font-bold text-primary">
                                    {listing.price.toLocaleString()} PLN
                                    <span className="text-sm font-normal text-muted-foreground">
                                      {listing.type === "sublet"
                                        ? ""
                                        : t("common.perMonth")}
                                    </span>
                                  </p>
                                </div>

                                {listing.promoted && listing.promotedUntil && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {t("dashboard.promotionEnds", {
                                      date: new Date(
                                        listing.promotedUntil,
                                      ).toLocaleDateString("en-GB", {
                                        day: "numeric",
                                        month: "long",
                                      }),
                                    })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="inquiries" className="mt-6">
                {inquiries.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-16 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <MessageSquare className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">
                        {t("dashboard.noInquiries")}
                      </h3>
                      <p className="mt-1 text-muted-foreground">
                        {t("dashboard.noInquiriesDesc")}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {inquiries.map((inquiry, i) => (
                      <motion.div
                        key={inquiry.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card
                          className={`transition-all duration-200 hover:shadow-md ${
                            inquiry.status === "pending"
                              ? "border-primary/50 bg-primary/5"
                              : ""
                          }`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {inquiry.status === "pending" && (
                                    <motion.span
                                      animate={{ scale: [1, 1.3, 1] }}
                                      transition={{ repeat: Infinity, duration: 2 }}
                                      className="h-2 w-2 rounded-full bg-primary"
                                    />
                                  )}
                                  <span className="font-semibold">
                                    {inquiry.from}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {t("dashboard.about")}{" "}
                                    <Link
                                      href={`/warsaw/${inquiry.listingType}/${inquiry.listingId}`}
                                      className="text-primary hover:underline"
                                    >
                                      {inquiry.listingTitle}
                                    </Link>
                                  </span>
                                </div>
                                <p className="mt-2 text-muted-foreground">
                                  {inquiry.message}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {new Date(inquiry.date).toLocaleDateString(
                                    "en-GB",
                                    {
                                      day: "numeric",
                                      month: "long",
                                      year: "numeric",
                                    },
                                  )}
                                </p>
                              </div>
                              <Button size="sm" className="transition-transform hover:scale-105">
                                {t("common.reply")}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="saved" className="mt-6">
                {savedListings.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-16 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Heart className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">
                        {t("dashboard.noSavedListings")}
                      </h3>
                      <p className="mt-1 text-muted-foreground">
                        {t("dashboard.noSavedListingsDesc")}
                      </p>
                      <Button className="mt-6 gap-2" asChild>
                        <Link href="/warsaw/replacement">
                          {t("dashboard.browseListings")}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {savedListings.map((saved, i) => (
                      <motion.div
                        key={saved.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
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
                                  <h3 className="mt-2 font-semibold">
                                    {saved.title}
                                  </h3>
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
                                      {saved.type === "sublet" ? "" : t("common.perMonth")}
                                    </span>
                                  </p>
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={`/warsaw/${saved.type}/${saved.id}`}>
                                      {t("dashboard.viewListing")}
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
