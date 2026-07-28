import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Footer } from '@/components/landing/footer';
import { HowItWorksClient } from './client';
import { getAlternates, getOgImage } from '@/lib/seo';
import { pickMessages } from '@/i18n/messages';
import { JsonLd, faqPageJsonLd, howToJsonLd, breadcrumbJsonLd } from '@/lib/json-ld';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('howItWorksPage');
  const m = await getTranslations('meta');
  return {
    title: t('title'),
    description: m('howItWorksDescription'),
    alternates: getAlternates('/how-it-works', await getLocale()),
    openGraph: {
      title: t('title'),
      description: m('howItWorksDescription'),
      images: [getOgImage(t('title'), t('subtitle'))],
    },
  };
}

export default async function HowItWorksPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('howItWorksPage');
  const messages = await getMessages();

  const plain = (key: string, tags: string[]) => {
    const handlers: Record<string, (chunks: string) => string> = {};
    for (const tag of tags) {
      handlers[tag] = (chunks: string) => chunks;
    }
    return t.markup(key, handlers);
  };

  const seekerHowTo = howToJsonLd(t('seekers.title'), t('subtitle'), [
    { name: t('seekers.step1Title'), text: plain('seekers.step1Desc', ['browseLink']) },
    { name: t('seekers.step2Title'), text: t('seekers.step2Desc') },
    { name: t('seekers.step3Title'), text: t('seekers.step3Desc') },
    { name: t('seekers.step4Title'), text: t('seekers.step4Desc') },
    { name: t('seekers.step5Title'), text: t('seekers.step5Desc') },
  ]);

  const listerHowTo = howToJsonLd(t('listers.title'), t('subtitle'), [
    { name: t('listers.step1Title'), text: t('listers.step1Desc') },
    { name: t('listers.step2Title'), text: t('listers.step2Desc') },
    { name: t('listers.step3Title'), text: t('listers.step3Desc') },
    { name: t('listers.step4Title'), text: t('listers.step4Desc') },
    { name: t('listers.step5Title'), text: t('listers.step5Desc') },
  ]);

  const costsHowTo = howToJsonLd(t('costs.title'), t('subtitle'), [
    { name: t('costs.step1Title'), text: t('costs.step1Desc') },
    { name: t('costs.step2Title'), text: t('costs.step2Desc') },
    { name: t('costs.step3Title'), text: plain('costs.step3Desc', ['compareLink']) },
  ]);

  const faqItems = [
    { question: t('faq.q1'), answer: t('faq.a1') },
    { question: t('faq.q2'), answer: t('faq.a2') },
    { question: t('faq.q3'), answer: t('faq.a3') },
    { question: t('faq.q4'), answer: t('faq.a4') },
    { question: t('faq.q5'), answer: t('faq.a5') },
    { question: t('faq.q6'), answer: t('faq.a6') },
    { question: t('faq.q7'), answer: t('faq.a7') },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbJsonLd([{ name: 'How It Works', path: '/how-it-works' }])} />
      <JsonLd data={seekerHowTo} />
      <JsonLd data={listerHowTo} />
      <JsonLd data={costsHowTo} />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <main className="flex-1 pt-24">
        <NextIntlClientProvider
          messages={pickMessages(messages, ['howItWorksPage', 'documents', 'common'])}
        >
          <HowItWorksClient />
        </NextIntlClientProvider>
      </main>
      <Footer />
    </div>
  );
}
