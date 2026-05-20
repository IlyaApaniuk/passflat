'use client';

import { useTranslations } from 'next-intl';

export function TermsClient() {
  const t = useTranslations('termsPage');

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('lastUpdated')}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <article className="mx-auto max-w-3xl space-y-4 text-muted-foreground [&>h2]:mt-10 [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-foreground [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-medium [&>h3]:text-foreground [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2">
            {/* 1. Acceptance */}
            <h2>{t('acceptance.title')}</h2>
            <p>{t('acceptance.p1')}</p>
            <p>{t('acceptance.p2')}</p>

            {/* 2. Service Description */}
            <h2>{t('service.title')}</h2>
            <ul>
              <li>{t('service.item1')}</li>
              <li>{t('service.item2')}</li>
              <li>{t('service.item3')}</li>
            </ul>

            {/* 3. User Accounts */}
            <h2>{t('accounts.title')}</h2>
            <ul>
              <li>{t('accounts.item1')}</li>
              <li>{t('accounts.item2')}</li>
              <li>{t('accounts.item3')}</li>
              <li>{t('accounts.item4')}</li>
            </ul>

            {/* 4. Listing Rules */}
            <h2>{t('listingRules.title')}</h2>
            <p>{t('listingRules.intro')}</p>
            <ul>
              <li>{t('listingRules.item1')}</li>
              <li>{t('listingRules.item2')}</li>
              <li>{t('listingRules.item3')}</li>
              <li>{t('listingRules.item4')}</li>
              <li>{t('listingRules.item5')}</li>
              <li>{t('listingRules.item6')}</li>
            </ul>

            {/* 5. Cost Reports */}
            <h2>{t('costReports.title')}</h2>
            <ul>
              <li>{t('costReports.item1')}</li>
              <li>{t('costReports.item2')}</li>
              <li>{t('costReports.item3')}</li>
            </ul>

            {/* 6. Payments */}
            <h2>{t('payments.title')}</h2>
            <p>{t('payments.p1')}</p>
            <p>{t('payments.p2')}</p>

            {/* 7. Liability */}
            <h2>{t('liability.title')}</h2>
            <ul>
              <li>{t('liability.item1')}</li>
              <li>{t('liability.item2')}</li>
              <li>{t('liability.item3')}</li>
            </ul>

            {/* 8. Intellectual Property */}
            <h2>{t('ip.title')}</h2>
            <p>{t('ip.p1')}</p>
            <p>{t('ip.p2')}</p>

            {/* 9. Governing Law */}
            <h2>{t('law.title')}</h2>
            <p>{t('law.text')}</p>

            {/* 10. Contact */}
            <h2>{t('contact.title')}</h2>
            <p>{t('contact.text')}</p>
            <p>
              <a href="mailto:legal@passflat.eu">legal@passflat.eu</a>
            </p>

            {/* 11. Changes */}
            <h2>{t('changes.title')}</h2>
            <p>{t('changes.text')}</p>
          </article>
        </div>
      </section>
    </>
  );
}
