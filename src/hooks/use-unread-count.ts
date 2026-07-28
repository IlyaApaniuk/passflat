'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PRIVATE_CHANNEL } from '@/lib/supabase/realtime';

export function useUnreadCount(currentUserId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const conversations = await res.json();
        const total = conversations.reduce(
          (sum: number, c: { unreadCount?: number }) => sum + (c.unreadCount ?? 0),
          0,
        );
        setUnreadCount(total);
      }
    } catch {
      // Silently fail
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    // Initial fetch + realtime subscription on mount (external data source).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUnreadCount();

    const supabase = createClient();
    const channel = supabase
      .channel(`chat:notifications:${currentUserId}`, PRIVATE_CHANNEL)
      .on('broadcast', { event: 'new_message' }, () => {
        setUnreadCount((prev) => prev + 1);
      })
      .on('broadcast', { event: 'messages_read' }, () => {
        fetchUnreadCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, fetchUnreadCount]);

  const markRead = useCallback(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  return { unreadCount, markRead };
}
