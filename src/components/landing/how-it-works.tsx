import { getTranslations } from 'next-intl/server';
import { HowItWorksTabs } from './how-it-works-tabs';

export async function HowItWorks() {
  const t = await getTranslations('landing.howItWorks');

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h2>
          <p className="mt-4 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <HowItWorksTabs />
      </div>
    </section>
  );
}
