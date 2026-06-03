'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { useChat } from '@/hooks/use-chat';
import { useTyping } from '@/hooks/use-typing';
import { LISTING_TYPE_TO_DOC, templatePdfHref } from '@/components/documents/template-download';
import { isDocumentTemplatesEnabled } from '@/lib/feature-flags';
import type { ListingType } from '@/lib/listings-data';
import { Send, Loader2, ArrowLeft, ExternalLink, ChevronUp, FileText, X } from 'lucide-react';

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
  const locale = useLocale();
  const posthog = usePostHog();
  const [input, setInput] = useState('');
  const [hintDismissed, setHintDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Whether the user is currently pinned near the bottom of the thread. Used to
  // avoid yanking them down while they scroll up to read history or click
  // "load more" (which prepends older messages).
  const isNearBottomRef = useRef(true);

  const templateDocKey =
    isDocumentTemplatesEnabled() && listingType in LISTING_TYPE_TO_DOC
      ? LISTING_TYPE_TO_DOC[listingType as ListingType]
      : null;

  const { messages, loading, sendMessage, sending, hasMore, loadMore } = useChat(
    conversationId,
    currentUserId,
  );
  const { isOtherTyping, sendTyping } = useTyping(conversationId, currentUserId);

  // Reset the pin-to-bottom intent when switching conversations.
  useEffect(() => {
    isNearBottomRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isNearBottomRef.current) return;
    // Defer to the next frame so layout has settled, then jump to bottom in a
    // single write to avoid synchronous layout thrash on large threads.
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, isOtherTyping]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

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
            {isOnline && <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />}
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
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
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

      {/* Contextual template hint */}
      {templateDocKey && !hintDismissed && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 text-muted-foreground">{t('documents.chat.hint')}</span>
          <a
            href={templatePdfHref(templateDocKey, locale)}
            download
            onClick={() =>
              posthog?.capture('template_downloaded', {
                template: templateDocKey,
                format: 'pdf',
                locale,
                listingType,
                source: 'chat',
              })
            }
            className="shrink-0 font-medium text-primary hover:underline"
          >
            {t('documents.chat.cta')}
          </a>
          <button
            type="button"
            onClick={() => setHintDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
