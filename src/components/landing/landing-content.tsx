'use client';

import { useEffect, useReducer } from 'react';

/**
 * Forces remount of animated children when the page is restored
 * from the browser's bfcache (back/forward navigation).
 * Solves framer-motion animations not replaying after browser navigation.
 */
export function LandingContent({ children }: { children: React.ReactNode }) {
  const [key, remount] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) remount();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return <div key={key}>{children}</div>;
}
