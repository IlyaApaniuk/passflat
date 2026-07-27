import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/ui/reveal';
import { ArrowRight, Calculator, FileText } from 'lucide-react';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';

const DEFAULT_CITY = 'warsaw';

interface ToolsProps {
  citySlug?: string;
}

/**
 * The calculator and the document templates used to exist only as hero buttons,
 * so trimming the hero to the transparency actions would have made them
 * undiscoverable. They live here instead: supporting tools, not the pitch.
 */
export async function Tools({ citySlug = DEFAULT_CITY }: ToolsProps) {
  const t = await getTranslations('landing.tools');

  const tools = [
    {
      key: 'calculator',
      icon: Calculator,
      href: `/${citySlug}/calculator` as const,
      title: t('calculatorTitle'),
      description: t('calculatorDescription'),
      cta: t('calculatorCta'),
    },
    ...(isDocumentTemplatesEnabled()
      ? [
          {
            key: 'templates',
            icon: FileText,
            href: '/resources' as const,
            title: t('templatesTitle'),
            description: t('templatesDescription'),
            cta: t('templatesCta'),
          },
        ]
      : []),
  ];

  return (
    <section className="relative py-24 sm:py-32">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t('title')} <span className="gradient-text">{t('titleHighlight')}</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
          </div>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2">
          {tools.map(({ key, icon: Icon, href, title, description, cta }) => (
            <Reveal key={key}>
              <Link
                href={href}
                className="group flex h-full flex-col rounded-2xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-accent/50 hover:bg-card"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">{title}</h3>
                <p className="mb-4 flex-1 text-muted-foreground">{description}</p>
                <span className="inline-flex items-center text-sm font-medium text-accent">
                  {cta}
                  <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
