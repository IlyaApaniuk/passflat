'use client';

import { useTranslations } from 'next-intl';

export function TermsClient() {
  const t = useTranslations('termsPage');

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
              <li>{t('service.item4')}</li>
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
              <li>{t('costReports.item4')}</li>
            </ul>

            {/* 6. Payments */}
            <h2>{t('payments.title')}</h2>
            <p>{t('payments.p1')}</p>
            <p>{t('payments.immediate')}</p>
            <p>{t('payments.serviceOutcome')}</p>
            <p>{t('payments.refunds')}</p>

            {/* 7. Liability */}
            <h2>{t('liability.title')}</h2>
            <ul>
              <li>{t('liability.item1')}</li>
              <li>{t('liability.item2')}</li>
              <li>{t('liability.item3')}</li>
              <li>{t('liability.item4')}</li>
            </ul>

            {/* 8. Intellectual Property */}
            <h2>{t('ip.title')}</h2>
            <p>{t('ip.p1')}</p>
            <p>{t('ip.p2')}</p>

            {/* 9. Right of Withdrawal */}
            <h2>{t('withdrawal.title')}</h2>
            <p>{t('withdrawal.p1')}</p>
            <p>{t('withdrawal.p2')}</p>
            <p>{t('withdrawal.p3')}</p>
            <h3>{t('withdrawal.formTitle')}</h3>
            <p>{t('withdrawal.formIntro')}</p>
            <p className="whitespace-pre-line rounded-lg border bg-muted/30 p-4 text-sm">
              {t('withdrawal.form')}
            </p>

            {/* 10. Digital Services Act */}
            <h2>{t('dsa.title')}</h2>
            <p>{t('dsa.intro')}</p>

            <h3>{t('dsa.removalTitle')}</h3>
            <p>{t('dsa.removalIntro')}</p>
            <ul>
              <li>{t('dsa.removal1')}</li>
              <li>{t('dsa.removal2')}</li>
              <li>{t('dsa.removal3')}</li>
              <li>{t('dsa.removal4')}</li>
            </ul>

            <h3>{t('dsa.complaintTitle')}</h3>
            <ul>
              <li>{t('dsa.complaint1')}</li>
              <li>{t('dsa.complaint2')}</li>
              <li>{t('dsa.complaint3')}</li>
            </ul>

            <h3>{t('dsa.rankingTitle')}</h3>
            <p>{t('dsa.ranking')}</p>

            <h3>{t('dsa.contactTitle')}</h3>
            <p>{t('dsa.contact')}</p>

            <h3>{t('dsa.odrTitle')}</h3>
            <p>{t('dsa.odrText')}</p>
            <p>
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('dsa.odrLink')}
              </a>
            </p>

            {/* 11. Governing Law */}
            <h2>{t('law.title')}</h2>
            <p>{t('law.text')}</p>

            {/* 12. Contact */}
            <h2>{t('contact.title')}</h2>
            <p>{t('contact.text')}</p>
            <p>{t('contact.operator')}</p>
            <p>
              <a href="mailto:contact@passflat.com">contact@passflat.com</a>
            </p>

            {/* 13. Force Majeure */}
            <h2>{t('forceMajeure.title')}</h2>
            <p>{t('forceMajeure.text')}</p>

            {/* 14. Changes */}
            <h2>{t('changes.title')}</h2>
            <p>{t('changes.text')}</p>
          </article>
        </div>
      </section>
    </>
  );
}
