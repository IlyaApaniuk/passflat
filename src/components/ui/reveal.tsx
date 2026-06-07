'use client';

import { useEffect, useRef, useState } from 'react';
import type { ElementType, ReactNode } from 'react';

type RevealVariant = 'up' | 'down' | 'left' | 'right' | 'scale' | 'fade';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Direction the element travels in from while fading in. */
  variant?: RevealVariant;
  /** Stagger delay in seconds (mirrors the old framer-motion `delay`). */
  delay?: number;
  /** Fraction of the element that must be visible to trigger (0–1). */
  amount?: number;
  /** Rendered element. Defaults to a `div`. */
  as?: ElementType;
}

const VARIANT_CLASS: Record<RevealVariant, string> = {
  up: 'reveal-up',
  down: 'reveal-down',
  left: 'reveal-left',
  right: 'reveal-right',
  scale: 'reveal-scale',
  fade: '',
};

/**
 * Scroll-triggered reveal built on IntersectionObserver + CSS transitions —
 * a zero-dependency replacement for the framer-motion `whileInView` reveal.
 *
 * The element renders its content immediately (server HTML) and only animates
 * opacity/transform, so it never causes layout shift. It reveals exactly once,
 * then the observer disconnects (no replay on scroll-up). If JS is unavailable
 * or IntersectionObserver is unsupported, the content is shown immediately on
 * mount; reduced-motion users get the revealed state with no transition (see
 * globals.css).
 *
 * Because this is a tiny client island, it can be rendered from Server
 * Components — the (server-rendered) children are passed straight through.
 */
export function Reveal({
  children,
  className,
  variant = 'up',
  delay = 0,
  amount = 0.2,
  as,
}: RevealProps) {
  const Tag = (as ?? 'div') as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      // No IO support: reveal immediately. Client-only fallback after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: amount, rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [amount]);

  const classes = [
    'reveal-init',
    VARIANT_CLASS[variant],
    visible ? 'reveal-visible' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag ref={ref} className={classes} style={delay ? { transitionDelay: `${delay}s` } : undefined}>
      {children}
    </Tag>
  );
}
