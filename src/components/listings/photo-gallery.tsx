'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Expand, Grid3X3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';

interface PhotoGalleryProps {
  images: string[];
  title: string;
}

export function PhotoGallery({ images, title }: PhotoGalleryProps) {
  const t = useTranslations();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setLightboxOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, handlePrevious, handleNext]);

  if (images.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-muted/50 border border-border/50">
        <p className="text-muted-foreground">{t('common.noImagesAvailable')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-1.5 overflow-hidden rounded-xl">
        {images.length === 1 ? (
          <motion.button
            whileHover={{ scale: 1.005 }}
            onClick={() => {
              setCurrentIndex(0);
              setLightboxOpen(true);
            }}
            className="group relative aspect-[2/1] cursor-pointer overflow-hidden rounded-xl"
          >
            <img
              src={images[0]}
              alt={`${title} - Photo 1`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg bg-background/90 px-3 py-1.5 text-sm font-medium opacity-0 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2">
              <Expand className="h-4 w-4" />
              {t('common.viewPhotos')}
            </div>
          </motion.button>
        ) : (
          <div className="grid grid-cols-4 grid-rows-2 gap-1.5" style={{ height: '280px' }}>
            <motion.button
              whileHover={{ scale: 1.01 }}
              onClick={() => {
                setCurrentIndex(0);
                setLightboxOpen(true);
              }}
              className="group relative col-span-2 row-span-2 cursor-pointer overflow-hidden rounded-l-xl"
            >
              <img
                src={images[0]}
                alt={`${title} - Photo 1`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </motion.button>

            {images.slice(1, 5).map((image, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.02 }}
                onClick={() => {
                  setCurrentIndex(index + 1);
                  setLightboxOpen(true);
                }}
                className={`group relative cursor-pointer overflow-hidden ${
                  index === 1 ? 'rounded-tr-xl' : index === 3 ? 'rounded-br-xl' : ''
                }`}
              >
                <img
                  src={image}
                  alt={`${title} - Photo ${index + 2}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />

                {index === 3 && images.length > 5 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-1">
                      <Grid3X3 className="h-5 w-5 text-white" />
                      <span className="text-sm font-semibold text-white">
                        {t('common.morePhotos', { count: images.length - 5 })}
                      </span>
                    </div>
                  </div>
                )}
              </motion.button>
            ))}

            {images.length < 5 &&
              Array.from({ length: Math.min(4, 5 - images.length) }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className={`bg-muted/50 ${
                    images.length + index === 2
                      ? 'rounded-tr-xl'
                      : images.length + index === 4
                        ? 'rounded-br-xl'
                        : ''
                  }`}
                />
              ))}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="mt-3 w-full gap-2 md:hidden"
        onClick={() => {
          setCurrentIndex(0);
          setLightboxOpen(true);
        }}
      >
        <Expand className="h-4 w-4" />
        {t('common.viewAllPhotos', { count: images.length })}
      </Button>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-none bg-black/95 p-0 sm:max-w-none"
        >
          <VisuallyHidden>
            <DialogTitle>{title}</DialogTitle>
          </VisuallyHidden>
          <div className="relative flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm text-white/70">
                {currentIndex + 1} / {images.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLightboxOpen(false)}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentIndex}
                  src={images[currentIndex]}
                  alt={`${title} - Photo ${currentIndex + 1}`}
                  className="max-h-full max-w-full object-contain"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                />
              </AnimatePresence>

              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevious}
                    className="absolute left-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white transition-all"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white transition-all"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </Button>
                </>
              )}
            </div>

            <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 p-4 scrollbar-thin">
              {images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-md transition-all duration-200 ${
                    index === currentIndex
                      ? 'ring-2 ring-primary scale-105'
                      : 'opacity-50 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <img
                    src={image}
                    alt={`Thumbnail ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
