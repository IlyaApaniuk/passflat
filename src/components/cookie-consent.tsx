'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { CONSENT_KEY, setConsent } from '@/lib/consent';

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

export function CookieConsent() {
  const pathname = usePathname();
  const posthog = usePostHog();
  const [visible, setVisible] = useState<boolean | null>(null);

  const locale = detectLocale(pathname);
  const t = translations[locale];

  // Reads the persisted consent (client-only localStorage) after mount and
  // shows the banner accordingly. Default-hidden render keeps SSR/CSR in sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      setVisible(true);
    } else {
      setVisible(false);
      if (consent === 'declined') {
        posthog?.opt_out_capturing();
      }
    }
  }, [posthog]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAccept = () => {
    setConsent('accepted');
    posthog?.opt_in_capturing();
    setVisible(false);
  };

  const handleDecline = () => {
    setConsent('declined');
    posthog?.opt_out_capturing();
    setVisible(false);
  };

  if (visible === null) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm p-4 shadow-lg"
        >
          <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground max-w-xl">
              {t.message}{' '}
              <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
                {t.learnMore}
              </a>
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleDecline}>
                {t.decline}
              </Button>
              <Button size="sm" onClick={handleAccept}>
                {t.accept}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
