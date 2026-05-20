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
import {
  Search,
  SlidersHorizontal,
  MessageSquare,
  FileSignature,
  Key,
  Camera,
  MapPin,
  Bell,
  Users,
  HandshakeIcon,
  Lock,
  Unlock,
  BarChart3,
  ArrowRight,
  Plus,
} from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

export function HowItWorksClient() {
  const t = useTranslations('howItWorksPage');

  const seekerSteps = [
    { icon: Search, title: t('seekers.step1Title'), desc: t('seekers.step1Desc') },
    { icon: SlidersHorizontal, title: t('seekers.step2Title'), desc: t('seekers.step2Desc') },
    { icon: MessageSquare, title: t('seekers.step3Title'), desc: t('seekers.step3Desc') },
    { icon: FileSignature, title: t('seekers.step4Title'), desc: t('seekers.step4Desc') },
    { icon: Key, title: t('seekers.step5Title'), desc: t('seekers.step5Desc') },
  ];

  const listerSteps = [
    { icon: Camera, title: t('listers.step1Title'), desc: t('listers.step1Desc') },
    { icon: MapPin, title: t('listers.step2Title'), desc: t('listers.step2Desc') },
    { icon: Bell, title: t('listers.step3Title'), desc: t('listers.step3Desc') },
    { icon: Users, title: t('listers.step4Title'), desc: t('listers.step4Desc') },
    { icon: HandshakeIcon, title: t('listers.step5Title'), desc: t('listers.step5Desc') },
  ];

  const costSteps = [
    { icon: Lock, title: t('costs.step1Title'), desc: t('costs.step1Desc') },
    { icon: Unlock, title: t('costs.step2Title'), desc: t('costs.step2Desc') },
    { icon: BarChart3, title: t('costs.step3Title'), desc: t('costs.step3Desc') },
  ];

  const faqs = [
    { q: t('faq.q1'), a: t('faq.a1') },
    { q: t('faq.q2'), a: t('faq.a2') },
    { q: t('faq.q3'), a: t('faq.a3') },
    { q: t('faq.q4'), a: t('faq.a4') },
    { q: t('faq.q5'), a: t('faq.a5') },
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

      {/* Section A: Seekers */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('seekers.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('seekers.title')}
            </h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-8">
            {seekerSteps.map((step, i) => (
              <div key={i} className="flex gap-5">
                <div className="flex shrink-0 flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  {i < seekerSteps.length - 1 && (
                    <div className="mt-2 h-full w-0.5 bg-border" />
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section B: Listers */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('listers.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('listers.title')}
            </h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-8">
            {listerSteps.map((step, i) => (
              <div key={i} className="flex gap-5">
                <div className="flex shrink-0 flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  {i < listerSteps.length - 1 && (
                    <div className="mt-2 h-full w-0.5 bg-border" />
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section C: Cost Transparency */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {t('costs.label')}
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('costs.title')}
            </h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-8">
            {costSteps.map((step, i) => (
              <div key={i} className="flex gap-5">
                <div className="flex shrink-0 flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  {i < costSteps.length - 1 && (
                    <div className="mt-2 h-full w-0.5 bg-border" />
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-8 text-center text-3xl font-bold tracking-tight md:text-4xl">
            {t('faq.title')}
          </h2>
          <div className="mx-auto max-w-2xl">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t('ctaTitle')}
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="gap-2" asChild>
              <Link href={`/${DEFAULT_CITY}/replacement`}>
                <Search className="h-4 w-4" />
                {t('ctaBrowse')}
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href="/create-listing">
                <Plus className="h-4 w-4" />
                {t('ctaPost')}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
