import { MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Placeholder shown while the (code-split, WebGL-only) Mapbox map chunk loads.
 * Fills its parent (`h-full w-full`) so the caller controls the reserved height,
 * keeping layout shift at zero. The pulse is automatically neutralised under
 * `prefers-reduced-motion` by the global reduced-motion rule in globals.css.
 */
export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading map"
      className={cn(
        'relative h-full w-full overflow-hidden rounded-lg border bg-muted/30',
        className,
      )}
    >
      <div className="absolute inset-0 animate-pulse bg-muted/40" />
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <MapPin
        aria-hidden
        className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-pulse text-muted-foreground/60"
      />
    </div>
  );
}
