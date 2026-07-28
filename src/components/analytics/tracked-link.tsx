'use client';

import type { ComponentProps, ReactNode } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';

/**
 * A link that reports where it was clicked.
 *
 * The landing sections are server components, so they cannot capture on their
 * own — and until now most of them captured nothing at all, which made it
 * impossible to tell which placement actually sends people to the form. One
 * event name with a `placement` property keeps them comparable in a single
 * breakdown instead of a pile of one-off event names.
 */
export function TrackedLink({
  placement,
  properties,
  children,
  ...linkProps
}: {
  placement: string;
  properties?: Record<string, unknown>;
  children: ReactNode;
} & ComponentProps<typeof Link>) {
  const posthog = usePostHog();

  return (
    <Link
      {...linkProps}
      onClick={(event) => {
        posthog?.capture('cta_click', { placement, ...properties });
        linkProps.onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
