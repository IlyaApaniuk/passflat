# Passflat — Cursor Agent Rules

## Project Overview

Passflat ("Pass the flat") is a rental **transparency** platform for Europe, starting in Poland (Warsaw). It shows what tenants actually **PAY** (rent + komunalka, district medians).

> **⚠️ Direction (2026-06-21 pivot) — read before building anything:**
>
> - **Pillar 1 (the engine + SINGLE headline NOW): Real Cost Transparency** — crowdsourced real rental costs (rent + komunalka/доплаты) per building/district, contribute-to-unlock.
> - **Pillar 2 (later, REPLACES listings): Agency Reputation** — tenant reviews/ratings of agencies. NOT built yet; only on a trigger.
> - **Tenant-replacement / listings = FROZEN** (kept in code, do NOT extend or promote). KEEP only: the district "Ищешь жильё?" waitlist (lead capture) + the scraped Otodom seed (feeds map medians). Search/discovery is **ceded to Flatka** — Passflat is NOT a listings aggregator.
> - **CURRENT MODE = FEATURE FREEZE.** Only sanctioned code work = a CRO/funnel-leak fix on the cost funnel (landing→form→submit). No new features.

**Core features:**

1. **Real Cost Transparency** (primary, the engine) — crowdsourced real rental costs per building/district.
2. **Tenant Replacement** — _FROZEN_: existing listings code only; do not extend or promote.

**Read these files for full context:**

- `PROJECT.md` — vision, features, monetization, marketing
- `ARCHITECTURE.md` — tech stack, DB schema, URL structure, project structure
- `DEVELOPMENT_PLAN.md` — phases, timeline, detailed task breakdown
- `COMPETITORS.md` — competitive analysis, market data, launch channels

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (Postgres)
- **ORM:** Prisma
- **i18n:** next-intl (PL, EN, RU, UK)
- **Maps:** Mapbox GL JS (display) + Google Places API (autocomplete)
- **Payments:** Stripe (multi-currency: PLN, EUR, CZK)
- **Email:** Resend
- **Hosting:** Vercel
- **Analytics:** PostHog
- **Photo storage:** Supabase Storage

## Coding Conventions

- Use TypeScript strict mode
- Use `src/` directory structure
- Use Next.js App Router (not Pages Router)
- Use Server Components by default, Client Components only when needed
- Use Prisma for all database operations
- Use `next-intl` for all user-facing strings — never hardcode text
- All pages must support 4 locales: pl, en, ru, uk
- Use shadcn/ui components — do not install other UI libraries
- Use Tailwind for styling — no CSS modules, no styled-components
- Mobile-first responsive design

## Database

- Schema is defined in `ARCHITECTURE.md`
- Use Prisma migrations
- Supabase for auth (email + Google + Apple)
- Supabase Storage for photo uploads
- Row Level Security (RLS) for data access control

## i18n

- Locale routing: `/{locale}/...` (pl, en, ru, uk)
- Translation files in `src/i18n/messages/{locale}.json`
- Use `next-intl` `useTranslations()` hook in components
- Use `getTranslations()` in server components

## Map

- Primary purpose: the **cost-median surface** — district/building medians (real reports blended with scraped Otodom asking-prices; never label as bare "market/рынок"; gate %-comparisons at N≥5).
- Use `react-map-gl` wrapper for Mapbox GL JS; cluster markers for zoom-out.
- Listings-browse behavior (Airbnb/Booking split view, listing-preview popups) is FROZEN with the listings product — do not extend.

## Key Design Decisions

- **No apartment numbers** in addresses — only building level (street + number). Privacy protection.
- **Monetization (current):** listings revenue (promoted/urgent) is **PARKED**. Engines = cost-data B2C (paid report ~15zł / subscription ~35zł / relocation pack ~60zł) + agency B2B (later). _(old "free listings, paid promotion" — parked.)_
- **Contribute-to-unlock model** for cost data — share your data to unlock others' data, or pay to bypass
- **Building-level data aggregation** — costs are averaged per building, not per apartment
- **Multi-country from day 1** — schema supports countries, cities, districts, currencies, locale-specific cost labels _(future scaffolding; current focus is a distribution sprint, not new countries)_
- **Honesty guardrails (sacred):** real medians only; the median BLENDS scraped asking-prices + real reports → never bare "market/рынок"; gate any %-comparison at N≥5; NEVER "verified / проверено жильцами" or invented stats.
