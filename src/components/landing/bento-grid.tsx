import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/ui/reveal';
import { ArrowRight, TrendingDown, Building2, Droplets, ShieldCheck, Eye } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

interface BentoItem {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  className: string;
  gradient: string;
  featured?: boolean;
}

const bentoItems: BentoItem[] = [
  {
    titleKey: 'realCostDataTitle',
    descKey: 'realCostDataDesc',
    icon: Eye,
    className: 'lg:col-span-2 lg:row-span-2',
    gradient: 'from-accent/20 via-transparent to-transparent',
    featured: true,
  },
  {
    titleKey: 'saveDepositTitle',
    descKey: 'saveDepositDesc',
    icon: TrendingDown,
    className: 'lg:col-span-1',
    gradient: 'from-accent/10 via-transparent to-transparent',
  },
  {
    titleKey: 'buildingFactsTitle',
    descKey: 'buildingFactsDesc',
    icon: Building2,
    className: 'lg:col-span-1',
    gradient: 'from-accent/10 via-transparent to-transparent',
  },
  {
    titleKey: 'hiddenChargesTitle',
    descKey: 'hiddenChargesDesc',
    icon: Droplets,
    className: 'lg:col-span-1',
    gradient: 'from-accent/10 via-transparent to-transparent',
  },
  {
    titleKey: 'depositReturnTitle',
    descKey: 'depositReturnDesc',
    icon: ShieldCheck,
    className: 'lg:col-span-1',
    gradient: 'from-accent/10 via-transparent to-transparent',
  },
];

export async function BentoGrid() {
  const t = await getTranslations('landing.bentoGrid');

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 dot-pattern opacity-30" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <Reveal className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('titleBefore')} <span className="gradient-text">{t('titleHighlight')}</span>
            {t('titleAfter')}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </Reveal>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-4">
          {bentoItems.map((item, index) => (
            <Reveal
              key={item.titleKey}
              delay={index * 0.1}
              // No backdrop-blur here: each tile is a <Reveal> that keeps
              // `will-change: transform` promoted for its lifetime, and a
              // permanently-promoted backdrop-filter layer sampling the
              // high-frequency .dot-pattern behind it shimmers/flickers on
              // desktop repaints. The blur over that faint pattern is barely
              // visible (it's already dropped on touch via the pointer:coarse
              // rule in globals.css), so we drop it on every pointer here.
              className={`group relative overflow-hidden rounded-3xl border border-border/50 bg-card/50 ${item.className}`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />

              <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              </div>

              <div
                className={`relative z-10 flex h-full flex-col p-6 sm:p-8 ${item.featured ? 'min-h-[300px] justify-between lg:min-h-[400px]' : 'min-h-[180px]'}`}
              >
                <div
                  className={`mb-4 flex items-center justify-center rounded-2xl bg-secondary transition-transform group-hover:scale-110 ${item.featured ? 'h-14 w-14' : 'h-12 w-12'}`}
                >
                  <item.icon className={`text-accent ${item.featured ? 'h-7 w-7' : 'h-5 w-5'}`} />
                </div>

                <div>
                  <h3
                    className={`mb-2 font-semibold ${item.featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}
                  >
                    {t(item.titleKey)}
                  </h3>
                  <p
                    className={`text-muted-foreground ${item.featured ? 'text-base sm:text-lg' : 'text-sm'}`}
                  >
                    {t(item.descKey)}
                  </p>
                </div>

                {item.featured && (
                  <Link
                    href={`/${DEFAULT_CITY}/costs`}
                    className="group/link mt-4 inline-flex items-center text-accent hover:underline"
                  >
                    {t('exploreCta')}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                )}
              </div>

              <div className="pointer-events-none absolute inset-0 rounded-3xl border border-accent/0 transition-colors duration-300 group-hover:border-accent/30" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
