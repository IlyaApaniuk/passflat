'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  content: string;
  isOwn: boolean;
  senderName?: string;
  timestamp: string;
  showSender?: boolean;
}

function MessageBubbleImpl({
  content,
  isOwn,
  senderName,
  timestamp,
  showSender = false,
}: MessageBubbleProps) {
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[75%] space-y-1', isOwn ? 'items-end' : 'items-start')}>
        {showSender && !isOwn && senderName && (
          <p className="text-xs text-muted-foreground px-1">{senderName}</p>
        )}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isOwn ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
        <p
          className={cn(
            'text-[10px] text-muted-foreground px-1',
            isOwn ? 'text-right' : 'text-left',
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}

// Memoized so an incoming/optimistic message only re-renders the new bubble
// rather than the entire (potentially long) message list on every update.
export const MessageBubble = memo(MessageBubbleImpl);
