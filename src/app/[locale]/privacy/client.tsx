'use client';

import { useTranslations } from 'next-intl';

export function PrivacyClient() {
  const t = useTranslations('privacy');

  const processors = [
    t('dataSharing.processors.supabase'),
    t('dataSharing.processors.vercel'),
    t('dataSharing.processors.resend'),
    t('dataSharing.processors.stripe'),
    t('dataSharing.processors.google'),
    t('dataSharing.processors.mapbox'),
    t('dataSharing.processors.posthog'),
  ];

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
            {/* Introduction */}
            <h2>{t('intro.title')}</h2>
            <p>{t('intro.p1')}</p>
            <p>{t('intro.p2')}</p>

            {/* Data We Collect */}
            <h2>{t('dataCollected.title')}</h2>
            <p>{t('dataCollected.intro')}</p>

            <h3>{t('dataCollected.account.title')}</h3>
            <ul>
              <li>{t('dataCollected.account.item1')}</li>
              <li>{t('dataCollected.account.item2')}</li>
            </ul>

            <h3>{t('dataCollected.listings.title')}</h3>
            <ul>
              <li>{t('dataCollected.listings.item1')}</li>
              <li>{t('dataCollected.listings.item2')}</li>
              <li>{t('dataCollected.listings.item3')}</li>
            </ul>

            <h3>{t('dataCollected.costReports.title')}</h3>
            <ul>
              <li>{t('dataCollected.costReports.item1')}</li>
              <li>{t('dataCollected.costReports.item2')}</li>
            </ul>

            <h3>{t('dataCollected.usage.title')}</h3>
            <ul>
              <li>{t('dataCollected.usage.item1')}</li>
              <li>{t('dataCollected.usage.item2')}</li>
            </ul>

            {/* How We Use Data */}
            <h2>{t('howWeUse.title')}</h2>
            <ul>
              <li>{t('howWeUse.item1')}</li>
              <li>{t('howWeUse.item2')}</li>
              <li>{t('howWeUse.item3')}</li>
              <li>{t('howWeUse.item4')}</li>
            </ul>
            <p className="font-semibold">{t('howWeUse.noSell')}</p>

            {/* Data Sharing */}
            <h2>{t('dataSharing.title')}</h2>
            <p>{t('dataSharing.intro')}</p>
            <ul>
              <li>{t('dataSharing.item1')}</li>
              <li>{t('dataSharing.item2')}</li>
            </ul>

            <h3>{t('dataSharing.processors.title')}</h3>
            <ul>
              {processors.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>

            {/* Data Retention */}
            <h2>{t('retention.title')}</h2>
            <ul>
              <li>{t('retention.account')}</li>
              <li>{t('retention.listings')}</li>
              <li>{t('retention.costReports')}</li>
            </ul>

            {/* Your Rights (GDPR) */}
            <h2>{t('rights.title')}</h2>
            <p>{t('rights.intro')}</p>
            <ul>
              <li>{t('rights.access')}</li>
              <li>{t('rights.rectification')}</li>
              <li>{t('rights.erasure')}</li>
              <li>{t('rights.portability')}</li>
              <li>{t('rights.objection')}</li>
              <li>{t('rights.withdrawConsent')}</li>
            </ul>
            <p>{t('rights.howToExercise')}</p>

            {/* Cookies */}
            <h2>{t('cookies.title')}</h2>
            <p>{t('cookies.intro')}</p>
            <ul>
              <li>{t('cookies.essential')}</li>
              <li>{t('cookies.analytics')}</li>
            </ul>

            {/* Contact */}
            <h2>{t('contact.title')}</h2>
            <p>{t('contact.text')}</p>
            <p>
              <a href="mailto:privacy@passflat.eu">privacy@passflat.eu</a>
            </p>

            {/* Changes */}
            <h2>{t('changes.title')}</h2>
            <p>{t('changes.text')}</p>
          </article>
        </div>
      </section>
    </>
  );
}
