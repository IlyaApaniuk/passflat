'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { hasBottomActionBar, readConsent, setConsent } from '@/lib/consent';

const translations = {
  pl: {
    message: 'Używamy plików cookie i analityki, aby poprawić Twoje doświadczenia.',
    accept: 'Akceptuję',
    decline: 'Odrzucam',
    learnMore: 'Dowiedz się więcej',
  },
  en: {
    message: 'We use cookies and analytics to improve your experience.',
    accept: 'Accept',
    decline: 'Decline',
    learnMore: 'Learn more',
  },
  ru: {
    message: 'Мы используем файлы cookie и аналитику для улучшения вашего опыта.',
    accept: 'Принять',
    decline: 'Отклонить',
    learnMore: 'Подробнее',
  },
  uk: {
    message: 'Ми використовуємо файли cookie та аналітику для покращення вашого досвіду.',
    accept: 'Прийняти',
    decline: 'Відхилити',
    learnMore: 'Дізнатися більше',
  },
} as const;

type Locale = keyof typeof translations;

const SUPPORTED_LOCALES = new Set<string>(Object.keys(translations));

function detectLocale(pathname: string): Locale {
  const segment = pathname.split('/')[1];
  if (segment && SUPPORTED_LOCALES.has(segment)) {
    return segment as Locale;
  }
  return 'pl';
}

/**
 * Vertical space the banner leaves free on {@link hasBottomActionBar} routes.
 *
 * The cost form's sticky summary bar measures 12 + 12px padding, a 1px border
 * and a 44px two-line total block = 69px; 76px clears it with a margin. Keep in
 * sync with the `bottom-[calc(76px+…)]` class below — Tailwind needs the literal.
 */
const BOTTOM_ACTION_CLEARANCE_PX = 76;

export function CookieConsent() {
  const pathname = usePathname();
  const posthog = usePostHog();
  const [visible, setVisible] = useState<boolean | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const shownCaptured = useRef(false);

  const locale = detectLocale(pathname);
  const t = translations[locale];
  const liftAboveAction = hasBottomActionBar(pathname);

  // Reads the persisted consent (client-only localStorage) after mount and
  // shows the banner accordingly. Default-hidden render keeps SSR/CSR in sync.
  // Nothing is opted out here: PostHog captures anonymously in its write-free
  // memory mode until consent arrives (see providers/posthog-provider.tsx).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Now that un-consented visits are counted, the banner's own funnel is
  // measurable — how many people see it, and how many actually decline.
  useEffect(() => {
    if (visible !== true || !posthog || shownCaptured.current) return;
    shownCaptured.current = true;
    posthog.capture('consent_banner_shown', { locale });
  }, [visible, posthog, locale]);

  // A `fixed` bar covers whatever the page ends with. Reserving its height at
  // the end of the document lets the last element — /review's save button — be
  // scrolled clear of it. `sticky bottom-0` bars ignore document padding, which
  // is why the banner is *also* lifted above them on these routes.
  //
  // Every route reserves, not just those two: a banner that hides the bottom of
  // the fold is survivable only if a scroll can free what is under it, and on a
  // page that ends exactly at the fold there is nothing to scroll.
  useEffect(() => {
    const node = bannerRef.current;
    if (visible !== true || !node) return;

    const reserve = () => {
      document.body.style.paddingBottom = `${node.offsetHeight + (liftAboveAction ? BOTTOM_ACTION_CLEARANCE_PX : 0)}px`;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = '';
    };
  }, [visible, liftAboveAction]);

  const handleAccept = () => {
    // Captured before the flip so it carries the same anonymous id as the
    // pre-consent events; `set_config` then migrates that id into localStorage.
    posthog?.capture('consent_accepted', { locale });
    setConsent('accepted');
    setVisible(false);
  };

  const handleDecline = () => {
    // Deliberately no `opt_out_capturing()`: a decline means "don't store", and
    // PostHog stays in its write-free memory mode. It would also write a
    // `__ph_opt_in_out_<token>` localStorage key — the opposite of the point.
    posthog?.capture('consent_declined', { locale });
    setConsent('declined');
    setVisible(false);
  };

  if (visible === null) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={bannerRef}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={
            liftAboveAction
              ? // Floating card rather than an edge-to-edge bar, so the gap it
                // leaves for the page's submit button reads as intentional.
                'fixed inset-x-2 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 rounded-xl border bg-background/95 p-2.5 shadow-lg backdrop-blur-sm sm:inset-x-4 sm:p-4'
              : 'fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 p-2.5 shadow-lg backdrop-blur-sm sm:p-4'
          }
        >
          {/* One row on every width. Stacked, the banner stood 117px tall on a
              390x664 phone and swallowed the bottom sixth of the fold — on the
              landing that is exactly where the primary CTA sits, and a tap
              aimed at it landed on the privacy link underneath. */}
          <div className="container mx-auto flex flex-row items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-tight text-muted-foreground sm:text-sm sm:leading-normal">
              {t.message}{' '}
              <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
                {t.learnMore}
              </a>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm"
                onClick={handleDecline}
              >
                {t.decline}
              </Button>
              <Button
                size="sm"
                className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm"
                onClick={handleAccept}
              >
                {t.accept}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
