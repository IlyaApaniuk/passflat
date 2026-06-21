# Избранные объявления (Favorites)

> **⚠️ ЗАШИПЛЕНО + ЗАМОРОЖЕНО (история).** Фича уже в коде (`SavedListing`, `use-favorites`, `favorite-button`). Относится к **замороженному** листинг-пиллару — не расширять, не переприоритизировать. Чек-листы ниже — закрытая история, не открытые задачи.

## Текущее состояние

На странице детального просмотра объявления (`src/app/[locale]/[city]/replacement/[id]/client.tsx`) есть кнопка Heart, но она работает только через `useState` — при перезагрузке страницы состояние теряется:

```tsx
const [saved, setSaved] = useState(false);
// ...
<Button variant={saved ? 'default' : 'outline'} size="icon" onClick={() => setSaved(!saved)}>
  <Heart className={`h-4 w-4 transition-all ${saved ? 'fill-current scale-110' : ''}`} />
</Button>;
```

Нет:

- Модели данных для сохранения избранного
- API для добавления/удаления
- Кнопки Heart на карточках в результатах поиска
- Вкладки "Избранное" в дашборде
- Поддержки неавторизованных пользователей (localStorage)

## Архитектура решения

### Подход

1. Авторизованные пользователи — сохранение через API в БД (`SavedListing`)
2. Неавторизованные пользователи — `localStorage` (массив `listingId`), синхронизация при логине
3. Optimistic UI — кнопка реагирует мгновенно, откатывается при ошибке

### Кастомный хук `useFavorites`

Центральный хук, который инкапсулирует логику:

```tsx
// src/hooks/use-favorites.ts
import { useState, useEffect, useCallback } from 'react';

const LOCAL_STORAGE_KEY = 'passflat_favorites';

interface UseFavoritesReturn {
  favorites: Set<string>;
  isFavorite: (listingId: string) => boolean;
  toggleFavorite: (listingId: string) => Promise<void>;
  isLoading: boolean;
}

export function useFavorites(isLoggedIn: boolean): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isLoggedIn) {
      fetch('/api/favorites')
        .then((res) => res.json())
        .then((data) => setFavorites(new Set(data.listingIds)))
        .finally(() => setIsLoading(false));
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      setFavorites(new Set(stored ? JSON.parse(stored) : []));
      setIsLoading(false);
    }
  }, [isLoggedIn]);

  const toggleFavorite = useCallback(
    async (listingId: string) => {
      const isSaved = favorites.has(listingId);

      // Optimistic update
      setFavorites((prev) => {
        const next = new Set(prev);
        isSaved ? next.delete(listingId) : next.add(listingId);
        return next;
      });

      if (isLoggedIn) {
        try {
          const res = await fetch('/api/favorites', {
            method: isSaved ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listingId }),
          });
          if (!res.ok) throw new Error();
        } catch {
          // Rollback
          setFavorites((prev) => {
            const next = new Set(prev);
            isSaved ? next.add(listingId) : next.delete(listingId);
            return next;
          });
        }
      } else {
        const arr = Array.from(favorites);
        isSaved ? arr.splice(arr.indexOf(listingId), 1) : arr.push(listingId);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(arr));
      }
    },
    [favorites, isLoggedIn],
  );

  return {
    favorites,
    isFavorite: (id) => favorites.has(id),
    toggleFavorite,
    isLoading,
  };
}
```

## Модели данных

### Новая Prisma модель

```prisma
// prisma/schema.prisma

model SavedListing {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  listingId String   @map("listing_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  user    Profile @relation(fields: [userId], references: [id], onDelete: Cascade)
  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([userId, listingId])
  @@index([userId])
  @@map("saved_listings")
}
```

Обновить связи в существующих моделях:

```prisma
// Profile — добавить
savedListings SavedListing[]

// Listing — добавить
savedBy SavedListing[]
```

## API

### `POST /api/favorites` — добавить в избранное

```ts
// src/app/api/favorites/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const user = await getUser(); // существующий паттерн из api/responses/route.ts
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId } = await request.json();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const saved = await prisma.savedListing.upsert({
    where: { userId_listingId: { userId: user.id, listingId } },
    create: { userId: user.id, listingId },
    update: {},
  });

  return NextResponse.json({ saved }, { status: 201 });
}
```

### `DELETE /api/favorites` — убрать из избранного

```ts
export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId } = await request.json();

  await prisma.savedListing.deleteMany({
    where: { userId: user.id, listingId },
  });

  return NextResponse.json({ ok: true });
}
```

### `GET /api/favorites` — получить список избранного

```ts
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const saved = await prisma.savedListing.findMany({
    where: { userId: user.id },
    include: {
      listing: {
        include: {
          building: { include: { district: true, city: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    listingIds: saved.map((s) => s.listingId),
    listings: saved.map((s) => s.listing),
  });
}
```

### `POST /api/favorites/sync` — синхронизация localStorage при логине

```ts
// src/app/api/favorites/sync/route.ts
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingIds } = await request.json(); // string[]

  // Upsert каждого — skipDuplicates
  await prisma.savedListing.createMany({
    data: listingIds.map((listingId: string) => ({
      userId: user.id,
      listingId,
    })),
    skipDuplicates: true,
  });

  // Очистить localStorage на клиенте после успешного sync
  return NextResponse.json({ synced: listingIds.length });
}
```

## UI компоненты

### 1. Компонент `FavoriteButton`

```tsx
// src/components/listings/favorite-button.tsx
'use client';

import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  size?: 'default' | 'sm';
  className?: string;
}

export function FavoriteButton({
  isFavorite,
  onToggle,
  size = 'default',
  className,
}: FavoriteButtonProps) {
  return (
    <Button
      variant={isFavorite ? 'default' : 'outline'}
      size="icon"
      className={cn('transition-transform hover:scale-105', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <Heart
        className={cn(
          'transition-all',
          size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
          isFavorite && 'fill-current scale-110',
        )}
      />
    </Button>
  );
}
```

### 2. Обновление страницы объявления

В `src/app/[locale]/[city]/replacement/[id]/client.tsx`:

- Убрать локальный `useState(false)` для `saved`
- Подключить `useFavorites` хук
- Заменить кнопку на `<FavoriteButton>`

### 3. Добавить Heart на карточки объявлений

В `src/components/listings/listings-page-client.tsx` — добавить `<FavoriteButton>` в правый верхний угол каждой карточки (поверх фото, как на Airbnb).

### 4. Вкладка "Избранное" на дашборде

В `src/app/[locale]/dashboard/client.tsx` — добавить третий таб в `<Tabs>`:

```tsx
<TabsTrigger value="saved" className="gap-2">
  <Heart className="h-4 w-4" />
  {t('dashboard.savedListings')}
  {savedCount > 0 && (
    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
      {savedCount}
    </span>
  )}
</TabsTrigger>
```

Содержимое таба — список карточек избранных объявлений (тот же формат, что и на странице поиска, с кнопкой удалить).

### 5. Синхронизация localStorage при логине

В `src/app/[locale]/auth/callback/route.ts` — после успешной авторизации редиректить на клиентскую страницу, которая проверяет localStorage и вызывает `/api/favorites/sync`.

Или лучше: в `useFavorites` при `isLoggedIn=true` проверять localStorage и автоматически синхронизировать:

```ts
useEffect(() => {
  if (isLoggedIn) {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const localIds = JSON.parse(stored) as string[];
      if (localIds.length > 0) {
        fetch('/api/favorites/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingIds: localIds }),
        }).then(() => localStorage.removeItem(LOCAL_STORAGE_KEY));
      }
    }
  }
}, [isLoggedIn]);
```

## i18n

Добавить ключи во все 4 файла (`en.json`, `pl.json`, `ru.json`, `uk.json`):

```json
{
  "favorites": {
    "saved": "Saved",
    "addToFavorites": "Add to favorites",
    "removeFromFavorites": "Remove from favorites",
    "savedToast": "Added to favorites",
    "removedToast": "Removed from favorites",
    "loginToSave": "Log in to save listings",
    "noSavedListings": "No saved listings",
    "noSavedListingsDesc": "Heart listings you like to find them later here"
  },
  "dashboard": {
    "savedListings": "Saved"
  }
}
```

## Миграция

```bash
npx prisma migrate dev --name add-saved-listings
```

Миграция создаст:

1. Таблицу `saved_listings` с колонками `id`, `user_id`, `listing_id`, `created_at`
2. Уникальный индекс на `(user_id, listing_id)`
3. Индекс на `user_id`
4. Foreign keys на `profiles` и `listings` с каскадным удалением

## Этапы реализации

### Этап 1 — База (1-2 дня)

- [ ] Prisma модель + миграция
- [ ] API routes: POST, DELETE, GET `/api/favorites`
- [ ] Хук `useFavorites`
- [ ] Компонент `FavoriteButton`

### Этап 2 — Интеграция в UI (1 день)

- [ ] Заменить useState на `useFavorites` в `client.tsx` детального просмотра
- [ ] Добавить `FavoriteButton` на карточки в списке объявлений
- [ ] Toast-уведомления через Sonner: "Добавлено в избранное" / "Удалено из избранного"
- [ ] i18n ключи

### Этап 3 — Дашборд (0.5 дня)

- [ ] Новый таб "Избранное" в дашборде
- [ ] Серверная загрузка данных в `page.tsx` дашборда
- [ ] Empty state с иконкой Heart

### Этап 4 — localStorage и синхронизация (0.5 дня)

- [ ] localStorage fallback в `useFavorites` для неавторизованных
- [ ] API `/api/favorites/sync` для пакетной синхронизации
- [ ] Автоматическая синхронизация при логине
- [ ] Очистка localStorage после синхронизации

### Этап 5 — Полировка (0.5 дня)

- [ ] Анимация Heart (framer-motion pulse при добавлении)
- [ ] PostHog event: `listing_favorited`, `listing_unfavorited`
- [ ] Проверка удаления: при удалении объявления `onDelete: Cascade` удаляет записи из `saved_listings`
