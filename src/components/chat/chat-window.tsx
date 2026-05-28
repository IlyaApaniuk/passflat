'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { useChat } from '@/hooks/use-chat';
import { useTyping } from '@/hooks/use-typing';
import {
  Send,
  Loader2,
  ArrowLeft,
  ExternalLink,
  ChevronUp,
} from 'lucide-react';

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  listingTitle: string;
  listingType: string;
  listingId: string;
  otherUserName: string;
  isOnline?: boolean;
  onBack?: () => void;
}

export function ChatWindow({
  conversationId,
  currentUserId,
  listingTitle,
  listingType,
  listingId,
  otherUserName,
  isOnline,
  onBack,
}: ChatWindowProps) {
  const t = useTranslations();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading, sendMessage, sending, hasMore, loadMore } =
    useChat(conversationId, currentUserId);
  const { isOtherTyping, sendTyping } = useTyping(
    conversationId,
    currentUserId,
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOtherTyping]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input;
    setInput('');
    await sendMessage(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{otherUserName}</p>
            {isOnline && (
              <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            )}
          </div>
          <Link
            href={`/warsaw/${listingType}/${listingId}` as '/'}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
          >
            {listingTitle}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button variant="ghost" size="sm" onClick={loadMore} className="gap-1 text-xs">
              <ChevronUp className="h-3 w-3" />
              {t('chat.loadMore')}
            </Button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map((msg, i) => {
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showSender = !prevMsg || prevMsg.senderId !== msg.senderId;
            return (
              <MessageBubble
                key={msg.id}
                content={msg.content}
                isOwn={msg.isOwn}
                senderName={msg.senderName}
                timestamp={msg.createdAt}
                showSender={showSender}
              />
            );
          })
        )}
        {isOtherTyping && <TypingIndicator />}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              sendTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.typeMessage')}
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            size="icon"
            className="shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
