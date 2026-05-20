# Passflat — Development Plan

## Общий timeline

| Фаза | Описание | Full-time (8ч/день) | Вечера (3ч/день) |
|------|----------|---------------------|------------------|
| 1 | Foundation (скелет) | 7-10 дней | 2-3 недели |
| 2 | Tenant Replacement MVP | 10-12 дней | 3-4 недели |
| 3 | Cost Transparency | 8-10 дней | 2-3 недели |
| 4 | Monetization (Stripe) | 5-7 дней | 1.5-2 недели |
| 5 | Polish & Launch | 5-7 дней | 1.5-2 недели |
| **Итого** | | **35-46 дней** | **10-14 недель** |

## Week 1 Launch (минимальный продукт для теста)

Только Фаза 1 + урезанная Фаза 2. Достаточно для тестирования в FB-группах:

1. Список объявлений о замене в Варшаве
2. Форма: добавить квартиру (адрес, цена, описание, фото)
3. Auth: email + Google
4. Страница объявления с контактной кнопкой
5. PL + EN + RU + UA
6. Деплой на Vercel

---

## Фаза 1 — Foundation (7-10 дней)

Всё, что нужно один раз и переиспользуется для любой страны.

| # | Задача | Дней | Детали |
|---|--------|------|--------|
| 1.1 | Next.js 15 + Tailwind + shadcn/ui init | 0.5 | App Router, src/ structure |
| 1.2 | Supabase: проект + RLS | 0.5 | Auth config, storage buckets |
| 1.3 | Prisma setup + schema + migrations | 1 | Все таблицы из ARCHITECTURE.md |
| 1.4 | Auth (Supabase Auth: email + Google + Apple) | 1 | Login/register/profile pages |
| 1.5 | i18n (next-intl): routing, PL + EN + RU + UA | 1.5 | Middleware, locale detection, базовые словари |
| 1.6 | Layout: header, footer, city selector, mobile nav | 1 | Responsive, переключение города/языка |
| 1.7 | Seed data: countries + cities + districts (Варшава) | 0.5 | SQL seed файлы |
| 1.8 | Деплой Vercel + домен + env | 0.5 | CI/CD с GitHub |
| 1.9 | .env.example + README setup | 0.5 | Документация для разработчиков |

## Фаза 2 — Tenant Replacement MVP (10-12 дней)

Главный продукт. Должен работать идеально.

| # | Задача | Дней | Детали |
|---|--------|------|--------|
| 2.1 | Форма создания объявления (multi-step wizard) | 2 | Адрес → детали → фото → preview |
| 2.2 | Google Places API автокомплит адреса | 1 | Интеграция, парсинг компонентов адреса |
| 2.3 | Building resolution (find or create) | 1 | Нормализация адреса, дедупликация |
| 2.4 | Загрузка фото (Supabase Storage + resize) | 1 | Drag-and-drop, preview, до 10 фото |
| 2.5 | Страница объявления (SSR, OG tags) | 1.5 | Фото gallery, cost breakdown, карта, CTA |
| 2.6 | Интерактивная карта + список (split view) | 2 | Mapbox GL, кластеры, попапы, связь с листом |
| 2.7 | Фильтры: район, цена, комнаты, дата | 1 | URL-based filters для SEO |
| 2.8 | Система откликов (кнопка + сообщение) | 1 | Модалка, сохранение, статусы |
| 2.9 | Личный кабинет (мои объявления, отклики) | 1.5 | Dashboard с метриками |
| 2.10 | Email-уведомления (Resend) | 1 | Новый отклик, напоминание, expiry |
| 2.11 | Авто-expiry (cron: 60 дней) | 0.5 | Trigger.dev или Vercel Cron |

## Фаза 3 — Cost Transparency (8-10 дней)

Краудсорсинговая модель прозрачности расходов на аренду.

| # | Задача | Дней | Детали |
|---|--------|------|--------|
| 3.1 | Форма "Добавь свои расходы" | 1.5 | Адрес autocomplete → поля расходов → submit |
| 3.2 | Динамические поля по стране (cost_term_labels) | 1 | PL: "Czynsz admin", DE: "Nebenkosten" |
| 3.3 | Страница здания: агрегированные расходы | 2 | Avg/min/max, лето/зима, кол-во отчётов |
| 3.4 | Страница района: обзор расходов | 1 | Средние по району, сравнение зданий |
| 3.5 | Glassdoor-механика: unlock через свои данные | 1 | Gated content: blurred → unlocked |
| 3.6 | Калькулятор "Сколько реально стоит" (публичный) | 1 | SEO: район + комнаты → примерная стоимость |
| 3.7 | SEO-страницы городов/районов | 1 | Meta tags, structured data |

## Фаза 4 — Monetization (5-7 дней)

Stripe интеграция. У автора есть наработки по Stripe.

| # | Задача | Дней | Детали |
|---|--------|------|--------|
| 4.1 | Stripe Products/Prices (multi-currency) | 0.5 | PLN, EUR, CZK |
| 4.2 | Promoted listing: checkout + webhook | 1.5 | Checkout Session → webhook → is_promoted |
| 4.3 | Платный отчёт: checkout + unlock | 1.5 | Checkout Session → access granted |
| 4.4 | Подписка: subscription lifecycle | 2 | Create/cancel/renew + Customer Portal |
| 4.5 | Pricing page + success/cancel pages | 1 | Мультивалютная pricing page |

## Фаза 5 — Polish & Launch (5-7 дней)

| # | Задача | Дней | Детали |
|---|--------|------|--------|
| 5.1 | Mobile responsive polish | 1 | Тестирование на реальных устройствах |
| 5.2 | Dynamic OG images (@vercel/og) | 1 | Красивые превью для FB/Telegram шаринга |
| 5.3 | Regulamin + Polityka Prywatności (RODO) | 1 | С юристом |
| 5.4 | Admin panel (модерация) | 1.5 | Список объявлений/отчётов, флаги, скрытие |
| 5.5 | Error handling, empty states, loading | 1 | Скелетоны, fallbacks |
| 5.6 | E2E тестирование + bugfixes | 1 | Основные flow |

---

## Launch Checklist

### До первого public поста:
- [ ] 10-15 реальных объявлений о замене (seed от друзей + ручной набор из FB-групп)
- [ ] 15-20 cost reports (seed от друзей через Google Form)
- [ ] Средние данные по районам Варшавы (парсинг Otodom)
- [ ] Regulamin и Polityka Prywatności
- [ ] Email-уведомления работают
- [ ] OG images генерируются (для красивых превью в FB/Telegram)
- [ ] Mobile version работает корректно

### Каналы launch:
- [ ] Топ-5 FB-групп по аренде в Варшаве (464K+ участников)
- [ ] Топ-3 Telegram-канала (RU/UA)
- [ ] Reddit: r/warsaw, r/poland
- [ ] Личные сообщения людям, ищущим замену в группах
