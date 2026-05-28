'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';
import {
  ConversationList,
  type ConversationListItem,
} from '@/components/chat/conversation-list';
import { ChatWindow } from '@/components/chat/chat-window';
import { usePresence } from '@/hooks/use-presence';
import { createClient } from '@/lib/supabase/client';
import { MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessagesClientProps {
  userId: string;
}

export function MessagesClient({ userId }: MessagesClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('c'),
  );
  const [loading, setLoading] = useState(true);
  const { isOnline } = usePresence(userId);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:notifications:${userId}`)
      .on('broadcast', { event: 'new_conversation' }, () => {
        fetchConversations();
      })
      .on('broadcast', { event: 'new_message' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations]);

  // Auto-select first conversation on desktop if none selected
  useEffect(() => {
    if (!selectedId && conversations.length > 0 && window.innerWidth >= 768) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // Mark as read
    fetch(`/api/conversations/${id}/read`, { method: 'PATCH' }).then(() => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, unreadCount: 0 } : c,
        ),
      );
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center pt-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-20">
        <div className="container mx-auto h-[calc(100vh-80px)] max-w-6xl px-0 md:px-4 md:py-4">
          <div className="flex h-full overflow-hidden rounded-none md:rounded-xl md:border md:border-border">
            {/* Conversation list panel */}
            <div
              className={cn(
                'w-full flex-col border-r md:w-80 lg:w-96 md:flex',
                selectedId ? 'hidden md:flex' : 'flex',
              )}
            >
              <div className="border-b px-4 py-3">
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t('chat.conversations')}
                </h1>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  isOnline={isOnline}
                />
              </div>
            </div>

            {/* Chat panel */}
            <div
              className={cn(
                'flex-1 flex-col',
                selectedId ? 'flex' : 'hidden md:flex',
              )}
            >
              {selectedConv ? (
                <ChatWindow
                  conversationId={selectedConv.id}
                  currentUserId={userId}
                  listingTitle={selectedConv.listingTitle}
                  listingType={selectedConv.listingType}
                  listingId={selectedConv.listingId}
                  otherUserName={selectedConv.otherUser.name}
                  isOnline={isOnline(selectedConv.otherUser.id)}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
                    <p className="mt-4 text-muted-foreground">
                      {t('chat.selectConversation')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <div className={cn(selectedId ? 'hidden md:block' : '')}>
        <Footer />
      </div>
    </div>
  );
}
