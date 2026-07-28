'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PRIVATE_CHANNEL } from '@/lib/supabase/realtime';

export function usePresence(currentUserId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('online-users', PRIVATE_CHANNEL)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        for (const key of Object.keys(state)) {
          const presences = state[key] as Array<{ userId?: string }>;
          for (const p of presences) {
            if (p.userId) ids.add(p.userId);
          }
        }
        setOnlineUsers(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: currentUserId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const isOnline = useCallback((id: string) => onlineUsers.has(id), [onlineUsers]);

  return { onlineUsers, isOnline };
}
