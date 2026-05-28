'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useTyping(
  conversationId: string | null,
  currentUserId: string | null,
) {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const throttleRef = useRef<number>(0);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId !== currentUserId) {
          setIsOtherTyping(true);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [conversationId, currentUserId]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !currentUserId) return;
    const now = Date.now();
    if (now - throttleRef.current < 2000) return;
    throttleRef.current = now;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId },
    });
  }, [currentUserId]);

  return { isOtherTyping, sendTyping };
}
