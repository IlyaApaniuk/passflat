'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import { Home, Linkedin, Instagram } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

export function Footer() {
  const t = useTranslations();

  const footerLinks = {
    product: [
      { label: t('landing.footer.browseListings'), href: `/${DEFAULT_CITY}/replacement` },
      { label: t('landing.footer.roommateSearch'), href: `/${DEFAULT_CITY}/roommate` },
      { label: t('landing.footer.temporarySublets'), href: `/${DEFAULT_CITY}/sublet` },
      { label: t('landing.footer.costReports'), href: `/${DEFAULT_CITY}/costs` },
      { label: t('landing.footer.addListing'), href: '/create-listing' },
      { label: t('landing.footer.pricing'), href: '/pricing' },
      ...(isDocumentTemplatesEnabled()
        ? [{ label: t('landing.footer.resources'), href: '/resources' }]
        : []),
    ],
    company: [
      { label: t('landing.footer.aboutUs'), href: '/about' },
      { label: t('landing.footer.howItWorks'), href: '/how-it-works' },
      { label: `${t('landing.footer.blog')} (Beta)`, href: '/blog' },
      { label: t('landing.footer.contactUs'), href: '/contact' },
    ],
    legal: [
      { label: t('landing.footer.privacyPolicy'), href: '/privacy' },
      { label: t('landing.footer.termsOfService'), href: '/terms' },
      { label: t('landing.footer.helpCenter'), href: '/help' },
    ],
  };

  return (
    <footer className="relative border-t border-border/50 pb-8 pt-16">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="group mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Home className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">{t('common.appName')}</span>
            </Link>
            <p className="mb-4 text-sm text-muted-foreground">{t('landing.footer.tagline')}</p>
            <p className="text-sm text-muted-foreground">{t('landing.footer.expanding')}</p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href="https://linkedin.com/company/passflat"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href="https://instagram.com/passflat.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t('landing.footer.product')}</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t('landing.footer.company')}</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t('landing.footer.legal')}</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {t('common.appName')}.{' '}
            {t('landing.footer.allRightsReserved')}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            {t('landing.footer.betaStatus')}
          </div>
        </div>
      </div>
    </footer>
  );
}
