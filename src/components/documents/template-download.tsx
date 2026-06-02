'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import { FileText, FileType2, ShieldAlert } from 'lucide-react';
import type { ListingType } from '@/lib/listings-data';

export type DocumentKey = 'cesja' | 'podnajem' | 'wspollokatorska';

export type TemplateSource = 'listing' | 'resources' | 'how_it_works' | 'blog' | 'chat';

export const LISTING_TYPE_TO_DOC: Record<ListingType, DocumentKey> = {
  replacement: 'cesja',
  sublet: 'podnajem',
  roommate: 'wspollokatorska',
};

const DOC_BASENAME: Record<DocumentKey, string> = {
  cesja: 'cesja-umowy-najmu',
  podnajem: 'umowa-podnajmu',
  wspollokatorska: 'umowa-wspollokatorska',
};

const TRANSLATED_LOCALES = ['uk', 'en', 'ru'];

export function templatePdfHref(docKey: DocumentKey, locale: string): string {
  const base = DOC_BASENAME[docKey];
  return TRANSLATED_LOCALES.includes(locale)
    ? `/documents/${base}-${locale}.pdf`
    : `/documents/${base}.pdf`;
}

interface TemplateDownloadProps {
  source: TemplateSource;
  documentKey?: DocumentKey;
  listingType?: ListingType;
  showDescription?: boolean;
  className?: string;
}

export function TemplateDownload({
  source,
  documentKey,
  listingType,
  showDescription = false,
  className,
}: TemplateDownloadProps) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const posthog = usePostHog();

  if (!isDocumentTemplatesEnabled()) return null;

  const docKey: DocumentKey =
    documentKey ?? (listingType ? LISTING_TYPE_TO_DOC[listingType] : 'cesja');
  const base = DOC_BASENAME[docKey];

  const isTranslated = TRANSLATED_LOCALES.includes(locale);
  const pdfHref = templatePdfHref(docKey, locale);
  const docxHref = `/documents/${base}.docx`;

  const track = (format: 'pdf' | 'docx', fileLocale: string) => {
    posthog?.capture('template_downloaded', {
      template: docKey,
      format,
      locale: fileLocale,
      ...(listingType ? { listingType } : {}),
      source,
    });
  };

  return (
    <div className={cn('flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm', className)}>
      <div className="flex flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight">{t(`docs.${docKey}.title`)}</h3>
          {showDescription && (
            <p className="mt-1 text-sm text-muted-foreground">{t(`docs.${docKey}.description`)}</p>
          )}
        </div>
      </div>

      <div className="mt-3 inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        <span>{t('badge')}</span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href={pdfHref}
          download
          onClick={() => track('pdf', locale)}
          className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-2')}
        >
          <FileText className="h-4 w-4" />
          {t('downloadPdf')}
        </a>
        <a
          href={docxHref}
          download
          onClick={() => track('docx', 'pl')}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        >
          <FileType2 className="h-4 w-4" />
          {t('downloadDocx')}
        </a>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {isTranslated ? t('localeNote') : t('formatNote')}
      </p>
    </div>
  );
}
