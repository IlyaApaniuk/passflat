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
    t('dataSharing.processors.googleAnalytics'),
    t('dataSharing.processors.deepl'),
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('lastUpdated')}</p>
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
              <li>{t('dataCollected.costReports.item3')}</li>
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

            {/* Legal Bases */}
            <h3>{t('howWeUse.legalBases.title')}</h3>
            <ul>
              <li>{t('howWeUse.legalBases.contract')}</li>
              <li>{t('howWeUse.legalBases.legitimateInterest')}</li>
              <li>{t('howWeUse.legalBases.consent')}</li>
            </ul>

            {/* Imported cost reports */}
            <h3>{t('howWeUse.imported.title')}</h3>
            <p>{t('howWeUse.imported.description')}</p>

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
              <li>{t('retention.importedEmail')}</li>
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
              <li>{t('rights.restriction')}</li>
            </ul>
            <p>{t('rights.howToExercise')}</p>
            <p>{t('rights.complaint')}</p>

            {/* Cross-Border Data Transfers */}
            <h2>{t('transfers.title')}</h2>
            <p>{t('transfers.description')}</p>
            <p>{t('transfers.processors')}</p>

            {/* Cookies */}
            <h2>{t('cookies.title')}</h2>
            <p>{t('cookies.intro')}</p>
            <ul>
              <li>{t('cookies.essential')}</li>
              <li>{t('cookies.analytics')}</li>
            </ul>

            <h3>{t('cookies.tableTitle')}</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-foreground">
                    <th className="py-2 pr-4 font-medium">{t('cookies.tableName')}</th>
                    <th className="py-2 pr-4 font-medium">{t('cookies.tableCategory')}</th>
                    <th className="py-2 pr-4 font-medium">{t('cookies.tablePurpose')}</th>
                    <th className="py-2 font-medium">{t('cookies.tableDuration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(['sb', 'ph', 'ga', 'consent', 'locale'] as const).map((key) => (
                    <tr key={key} className="border-b">
                      <td className="py-2 pr-4 font-mono text-xs">{t(`cookies.${key}Name`)}</td>
                      <td className="py-2 pr-4">{t(`cookies.${key}Category`)}</td>
                      <td className="py-2 pr-4">{t(`cookies.${key}Purpose`)}</td>
                      <td className="py-2">{t(`cookies.${key}Duration`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Automated Decision-Making */}
            <h2>{t('automated.title')}</h2>
            <p>{t('automated.description')}</p>

            {/* Children's Data */}
            <h2>{t('children.title')}</h2>
            <p>{t('children.description')}</p>

            {/* Data Breach Notification */}
            <h2>{t('breach.title')}</h2>
            <p>{t('breach.description')}</p>
            <p>{t('breach.notification')}</p>

            {/* Data Protection Officer */}
            <h2>{t('dpo.title')}</h2>
            <p>{t('dpo.description')}</p>

            {/* Data Controller & Contact */}
            <h2>{t('contact.title')}</h2>
            <p>{t('contact.text')}</p>
            <ul>
              <li>{t('contact.controller')}</li>
              <li>{t('contact.location')}</li>
              <li>{t('contact.email')}</li>
            </ul>

            {/* Changes */}
            <h2>{t('changes.title')}</h2>
            <p>{t('changes.text')}</p>
          </article>
        </div>
      </section>
    </>
  );
}
