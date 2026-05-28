'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { usePublishStore, type PublishStatus } from '@/stores/publish-store';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}

function statusLabel(status: PublishStatus, current: number, total: number): string {
  switch (status) {
    case 'compressing':
      return `Compressing photos ${current}/${total}...`;
    case 'uploading':
      return `Uploading photos ${current}/${total}...`;
    case 'creating':
      return 'Creating listing...';
    case 'done':
      return 'Listing published!';
    case 'error':
      return 'Publishing failed';
    default:
      return '';
  }
}

export function PublishSnackbar() {
  const { status, progress, error, listingId, listingType, citySlug, retry, dismiss } =
    usePublishStore();
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (status === 'done') {
      autoDismissRef.current = setTimeout(() => dismiss(), 10000);
    }
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [status, dismiss]);

  if (status === 'idle') return null;

  const isActive = status === 'compressing' || status === 'uploading' || status === 'creating';

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
            {isActive && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {status === 'done' && <Check className="h-5 w-5 text-green-500" />}
            {status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {statusLabel(status, progress.current, progress.total)}
            </p>

            {isActive && <ProgressBar current={progress.current} total={progress.total} />}

            {status === 'error' && error && (
              <p className="mt-1 text-xs text-destructive truncate">{error}</p>
            )}

            {status === 'error' && (
              <Button size="sm" variant="outline" className="mt-2" onClick={retry}>
                Retry
              </Button>
            )}

            {status === 'done' && listingId && (
              <Button
                size="sm"
                variant="link"
                className="mt-1 h-auto p-0 text-primary"
                onClick={() => {
                  const city = citySlug || 'warsaw';
                  const type = listingType || 'replacement';
                  router.push(`/${locale}/${city}/${type}/${listingId}`);
                  dismiss();
                }}
              >
                View listing <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>

          {(status === 'done' || status === 'error') && (
            <button
              onClick={dismiss}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
