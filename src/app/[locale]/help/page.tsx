import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import { HelpCenterClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { JsonLd, faqPageJsonLd, breadcrumbJsonLd } from '@/lib/json-ld';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('helpCenter');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('helpDescription'),
    alternates: getAlternates('/help'),
    openGraph: {
      title: t('title'),
      description: m('helpDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default async function HelpPage() {
  const t = await getTranslations('helpCenter');

  const faqItems = [
    { question: t('general.q1'), answer: t('general.a1') },
    { question: t('general.q2'), answer: t('general.a2') },
    { question: t('general.q3'), answer: t('general.a3') },
    { question: t('general.q4'), answer: t('general.a4') },
    { question: t('leaseTakeovers.q1'), answer: t('leaseTakeovers.a1') },
    { question: t('leaseTakeovers.q2'), answer: t('leaseTakeovers.a2') },
    { question: t('leaseTakeovers.q3'), answer: t('leaseTakeovers.a3') },
    { question: t('leaseTakeovers.q4'), answer: t('leaseTakeovers.a4') },
    { question: t('leaseTakeovers.q5'), answer: t('leaseTakeovers.a5') },
    { question: t('leaseTakeovers.q6'), answer: t('leaseTakeovers.a6') },
    { question: t('costTransparency.q1'), answer: t('costTransparency.a1') },
    { question: t('costTransparency.q2'), answer: t('costTransparency.a2') },
    { question: t('costTransparency.q3'), answer: t('costTransparency.a3') },
    { question: t('costTransparency.q4'), answer: t('costTransparency.a4') },
    { question: t('account.q1'), answer: t('account.a1') },
    { question: t('account.q2'), answer: t('account.a2') },
    { question: t('account.q3'), answer: t('account.a3') },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Help', path: '/help' }])} />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <Header />
      <main className="flex-1 pt-20">
        <HelpCenterClient />
      </main>
      <Footer />
    </div>
  );
}
