# Passflat — Architecture

## Tech Stack

| Слой | Технология | Почему |
|------|-----------|--------|
| Framework | Next.js 15 (App Router) | SSR для SEO, i18n routing, React |
| UI | Tailwind CSS + shadcn/ui | Быстро, кастомизируемо |
| БД | Supabase (Postgres) | Auth, Storage, RLS, Realtime |
| ORM | Prisma | Type-safe, migrations, studio |
| i18n | next-intl | Routing по locale, серверные/клиентские переводы |
| Карты (отображение) | Mapbox GL JS | Кластеризация, стилизация, дешевле Google на масштабе |
| Геокодинг (автокомплит) | Google Places API | Лучший автокомплит адресов в мире |
| Оплаты | Stripe | Мультивалютность, BLIK, SEPA, Klarna |
| Email | Resend | Простой API, шаблоны |
| Хостинг | Vercel | Edge, автодеплой, CDN |
| Аналитика | PostHog | Privacy-friendly, funnels, feature flags |
| Feature flags | PostHog / Vercel Flags | A/B тесты, разный функционал по странам |
| Фото storage | Supabase Storage | Интеграция с Supabase, resize через edge functions |
| Cron/очереди | Trigger.dev / Vercel Cron | Expiry объявлений, уведомления |

## Языки

- PL (польский) — основной
- EN (английский) — экспаты
- RU (русский) — русскоязычное комьюнити
- UA (украинский) — украинское комьюнити

Структура i18n: `next-intl` с routing `/pl/...`, `/en/...`, `/ru/...`, `/ua/...`

## URL-структура

```
/{locale}/{city}                          — страница города
/{locale}/{city}/{district}               — страница района
/{locale}/{city}/building/{slug}          — страница здания
/{locale}/{city}/replacement              — список замен в городе
/{locale}/{city}/replacement/{id}         — объявление о замене
/{locale}/{city}/costs                    — калькулятор/обзор расходов
/{locale}/add-costs                       — форма "добавь свои расходы"
/{locale}/add-replacement                 — форма "ищу замену"

Примеры:
/pl/warszawa/mokotow                      — Мокотув
/en/warsaw/mokotow                        — Mokotów for expats
/de/berlin/kreuzberg                      — Kreuzberg
```

## Database Schema

### Geography (масштабируемость по странам)

```sql
countries (
  id text PK,                    -- 'pl', 'de', 'cz'
  name_key text,                 -- i18n key: 'country.pl'
  currency text,                 -- 'PLN', 'EUR', 'CZK'
  default_locale text,           -- 'pl', 'de', 'cs'
  supported_locales text[],      -- ['pl', 'en', 'uk']
  is_active boolean default false,
  launched_at timestamptz
)

cities (
  id uuid PK,
  country_id text FK → countries,
  slug text UNIQUE,              -- 'warszawa', 'berlin'
  name_key text,
  lat numeric,
  lng numeric,
  bounds jsonb,                  -- bounding box для карты
  timezone text,
  is_active boolean default false
)

districts (
  id uuid PK,
  city_id uuid FK → cities,
  slug text,                     -- 'mokotow', 'kreuzberg'
  name_key text,
  bounds jsonb,                  -- GeoJSON polygon
  UNIQUE(city_id, slug)
)
```

### Buildings (здания)

```sql
buildings (
  id uuid PK,
  city_id uuid FK → cities,
  district_id uuid FK → districts,
  street text,
  building_number text,
  address_full text,
  address_normalized text,       -- lowercase, no spaces, для дедупликации
  lat numeric,
  lng numeric,
  place_id text,                 -- Google Place ID
  total_apartments_approx int,
  building_type text,            -- 'blok', 'kamienica', 'apartamentowiec', 'dom'
  year_built int,
  created_at timestamptz,
  UNIQUE(city_id, address_normalized)
)
```

### Tenant Replacement (объявления о замене)

```sql
replacement_listings (
  id uuid PK,
  building_id uuid FK → buildings,
  author_id uuid FK → profiles,

  title text,
  description text,
  locale text,                   -- 'pl', 'en', 'ru', 'ua'

  currency text,
  rent numeric,
  admin_fee numeric,
  utilities_avg numeric,
  total_monthly numeric,

  lease_type text,               -- 'zwykly_najem', 'najem_okazjonalny'
  lease_end_date date,
  available_from date,
  deposit_amount numeric,

  rooms int,
  area_m2 numeric,
  floor int,
  pets_allowed boolean,
  furnished boolean,

  photos text[],                 -- URLs в Supabase Storage

  status text default 'active',  -- 'draft','active','found','expired','removed'
  is_promoted boolean default false,
  promoted_until timestamptz,
  is_verified boolean default false,

  views_count int default 0,
  responses_count int default 0,

  expires_at timestamptz,        -- авто-expiry через 60 дней
  created_at timestamptz,
  updated_at timestamptz
)

replacement_responses (
  id uuid PK,
  listing_id uuid FK → replacement_listings,
  responder_id uuid FK → profiles,
  message text,
  status text default 'pending', -- 'pending','viewed','accepted','rejected'
  created_at timestamptz
)
```

### Cost Reports (данные о расходах)

```sql
cost_reports (
  id uuid PK,
  building_id uuid FK → buildings,
  author_id uuid FK → profiles,

  currency text,
  rent numeric,
  admin_fee numeric,             -- czynsz admin / Nebenkosten / közös költség
  electricity_avg numeric,
  electricity_winter numeric,
  electricity_summer numeric,
  gas numeric,
  heating numeric,
  heating_included boolean,
  water numeric,
  water_included boolean,
  internet numeric,
  internet_provider text,
  other_costs numeric,
  other_costs_note text,
  total_monthly_avg numeric,

  rooms int,
  area_m2 numeric,
  floor int,

  lease_type text,
  deposit_months numeric,
  deposit_returned boolean,
  deposit_return_days int,

  lived_from date,
  lived_until date,
  is_current_tenant boolean,

  verification_status text,      -- 'unverified', 'email_verified', 'document_verified'
  is_visible boolean default true,
  created_at timestamptz,
  updated_at timestamptz
)

-- Country-specific cost field labels
cost_term_labels (
  id uuid PK,
  country_id text FK → countries,
  field_name text,               -- 'admin_fee'
  label_key text,                -- 'cost.admin_fee.pl' → "Czynsz administracyjny"
  tooltip_key text,
  UNIQUE(country_id, field_name)
)
```

### Users

```sql
profiles (
  id uuid PK,                   -- = auth.users.id
  display_name text,
  locale text,
  city_id uuid FK → cities,
  contact_method text,           -- 'email','telegram','whatsapp','phone'
  contact_value text,
  has_contributed_cost boolean default false,  -- cost data unlock
  is_verified boolean default false,
  created_at timestamptz
)
```

### Payments

```sql
payments (
  id uuid PK,
  user_id uuid FK → profiles,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  product_type text,             -- 'promoted_listing','cost_report','subscription'
  reference_id uuid,
  amount integer,                -- в минимальных единицах (grosze/cents)
  currency text,
  status text,
  created_at timestamptz
)

subscriptions (
  id uuid PK,
  user_id uuid FK → profiles,
  stripe_subscription_id text,
  plan_type text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz
)
```

### Moderation

```sql
reports (
  id uuid PK,
  reporter_id uuid FK → profiles,
  target_type text,              -- 'cost_report','replacement_listing'
  target_id uuid,
  reason text,
  status text default 'pending',
  moderator_notes text,
  created_at timestamptz
)
```

## Карта (интерактивная, split view)

Layout как на Airbnb/Booking:
- **Левая панель:** список объявлений с фильтрами (район, цена, комнаты, дата)
- **Правая панель:** Mapbox GL карта с маркерами/кластерами
- **Взаимодействие:** hover на маркер → подсветка карточки; клик на карточку → центрирование карты
- **Попапы:** превью объявления (фото, цена, комнаты) при клике на маркер

Технология: Mapbox GL JS (`react-map-gl` обёртка).

## Структура проекта (Next.js App Router)

```
passflat/
├── .cursor/
│   └── rules/
│       └── passflat.md          # Rules для Cursor agents
├── prisma/
│   └── schema.prisma
├── public/
│   └── locales/                 # Static assets
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                     # Landing
│   │   │   ├── [city]/
│   │   │   │   ├── page.tsx                 # City page
│   │   │   │   ├── [district]/
│   │   │   │   │   └── page.tsx             # District page
│   │   │   │   ├── building/
│   │   │   │   │   └── [slug]/page.tsx      # Building page
│   │   │   │   ├── replacement/
│   │   │   │   │   ├── page.tsx             # Listings list + map
│   │   │   │   │   └── [id]/page.tsx        # Single listing
│   │   │   │   └── costs/
│   │   │   │       └── page.tsx             # Cost overview
│   │   │   ├── add-replacement/
│   │   │   │   └── page.tsx                 # Create listing wizard
│   │   │   ├── add-costs/
│   │   │   │   └── page.tsx                 # Add cost report
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx                 # User dashboard
│   │   │   └── auth/
│   │   │       ├── login/page.tsx
│   │   │       └── register/page.tsx
│   │   └── api/
│   │       ├── webhooks/
│   │       │   └── stripe/route.ts
│   │       └── og/
│   │           └── route.tsx                # Dynamic OG images
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── map/                 # Mapbox components
│   │   ├── listings/            # Listing cards, filters
│   │   ├── costs/               # Cost forms, charts
│   │   └── layout/              # Header, footer, nav
│   ├── lib/
│   │   ├── prisma.ts            # Prisma client
│   │   ├── supabase.ts          # Supabase clients
│   │   ├── stripe.ts            # Stripe helpers
│   │   ├── mapbox.ts            # Mapbox helpers
│   │   └── utils.ts
│   ├── i18n/
│   │   ├── messages/
│   │   │   ├── pl.json
│   │   │   ├── en.json
│   │   │   ├── ru.json
│   │   │   └── ua.json
│   │   ├── request.ts
│   │   └── routing.ts
│   ├── hooks/
│   ├── types/
│   └── styles/
│       └── globals.css
├── .env.local
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── PROJECT.md
├── ARCHITECTURE.md
├── DEVELOPMENT_PLAN.md
└── COMPETITORS.md
```

## Добавление новой страны (чеклист)

Когда архитектура готова, новая страна = 2-3 дня:

1. Добавить записи в `countries`, `cities`, `districts` (SQL seed)
2. Перевести словарь (next-intl) на новый язык
3. Настроить `cost_term_labels` для страны
4. Добавить currency в Stripe
5. Адаптировать цены
6. SEO: meta tags, hreflang, sitemap
7. Seed данные по районам
8. Тестирование flow в новом locale
