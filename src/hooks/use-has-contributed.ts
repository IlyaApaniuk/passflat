'use client';

import { useEffect, useState } from 'react';

/**
 * Resolves the display-only "has contributed / has cost access" flag on the
 * client by querying `/api/cost-access`. Lets public pages render statically
 * (no server auth) while still personalizing the cost-transparency blur/CTA.
 *
 * Defaults to the conservative `false` (blurred / "contribute" CTA) so a
 * logged-out or still-loading state never reveals gated UI.
 */
export function useHasContributed(initial = false): boolean {
  const [hasContributed, setHasContributed] = useState(initial);

  useEffect(() => {
    let active = true;

    fetch('/api/cost-access')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.hasContributed === 'boolean') {
          setHasContributed(data.hasContributed);
        }
      })
      .catch(() => {
        // Network/auth unavailable — keep the conservative default.
      });

    return () => {
      active = false;
    };
  }, []);

  return hasContributed;
}
