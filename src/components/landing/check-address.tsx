import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/ui/reveal';
import { MapPinned, Receipt, Search, Sparkles, TramFront } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface CheckAddressProps {
  citySlug?: string;
}

/**
 * Top-of-funnel band directly under the hero: free instant value (a location
 * score for any Warsaw address) before the cost-report ask.
 *
 * The search box is a link shaped like an input rather than a live
 * autocomplete. Mounting the real one would pull the Google Maps JS SDK into
 * every landing view — a heavy script plus Places session tokens — to serve the
 * minority who actually search. The checker page owns the real input.
 */
export async function CheckAddress({ citySlug = DEFAULT_CITY }: CheckAddressProps) {
  const t = await getTranslations('landing.checkAddress');

  const points = [
    { icon: TramFront, label: t('pointTransit') },
    { icon: MapPinned, label: t('pointAmenities') },
    { icon: Receipt, label: t('pointCosts') },
  ];

  return (
    <section className="relative overflow-hidden py-20 sm:py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

      <div className="relative z-10 container mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent">
            <Sparkles className="h-4 w-4" />
            {t('badge')}
          </div>

          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('title')} <span className="gradient-text">{t('titleHighlight')}</span>
          </h2>

          <p className="mb-8 text-lg text-muted-foreground">{t('subtitle')}</p>

          <Link
            href={`/${citySlug}/check`}
            className="group flex items-center gap-3 rounded-full border border-border/60 bg-card/80 px-5 py-4 text-left shadow-sm backdrop-blur-sm transition-colors hover:border-accent/50 hover:bg-card"
          >
            <Search className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
            <span className="flex-1 truncate text-muted-foreground">{t('inputPlaceholder')}</span>
            <span className="hidden shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground sm:inline">
              {t('cta')}
            </span>
          </Link>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {points.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-accent" />
                {label}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-muted-foreground">{t('free')}</p>
        </Reveal>
      </div>
    </section>
  );
}
