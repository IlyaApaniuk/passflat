'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { MessageSquare } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

export function HelpCenterClient() {
  const t = useTranslations('helpCenter');

  const sections: FaqSection[] = [
    {
      title: t('general.title'),
      items: [
        { q: t('general.q1'), a: t('general.a1') },
        { q: t('general.q2'), a: t('general.a2') },
        { q: t('general.q3'), a: t('general.a3') },
        { q: t('general.q4'), a: t('general.a4') },
      ],
    },
    {
      title: t('leaseTakeovers.title'),
      items: [
        { q: t('leaseTakeovers.q1'), a: t('leaseTakeovers.a1') },
        { q: t('leaseTakeovers.q2'), a: t('leaseTakeovers.a2') },
        { q: t('leaseTakeovers.q3'), a: t('leaseTakeovers.a3') },
        { q: t('leaseTakeovers.q4'), a: t('leaseTakeovers.a4') },
        { q: t('leaseTakeovers.q5'), a: t('leaseTakeovers.a5') },
        { q: t('leaseTakeovers.q6'), a: t('leaseTakeovers.a6') },
      ],
    },
    {
      title: t('costTransparency.title'),
      items: [
        { q: t('costTransparency.q1'), a: t('costTransparency.a1') },
        { q: t('costTransparency.q2'), a: t('costTransparency.a2') },
        { q: t('costTransparency.q3'), a: t('costTransparency.a3') },
        { q: t('costTransparency.q4'), a: t('costTransparency.a4') },
      ],
    },
    {
      title: t('account.title'),
      items: [
        { q: t('account.q1'), a: t('account.a1') },
        { q: t('account.q2'), a: t('account.a2') },
        { q: t('account.q3'), a: t('account.a3') },
      ],
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl space-y-12">
            {sections.map((section, si) => (
              <div key={si}>
                <h2 className="mb-4 text-xl font-semibold">{section.title}</h2>
                <Accordion type="single" collapsible className="w-full">
                  {section.items.map((item, qi) => (
                    <AccordionItem key={qi} value={`s${si}-q${qi}`}>
                      <AccordionTrigger className="text-left text-base">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still have questions */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold">{t('stillHaveQuestions')}</h2>
          <p className="mt-2 text-muted-foreground">
            {t('stillHaveQuestionsDesc')}
          </p>
          <Button size="lg" className="mt-6 gap-2" asChild>
            <Link href="/contact">
              <MessageSquare className="h-4 w-4" />
              {t('contactUs')}
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
