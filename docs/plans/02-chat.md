# Внутренний чат (In-App Messaging)

> **⚠️ ЗАМОРОЖЕНО (2026-06-21).** Forward-план новой фичи (чат tenant↔landlord) поверх **замороженного** листинг-продукта — сейчас НЕ строится. Режим feature-freeze: единственная разрешённая работа по коду — CRO-фикс воронки cost. Пиллар 2 = репутация агентств (не этот чат). Пересмотр через ~2-3 недели. Оставлено как дремлющий спек.

## Текущее состояние

Сейчас взаимодействие между пользователями — one-shot:

1. Пользователь нажимает "I'm Interested" на странице объявления (`src/app/[locale]/[city]/replacement/[id]/client.tsx`)
2. Открывается `InterestModal` (`src/components/listings/interest-modal.tsx`)
3. Отправляется `POST /api/responses` — создаётся `ListingResponse` в БД
4. Автор объявления получает email через Resend (`sendNewInquiryEmail`)
5. На дашборде (`src/app/[locale]/dashboard/client.tsx`) отклик появляется во вкладке "My Inquiries"
6. Кнопка "Reply" на дашборде **не делает ничего** — нет обработчика

Проблемы:

- Нет возможности продолжить диалог после первого сообщения
- Автор объявления не может ответить через платформу
- Пользователи уходят в Telegram/WhatsApp, теряя привязку к объявлению
- Нет истории переписки

## Архитектура решения

### Выбор технологии: Supabase Realtime

Проект уже использует Supabase (`@supabase/ssr`, `@supabase/supabase-js`) для авторизации и storage. Supabase Realtime — логичный выбор:

| Критерий           | Supabase Realtime   | Polling                |
| ------------------ | ------------------- | ---------------------- |
| Задержка           | ~100ms              | 5-30с                  |
| Нагрузка на сервер | Низкая (websocket)  | Высокая (HTTP запросы) |
| Инфра              | Уже есть (Supabase) | Нет доп. инфры         |
| Сложность          | Средняя             | Низкая                 |
| Масштабируемость   | До 10K concurrent   | Ограничена rate limits |

**Рекомендация:** MVP на Supabase Realtime. Подписки через Postgres Changes на таблицу `messages`. В будущем можно добавить Broadcast channels для typing indicators.

### Связь с текущим flow

Клик "I'm Interested" → вместо только `ListingResponse` → создаётся `Conversation` + первое `Message`. Все дальнейшие сообщения идут в рамках `Conversation`.

## Модели данных

### Новые Prisma модели

```prisma
// prisma/schema.prisma

model Conversation {
  id          String   @id @default(uuid()) @db.Uuid
  listingId   String   @map("listing_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  listing      Listing                @relation(fields: [listingId], references: [id], onDelete: Cascade)
  participants ConversationParticipant[]
  messages     Message[]

  @@map("conversations")
}

model ConversationParticipant {
  id             String    @id @default(uuid()) @db.Uuid
  conversationId String    @map("conversation_id") @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  joinedAt       DateTime  @default(now()) @map("joined_at")
  lastReadAt     DateTime? @map("last_read_at")
  isBlocked      Boolean   @default(false) @map("is_blocked")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         Profile      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId])
  @@map("conversation_participants")
}

model Message {
  id             String    @id @default(uuid()) @db.Uuid
  conversationId String    @map("conversation_id") @db.Uuid
  senderId       String    @map("sender_id") @db.Uuid
  content        String
  messageType    String    @default("text") @map("message_type") // 'text' | 'system' | 'payment_request'
  readAt         DateTime? @map("read_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       Profile      @relation(fields: [senderId], references: [id])

  @@index([conversationId, createdAt])
  @@index([senderId])
  @@map("messages")
}
```

Обновить `Profile`:

```prisma
// Profile — добавить
conversations ConversationParticipant[]
messages      Message[]
```

Обновить `Listing`:

```prisma
// Listing — добавить
conversations Conversation[]
```

### Supabase RLS (Row Level Security)

Критично для Realtime подписок — пользователь должен видеть только свои разговоры:

```sql
-- conversations: участник может читать
CREATE POLICY "Users can view own conversations"
ON conversations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conversations.id
    AND user_id = auth.uid()
  )
);

-- messages: участник разговора может читать
CREATE POLICY "Users can view messages in own conversations"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);

-- messages: отправитель может вставлять
CREATE POLICY "Users can send messages to own conversations"
ON messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
    AND is_blocked = false
  )
);
```

## API

### `POST /api/conversations` — создать разговор (из InterestModal)

```ts
// src/app/api/conversations/route.ts
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId, message } = await request.json();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { authorId: true, title: true },
  });
  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (listing.authorId === user.id) {
    return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });
  }

  // Проверяем: может быть, разговор уже существует
  const existing = await prisma.conversation.findFirst({
    where: {
      listingId,
      participants: {
        every: {
          userId: { in: [user.id, listing.authorId] },
        },
      },
    },
  });

  if (existing) {
    // Добавить сообщение в существующий разговор
    await prisma.message.create({
      data: {
        conversationId: existing.id,
        senderId: user.id,
        content: message,
      },
    });
    return NextResponse.json({ conversationId: existing.id });
  }

  // Создать новый разговор + участников + первое сообщение
  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.create({
      data: {
        listingId,
        participants: {
          createMany: {
            data: [{ userId: user.id }, { userId: listing.authorId }],
          },
        },
      },
    });

    await tx.message.create({
      data: {
        conversationId: conv.id,
        senderId: user.id,
        content: message,
      },
    });

    // Также создать ListingResponse для обратной совместимости
    await tx.listingResponse.create({
      data: {
        listingId,
        responderId: user.id,
        message,
        status: 'pending',
      },
    });

    await tx.listing.update({
      where: { id: listingId },
      data: { responsesCount: { increment: 1 } },
    });

    return conv;
  });

  return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
}
```

### `GET /api/conversations` — список разговоров текущего пользователя

```ts
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { userId: user.id } },
    },
    include: {
      listing: {
        select: { id: true, title: true, type: true, photos: true },
      },
      participants: {
        include: { user: { select: { id: true, displayName: true } } },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, senderId: true, createdAt: true, readAt: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Подсчёт непрочитанных
  const withUnread = await Promise.all(
    conversations.map(async (conv) => {
      const participant = conv.participants.find((p) => p.userId === user.id);
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: user.id },
          createdAt: { gt: participant?.lastReadAt ?? new Date(0) },
        },
      });
      return { ...conv, unreadCount };
    }),
  );

  return NextResponse.json({ conversations: withUnread });
}
```

### `GET /api/conversations/[id]/messages` — сообщения конкретного разговора

```ts
// src/app/api/conversations/[id]/messages/route.ts
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const limit = 50;

  // Проверить, что пользователь — участник
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
  });
  if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      sender: { select: { id: true, displayName: true } },
    },
  });

  return NextResponse.json({ messages: messages.reverse() });
}
```

### `POST /api/conversations/[id]/messages` — отправить сообщение

```ts
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { content } = await request.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
  });
  if (!participant || participant.isBlocked) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderId: user.id,
      content: content.trim(),
    },
  });

  // Обновить updatedAt разговора (для сортировки)
  await prisma.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ message }, { status: 201 });
}
```

### `PATCH /api/conversations/[id]/read` — отметить как прочитанное

```ts
// src/app/api/conversations/[id]/read/route.ts
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
```

## Realtime подписки (Supabase)

### Клиентский хук

```tsx
// src/hooks/use-chat-realtime.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export function useChatRealtime(conversationId: string, onNewMessage: (message: Message) => void) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          onNewMessage(payload.new as Message);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);
}
```

### Подписка на новые разговоры (для badge в хедере)

```tsx
// src/hooks/use-unread-count.ts
export function useUnreadCount(userId: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Начальная загрузка
    fetch('/api/conversations/unread-count')
      .then((res) => res.json())
      .then((data) => setCount(data.count));

    // Realtime: подписка на новые сообщения
    const channel = supabase
      .channel(`user:${userId}:messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=neq.${userId}`,
        },
        () => {
          setCount((prev) => prev + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
```

## UI компоненты

### 1. Страница чата — `src/app/[locale]/messages/page.tsx`

Layout: двухпанельный (как Telegram Web):

- **Левая панель:** список разговоров (ConversationList)
- **Правая панель:** сообщения выбранного разговора (ChatView)
- **Мобильная версия:** одна панель, переключение между списком и чатом

```
┌─────────────────────────────────────────────┐
│  Header (с badge непрочитанных)              │
├──────────────┬──────────────────────────────┤
│ Conversations│  Chat with Anna              │
│              │  Re: Apartment on Marszalk.  │
│ ● Anna  1m  │──────────────────────────────│
│   Hi, is ... │  Anna: Hi! Is the apt...     │
│              │  You: Yes, available from...  │
│   Piotr  2d  │  Anna: Great, can I see...   │
│   Thanks ... │                              │
│              │──────────────────────────────│
│              │  [Type a message...] [Send]  │
└──────────────┴──────────────────────────────┘
```

### 2. Компонент ConversationList

```tsx
// src/components/chat/conversation-list.tsx
interface ConversationItemProps {
  conversation: {
    id: string;
    listing: { title: string; photos: string[] };
    otherUser: { displayName: string };
    lastMessage: { content: string; createdAt: string };
    unreadCount: number;
  };
  isActive: boolean;
  onClick: () => void;
}
```

### 3. Компонент ChatView

```tsx
// src/components/chat/chat-view.tsx
// Бесконечный скролл вверх (load more), auto-scroll на новые сообщения
// Realtime через useChatRealtime хук
// Форма ввода с Textarea + Send кнопка
// Оптимистичная вставка сообщения
```

### 4. Badge непрочитанных в Header

В `src/components/landing/header.tsx` — добавить иконку `MessageSquare` с badge рядом с Dashboard:

```tsx
<Link href="/messages" className="relative">
  <MessageSquare className="h-5 w-5" />
  {unreadCount > 0 && (
    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  )}
</Link>
```

### 5. Обновление дашборда

На вкладке "My Inquiries" — кнопка Reply вместо пустого обработчика открывает чат:

```tsx
<Button size="sm" asChild>
  <Link href={`/messages?conversation=${inquiry.conversationId}`}>{t('common.reply')}</Link>
</Button>
```

### 6. Обновление InterestModal

Обновить `src/components/listings/interest-modal.tsx`:

- `handleSubmit` вызывает `POST /api/conversations` вместо `POST /api/responses`
- После успешной отправки — перенаправление на страницу чата или показ success state

## Email-уведомления

Используем существующий Resend setup. Отправлять email когда:

1. **Новое сообщение** — если получатель не онлайн (не имеет активной Realtime подписки). Задержка 5 минут — если за это время пользователь прочитал, email не отправляется.
2. **Новый разговор** — сразу (как сейчас `sendNewInquiryEmail`).

Реализация через Vercel Cron Job (`src/app/api/cron/send-message-notifications/route.ts`):

- Каждые 5 минут проверяет непрочитанные сообщения старше 5 минут
- Если `lastReadAt` участника < `createdAt` сообщения — отправить email
- Помечать отправленные (добавить поле `emailSentAt` в `Message` или отдельную таблицу)

## Модерация

### Репорт сообщений

Использовать существующую модель `Report`:

```ts
await prisma.report.create({
  data: {
    reporterId: user.id,
    targetType: 'message',
    targetId: messageId,
    reason: selectedReason,
  },
});
```

### Блокировка пользователя

В `ConversationParticipant` есть поле `isBlocked`. При блокировке:

1. Установить `isBlocked = true` для заблокированного участника
2. Заблокированный не может отправлять сообщения (проверка в POST messages)
3. UI: показать "Этот пользователь заблокирован"

### API: `POST /api/conversations/[id]/block`

```ts
export async function POST(request: NextRequest, { params }) {
  const { userId } = await request.json();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId } },
    data: { isBlocked: true },
  });
}
```

## Будущее: кнопки оплаты в чате

Для субаренды (sublet) — в будущем добавить `messageType: 'payment_request'`:

```json
{
  "messageType": "payment_request",
  "content": "{\"amount\": 3500, \"currency\": \"PLN\", \"description\": \"Deposit for sublet\"}"
}
```

Рендерить как карточку с кнопкой "Pay" → Stripe Checkout. Это будет реализовано в плане 03-payments.

## i18n

```json
{
  "chat": {
    "title": "Messages",
    "noConversations": "No messages yet",
    "noConversationsDesc": "When you contact a listing owner or someone contacts you, messages will appear here",
    "typeMessage": "Type a message...",
    "send": "Send",
    "today": "Today",
    "yesterday": "Yesterday",
    "you": "You",
    "unreadMessages": "{count} unread",
    "newMessage": "New message",
    "blocked": "This user is blocked",
    "reportMessage": "Report message",
    "blockUser": "Block user",
    "unblockUser": "Unblock user",
    "listingDeleted": "This listing has been removed",
    "conversationAbout": "About: {listing}"
  }
}
```

## Миграция

```bash
npx prisma migrate dev --name add-chat-models
```

Создаёт таблицы:

1. `conversations`
2. `conversation_participants` (с unique на `conversation_id + user_id`)
3. `messages` (с индексом на `conversation_id + created_at`)

Далее — SQL миграция для RLS policies в Supabase:

```bash
# Применить RLS через Supabase Dashboard или SQL migration
# Включить Realtime для таблицы messages:
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### Миграция существующих ListingResponse → Conversation

Скрипт для конвертации существующих откликов в разговоры:

```ts
// prisma/migrations/migrate-responses-to-conversations.ts
const responses = await prisma.listingResponse.findMany({
  include: { listing: true },
});

for (const response of responses) {
  await prisma.conversation.create({
    data: {
      listingId: response.listingId,
      participants: {
        createMany: {
          data: [{ userId: response.responderId }, { userId: response.listing.authorId }],
        },
      },
      messages: {
        create: response.message
          ? {
              senderId: response.responderId,
              content: response.message,
              createdAt: response.createdAt,
            }
          : undefined,
      },
    },
  });
}
```

## Этапы реализации

### Фаза 1 — MVP: базовый обмен сообщениями (3-4 дня)

- [ ] Prisma модели + миграция
- [ ] API: POST /api/conversations (создание из InterestModal)
- [ ] API: GET /api/conversations (список)
- [ ] API: GET/POST /api/conversations/[id]/messages
- [ ] API: PATCH /api/conversations/[id]/read
- [ ] Обновить InterestModal → создаёт Conversation
- [ ] Страница `/messages` с двухпанельным layout
- [ ] Компоненты ConversationList + ChatView
- [ ] Мобильная адаптация
- [ ] i18n ключи

### Фаза 2 — Realtime (1-2 дня)

- [ ] Supabase RLS policies
- [ ] `ALTER PUBLICATION supabase_realtime ADD TABLE messages`
- [ ] Хук `useChatRealtime` — подписка на новые сообщения
- [ ] Auto-scroll на новое сообщение
- [ ] Хук `useUnreadCount` — badge в хедере
- [ ] Оптимистичная вставка сообщений

### Фаза 3 — Уведомления (1 день)

- [ ] Cron job для email-уведомлений о непрочитанных сообщениях
- [ ] Email шаблон "New message from {name}"
- [ ] Логика задержки (5 минут) для избежания спама
- [ ] Обновить дашборд — кнопка Reply → Link на чат

### Фаза 4 — Модерация и полировка (1 день)

- [ ] Report message UI
- [ ] Block/unblock user
- [ ] Миграция существующих ListingResponse → Conversation
- [ ] PostHog events: `message_sent`, `conversation_started`
- [ ] Empty states, loading skeletons
- [ ] Typing indicator (Supabase Broadcast, опционально)
