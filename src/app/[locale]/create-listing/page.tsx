'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { usePostHog, useFeatureFlagEnabled } from 'posthog-js/react';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Header } from '@/components/landing/header';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CalendarIcon,
  Repeat,
  GripVertical,
} from 'lucide-react';
import { AddressAutocomplete, type PlaceResult } from '@/components/listings/address-autocomplete';
import { usePhotoUploadStore } from '@/stores/publish-store';
import { toast } from 'sonner';

import { AMENITY_CATEGORIES, THINGS_TO_KNOW_SECTIONS } from '@/lib/amenities';
import { PRICES_PLN, listingOrderTotal, promotePrice } from '@/lib/pricing';

const FREE_LISTING_LIMIT = 2;
type PromoteDays = 0 | 7 | 14 | 30;

type ListingType = 'replacement' | 'roommate' | 'sublet';
type Step = 'type' | 'address' | 'details' | 'photos' | 'preview';

interface PhotoItem {
  id: string;
  type: 'remote' | 'local';
  url: string;
  file?: File;
}

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
  thingsToKnow: string[];
  registrationPossible: boolean | null;
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
  listingType: 'replacement',
  street: '',
  buildingNumber: '',
  apartmentNumber: '',
  district: '',
  postalCode: '',
  placeId: '',
  lat: null,
  lng: null,
  title: '',
  description: '',
  bedrooms: '',
  bathrooms: '',
  area: '',
  floor: '',
  totalFloors: '',
  availableFrom: '',
  features: [],
  thingsToKnow: [],
  registrationPossible: null,
  rent: '',
  adminFee: '',
  utilities: '',
  pricePerPerson: '',
  totalApartmentRent: '',
  currentRoommates: '',
  totalRooms: '',
  roomType: '',
  preferredGender: 'any',
  preferredAgeMin: '',
  preferredAgeMax: '',
  roommateDescription: '',
  depositAmount: '',
  availableTo: '',
  priceTotal: '',
  utilitiesIncluded: false,
  internetIncluded: false,
  subletRules: '',
};

function SortablePhoto({
  photo,
  index,
  onRemove,
  coverLabel,
}: {
  photo: PhotoItem;
  index: number;
  onRemove: (id: string) => void;
  coverLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative aspect-video overflow-hidden rounded-lg ${
        isDragging ? 'opacity-40 ring-2 ring-primary ring-offset-2' : ''
      }`}
    >
      <img
        src={photo.url}
        alt={`Photo ${index + 1}`}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <button
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 cursor-grab rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={() => onRemove(photo.id)}
        className="absolute right-2 top-2 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
      {index === 0 && (
        <span className="absolute bottom-2 left-2 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
          {coverLabel}
        </span>
      )}
    </div>
  );
}

function PhotoOverlay({ photo }: { photo: PhotoItem }) {
  return (
    <div className="aspect-video overflow-hidden rounded-lg shadow-xl ring-2 ring-primary">
      <img src={photo.url} alt="Dragging" className="h-full w-full object-cover" />
    </div>
  );
}

const stepTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
};

export default function CreateListingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const citySlug = (params.city as string) || 'warsaw';

  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  const allSteps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: 'type', label: t('listings.create.stepType'), icon: LayoutList },
    { id: 'address', label: t('listings.create.stepAddress'), icon: MapPin },
    { id: 'details', label: t('listings.create.stepDetails'), icon: DollarSign },
    { id: 'photos', label: t('listings.create.stepPhotos'), icon: ImageIcon },
    { id: 'preview', label: t('listings.create.stepPreview'), icon: Eye },
  ];

  const steps = editId
    ? allSteps.filter((s) => s.id === 'details' || s.id === 'photos' || s.id === 'preview')
    : allSteps;

  const posthog = usePostHog();
  const photoStore = usePhotoUploadStore();
  const [currentStep, setCurrentStep] = useState<Step>(editId ? 'details' : 'type');
  const [formData, setFormData] = useState<ListingFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(!!editId);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [promoteDays, setPromoteDays] = useState<PromoteDays>(0);
  const promotedListingsEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PROMOTED_LISTINGS_ENABLED);
  const [activeFreeListings, setActiveFreeListings] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!editId) return;
    setIsLoadingEdit(true);
    fetch(`/api/listings/${editId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load listing');
        return res.json();
      })
      .then(({ listing }) => {
        const b = listing.building;
        setFormData({
          listingType: listing.type as ListingType,
          street: b?.street ?? '',
          buildingNumber: b?.buildingNumber ?? '',
          apartmentNumber: listing.apartmentNumber ?? '',
          district: b?.district?.nameKey ?? '',
          postalCode: b?.postalCode ?? '',
          placeId: b?.placeId ?? '',
          lat: b?.lat ? Number(b.lat) : null,
          lng: b?.lng ? Number(b.lng) : null,
          title: listing.title ?? '',
          description: listing.description ?? '',
          bedrooms: listing.rooms ? String(listing.rooms) : '',
          bathrooms: '1',
          area: listing.areaM2 ? String(Number(listing.areaM2)) : '',
          floor: listing.floor ? String(listing.floor) : '',
          totalFloors: '',
          availableFrom: listing.availableFrom
            ? new Date(listing.availableFrom).toISOString().slice(0, 10)
            : '',
          features: listing.amenities ?? [],
          thingsToKnow: listing.thingsToKnow ?? [],
          registrationPossible: listing.registrationPossible ?? null,
          rent: listing.rent ? String(Number(listing.rent)) : '',
          adminFee: listing.adminFee ? String(Number(listing.adminFee)) : '',
          utilities: listing.utilitiesAvg ? String(Number(listing.utilitiesAvg)) : '',
          pricePerPerson: listing.pricePerPerson ? String(Number(listing.pricePerPerson)) : '',
          totalApartmentRent: listing.totalApartmentRent
            ? String(Number(listing.totalApartmentRent))
            : '',
          currentRoommates: listing.currentRoommates ? String(listing.currentRoommates) : '',
          totalRooms: listing.totalRooms ? String(listing.totalRooms) : '',
          roomType: listing.roomType ?? '',
          preferredGender: listing.preferredGender ?? 'any',
          preferredAgeMin: listing.preferredAgeMin ? String(listing.preferredAgeMin) : '',
          preferredAgeMax: listing.preferredAgeMax ? String(listing.preferredAgeMax) : '',
          roommateDescription: listing.roommateDescription ?? '',
          depositAmount: listing.depositAmount ? String(Number(listing.depositAmount)) : '',
          availableTo: listing.availableTo
            ? new Date(listing.availableTo).toISOString().slice(0, 10)
            : '',
          priceTotal: listing.priceTotal ? String(Number(listing.priceTotal)) : '',
          utilitiesIncluded: listing.utilitiesIncluded ?? false,
          internetIncluded: listing.internetIncluded ?? false,
          subletRules: listing.subletRules ?? '',
        });
        setPhotos(
          (listing.photos ?? []).map((url: string) => ({
            id: crypto.randomUUID(),
            type: 'remote' as const,
            url,
          })),
        );
        setCurrentStep('details');
      })
      .catch((err) => {
        console.error('Failed to load listing for edit:', err);
        setError('Failed to load listing data');
      })
      .finally(() => setIsLoadingEdit(false));
  }, [editId]);

  useEffect(() => {
    if (!editId) posthog?.capture('create_listing_started');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editId) return;
    fetch('/api/listings/count-free')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setActiveFreeListings(data.count);
      })
      .catch(() => {});
  }, [editId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentStep !== 'type') {
        posthog?.capture('create_listing_abandoned', {
          last_step: currentStep,
          step_number: steps.findIndex((s) => s.id === currentStep),
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const updateFormData = (updates: Partial<ListingFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    const keys = Object.keys(updates);
    if (keys.some((k) => k in validationErrors)) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        keys.forEach((k) => delete next[k]);
        return next;
      });
    }
  };

  const toggleFeature = (feature: string) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const toggleThingToKnow = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      thingsToKnow: prev.thingsToKnow.includes(key)
        ? prev.thingsToKnow.filter((k) => k !== key)
        : [...prev.thingsToKnow, key],
    }));
  };

  const validateStep = (step: Step): Record<string, string> => {
    const errors: Record<string, string> = {};

    switch (step) {
      case 'type':
        break;
      case 'address':
        if (!formData.street.trim()) errors.street = t('listings.create.fieldRequired');
        if (!formData.buildingNumber.trim())
          errors.buildingNumber = t('listings.create.fieldRequired');
        break;
      case 'details': {
        if (!formData.title.trim()) errors.title = t('listings.create.fieldRequired');
        if (!formData.bedrooms) errors.bedrooms = t('listings.create.fieldRequired');
        if (!formData.area) errors.area = t('listings.create.fieldRequired');
        if (!formData.floor) errors.floor = t('listings.create.fieldRequired');
        if (!formData.availableFrom) errors.availableFrom = t('listings.create.fieldRequired');

        if (formData.listingType === 'replacement') {
          if (!formData.rent) errors.rent = t('listings.create.fieldRequired');
        } else if (formData.listingType === 'roommate') {
          if (!formData.pricePerPerson) errors.pricePerPerson = t('listings.create.fieldRequired');
        } else if (formData.listingType === 'sublet') {
          if (!formData.priceTotal) errors.priceTotal = t('listings.create.fieldRequired');
          if (!formData.availableTo) errors.availableTo = t('listings.create.fieldRequired');
        }
        break;
      }
      case 'photos':
        break;
    }

    return errors;
  };

  const handleNext = () => {
    const errors = validateStep(currentStep);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    posthog?.capture('create_listing_step_completed', {
      step: currentStep,
      step_number: currentStepIndex,
    });
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

  const MAX_PHOTOS = 10;

  const MAX_UPLOAD_MB = 10;

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const slotsAvailable = MAX_PHOTOS - photos.length;
    if (slotsAvailable <= 0) return;

    const selected = Array.from(files).slice(0, slotsAvailable);

    const tooBig = selected.filter((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    const accepted = selected.filter((f) => f.size <= MAX_UPLOAD_MB * 1024 * 1024);

    if (tooBig.length > 0) {
      toast.error(t('listings.create.fileTooLarge', { max: MAX_UPLOAD_MB }));
    }

    if (accepted.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const newItems: PhotoItem[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      type: 'local' as const,
      url: URL.createObjectURL(file),
      file,
    }));

    setPhotos((prev) => [...prev, ...newItems]);

    photoStore.addPhotos(accepted);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = useCallback(
    (id: string) => {
      setPhotos((prev) => {
        const item = prev.find((p) => p.id === id);
        if (item?.type === 'local') URL.revokeObjectURL(item.url);
        return prev.filter((p) => p.id !== id);
      });

      const managedPhoto = photoStore.photos.find(
        (p) => p.preview === photos.find((ph) => ph.id === id)?.url,
      );
      if (managedPhoto) {
        photoStore.removePhoto(managedPhoto.id);
      }
    },
    [photos, photoStore],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActivePhotoId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePhotoId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPhotos((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleDragCancel = () => {
    setActivePhotoId(null);
  };

  const activePhoto = activePhotoId ? photos.find((p) => p.id === activePhotoId) : null;

  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        if (p.type === 'local') URL.revokeObjectURL(p.url);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overLimit = activeFreeListings !== null && activeFreeListings >= FREE_LISTING_LIMIT;
  const effectivePromoteDays = promotedListingsEnabled ? promoteDays : 0;
  const needsPayment = overLimit || effectivePromoteDays > 0;
  const orderTotal = listingOrderTotal({
    paidListing: overLimit,
    promoteDays: effectivePromoteDays,
  });

  const handlePublish = async () => {
    setIsSubmitting(true);
    setError(null);

    if (editId) {
      const patchPayload: Record<string, unknown> = {
        title: formData.title,
        description: formData.description,
        rooms: formData.bedrooms,
        areaM2: formData.area,
        floor: formData.floor,
        availableFrom: formData.availableFrom,
        amenities: formData.features,
        thingsToKnow: formData.thingsToKnow,
        registrationPossible: formData.registrationPossible,
      };

      if (formData.listingType === 'replacement') {
        patchPayload.rent = formData.rent;
        patchPayload.adminFee = formData.adminFee;
        patchPayload.utilitiesAvg = formData.utilities;
      } else if (formData.listingType === 'roommate') {
        patchPayload.pricePerPerson = formData.pricePerPerson;
        patchPayload.totalApartmentRent = formData.totalApartmentRent || null;
        patchPayload.currentRoommates = formData.currentRoommates || null;
        patchPayload.totalRooms = formData.totalRooms || null;
        patchPayload.roomType = formData.roomType || null;
        patchPayload.preferredGender = formData.preferredGender || null;
        patchPayload.preferredAgeMin = formData.preferredAgeMin || null;
        patchPayload.preferredAgeMax = formData.preferredAgeMax || null;
        patchPayload.roommateDescription = formData.roommateDescription || null;
        patchPayload.depositAmount = formData.depositAmount || null;
      } else if (formData.listingType === 'sublet') {
        patchPayload.availableTo = formData.availableTo;
        patchPayload.priceTotal = formData.priceTotal;
        patchPayload.utilitiesIncluded = formData.utilitiesIncluded;
        patchPayload.internetIncluded = formData.internetIncluded;
        patchPayload.subletRules = formData.subletRules || null;
        patchPayload.depositAmount = formData.depositAmount || null;
      }

      const localFiles = photos.filter((p) => p.type === 'local' && p.file);
      const uploadedUrlMap = new Map<string, string>();
      for (const item of localFiles) {
        const fd = new FormData();
        fd.append('file', item.file!);
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: fd });
          if (res.ok) {
            const { url } = await res.json();
            uploadedUrlMap.set(item.id, url);
          }
        } catch {
          /* keep existing photos */
        }
      }

      patchPayload.photos = photos.map((p) => {
        if (p.type === 'remote') return p.url;
        return uploadedUrlMap.get(p.id) ?? p.url;
      });

      try {
        const res = await fetch(`/api/listings/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchPayload),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to update listing');
          setIsSubmitting(false);
          return;
        }
        posthog?.capture('listing_updated', { listing_id: editId, type: formData.listingType });
        router.push('/dashboard');
      } catch {
        setError('Failed to update listing');
        setIsSubmitting(false);
      }
      return;
    }

    const uploadedUrls = photoStore.getUploadedUrls();

    const commonPayload = {
      type: formData.listingType,
      title: formData.title,
      description: formData.description,
      street: formData.street,
      buildingNumber: formData.buildingNumber,
      apartmentNumber: formData.apartmentNumber || undefined,
      postalCode: formData.postalCode || undefined,
      district: formData.district,
      placeId: formData.placeId,
      lat: formData.lat,
      lng: formData.lng,
      rooms: formData.bedrooms,
      areaM2: formData.area,
      floor: formData.floor,
      availableFrom: formData.availableFrom,
      amenities: formData.features,
      thingsToKnow: formData.thingsToKnow,
      registrationPossible: formData.registrationPossible,
      citySlug,
      locale,
      photos: uploadedUrls,
      promoteDays: effectivePromoteDays,
    };

    let typePayload = {};

    if (formData.listingType === 'replacement') {
      typePayload = {
        rent: formData.rent,
        adminFee: formData.adminFee,
        utilitiesAvg: formData.utilities,
      };
    } else if (formData.listingType === 'roommate') {
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
    } else if (formData.listingType === 'sublet') {
      typePayload = {
        availableTo: formData.availableTo,
        priceTotal: formData.priceTotal,
        utilitiesIncluded: formData.utilitiesIncluded,
        internetIncluded: formData.internetIncluded,
        subletRules: formData.subletRules || undefined,
        depositAmount: formData.depositAmount || undefined,
      };
    }

    const payload = { ...commonPayload, ...typePayload };

    try {
      const createRes = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        setError(data.error || 'Failed to create listing');
        setIsSubmitting(false);
        return;
      }

      const { listing, needCheckout, overLimit: isOverLimit } = await createRes.json();

      posthog?.capture('create_listing_publish_started', {
        type: formData.listingType,
        photo_count: uploadedUrls.length,
        needs_checkout: needCheckout,
      });

      if (needCheckout) {
        posthog?.capture('checkout_initiated', {
          productType: 'listing',
          listingId: listing.id,
          paidListing: isOverLimit,
          promoteDays: effectivePromoteDays,
          source: 'create_listing',
        });
        const checkoutRes = await fetch('/api/checkout/listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingId: listing.id,
            paidListing: isOverLimit,
            promoteDays: effectivePromoteDays,
            locale,
          }),
        });

        if (!checkoutRes.ok) {
          const data = await checkoutRes.json();
          setError(data.error || 'Failed to create checkout session');
          setIsSubmitting(false);
          return;
        }

        const { url } = await checkoutRes.json();
        if (url) {
          window.location.href = url;
          return;
        }
      }

      photoStore.clearAll();
      toast.success(t('listings.create.publishedTitle'));
      router.push('/dashboard?published=success');
    } catch {
      setError('Failed to create listing');
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
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-200 dark:border-blue-800',
      ring: 'ring-blue-500',
    },
    roommate: {
      icon: Users,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      border: 'border-violet-200 dark:border-violet-800',
      ring: 'ring-violet-500',
    },
    sublet: {
      icon: CalendarClock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-200 dark:border-amber-800',
      ring: 'ring-amber-500',
    },
  } as const;

  const FieldError = ({ field }: { field: string }) => {
    const error = validationErrors[field];
    if (!error) return null;
    return <p className="text-xs text-destructive mt-1">{error}</p>;
  };

  if (isLoadingEdit) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 bg-muted/30 pt-24">
          <div className="container mx-auto flex items-center justify-center px-4 py-32">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30 pt-24">
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
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : index < currentStepIndex
                          ? 'bg-primary/20 text-primary hover:bg-primary/30'
                          : 'bg-muted text-muted-foreground'
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
                        index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="mx-auto max-w-2xl">
            {editId && (
              <div className="mb-6 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                {(() => {
                  const cfg = typeConfig[formData.listingType];
                  const Icon = cfg.icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.bg} ${cfg.color}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t(`listings.types.${formData.listingType}`)}
                    </span>
                  );
                })()}
                <span className="text-sm text-muted-foreground">
                  {formData.street} {formData.buildingNumber}
                  {formData.apartmentNumber && `/${formData.apartmentNumber}`}
                  {formData.district && `, ${formData.district}`}
                </span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {currentStep === 'type' && (
                <motion.div key="type" {...stepTransition}>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <LayoutList className="h-5 w-5" />
                        {t('listings.create.typeSelector')}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {t('listings.create.typeSelectorHint')}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {(['replacement', 'roommate', 'sublet'] as const).map((type) => {
                          const config = typeConfig[type];
                          const TypeIcon = config.icon;
                          const isSelected = formData.listingType === type;
                          return (
                            <motion.button
                              key={type}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => updateFormData({ listingType: type })}
                              className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                                isSelected
                                  ? `${config.border} ${config.bg} ring-2 ${config.ring} ring-offset-2`
                                  : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                              }`}
                            >
                              <div
                                className={`flex h-12 w-12 items-center justify-center rounded-full ${config.bg}`}
                              >
                                <TypeIcon className={`h-6 w-6 ${config.color}`} />
                              </div>
                              <div>
                                <h3 className="font-semibold">{t(`listings.types.${type}`)}</h3>
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
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {currentStep === 'address' && (
                <motion.div key="address" {...stepTransition}>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        {t('listings.create.apartmentAddress')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t('listings.create.searchAddress')}</Label>
                        <AddressAutocomplete
                          onPlaceSelect={handlePlaceSelect}
                          placeholder={t('listings.create.addressPlaceholder')}
                          defaultValue={
                            formData.street ? `${formData.street} ${formData.buildingNumber}` : ''
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('listings.create.addressHint')}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="street">{t('listings.create.street')} *</Label>
                          <Input
                            id="street"
                            placeholder="e.g., Marszałkowska"
                            value={formData.street}
                            readOnly
                            className="bg-muted"
                          />
                          <FieldError field="street" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="buildingNumber">
                            {t('listings.create.buildingNo')} *
                          </Label>
                          <Input
                            id="buildingNumber"
                            placeholder="e.g., 45"
                            value={formData.buildingNumber}
                            onChange={(e) =>
                              updateFormData({
                                buildingNumber: e.target.value,
                                placeId: '',
                              })
                            }
                          />
                          <FieldError field="buildingNumber" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="apartmentNumber">{t('listings.create.aptNo')}</Label>
                          <Input
                            id="apartmentNumber"
                            placeholder="e.g., 12"
                            value={formData.apartmentNumber}
                            onChange={(e) => updateFormData({ apartmentNumber: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="district">{t('listings.create.district')}</Label>
                          <Input
                            id="district"
                            placeholder="e.g., Mokotów"
                            value={formData.district}
                            onChange={(e) => updateFormData({ district: e.target.value })}
                            readOnly={!!formData.placeId}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="postalCode">{t('listings.create.postalCode')}</Label>
                          <Input
                            id="postalCode"
                            placeholder="e.g., 00-001"
                            value={formData.postalCode}
                            onChange={(e) => updateFormData({ postalCode: e.target.value })}
                            readOnly={!!formData.placeId}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {currentStep === 'details' && (
                <motion.div key="details" {...stepTransition} className="space-y-6">
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Home className="h-5 w-5" />
                        {t('listings.create.apartmentDetails')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">{t('listings.create.listingTitle')} *</Label>
                        <Input
                          id="title"
                          placeholder="e.g., Sunny Studio in Mokotów"
                          value={formData.title}
                          onChange={(e) => updateFormData({ title: e.target.value })}
                        />
                        <FieldError field="title" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">
                          {t('listings.create.listingDescription')}
                        </Label>
                        <Textarea
                          id="description"
                          rows={4}
                          placeholder={t('listings.create.descriptionPlaceholder')}
                          value={formData.description}
                          onChange={(e) => updateFormData({ description: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="bedrooms">{t('listings.create.bedroomsLabel')} *</Label>
                          <Select
                            value={formData.bedrooms}
                            onValueChange={(value) => updateFormData({ bedrooms: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('listings.create.select')} />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={n.toString()}>
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldError field="bedrooms" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bathrooms">{t('listings.create.bathroomsLabel')} *</Label>
                          <Select
                            value={formData.bathrooms}
                            onValueChange={(value) => updateFormData({ bathrooms: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('listings.create.select')} />
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
                          <Label htmlFor="area">{t('listings.create.areaLabel')} *</Label>
                          <Input
                            id="area"
                            type="number"
                            placeholder="e.g., 45"
                            value={formData.area}
                            onChange={(e) => updateFormData({ area: e.target.value })}
                          />
                          <FieldError field="area" />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="floor">{t('listings.create.floorLabel')} *</Label>
                          <Input
                            id="floor"
                            type="number"
                            placeholder="e.g., 3"
                            value={formData.floor}
                            onChange={(e) => updateFormData({ floor: e.target.value })}
                          />
                          <FieldError field="floor" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="totalFloors">{t('listings.create.totalFloors')}</Label>
                          <Input
                            id="totalFloors"
                            type="number"
                            placeholder="e.g., 10"
                            value={formData.totalFloors}
                            onChange={(e) => updateFormData({ totalFloors: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('listings.create.availableFrom')} *</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full h-9 justify-start text-left text-sm font-normal hover:border-primary/40"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                {formData.availableFrom ? (
                                  format(new Date(formData.availableFrom), 'PP')
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    {t('listings.create.availableFrom')}
                                  </span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={
                                  formData.availableFrom
                                    ? new Date(formData.availableFrom)
                                    : undefined
                                }
                                onSelect={(date) =>
                                  updateFormData({
                                    availableFrom: date ? format(date, 'yyyy-MM-dd') : '',
                                  })
                                }
                              />
                            </PopoverContent>
                          </Popover>
                          <FieldError field="availableFrom" />
                        </div>
                      </div>

                      {formData.listingType === 'sublet' && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label>{t('listings.create.availableTo')} *</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full h-9 justify-start text-left text-sm font-normal hover:border-primary/40"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                  {formData.availableTo ? (
                                    format(new Date(formData.availableTo), 'PP')
                                  ) : (
                                    <span className="text-muted-foreground text-xs">
                                      {t('listings.create.availableTo')}
                                    </span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={
                                    formData.availableTo
                                      ? new Date(formData.availableTo)
                                      : undefined
                                  }
                                  onSelect={(date) =>
                                    updateFormData({
                                      availableTo: date ? format(date, 'yyyy-MM-dd') : '',
                                    })
                                  }
                                  disabled={(date) =>
                                    formData.availableFrom
                                      ? date < new Date(formData.availableFrom)
                                      : false
                                  }
                                />
                              </PopoverContent>
                            </Popover>
                            <FieldError field="availableTo" />
                          </div>
                          {subletDays > 0 && (
                            <div className="flex items-end pb-2">
                              <span className="text-sm text-muted-foreground">
                                {subletDays} {t('listings.create.days')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-4">
                        <Label>{t('listings.create.featuresAmenities')}</Label>
                        {AMENITY_CATEGORIES.map((category) => (
                          <div key={category.categoryKey} className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                              {t(category.categoryKey)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {category.items.map((key) => (
                                <div key={key} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`feature-${key}`}
                                    checked={formData.features.includes(key)}
                                    onCheckedChange={() => toggleFeature(key)}
                                  />
                                  <Label htmlFor={`feature-${key}`} className="text-sm font-normal">
                                    {t(`listings.features.${key}`)}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 rounded-lg border p-3">
                        <Checkbox
                          id="registrationPossible"
                          checked={formData.registrationPossible === true}
                          onCheckedChange={(checked) =>
                            updateFormData({
                              registrationPossible: checked === true ? true : false,
                            })
                          }
                        />
                        <Label htmlFor="registrationPossible" className="text-sm font-normal">
                          {t('listings.registrationPossible')}
                        </Label>
                      </div>

                      <div className="space-y-4">
                        <Label>{t('listings.create.thingsToKnow')}</Label>
                        <p className="text-xs text-muted-foreground -mt-3">
                          {t('listings.create.thingsToKnowHint')}
                        </p>
                        {THINGS_TO_KNOW_SECTIONS.map((section) => (
                          <div key={section.titleKey} className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                              {t(section.titleKey)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {section.items.map((item) => (
                                <div key={item.key} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`ttk-${item.key}`}
                                    checked={formData.thingsToKnow.includes(item.key)}
                                    onCheckedChange={() => toggleThingToKnow(item.key)}
                                  />
                                  <Label
                                    htmlFor={`ttk-${item.key}`}
                                    className="text-sm font-normal"
                                  >
                                    {t(`listings.thingsToKnow.${item.key}`)}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {formData.listingType === 'replacement' && (
                    <Card className="transition-shadow hover:shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          {t('listings.create.monthlyCosts')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid items-end gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="rent">{t('listings.create.rentPln')} *</Label>
                            <Input
                              id="rent"
                              type="number"
                              placeholder="e.g., 3200"
                              value={formData.rent}
                              onChange={(e) => updateFormData({ rent: e.target.value })}
                            />
                            <FieldError field="rent" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="adminFee">{t('listings.create.adminFeePln')}</Label>
                            <Input
                              id="adminFee"
                              type="number"
                              placeholder="e.g., 350"
                              value={formData.adminFee}
                              onChange={(e) => updateFormData({ adminFee: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="utilities">
                              {t('listings.create.estUtilitiesPln')}
                            </Label>
                            <Input
                              id="utilities"
                              type="number"
                              placeholder="e.g., 250"
                              value={formData.utilities}
                              onChange={(e) => updateFormData({ utilities: e.target.value })}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('listings.create.adminFeeHint')}
                          {' · '}
                          {t('listings.create.extraBillsHint')}
                        </p>
                        <AnimatePresence>
                          {totalCost > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-lg bg-muted/50 p-4"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {t('listings.create.totalMonthlyCost')}
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

                  {formData.listingType === 'roommate' && (
                    <Card className="transition-shadow hover:shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          {t('listings.create.roommateDetails')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="pricePerPerson">
                              {t('listings.create.pricePerPerson')} *
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
                            <FieldError field="pricePerPerson" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="totalApartmentRent">
                              {t('listings.create.totalApartmentRent')}
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
                              {t('listings.create.currentRoommates')}
                            </Label>
                            <Select
                              value={formData.currentRoommates}
                              onValueChange={(value) => updateFormData({ currentRoommates: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('listings.create.select')} />
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
                            <Label htmlFor="totalRooms">{t('listings.create.totalRooms')}</Label>
                            <Select
                              value={formData.totalRooms}
                              onValueChange={(value) => updateFormData({ totalRooms: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('listings.create.select')} />
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
                            <Label htmlFor="roomType">{t('listings.create.roomType')}</Label>
                            <Select
                              value={formData.roomType}
                              onValueChange={(value) => updateFormData({ roomType: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('listings.create.select')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="private">
                                  {t('listings.create.roomTypePrivate')}
                                </SelectItem>
                                <SelectItem value="shared">
                                  {t('listings.create.roomTypeShared')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="preferredGender">
                              {t('listings.create.preferredGender')}
                            </Label>
                            <Select
                              value={formData.preferredGender}
                              onValueChange={(value) => updateFormData({ preferredGender: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">
                                  {t('listings.create.genderAny')}
                                </SelectItem>
                                <SelectItem value="male">
                                  {t('listings.create.genderMale')}
                                </SelectItem>
                                <SelectItem value="female">
                                  {t('listings.create.genderFemale')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="preferredAgeMin">{t('listings.create.ageMin')}</Label>
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
                            <Label htmlFor="preferredAgeMax">{t('listings.create.ageMax')}</Label>
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
                            {t('listings.create.depositAmount')}
                          </Label>
                          <Input
                            id="depositAmount"
                            type="number"
                            placeholder="e.g., 1200"
                            value={formData.depositAmount}
                            onChange={(e) => updateFormData({ depositAmount: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="roommateDescription">
                            {t('listings.create.roommateDescription')}
                          </Label>
                          <Textarea
                            id="roommateDescription"
                            rows={3}
                            placeholder={t('listings.create.roommateDescPlaceholder')}
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

                  {formData.listingType === 'sublet' && (
                    <Card className="transition-shadow hover:shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarClock className="h-5 w-5" />
                          {t('listings.create.subletDetails')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="priceTotal">{t('listings.create.priceTotal')} *</Label>
                            <Input
                              id="priceTotal"
                              type="number"
                              placeholder="e.g., 4000"
                              value={formData.priceTotal}
                              onChange={(e) => updateFormData({ priceTotal: e.target.value })}
                            />
                            <FieldError field="priceTotal" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="depositAmountSublet">
                              {t('listings.create.depositAmount')}
                            </Label>
                            <Input
                              id="depositAmountSublet"
                              type="number"
                              placeholder="e.g., 2000"
                              value={formData.depositAmount}
                              onChange={(e) => updateFormData({ depositAmount: e.target.value })}
                            />
                          </div>
                        </div>
                        {subletPricePerDay > 0 && (
                          <div className="rounded-lg bg-muted/50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {t('listings.create.pricePerDay')}
                              </span>
                              <span className="text-xl font-bold text-primary">
                                ~{subletPricePerDay} PLN{t('listings.create.perDay')}
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
                            <Label htmlFor="utilitiesIncluded" className="text-sm font-normal">
                              {t('listings.create.utilitiesIncluded')}
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
                            <Label htmlFor="internetIncluded" className="text-sm font-normal">
                              {t('listings.create.internetIncluded')}
                            </Label>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="subletRules">{t('listings.create.subletRules')}</Label>
                          <Textarea
                            id="subletRules"
                            rows={3}
                            placeholder={t('listings.create.subletRulesPlaceholder')}
                            value={formData.subletRules}
                            onChange={(e) => updateFormData({ subletRules: e.target.value })}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}

              {currentStep === 'photos' && (
                <motion.div key="photos" {...stepTransition}>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        {t('listings.create.photosTitle')}
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
                          onChange={handlePhotoAdd}
                        />

                        <motion.div
                          whileHover={
                            photos.length < MAX_PHOTOS
                              ? { scale: 1.01, borderColor: 'hsl(var(--primary) / 0.5)' }
                              : {}
                          }
                          whileTap={photos.length < MAX_PHOTOS ? { scale: 0.99 } : {}}
                          onClick={() => {
                            if (photos.length < MAX_PHOTOS) {
                              fileInputRef.current?.click();
                            }
                          }}
                          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                            photos.length >= MAX_PHOTOS
                              ? 'border-muted cursor-not-allowed opacity-50'
                              : 'border-muted-foreground/25 cursor-pointer hover:bg-muted/50'
                          }`}
                        >
                          <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                          <p className="font-medium">
                            {photos.length >= MAX_PHOTOS
                              ? t('listings.create.maxPhotosReached')
                              : t('listings.create.uploadPhotos')}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {photos.length}/{MAX_PHOTOS} — {t('listings.create.uploadHint')}
                          </p>
                        </motion.div>

                        {photos.length > 0 && (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragCancel={handleDragCancel}
                          >
                            <SortableContext
                              items={photos.map((p) => p.id)}
                              strategy={rectSortingStrategy}
                            >
                              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                {photos.map((photo, index) => (
                                  <SortablePhoto
                                    key={photo.id}
                                    photo={photo}
                                    index={index}
                                    onRemove={removePhoto}
                                    coverLabel={t('listings.create.cover')}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                              {activePhoto ? <PhotoOverlay photo={activePhoto} /> : null}
                            </DragOverlay>
                          </DndContext>
                        )}

                        <p className="text-sm text-muted-foreground">
                          {t('listings.create.photoHint')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {currentStep === 'preview' && (
                <motion.div key="preview" {...stepTransition} className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        {t('listings.create.previewTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {photos.length > 0 && (
                        <div className="mb-6 aspect-video overflow-hidden rounded-lg">
                          <img
                            src={photos[0].url}
                            alt="Cover"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      <div className="mb-3 flex items-center gap-2">
                        {(() => {
                          const TypeBadgeIcon = typeConfig[formData.listingType].icon;
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
                        {formData.title || t('listings.create.untitledListing')}
                      </h2>
                      <p className="mt-1 text-muted-foreground">
                        {formData.street} {formData.buildingNumber}
                        {formData.apartmentNumber && `/${formData.apartmentNumber}`},{' '}
                        {formData.district || 'District'}, Warsaw
                      </p>

                      <div className="mt-4 flex flex-wrap gap-4 text-sm">
                        <span>
                          {formData.bedrooms || '?'} {t('listings.detail.bedrooms')}
                        </span>
                        <span>
                          {formData.bathrooms || '?'} {t('listings.detail.bathrooms')}
                        </span>
                        <span>{formData.area || '?'} m²</span>
                        <span>
                          {t('listings.detail.floor')} {formData.floor || '?'}
                        </span>
                      </div>

                      {formData.description && (
                        <p className="mt-4 text-muted-foreground">{formData.description}</p>
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

                      {formData.thingsToKnow.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-sm font-semibold mb-2">
                            {t('listings.create.thingsToKnow')}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {formData.thingsToKnow.map((k) => (
                              <span
                                key={k}
                                className="rounded-full bg-muted px-3 py-1 text-xs font-medium"
                              >
                                {t(`listings.thingsToKnow.${k}`)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {formData.listingType === 'replacement' && (
                        <div className="mt-6 rounded-lg bg-muted/50 p-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('common.rent')}</span>
                              <span>{formData.rent || 0} PLN</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('common.adminFee')}</span>
                              <span>{formData.adminFee || 0} PLN</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('common.estUtilities')}
                              </span>
                              <span>~{formData.utilities || 0} PLN</span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span className="font-semibold">{t('common.totalMonthly')}</span>
                              <span className="text-lg font-bold text-primary">
                                ~{totalCost.toLocaleString()} PLN
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {formData.listingType === 'roommate' && (
                        <div className="mt-6 rounded-lg bg-muted/50 p-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('listings.create.pricePerPerson')}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                {formData.pricePerPerson || 0} PLN{t('listings.create.perPerson')}
                              </span>
                            </div>
                            {formData.totalApartmentRent && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t('listings.create.totalApartmentRent')}
                                </span>
                                <span>{formData.totalApartmentRent} PLN</span>
                              </div>
                            )}
                            {formData.currentRoommates && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t('listings.create.currentRoommates')}
                                </span>
                                <span>
                                  {formData.currentRoommates} {t('listings.create.roommates')}
                                </span>
                              </div>
                            )}
                            {formData.roomType && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t('listings.create.roomType')}
                                </span>
                                <span>
                                  {formData.roomType === 'private'
                                    ? t('listings.create.privateRoom')
                                    : t('listings.create.sharedRoom')}
                                </span>
                              </div>
                            )}
                            {formData.depositAmount && (
                              <div className="flex justify-between border-t pt-2">
                                <span className="text-muted-foreground">
                                  {t('listings.create.depositAmount')}
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

                      {formData.listingType === 'sublet' && (
                        <div className="mt-6 rounded-lg bg-muted/50 p-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('listings.create.subletPeriod')}
                              </span>
                              <span>
                                {formData.availableFrom} — {formData.availableTo}
                                {subletDays > 0 && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({subletDays} {t('listings.create.days')})
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {t('listings.create.priceTotal')}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                {formData.priceTotal || 0} PLN
                              </span>
                            </div>
                            {subletPricePerDay > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {t('listings.create.pricePerDay')}
                                </span>
                                <span>
                                  ~{subletPricePerDay} PLN{t('listings.create.perDay')}
                                </span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 border-t pt-2">
                              {formData.utilitiesIncluded && (
                                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  {t('listings.create.utilitiesInclYes')}
                                </span>
                              )}
                              {formData.internetIncluded && (
                                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  {t('listings.create.internetInclYes')}
                                </span>
                              )}
                            </div>
                            {formData.subletRules && (
                              <div className="border-t pt-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {t('listings.create.rulesLabel')}:
                                </span>
                                <p className="mt-1 text-sm">{formData.subletRules}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {!editId && promotedListingsEnabled && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Sparkles className="h-5 w-5" />
                          {t('listings.create.promotionOptional')}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {t('listings.create.promoteDesc')}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-4">
                          {([0, 7, 14, 30] as const).map((days) => (
                            <button
                              key={days}
                              onClick={() => setPromoteDays(days)}
                              className={`rounded-lg border-2 px-3 py-2.5 text-center text-sm font-medium transition-all ${
                                promoteDays === days
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-muted hover:border-muted-foreground/30'
                              }`}
                            >
                              {days === 0
                                ? t('listings.create.promotionNone')
                                : t(`listings.create.promote${days}days`)}
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {!editId && (
                    <Card>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {t('listings.create.paidListingFee')}
                          </span>
                          <span className={overLimit ? 'font-medium' : ''}>
                            {overLimit
                              ? `${PRICES_PLN.EXTRA_LISTING} PLN`
                              : t('listings.create.freeListingLabel', {
                                  used: activeFreeListings ?? '?',
                                  limit: FREE_LISTING_LIMIT,
                                })}
                          </span>
                        </div>
                        {effectivePromoteDays > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t('listings.create.promotionLabel')} ({effectivePromoteDays}d)
                            </span>
                            <span>{promotePrice(effectivePromoteDays)} PLN</span>
                          </div>
                        )}
                        {needsPayment && (
                          <>
                            <div className="flex justify-between border-t pt-3 font-semibold">
                              <span>{t('listings.create.totalLabel')}</span>
                              <span className="text-primary">{orderTotal} PLN</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-tight mt-2">
                              {t('listings.create.checkoutWaiverNote')}
                            </p>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {overLimit && !editId && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      {t('listings.create.paidListingNotice', { limit: FREE_LISTING_LIMIT })}
                    </div>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
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
                {t('common.back')}
              </Button>

              {currentStep === 'preview' ? (
                <Button
                  onClick={handlePublish}
                  disabled={isSubmitting || (!editId && !photoStore.allUploaded())}
                  className="gap-2 transition-transform hover:scale-[1.02]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('listings.create.publishing')}
                    </>
                  ) : editId ? (
                    <>
                      {t('listings.create.saveChanges')}
                      <Check className="h-4 w-4" />
                    </>
                  ) : needsPayment ? (
                    <>
                      {t('listings.create.continueToPayment', { total: orderTotal })}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      {t('listings.create.publishListing')}
                      <Check className="h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="gap-2 transition-transform hover:scale-[1.02]"
                >
                  {t('common.continue')}
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
