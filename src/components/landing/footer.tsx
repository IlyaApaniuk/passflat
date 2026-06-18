import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import { Home, Linkedin, Instagram } from 'lucide-react';

const DEFAULT_CITY = 'warsaw';

// No 'use client': `useTranslations` (the non-async hook) is isomorphic, so this
// renders as a zero-JS Server Component on server pages while still working when
// rendered inside a Client Component (e.g. the costs/dashboard client views).
export function Footer() {
  const t = useTranslations();

  const footerLinks = {
    product: [
      { label: t('landing.footer.browseListings'), href: `/${DEFAULT_CITY}/replacement` },
      { label: t('landing.footer.roommateSearch'), href: `/${DEFAULT_CITY}/roommate` },
      { label: t('landing.footer.temporarySublets'), href: `/${DEFAULT_CITY}/sublet` },
      { label: t('landing.footer.costReports'), href: `/${DEFAULT_CITY}/costs` },
      { label: t('landing.footer.addListing'), href: '/create-listing' },
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
                href="https://instagram.com/passflatapp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://www.threads.com/@passflatapp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Threads"
              >
                {/* lucide-react has no Threads glyph — inline the brand mark. */}
                <svg
                  viewBox="0 0 192 192"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-4 w-4"
                >
                  <path d="M141.537 88.988c-.687-.330-1.385-.649-2.092-.955-.124-22.692-12.508-35.69-33.292-35.824-.093 0-.186 0-.279 0-12.429 0-22.766 5.306-29.134 14.965l11.432 7.843c4.756-7.217 12.226-8.756 17.706-8.756.063 0 .126 0 .188 0 6.826.044 11.978 2.028 15.313 5.897 2.427 2.816 4.05 6.707 4.853 11.622-6.047-1.028-12.585-1.344-19.566-.942-19.664 1.132-32.305 12.603-31.456 27.601.431 7.609 4.219 14.156 10.667 18.437 5.452 3.621 12.477 5.333 19.778 4.933 9.643-.528 17.206-4.202 22.482-10.921 4.007-5.103 6.541-11.716 7.658-20.039 4.587 2.769 7.986 6.413 9.864 10.794 3.192 7.449 3.378 19.692-6.649 29.71-8.786 8.78-19.351 12.578-35.322 12.695-17.716-.131-31.111-5.812-39.818-16.881-8.155-10.364-12.37-25.341-12.528-44.516.158-19.176 4.373-34.153 12.528-44.517 8.707-11.069 22.102-16.749 39.818-16.881 17.843.132 31.473 5.839 40.516 16.961 4.435 5.449 7.778 12.304 9.982 20.3l13.039-3.477c-2.674-9.845-6.892-18.333-12.661-25.423C161.872 11.495 144.444 3.437 121.96 3.283l-.089-.001-.091.001c-22.442.154-39.666 8.247-51.191 24.256C60.428 41.795 55.15 60.735 54.966 83.84l-.001.085.001.085c.184 23.104 5.462 42.045 15.714 56.286 11.525 16.009 28.749 24.102 51.191 24.256l.091.001.089-.001c19.959-.139 34.034-5.368 45.631-16.954 15.171-15.153 14.715-34.143 9.714-45.854-3.585-8.402-10.419-15.226-19.767-19.726zm-33.63 50.759c-8.077.456-16.468-3.17-16.882-10.489-.307-5.427 3.839-11.481 17.321-12.258 1.544-.089 3.059-.132 4.548-.132 4.899 0 9.482.476 13.647 1.387-1.553 19.4-10.665 21.116-18.634 21.492z" />
                </svg>
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
