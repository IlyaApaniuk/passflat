import { getTranslations } from 'next-intl/server';
import { Handshake, Home, Search, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// PRD 4 FR-15 / FR-16 (D80): "how it works" shows the roommate steps only, the bot's four
// steps. The cesja and sublet tabs are gone, and one tab needs no tab strip.
const ROOMMATE_STEPS: { icon: LucideIcon; n: 1 | 2 | 3 | 4 }[] = [
  { icon: Search, n: 1 },
  { icon: Users, n: 2 },
  { icon: Handshake, n: 3 },
  { icon: Home, n: 4 },
];

export async function HowItWorks() {
  const t = await getTranslations('landing.howItWorks');

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h2>
          <p className="mt-4 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="relative mx-auto max-w-5xl">
          <div className="absolute left-0 right-0 top-12 hidden h-0.5 bg-border lg:block" />

          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {ROOMMATE_STEPS.map((step) => (
              <li key={step.n} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-violet-500/50 bg-violet-500/20 text-violet-500">
                  <step.icon className="h-10 w-10 text-violet-500" />
                  <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">
                    {step.n}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{t(`roommate.step${step.n}Title`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`roommate.step${step.n}Desc`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
