'use client';

import { useEffect, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CONSENT_EVENT, readConsent } from '@/lib/consent';

/**
 * Tracks whether a reference element has been scrolled above the viewport.
 * `top < 0` distinguishes "scrolled past" from "not yet reached" — for an
 * element that starts on-screen this never fires on load.
 */
export function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return scrolledPast;
}

/**
 * Floating pill that keeps a page's primary action in the viewport once its
 * inline counterpart has scrolled away (pair with {@link useScrolledPast}).
 * It mirrors that counterpart — same destination, same label — so the two
 * read as one CTA in two positions, not two competing asks.
 */
export function StickyCta({
  visible,
  href,
  onClick,
  children,
}: {
  visible: boolean;
  href: ComponentProps<typeof Link>['href'];
  onClick?: () => void;
  children: ReactNode;
}) {
  // While the cookie banner occupies the bottom edge (consent not yet
  // answered) the pill lifts above it. The banner's height varies with copy
  // length and wrapping, so it is measured, not assumed — a fixed clearance
  // left the pill half-hidden whenever the banner wrapped one line taller.
  const [clearance, setClearance] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const measure = () => {
      if (readConsent() !== null) {
        setClearance(0);
        return;
      }
      const banner = document.querySelector('[data-cookie-banner]');
      setClearance(banner instanceof HTMLElement ? banner.offsetHeight + 12 : 0);
    };
    measure();
    // Re-measure after the banner's entrance spring settles, and track later
    // wrapping changes (rotation, resize).
    const settle = setTimeout(measure, 700);
    window.addEventListener(CONSENT_EVENT, measure);
    window.addEventListener('storage', measure);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(settle);
      window.removeEventListener(CONSENT_EVENT, measure);
      window.removeEventListener('storage', measure);
      window.removeEventListener('resize', measure);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          // pointer-events split: the full-width wrapper centers the pill
          // without blocking taps on content beside it. z-40 stays under the
          // header and consent banner (both z-50).
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
          style={{ bottom: `calc(${16 + clearance}px + env(safe-area-inset-bottom))` }}
        >
          <Button
            size="lg"
            className="pointer-events-auto h-12 rounded-full px-6 text-base shadow-lg"
            asChild
          >
            <Link href={href} onClick={onClick}>
              {children}
            </Link>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
