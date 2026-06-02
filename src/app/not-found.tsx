import type { Metadata } from 'next';
import { Home } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found — Passflat',
  robots: { index: false, follow: false },
};

export default function RootNotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 grid-pattern opacity-50" />
      <div className="absolute -left-32 top-1/4 h-96 w-96 animate-pulse rounded-full bg-accent/20 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-md text-center">
        <span className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Home className="h-4 w-4 text-primary-foreground" />
          </span>
          Passflat
        </span>

        <p className="gradient-text mt-10 text-7xl font-bold leading-none tracking-tight sm:text-8xl">
          404
        </p>
        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">Page not found</h1>
        <p className="mx-auto mt-4 max-w-sm text-muted-foreground">
          The page you&rsquo;re looking for may have been moved, removed, or never existed.
        </p>

        <a
          href="/"
          className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90"
        >
          <Home className="h-4 w-4" />
          Back to home
        </a>
      </div>
    </main>
  );
}
