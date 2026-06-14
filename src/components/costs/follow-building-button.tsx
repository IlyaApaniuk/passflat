'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

// Only surface the follower count once it's meaningful social proof — a lone
// "1 following" reads as empty on cold-start.
const FOLLOWER_COUNT_MIN = 3;

/**
 * "Follow this building" — opts the user into re-engagement emails when new
 * cost reports land (see /api/cron/re-engage). Self-contained client island so
 * the building page stays static/ISR: it resolves its own follow state + the
 * public follower count from /api/buildings/[id]/follow and toggles
 * optimistically. Guests (POST → 401) are sent to login with a return path.
 */
export function FollowBuildingButton({
  buildingId,
  citySlug,
}: {
  buildingId: string;
  citySlug: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const posthog = usePostHog();

  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/buildings/${buildingId}/follow`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return;
        if (typeof d.following === 'boolean') setFollowing(d.following);
        if (typeof d.count === 'number') setFollowerCount(d.count);
      })
      .catch(() => {
        // Network/auth unavailable — keep the conservative "not following".
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buildingId]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next); // optimistic
    setFollowerCount((c) => Math.max(0, c + (next ? 1 : -1)));

    try {
      const res = await fetch(`/api/buildings/${buildingId}/follow`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (res.status === 401) {
        // Not logged in — bounce to login and come back to this building.
        setFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1)); // undo the optimistic bump
        router.push(`/auth/login?next=${pathname}` as never);
        return;
      }
      if (!res.ok) throw new Error('follow request failed');
      if (next) {
        posthog?.capture('building_followed', { building_id: buildingId, city: citySlug });
        toast.success(t('costs.building.followToast'), {
          classNames: { title: 'text-xs' },
          action: {
            label: t('costs.building.followManage'),
            onClick: () => router.push('/dashboard?tab=follows' as never),
          },
        });
      }
    } catch {
      setFollowing(!next); // rollback
      setFollowerCount((c) => Math.max(0, c + (next ? -1 : 1))); // rollback the count
      toast.error(t('costs.building.followError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={following ? 'default' : 'outline'}
        size="sm"
        className="gap-2"
        onClick={toggle}
        disabled={loading || busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : following ? (
          <BellRing className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {following ? t('costs.building.following') : t('costs.building.follow')}
      </Button>
      {followerCount >= FOLLOWER_COUNT_MIN && (
        <span className="text-xs text-muted-foreground">
          {t('costs.building.followerCount', { count: followerCount })}
        </span>
      )}
    </div>
  );
}
