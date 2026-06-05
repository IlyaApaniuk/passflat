import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading shell for the create-listing wizard. Mirrors `CreateListingForm`'s
 * layout — centered step indicator followed by a `max-w-2xl` card with a header
 * and stacked field rows — so the Suspense fallback reserves the same space and
 * keeps CLS at 0. Pulse is neutralised under `prefers-reduced-motion` via the
 * global reduced-motion rule in globals.css.
 */
export function CreateListingFormSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" role="status" aria-label="Loading form">
      <main className="flex-1 bg-muted/30 pt-24">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-center justify-center">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center">
                <Skeleton className="h-9 w-24 rounded-full sm:w-32" />
                {i < 3 && <Skeleton className="mx-2 h-0.5 w-8 sm:w-12" />}
              </div>
            ))}
          </div>

          <div className="mx-auto max-w-2xl">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="mt-6 space-y-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
              <div className="mt-8 flex justify-between">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-28" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
