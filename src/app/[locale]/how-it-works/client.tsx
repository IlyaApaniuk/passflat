'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { BuyAccessDialog } from '@/components/costs/buy-access-dialog';
import { TemplateDownload } from '@/components/documents/template-download';
import { FEATURE_FLAGS, isDocumentTemplatesEnabled } from '@/lib/feature-flags';
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
  Quote,
  Shield,
  ShoppingCart,
  BellOff,
} from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

type TabKey = 'seekers' | 'listers' | 'costs';

const TAB_COLORS: Record<TabKey, { active: string; icon: string; number: string }> = {
  seekers: {
    active: 'border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400',
    icon: 'text-blue-500 border-blue-500/50 bg-blue-500/20',
    number: 'bg-blue-500 text-white',
  },
  listers: {
    active: 'border-violet-500/50 bg-violet-500/15 text-violet-600 dark:text-violet-400',
    icon: 'text-violet-500 border-violet-500/50 bg-violet-500/20',
    number: 'bg-violet-500 text-white',
  },
  costs: {
    active: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    icon: 'text-emerald-500 border-emerald-500/50 bg-emerald-500/20',
    number: 'bg-emerald-500 text-white',
  },
};

export function HowItWorksClient({ hasContributed = false }: { hasContributed?: boolean }) {
  const t = useTranslations('howItWorksPage');
  const tDocs = useTranslations('documents');
  const showTestimonials = useFeatureFlagEnabled(FEATURE_FLAGS.SHOW_TESTIMONIALS);
  const [activeTab, setActiveTab] = useState<TabKey>('seekers');

  const seekerSteps: { icon: typeof Search; title: string; desc: ReactNode }[] = [
    {
      icon: Search,
      title: t('seekers.step1Title'),
      desc: t.rich('seekers.step1Desc', {
        browseLink: (chunks) => (
          <Link href="/warsaw/replacement" className="text-primary hover:underline">
            {chunks}
          </Link>
        ),
      }),
    },
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

  const costSteps: { icon: typeof Search; title: string; desc: ReactNode }[] = [
    { icon: Lock, title: t('costs.step1Title'), desc: t('costs.step1Desc') },
    { icon: Unlock, title: t('costs.step2Title'), desc: t('costs.step2Desc') },
    {
      icon: BarChart3,
      title: t('costs.step3Title'),
      desc: t.rich('costs.step3Desc', {
        compareLink: (chunks) => (
          <Link href="/warsaw/costs" className="text-primary hover:underline">
            {chunks}
          </Link>
        ),
      }),
    },
  ];

  const faqs = [
    { q: t('faq.q1'), a: t('faq.a1') },
    { q: t('faq.q2'), a: t('faq.a2') },
    { q: t('faq.q3'), a: t('faq.a3') },
    { q: t('faq.q4'), a: t('faq.a4') },
    { q: t('faq.q5'), a: t('faq.a5') },
    { q: t('faq.q6'), a: t('faq.a6') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      {/* Tabbed Steps */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          {/* Tab Buttons */}
          <div className="mx-auto mb-12 flex max-w-lg flex-wrap justify-center gap-2">
            {(['seekers', 'listers', 'costs'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-all ${
                  activeTab === tab
                    ? TAB_COLORS[tab].active
                    : 'border-border/50 text-muted-foreground hover:border-border hover:bg-secondary/50'
                }`}
              >
                {t(
                  `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as
                    | 'tabSeekers'
                    | 'tabListers'
                    | 'tabCosts',
                )}
              </button>
            ))}
          </div>

          {/* Animated Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="mx-auto max-w-3xl"
            >
              <div className="mb-10 text-center">
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {t(`${activeTab}.title`)}
                </h2>
              </div>

              <div className="space-y-6">
                {(activeTab === 'seekers'
                  ? seekerSteps
                  : activeTab === 'listers'
                    ? listerSteps
                    : costSteps
                ).map((step, i, arr) => (
                  <div key={i} className="flex gap-5">
                    <div className="flex shrink-0 flex-col items-center">
                      <div
                        className={`relative flex h-14 w-14 items-center justify-center rounded-full border ${TAB_COLORS[activeTab].icon}`}
                      >
                        <step.icon
                          className={`h-6 w-6 ${TAB_COLORS[activeTab].icon.split(' ')[0]}`}
                        />
                        <span
                          className={`absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${TAB_COLORS[activeTab].number}`}
                        >
                          {i + 1}
                        </span>
                      </div>
                      {i < arr.length - 1 && <div className="mt-2 h-full w-0.5 bg-border" />}
                    </div>
                    <div className="pb-6 pt-2">
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="mt-1 text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {activeTab === 'seekers' && isDocumentTemplatesEnabled() && (
                <div className="mx-auto mt-10 max-w-md">
                  <p className="mb-3 text-center text-sm font-medium">
                    {tDocs('howItWorks.title')}
                  </p>
                  <TemplateDownload documentKey="cesja" source="how_it_works" showDescription />
                </div>
              )}

              {/* TODO: Add screenshots — place in /public/images/how-it-works/ */}
              <div className="mt-10 text-center">
                {activeTab === 'seekers' && (
                  <Button size="lg" className="gap-2" asChild>
                    <Link href="/warsaw/replacement">
                      <Search className="h-4 w-4" />
                      {t('seekers.cta')}
                    </Link>
                  </Button>
                )}
                {activeTab === 'listers' && (
                  <Button size="lg" className="gap-2" asChild>
                    <Link href="/create-listing">
                      <Plus className="h-4 w-4" />
                      {t('listers.cta')}
                    </Link>
                  </Button>
                )}
                {activeTab === 'costs' &&
                  (hasContributed ? (
                    <Button size="lg" className="gap-2" asChild>
                      <Link href="/warsaw/costs">
                        <BarChart3 className="h-4 w-4" />
                        {t('costs.ctaExplore')}
                      </Link>
                    </Button>
                  ) : (
                    <div className="flex flex-col items-center gap-3 sm:flex-row">
                      <Button size="lg" className="gap-2" asChild>
                        <Link href="/warsaw/costs/submit">
                          <ArrowRight className="h-4 w-4" />
                          {t('costs.cta')}
                        </Link>
                      </Button>
                      <BuyAccessDialog citySlug={DEFAULT_CITY}>
                        <Button size="lg" variant="outline" className="gap-2">
                          <ShoppingCart className="h-4 w-4" />
                          {t('costs.ctaBuy')}
                        </Button>
                      </BuyAccessDialog>
                    </div>
                  ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* Testimonials (feature-flagged) */}
      {showTestimonials && (
        <section className="border-t bg-muted/30 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-4xl">
              {t('testimonials.title')}
            </h2>
            <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3">
              {[
                {
                  name: t('testimonials.t1Name'),
                  role: t('testimonials.t1Role'),
                  text: t('testimonials.t1Text'),
                },
                {
                  name: t('testimonials.t2Name'),
                  role: t('testimonials.t2Role'),
                  text: t('testimonials.t2Text'),
                },
                {
                  name: t('testimonials.t3Name'),
                  role: t('testimonials.t3Role'),
                  text: t('testimonials.t3Text'),
                },
              ].map((testimonial, i) => (
                <div key={i} className="rounded-xl border bg-card p-6">
                  <Quote className="mb-4 h-6 w-6 text-primary/30" />
                  <p className="text-sm text-muted-foreground">{testimonial.text}</p>
                  <div className="mt-4 border-t pt-4">
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
                  <AccordionTrigger className="text-left text-base">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-5 w-5 text-primary" />
              <span>{t('trust.euData')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-5 w-5 text-primary" />
              <span>{t('trust.gdpr')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BellOff className="h-5 w-5 text-primary" />
              <span>{t('trust.noSpam')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('ctaTitle')}</h2>
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
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href={`/${DEFAULT_CITY}/costs`}>
                <BarChart3 className="h-4 w-4" />
                {t('ctaCosts')}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
