"use client";

import { useState, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/landing/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Home,
  DollarSign,
  Image as ImageIcon,
  Eye,
  Upload,
  X,
  Sparkles,
  Loader2,
  LayoutList,
  Users,
  CalendarClock,
  Repeat,
} from "lucide-react";
import {
  AddressAutocomplete,
  type PlaceResult,
} from "@/components/listings/address-autocomplete";

type ListingType = "replacement" | "roommate" | "sublet";
type Step = "type" | "address" | "details" | "photos" | "preview";

const featureKeys = [
  "balcony",
  "terrace",
  "gardenAccess",
  "parking",
  "garage",
  "ac",
  "dishwasher",
  "washingMachine",
  "dryer",
  "furnished",
  "petFriendly",
  "elevator",
  "intercom",
  "smartHome",
  "gym",
  "concierge",
  "storage",
  "metroNearby",
  "tramStop",
  "quietArea",
] as const;

interface ListingFormData {
  listingType: ListingType;
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  district: string;
  postalCode: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
  title: string;
  description: string;
  bedrooms: string;
  bathrooms: string;
  area: string;
  floor: string;
  totalFloors: string;
  availableFrom: string;
  features: string[];
  photos: string[];
  // Replacement-specific
  rent: string;
  adminFee: string;
  utilities: string;
  // Roommate-specific
  pricePerPerson: string;
  totalApartmentRent: string;
  currentRoommates: string;
  totalRooms: string;
  roomType: string;
  preferredGender: string;
  preferredAgeMin: string;
  preferredAgeMax: string;
  roommateDescription: string;
  depositAmount: string;
  // Sublet-specific
  availableTo: string;
  priceTotal: string;
  utilitiesIncluded: boolean;
  internetIncluded: boolean;
  subletRules: string;
}

const initialFormData: ListingFormData = {
  listingType: "replacement",
  street: "",
  buildingNumber: "",
  apartmentNumber: "",
  district: "",
  postalCode: "",
  placeId: "",
  lat: null,
  lng: null,
  title: "",
  description: "",
  bedrooms: "",
  bathrooms: "",
  area: "",
  floor: "",
  totalFloors: "",
  availableFrom: "",
  features: [],
  photos: [],
  rent: "",
  adminFee: "",
  utilities: "",
  pricePerPerson: "",
  totalApartmentRent: "",
  currentRoommates: "",
  totalRooms: "",
  roomType: "",
  preferredGender: "any",
  preferredAgeMin: "",
  preferredAgeMax: "",
  roommateDescription: "",
  depositAmount: "",
  availableTo: "",
  priceTotal: "",
  utilitiesIncluded: false,
  internetIncluded: false,
  subletRules: "",
};

const stepTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
};

export default function CreateListingPage() {
  const t = useTranslations();
  const params = useParams();
  const citySlug = (params.city as string) || "warsaw";

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: "type", label: t("listings.create.stepType"), icon: LayoutList },
    { id: "address", label: t("listings.create.stepAddress"), icon: MapPin },
    { id: "details", label: t("listings.create.stepDetails"), icon: DollarSign },
    { id: "photos", label: t("listings.create.stepPhotos"), icon: ImageIcon },
    { id: "preview", label: t("listings.create.stepPreview"), icon: Eye },
  ];

  const [currentStep, setCurrentStep] = useState<Step>("type");
  const [formData, setFormData] = useState<ListingFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const updateFormData = (updates: Partial<ListingFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const toggleFeature = (feature: string) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    updateFormData({
      street: place.street,
      buildingNumber: place.buildingNumber,
      district: place.district,
      postalCode: place.postalCode,
      lat: place.lat,
      lng: place.lng,
      placeId: place.placeId,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    const uploaded: string[] = [];

    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }
        const data = await res.json();
        uploaded.push(data.url);
      } catch (err) {
        console.error("Photo upload error:", err);
      }
    }

    if (uploaded.length > 0) {
      updateFormData({ photos: [...formData.photos, ...uploaded] });
    }
    setUploadingPhotos(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    updateFormData({
      photos: formData.photos.filter((_, i) => i !== index),
    });
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const commonPayload = {
        type: formData.listingType,
        title: formData.title,
        description: formData.description,
        street: formData.street,
        buildingNumber: formData.buildingNumber,
        district: formData.district,
        placeId: formData.placeId,
        lat: formData.lat,
        lng: formData.lng,
        rooms: formData.bedrooms,
        areaM2: formData.area,
        floor: formData.floor,
        availableFrom: formData.availableFrom,
        photos: formData.photos,
        petsAllowed: formData.features.includes("petFriendly"),
        furnished: formData.features.includes("furnished"),
        citySlug,
      };

      let typePayload = {};

      if (formData.listingType === "replacement") {
        typePayload = {
          rent: formData.rent,
          adminFee: formData.adminFee,
          utilitiesAvg: formData.utilities,
        };
      } else if (formData.listingType === "roommate") {
        typePayload = {
          pricePerPerson: formData.pricePerPerson,
          totalApartmentRent: formData.totalApartmentRent || undefined,
          currentRoommates: formData.currentRoommates || undefined,
          totalRooms: formData.totalRooms || undefined,
          roomType: formData.roomType || undefined,
          preferredGender: formData.preferredGender || undefined,
          preferredAgeMin: formData.preferredAgeMin || undefined,
          preferredAgeMax: formData.preferredAgeMax || undefined,
          roommateDescription: formData.roommateDescription || undefined,
          depositAmount: formData.depositAmount || undefined,
        };
      } else if (formData.listingType === "sublet") {
        typePayload = {
          availableTo: formData.availableTo,
          priceTotal: formData.priceTotal,
          utilitiesIncluded: formData.utilitiesIncluded,
          internetIncluded: formData.internetIncluded,
          subletRules: formData.subletRules || undefined,
          depositAmount: formData.depositAmount || undefined,
        };
      }

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...commonPayload, ...typePayload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to publish listing");
      }

      setIsPublished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCost =
    (parseInt(formData.rent) || 0) +
    (parseInt(formData.adminFee) || 0) +
    (parseInt(formData.utilities) || 0);

  const subletDays =
    formData.availableFrom && formData.availableTo
      ? Math.max(
          0,
          Math.ceil(
            (new Date(formData.availableTo).getTime() -
              new Date(formData.availableFrom).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0;

  const subletPricePerDay =
    subletDays > 0 && parseInt(formData.priceTotal)
      ? Math.round(parseInt(formData.priceTotal) / subletDays)
      : 0;

  const typeConfig = {
    replacement: {
      icon: Repeat,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      border: "border-blue-200 dark:border-blue-800",
      ring: "ring-blue-500",
    },
    roommate: {
      icon: Users,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-950/40",
      border: "border-violet-200 dark:border-violet-800",
      ring: "ring-violet-500",
    },
    sublet: {
      icon: CalendarClock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      border: "border-amber-200 dark:border-amber-800",
      ring: "ring-amber-500",
    },
  } as const;

  if (isPublished) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center p-8 pt-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
          >
            <Card className="w-full max-w-md text-center">
              <CardContent className="pt-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                >
                  <Check className="h-8 w-8 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-bold">
                  {t("listings.create.publishedTitle")}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {t("listings.create.publishedDesc")}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Button asChild>
                    <Link href="/dashboard">
                      {t("listings.create.goToDashboard")}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/listings">
                      {t("listings.create.browseListings")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30 pt-20">
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <div className="flex items-center justify-center">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <motion.button
                    whileHover={index <= currentStepIndex ? { scale: 1.05 } : {}}
                    whileTap={index <= currentStepIndex ? { scale: 0.95 } : {}}
                    onClick={() => {
                      if (index <= currentStepIndex) {
                        setCurrentStep(step.id);
                      }
                    }}
                    disabled={index > currentStepIndex}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      index === currentStepIndex
                        ? "bg-primary text-primary-foreground shadow-md"
                        : index < currentStepIndex
                          ? "bg-primary/20 text-primary hover:bg-primary/30"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index < currentStepIndex ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <step.icon className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">{step.label}</span>
                  </motion.button>
                  {index < steps.length - 1 && (
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: index < currentStepIndex ? 1 : 0.3 }}
                      transition={{ duration: 0.4 }}
                      className={`mx-2 h-0.5 w-8 origin-left sm:w-12 ${
                        index < currentStepIndex ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="mx-auto max-w-2xl">
            <AnimatePresence mode="wait">
              {currentStep === "type" && (
                <motion.div key="type" {...stepTransition}>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <LayoutList className="h-5 w-5" />
                        {t("listings.create.typeSelector")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {t("listings.create.typeSelectorHint")}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {(["replacement", "roommate", "sublet"] as const).map(
                          (type) => {
                            const config = typeConfig[type];
                            const TypeIcon = config.icon;
                            const isSelected = formData.listingType === type;
                            return (
                              <motion.button
                                key={type}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() =>
                                  updateFormData({ listingType: type })
                                }
                                className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                                  isSelected
                                    ? `${config.border} ${config.bg} ring-2 ${config.ring} ring-offset-2`
                                    : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                                }`}
                              >
                                <div
                                  className={`flex h-12 w-12 items-center justify-center rounded-full ${config.bg}`}
                                >
                                  <TypeIcon
                                    className={`h-6 w-6 ${config.color}`}
                                  />
                                </div>
                                <div>
                                  <h3 className="font-semibold">
                                    {t(`listings.types.${type}`)}
                                  </h3>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {t(`listings.types.${type}Desc`)}
                                  </p>
                                </div>
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground`}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </motion.div>
                                )}
                              </motion.button>
                            );
                          },
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {currentStep === "address" && (
                <motion.div key="address" {...stepTransition}>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        {t("listings.create.apartmentAddress")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("listings.create.searchAddress")}</Label>
                        <AddressAutocomplete
                          onPlaceSelect={handlePlaceSelect}
                          placeholder={t("listings.create.addressPlaceholder")}
                          defaultValue={
                            formData.street
                              ? `${formData.street} ${formData.buildingNumber}`
                              : ""
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("listings.create.addressHint")}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="street">
                            {t("listings.create.street")} *
                          </Label>
                          <Input
                            id="street"
                            placeholder="e.g., ul. Marszałkowska"
                            value={formData.street}
                            onChange={(e) =>
                              updateFormData({ street: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="buildingNumber">
                            {t("listings.create.buildingNo")} *
                          </Label>
                          <Input
                            id="buildingNumber"
                            placeholder="e.g., 45"
                            value={formData.buildingNumber}
                            onChange={(e) =>
                              updateFormData({ buildingNumber: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="apartmentNumber">
                            {t("listings.create.aptNo")}
                          </Label>
                          <Input
                            id="apartmentNumber"
                            placeholder="e.g., 12"
                            value={formData.apartmentNumber}
                            onChange={(e) =>
                              updateFormData({ apartmentNumber: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="district">
                            {t("listings.create.district")}
                          </Label>
                          <Input
                            id="district"
                            placeholder="e.g., Mokotów"
                            value={formData.district}
                            onChange={(e) =>
                              updateFormData({ district: e.target.value })
                            }
                            readOnly={!!formData.placeId}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="postalCode">
                            {t("listings.create.postalCode")}
                          </Label>
                          <Input
                            id="postalCode"
                            placeholder="e.g., 00-001"
                            value={formData.postalCode}
                            onChange={(e) =>
                              updateFormData({ postalCode: e.target.value })
                            }
                            readOnly={!!formData.placeId}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {currentStep === "details" && (
                <motion.div key="details" {...stepTransition} className="space-y-6">
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Home className="h-5 w-5" />
                        {t("listings.create.apartmentDetails")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">
                          {t("listings.create.listingTitle")} *
                        </Label>
                        <Input
                          id="title"
                          placeholder="e.g., Sunny Studio in Mokotów"
                          value={formData.title}
                          onChange={(e) =>
                            updateFormData({ title: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">
                          {t("listings.create.listingDescription")}
                        </Label>
                        <Textarea
                          id="description"
                          rows={4}
                          placeholder={t(
                            "listings.create.descriptionPlaceholder",
                          )}
                          value={formData.description}
                          onChange={(e) =>
                            updateFormData({ description: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="bedrooms">
                            {t("listings.create.bedroomsLabel")} *
                          </Label>
                          <Select
                            value={formData.bedrooms}
                            onValueChange={(value) =>
                              updateFormData({ bedrooms: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t("listings.create.select")}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={n.toString()}>
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bathrooms">
                            {t("listings.create.bathroomsLabel")} *
                          </Label>
                          <Select
                            value={formData.bathrooms}
                            onValueChange={(value) =>
                              updateFormData({ bathrooms: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t("listings.create.select")}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3].map((n) => (
                                <SelectItem key={n} value={n.toString()}>
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="area">
                            {t("listings.create.areaLabel")} *
                          </Label>
                          <Input
                            id="area"
                            type="number"
                            placeholder="e.g., 45"
                            value={formData.area}
                            onChange={(e) =>
                              updateFormData({ area: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="floor">
                            {t("listings.create.floorLabel")} *
                          </Label>
                          <Input
                            id="floor"
                            type="number"
                            placeholder="e.g., 3"
                            value={formData.floor}
                            onChange={(e) =>
                              updateFormData({ floor: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="totalFloors">
                            {t("listings.create.totalFloors")}
                          </Label>
                          <Input
                            id="totalFloors"
                            type="number"
                            placeholder="e.g., 10"
                            value={formData.totalFloors}
                            onChange={(e) =>
                              updateFormData({ totalFloors: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="availableFrom">
                            {t("listings.create.availableFrom")} *
                          </Label>
                          <Input
                            id="availableFrom"
                            type="date"
                            value={formData.availableFrom}
                            onChange={(e) =>
                              updateFormData({ availableFrom: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      {formData.listingType === "sublet" && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="availableTo">
                              {t("listings.create.availableTo")} *
                            </Label>
                            <Input
                              id="availableTo"
                              type="date"
                              value={formData.availableTo}
                              min={formData.availableFrom || undefined}
                              onChange={(e) =>
                                updateFormData({ availableTo: e.target.value })
                              }
                            />
                          </div>
                          {subletDays > 0 && (
                            <div className="flex items-end pb-2">
                              <span className="text-sm text-muted-foreground">
                                {subletDays} {t("listings.create.days")}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>{t("listings.create.featuresAmenities")}</Label>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {featureKeys.map((key) => (
                            <div key={key} className="flex items-center gap-2">
                              <Checkbox
                                id={`feature-${key}`}
                                checked={formData.features.includes(key)}
                                onCheckedChange={() => toggleFeature(key)}
                              />
                              <Label
                                htmlFor={`feature-${key}`}
                                className="text-sm font-normal"
                              >
                                {t(`listings.features.${key}`)}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {formData.listingType === "replacement" && (
                    <Card className="transition-shadow hover:shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          {t("listings.create.monthlyCosts")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="rent">
                              {t("listings.create.rentPln")} *
                            </Label>
                            <Input
                              id="rent"
                              type="number"
                              placeholder="e.g., 3200"
                              value={formData.rent}
                              onChange={(e) =>
                                updateFormData({ rent: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="adminFee">
                              {t("listings.create.adminFeePln")}
                            </Label>
                            <Input
                              id="adminFee"
                              type="number"
                              placeholder="e.g., 350"
                              value={formData.adminFee}
                              onChange={(e) =>
                                updateFormData({ adminFee: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="utilities">
                              {t("listings.create.estUtilitiesPln")}
                            </Label>
                            <Input
                              id="utilities"
                              type="number"
                              placeholder="e.g., 250"
                              value={formData.utilities}
                              onChange={(e) =>
                                updateFormData({ utilities: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <AnimatePresence>
                          {totalCost > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-lg bg-muted/50 p-4"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {t("listings.create.totalMonthlyCost")}
                                </span>
                                <span className="text-xl font-bold text-primary">
                                  ~{totalCost.toLocaleString()} PLN
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  )}

                  {formData.listingType === "roommate" && (
                    <Card className="transition-shadow hover:shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          {t("listings.create.roommateDetails")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="pricePerPerson">
                              {t("listings.create.pricePerPerson")} *
                            </Label>
                            <Input
                              id="pricePerPerson"
                              type="number"
                              placeholder="e.g., 1200"
                              value={formData.pricePerPerson}
                              onChange={(e) =>
                                updateFormData({
                                  pricePerPerson: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="totalApartmentRent">
                              {t("listings.create.totalApartmentRent")}
                            </Label>
                            <Input
                              id="totalApartmentRent"
                              type="number"
                              placeholder="e.g., 3600"
                              value={formData.totalApartmentRent}
                              onChange={(e) =>
                                updateFormData({
                                  totalApartmentRent: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="currentRoommates">
                              {t("listings.create.currentRoommates")}
                            </Label>
                            <Select
                              value={formData.currentRoommates}
                              onValueChange={(value) =>
                                updateFormData({ currentRoommates: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("listings.create.select")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <SelectItem key={n} value={n.toString()}>
                                    {n}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="totalRooms">
                              {t("listings.create.totalRooms")}
                            </Label>
                            <Select
                              value={formData.totalRooms}
                              onValueChange={(value) =>
                                updateFormData({ totalRooms: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("listings.create.select")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                  <SelectItem key={n} value={n.toString()}>
                                    {n}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="roomType">
                              {t("listings.create.roomType")}
                            </Label>
                            <Select
                              value={formData.roomType}
                              onValueChange={(value) =>
                                updateFormData({ roomType: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("listings.create.select")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="private">
                                  {t("listings.create.roomTypePrivate")}
                                </SelectItem>
                                <SelectItem value="shared">
                                  {t("listings.create.roomTypeShared")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="preferredGender">
                              {t("listings.create.preferredGender")}
                            </Label>
                            <Select
                              value={formData.preferredGender}
                              onValueChange={(value) =>
                                updateFormData({ preferredGender: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">
                                  {t("listings.create.genderAny")}
                                </SelectItem>
                                <SelectItem value="male">
                                  {t("listings.create.genderMale")}
                                </SelectItem>
                                <SelectItem value="female">
                                  {t("listings.create.genderFemale")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="preferredAgeMin">
                              {t("listings.create.ageMin")}
                            </Label>
                            <Input
                              id="preferredAgeMin"
                              type="number"
                              placeholder="18"
                              min="18"
                              max="99"
                              value={formData.preferredAgeMin}
                              onChange={(e) =>
                                updateFormData({
                                  preferredAgeMin: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="preferredAgeMax">
                              {t("listings.create.ageMax")}
                            </Label>
                            <Input
                              id="preferredAgeMax"
                              type="number"
                              placeholder="35"
                              min="18"
                              max="99"
                              value={formData.preferredAgeMax}
                              onChange={(e) =>
                                updateFormData({
                                  preferredAgeMax: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="depositAmount">
                            {t("listings.create.depositAmount")}
                          </Label>
                          <Input
                            id="depositAmount"
                            type="number"
                            placeholder="e.g., 1200"
                            value={formData.depositAmount}
                            onChange={(e) =>
                              updateFormData({ depositAmount: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="roommateDescription">
                            {t("listings.create.roommateDescription")}
                          </Label>
                          <Textarea
                            id="roommateDescription"
                            rows={3}
                            placeholder={t(
                              "listings.create.roommateDescPlaceholder",
                            )}
                            value={formData.roommateDescription}
                            onChange={(e) =>
                              updateFormData({
                                roommateDescription: e.target.value,
                              })
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {formData.listingType === "sublet" && (
                    <Card className="transition-shadow hover:shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarClock className="h-5 w-5" />
                          {t("listings.create.subletDetails")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="priceTotal">
                              {t("listings.create.priceTotal")} *
                            </Label>
                            <Input
                              id="priceTotal"
                              type="number"
                              placeholder="e.g., 4000"
                              value={formData.priceTotal}
                              onChange={(e) =>
                                updateFormData({ priceTotal: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="depositAmountSublet">
                              {t("listings.create.depositAmount")}
                            </Label>
                            <Input
                              id="depositAmountSublet"
                              type="number"
                              placeholder="e.g., 2000"
                              value={formData.depositAmount}
                              onChange={(e) =>
                                updateFormData({ depositAmount: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        {subletPricePerDay > 0 && (
                          <div className="rounded-lg bg-muted/50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {t("listings.create.pricePerDay")}
                              </span>
                              <span className="text-xl font-bold text-primary">
                                ~{subletPricePerDay} PLN{t("listings.create.perDay")}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="utilitiesIncluded"
                              checked={formData.utilitiesIncluded}
                              onCheckedChange={(checked) =>
                                updateFormData({
                                  utilitiesIncluded: checked === true,
                                })
                              }
                            />
                            <Label
                              htmlFor="utilitiesIncluded"
                              className="text-sm font-normal"
                            >
                              {t("listings.create.utilitiesIncluded")}
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="internetIncluded"
                              checked={formData.internetIncluded}
                              onCheckedChange={(checked) =>
                                updateFormData({
                                  internetIncluded: checked === true,
                                })
                              }
                            />
                            <Label
                              htmlFor="internetIncluded"
                              className="text-sm font-normal"
                            >
                              {t("listings.create.internetIncluded")}
                            </Label>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="subletRules">
                            {t("listings.create.subletRules")}
                          </Label>
                          <Textarea
                            id="subletRules"
                            rows={3}
                            placeholder={t(
                              "listings.create.subletRulesPlaceholder",
                            )}
                            value={formData.subletRules}
                            onChange={(e) =>
                              updateFormData({ subletRules: e.target.value })
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}

              {currentStep === "photos" && (
                <motion.div key="photos" {...stepTransition}>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        {t("listings.create.photosTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                        <motion.div
                          whileHover={{ scale: 1.01, borderColor: "hsl(var(--primary) / 0.5)" }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => fileInputRef.current?.click()}
                          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:bg-muted/50"
                        >
                          {uploadingPhotos ? (
                            <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
                          ) : (
                            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                          )}
                          <p className="font-medium">
                            {uploadingPhotos
                              ? t("listings.create.uploading")
                              : t("listings.create.uploadPhotos")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("listings.create.uploadHint")}
                          </p>
                        </motion.div>

                        {formData.photos.length > 0 && (
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            {formData.photos.map((photo, index) => (
                              <motion.div
                                key={index}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className="group relative aspect-video overflow-hidden rounded-lg"
                              >
                                <img
                                  src={photo}
                                  alt={`Upload ${index + 1}`}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <button
                                  onClick={() => removePhoto(index)}
                                  className="absolute right-2 top-2 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                                {index === 0 && (
                                  <span className="absolute bottom-2 left-2 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                                    {t("listings.create.cover")}
                                  </span>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        )}

                        <p className="text-sm text-muted-foreground">
                          {t("listings.create.photoHint")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {currentStep === "preview" && (
                <motion.div key="preview" {...stepTransition} className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        {t("listings.create.previewTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {formData.photos.length > 0 && (
                        <div className="mb-6 aspect-video overflow-hidden rounded-lg">
                          <img
                            src={formData.photos[0]}
                            alt="Cover"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      <div className="mb-3 flex items-center gap-2">
                        {(() => {
                          const TypeBadgeIcon =
                            typeConfig[formData.listingType].icon;
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${typeConfig[formData.listingType].bg} ${typeConfig[formData.listingType].color}`}
                            >
                              <TypeBadgeIcon className="h-3.5 w-3.5" />
                              {t(`listings.types.${formData.listingType}`)}
                            </span>
                          );
                        })()}
                      </div>

                      <h2 className="text-xl font-bold">
                        {formData.title || t("listings.create.untitledListing")}
                      </h2>
                      <p className="mt-1 text-muted-foreground">
                        {formData.street} {formData.buildingNumber}
                        {formData.apartmentNumber &&
                          `/${formData.apartmentNumber}`}
                        , {formData.district || "District"}, Warsaw
                      </p>

                      <div className="mt-4 flex flex-wrap gap-4 text-sm">
                        <span>
                          {formData.bedrooms || "?"}{" "}
                          {t("listings.detail.bedrooms")}
                        </span>
                        <span>
                          {formData.bathrooms || "?"}{" "}
                          {t("listings.detail.bathrooms")}
                        </span>
                        <span>{formData.area || "?"} m²</span>
                        <span>
                          {t("listings.detail.floor")} {formData.floor || "?"}
                        </span>
                      </div>

                      {formData.description && (
                        <p className="mt-4 text-muted-foreground">
                          {formData.description}
                        </p>
                      )}

                      {formData.features.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {formData.features.map((f) => (
                            <span
                              key={f}
                              className="rounded-full bg-muted px-3 py-1 text-xs font-medium"
                            >
                              {t(`listings.features.${f}`)}
                            </span>
                          ))}
                        </div>
                      )}

                      {formData.listingType === "replacement" && (
                        <div className="mt-6 rounded-lg bg-muted/50 p-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t("common.rent")}
                              </span>
                              <span>{formData.rent || 0} PLN</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t("common.adminFee")}
                              </span>
                              <span>{formData.adminFee || 0} PLN</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t("common.estUtilities")}
                              </span>
                              <span>~{formData.utilities || 0} PLN</span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span className="font-semibold">
                                {t("common.totalMonthly")}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                ~{totalCost.toLocaleString()} PLN
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {formData.listingType === "roommate" && (
                        <div className="mt-6 rounded-lg bg-muted/50 p-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t("listings.create.pricePerPerson")}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                {formData.pricePerPerson || 0} PLN{t("listings.create.perPerson")}
                              </span>
                            </div>
                            {formData.totalApartmentRent && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t("listings.create.totalApartmentRent")}
                                </span>
                                <span>{formData.totalApartmentRent} PLN</span>
                              </div>
                            )}
                            {formData.currentRoommates && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t("listings.create.currentRoommates")}
                                </span>
                                <span>
                                  {formData.currentRoommates}{" "}
                                  {t("listings.create.roommates")}
                                </span>
                              </div>
                            )}
                            {formData.roomType && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t("listings.create.roomType")}
                                </span>
                                <span>
                                  {formData.roomType === "private"
                                    ? t("listings.create.privateRoom")
                                    : t("listings.create.sharedRoom")}
                                </span>
                              </div>
                            )}
                            {formData.depositAmount && (
                              <div className="flex justify-between border-t pt-2">
                                <span className="text-muted-foreground">
                                  {t("listings.create.depositAmount")}
                                </span>
                                <span>{formData.depositAmount} PLN</span>
                              </div>
                            )}
                          </div>
                          {formData.roommateDescription && (
                            <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                              {formData.roommateDescription}
                            </p>
                          )}
                        </div>
                      )}

                      {formData.listingType === "sublet" && (
                        <div className="mt-6 rounded-lg bg-muted/50 p-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t("listings.create.subletPeriod")}
                              </span>
                              <span>
                                {formData.availableFrom} — {formData.availableTo}
                                {subletDays > 0 && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({subletDays} {t("listings.create.days")})
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t("listings.create.priceTotal")}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                {formData.priceTotal || 0} PLN
                              </span>
                            </div>
                            {subletPricePerDay > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t("listings.create.pricePerDay")}
                                </span>
                                <span>~{subletPricePerDay} PLN{t("listings.create.perDay")}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 border-t pt-2">
                              {formData.utilitiesIncluded && (
                                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  {t("listings.create.utilitiesInclYes")}
                                </span>
                              )}
                              {formData.internetIncluded && (
                                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  {t("listings.create.internetInclYes")}
                                </span>
                              )}
                            </div>
                            {formData.subletRules && (
                              <div className="border-t pt-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {t("listings.create.rulesLabel")}:
                                </span>
                                <p className="mt-1 text-sm">
                                  {formData.subletRules}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
                    <CardContent className="flex items-start gap-4 pt-6">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {t("listings.create.promoteTitle")}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("listings.create.promoteDesc")}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm">
                            {t("listings.create.promote7days")}
                          </Button>
                          <Button variant="outline" size="sm">
                            {t("listings.create.promote14days")}
                          </Button>
                          <Button size="sm">
                            {t("listings.create.promote30days")}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex items-center justify-between"
            >
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStepIndex === 0}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("common.back")}
              </Button>

              {currentStep === "preview" ? (
                <Button
                  onClick={handlePublish}
                  disabled={isSubmitting}
                  className="gap-2 transition-transform hover:scale-[1.02]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("listings.create.publishing")}
                    </>
                  ) : (
                    <>
                      {t("listings.create.publishListing")}
                      <Check className="h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={handleNext} className="gap-2 transition-transform hover:scale-[1.02]">
                  {t("common.continue")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
