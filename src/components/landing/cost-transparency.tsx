import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { ArrowRight, Eye, ShieldCheck } from 'lucide-react';
import {
  CostTransparencyCard,
  SubmitCostsButton,
  type CostBuildingData,
} from './cost-transparency-card';

const DEFAULT_CITY = 'warsaw';

interface CostTransparencyProps {
  citySlug?: string;
  buildingData?: CostBuildingData;
}

export async function CostTransparency({
  citySlug = DEFAULT_CITY,
  buildingData,
}: CostTransparencyProps) {
  const t = await getTranslations();

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

      <div className="relative z-10 container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Content */}
          <Reveal variant="left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent">
              <Eye className="h-4 w-4" />
              {t('landing.costTransparency.badge')}
            </div>

            <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {t('landing.costTransparency.title')}{' '}
              <span className="gradient-text">{t('landing.costTransparency.titleHighlight')}</span>
            </h2>

            <p className="mb-8 text-lg text-muted-foreground">
              {t('landing.costTransparency.subtitle')}
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" className="group rounded-full" asChild>
                <Link href={`/${citySlug}/costs`}>
                  {t('landing.costTransparency.viewReports')}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <SubmitCostsButton citySlug={citySlug} />
            </div>
          </Reveal>

          {/* Interactive Card */}
          <div className="relative">
            <CostTransparencyCard citySlug={citySlug} buildingData={buildingData} />

            <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-border/50 bg-card/80 px-4 py-2 text-sm backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="text-muted-foreground">
                {t('landing.costTransparency.anonymousVerified')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
