# Упрощение кнопки Share

> **⚠️ ЗАШИПЛЕНО (Jun 2026) + поверхность ЗАМОРОЖЕНА.** Изменение уже в проде (clipboard + toast на странице listing-детали). Поверхность `replacement/[id]` заморожена — не повод для новых листинг-правок. Единственная разрешённая работа по коду — CRO воронки cost.

## Текущее состояние

В `src/app/[locale]/[city]/replacement/[id]/client.tsx` (строки 196-208) кнопка Share использует `navigator.share()`:

```tsx
<Button
  variant="outline"
  size="icon"
  className="transition-transform hover:scale-105"
  onClick={() => {
    navigator.share?.({
      title: listing.title,
      url: window.location.href,
    });
  }}
>
  <Share2 className="h-4 w-4" />
</Button>
```

### Проблемы

1. **`navigator.share`** работает только на мобильных устройствах и Safari на macOS. На Chrome/Firefox/Edge desktop — **не работает** (undefined или выбрасывает ошибку).
2. Оператор `?.` предотвращает ошибку, но кнопка просто **ничего не делает** на desktop — пользователь кликает и не получает никакой обратной связи.
3. Нет fallback для копирования ссылки.

## Архитектура решения

Заменить на `navigator.clipboard.writeText()` с toast-уведомлением через Sonner (уже в проекте: `"sonner": "^1.7.1"`).

### Подход

1. Попытаться `navigator.clipboard.writeText` (работает везде с HTTPS)
2. Показать toast "Ссылка скопирована" через Sonner
3. Иконку оставить `Share2` (узнаваема) или заменить на `Link` / `Copy` — на усмотрение

## Точные изменения кода

### Файл: `src/app/[locale]/[city]/replacement/[id]/client.tsx`

#### 1. Добавить импорт toast

```tsx
// Добавить в начало файла
import { toast } from 'sonner';
```

Sonner уже подключён в `src/app/layout.tsx` через `<Toaster />` (пакет установлен).

#### 2. Заменить обработчик onClick

Было:

```tsx
<Button
  variant="outline"
  size="icon"
  className="transition-transform hover:scale-105"
  onClick={() => {
    navigator.share?.({
      title: listing.title,
      url: window.location.href,
    });
  }}
>
  <Share2 className="h-4 w-4" />
</Button>
```

Стало:

```tsx
<Button
  variant="outline"
  size="icon"
  className="transition-transform hover:scale-105"
  onClick={async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('common.linkCopied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  }}
>
  <Share2 className="h-4 w-4" />
</Button>
```

### Вопрос иконки

| Вариант  | Иконка | За                     | Против                                       |
| -------- | ------ | ---------------------- | -------------------------------------------- |
| `Share2` | ↗      | Узнаваема, привычна    | Вводит в заблуждение — ожидание native share |
| `Link`   | 🔗     | Чётко говорит "ссылка" | Менее привычна                               |
| `Copy`   | 📋     | Чётко — "скопировать"  | Может быть непонятна                         |

**Рекомендация:** оставить `Share2` — это стандарт для "поделиться", а toast сообщит пользователю о результате.

## i18n

Добавить ключи во все 4 файла переводов:

### `src/i18n/messages/en.json`

```json
{
  "common": {
    "linkCopied": "Link copied to clipboard",
    "copyFailed": "Failed to copy link"
  }
}
```

### `src/i18n/messages/pl.json`

```json
{
  "common": {
    "linkCopied": "Link skopiowany do schowka",
    "copyFailed": "Nie udało się skopiować linku"
  }
}
```

### `src/i18n/messages/ru.json`

```json
{
  "common": {
    "linkCopied": "Ссылка скопирована",
    "copyFailed": "Не удалось скопировать ссылку"
  }
}
```

### `src/i18n/messages/uk.json`

```json
{
  "common": {
    "linkCopied": "Посилання скопійовано",
    "copyFailed": "Не вдалося скопіювати посилання"
  }
}
```

## Миграция

Нет миграций БД. Только изменения фронтенда.

## Этапы реализации

### Единственный этап (~15-30 минут)

- [ ] Добавить `import { toast } from "sonner"` в `src/app/[locale]/[city]/replacement/[id]/client.tsx`
- [ ] Заменить `navigator.share?.()` на `navigator.clipboard.writeText()` + `toast.success()`
- [ ] Добавить i18n ключи `linkCopied` и `copyFailed` в `common` секцию всех 4 файлов переводов
- [ ] Проверить, что `<Toaster />` есть в `src/app/layout.tsx` (уже должен быть)
- [ ] Тест на desktop Chrome/Firefox и мобильном Safari
- [ ] (Опционально) Добавить PostHog event: `listing_shared`

## Проверка Toaster

Убедиться, что Sonner `<Toaster />` присутствует в корневом layout:

```tsx
// src/app/layout.tsx — должен содержать:
import { Toaster } from 'sonner';

// Внутри <body>:
<Toaster position="bottom-right" />;
```

Если `<Toaster />` отсутствует — добавить. Но он наверняка уже есть, т.к. Sonner установлен и используется в проекте.
