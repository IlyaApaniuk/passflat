import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/ui/reveal';
import { HelpCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

export async function FAQ() {
  const t = await getTranslations('landing.faq');

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 dot-pattern opacity-30" />

      <div className="relative z-10 container mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent">
            <HelpCircle className="h-4 w-4" />
            FAQ
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t('title')} <span className="gradient-text">{t('titleHighlight')}</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_KEYS.map((key, i) => (
              <AccordionItem key={key} value={key} className="border-border/50">
                <AccordionTrigger className="text-base font-medium hover:no-underline">
                  {t(key)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t(`a${i + 1}` as const)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
