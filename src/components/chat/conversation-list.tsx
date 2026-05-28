'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Home, MessageSquare } from 'lucide-react';

export interface ConversationListItem {
  id: string;
  listingId: string;
  listingTitle: string;
  listingType: string;
  listingPhoto: string | null;
  otherUser: { id: string; name: string };
  lastMessage: {
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount?: number;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isOnline?: (userId: string) => boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isOnline,
}: ConversationListProps) {
  const t = useTranslations();

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{t('chat.noConversations')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('chat.noConversationsDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {conversations.map((conv) => {
        const isSelected = selectedId === conv.id;
        const unread = (conv.unreadCount ?? 0) > 0;
        const lastTime = conv.lastMessage
          ? formatRelativeTime(conv.lastMessage.createdAt)
          : '';

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              'flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50',
              isSelected && 'bg-muted',
              unread && !isSelected && 'bg-primary/5',
            )}
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
              {conv.listingPhoto ? (
                <img
                  src={conv.listingPhoto}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Home className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              {isOnline?.(conv.otherUser.id) && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    'truncate text-sm',
                    unread ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {conv.otherUser.name}
                </p>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {lastTime}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {conv.listingTitle}
              </p>
              {conv.lastMessage && (
                <p
                  className={cn(
                    'mt-1 truncate text-xs',
                    unread
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {conv.lastMessage.content}
                </p>
              )}
            </div>

            {unread && (
              <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {conv.unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
