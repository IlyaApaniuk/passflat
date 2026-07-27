'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  isOwn: boolean;
}

interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  sending: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function useChat(
  conversationId: string | null,
  currentUserId: string | null,
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cursorRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());
        setHasMore(!!data.nextCursor);
        cursorRef.current = data.nextCursor;
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadMore = useCallback(async () => {
    if (!conversationId || !cursorRef.current) return;
    const res = await fetch(
      `/api/conversations/${conversationId}/messages?limit=50&cursor=${cursorRef.current}`,
    );
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...data.messages.reverse(), ...prev]);
      setHasMore(!!data.nextCursor);
      cursorRef.current = data.nextCursor;
    }
  }, [conversationId]);

  // The realtime channel is public, so it only carries a ping — the message
  // itself comes from the authenticated API. Merges instead of replacing so
  // history pulled via loadMore() survives an incoming message.
  const mergeLatest = useCallback(async () => {
    if (!conversationId) return;
    const res = await fetch(`/api/conversations/${conversationId}/messages?limit=20`);
    if (!res.ok) return;
    const data = await res.json();
    const latest: ChatMessage[] = data.messages.slice().reverse();
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = latest.filter((m) => !known.has(m.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    // Initial fetch + realtime subscription on mount (external data source).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMessages();

    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        const ping = payload as { senderId?: string };
        if (ping.senderId === currentUserId) return;
        void mergeLatest();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, currentUserId, fetchMessages, mergeLatest]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || !currentUserId || !content.trim()) return;
      setSending(true);

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: optimisticId,
        content: content.trim(),
        senderId: currentUserId,
        senderName: '',
        createdAt: new Date().toISOString(),
        isOwn: true,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.trim() }),
        });

        if (res.ok) {
          const data = await res.json();
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? { ...m, id: data.id } : m)),
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } finally {
        setSending(false);
      }
    },
    [conversationId, currentUserId],
  );

  return { messages, loading, sendMessage, sending, hasMore, loadMore };
}
