'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePhotoUploadStore } from '@/stores/publish-store';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PublishSnackbar() {
  const t = useTranslations('upload');
  const { photos } = usePhotoUploadStore();
  const [dismissed, setDismissed] = useState(false);

  const uploading = photos.filter((p) => p.status === 'compressing' || p.status === 'uploading');
  const errors = photos.filter((p) => p.status === 'error');
  const done = photos.filter((p) => p.status === 'done');

  // New activity (a fresh upload batch or a retry) re-surfaces a dismissed toast.
  // State adjustment during render (guarded) — the React-endorsed alternative to
  // a setState-in-effect cascade.
  if (dismissed && uploading.length > 0) {
    setDismissed(false);
  }

  const hasActivity = uploading.length > 0 || errors.length > 0;
  if (!hasActivity || dismissed) return null;

  const total = photos.length;
  const pct = total > 0 ? (done.length / total) * 100 : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 80, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 80, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-popover p-4 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {uploading.length > 0 && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {uploading.length === 0 && errors.length > 0 && (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            {uploading.length === 0 && errors.length === 0 && (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {uploading.length > 0
                ? t('progress', { done: done.length, total })
                : errors.length > 0
                  ? t('failed', { count: errors.length })
                  : t('allDone')}
            </p>

            {uploading.length > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            )}

            {uploading.length === 0 && errors.length > 0 && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => usePhotoUploadStore.getState().retryAllFailed()}
                >
                  {t('retryAll', { count: errors.length })}
                </Button>
              </div>
            )}
          </div>

          {uploading.length === 0 && (
            <button
              onClick={() => setDismissed(true)}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
