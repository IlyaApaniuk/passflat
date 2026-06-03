'use client';

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { TemplateDownload, type DocumentKey } from '@/components/documents/template-download';

const DOCS: DocumentKey[] = ['cesja', 'podnajem', 'wspollokatorska'];

export function ResourcesClient() {
  const t = useTranslations('documents');

  return (
    <>
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('resources.title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t('resources.subtitle')}
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <p className="mx-auto mb-10 max-w-3xl text-center text-muted-foreground">
            {t('resources.intro')}
          </p>

          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {DOCS.map((doc) => (
              <TemplateDownload key={doc} documentKey={doc} source="resources" showDescription />
            ))}
          </div>

          <div className="mx-auto mt-12 flex max-w-3xl items-start gap-3 rounded-lg border bg-card p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('resources.disclaimer')}</p>
          </div>
        </div>
      </section>
    </>
  );
}
