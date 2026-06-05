import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Home, Search } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { Button } from '@/components/ui/button';

const DEFAULT_CITY = 'warsaw';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors.notFound');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function LocaleNotFound() {
  const t = await getTranslations('errors.notFound');

  return (
    <div className="flex min-h-screen flex-col">
      <main className="relative flex flex-1 items-center justify-center overflow-hidden pt-24">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="absolute -left-32 top-1/4 h-96 w-96 animate-pulse rounded-full bg-accent/20 blur-[120px]" />
        <div
          className="absolute -right-32 bottom-1/4 h-96 w-96 animate-pulse rounded-full bg-accent/10 blur-[120px]"
          style={{ animationDelay: '1s' }}
        />

        <div className="relative z-10 container mx-auto px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="gradient-text text-7xl font-bold leading-none tracking-tight sm:text-8xl">
              {t('code')}
            </p>
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{t('heading')}</h1>
            <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
              {t('description')}
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="group h-12 rounded-full px-8 text-base">
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  {t('home')}
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full px-8 text-base"
              >
                <Link href={`/${DEFAULT_CITY}/replacement`}>
                  <Search className="mr-2 h-4 w-4" />
                  {t('browse')}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
