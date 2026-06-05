import { MapSkeleton } from '@/components/map/map-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A single listing-card placeholder mirroring the horizontal layout of
 * `ListingCard` (image on the left, text rows on the right).
 */
function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col sm:flex-row">
        <Skeleton className="aspect-[4/3] w-full shrink-0 rounded-none sm:min-h-36 sm:w-48" />
        <div className="flex-1 space-y-2 p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="mt-3 h-6 w-24" />
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen loading state for the listings page. Mirrors the real layout in
 * `ListingsPageInner` — desktop filter rail, toolbar, active-filters bar, and a
 * split list/map column — so swapping to the loaded UI causes no layout shift.
 */
export function ListingsPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading listings"
      className="flex h-screen flex-col overflow-hidden pt-24"
    >
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-72 shrink-0 overflow-hidden border-r border-border/50 bg-card/50 p-5 xl:block">
          <Skeleton className="h-6 w-32" />
          <div className="mt-6 space-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b bg-card px-4 py-3">
            <Skeleton className="mb-2 h-4 w-40" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-24" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-[140px] sm:w-[180px]" />
                <Skeleton className="h-9 w-9 xl:hidden" />
              </div>
            </div>
          </div>

          <div className="border-b bg-card px-4 py-2">
            <Skeleton className="h-6 w-48" />
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="hidden flex-1 space-y-3 overflow-y-auto p-4 xl:block xl:max-w-xl">
              {Array.from({ length: 5 }).map((_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </div>
            <div className="relative flex-1 border-l">
              <div className="absolute inset-0">
                <MapSkeleton className="rounded-none border-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
