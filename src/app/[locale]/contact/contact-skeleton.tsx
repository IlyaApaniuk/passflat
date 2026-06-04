import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading state for the contact page (`ContactClient` reads `useSearchParams`,
 * so it streams in behind a Suspense boundary). Mirrors the hero band and the
 * form/sidebar grid so the fallback reserves the same space and keeps CLS at 0.
 */
export function ContactSkeleton() {
  return (
    <div role="status" aria-label="Loading contact form">
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto flex flex-col items-center px-4 text-center">
          <Skeleton className="h-10 w-64 md:h-12" />
          <Skeleton className="mt-4 h-6 w-full max-w-2xl" />
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-4xl gap-12 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-36 w-full" />
              </div>
              <Skeleton className="h-11 w-40" />
            </div>

            <div className="space-y-4 lg:col-span-2">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
