# Passflat — Cursor Agent Rules

## Project Overview

Passflat ("Pass the flat") is a tenant replacement + rental cost transparency platform for Europe, starting in Poland (Warsaw).

**Core features:**
1. **Tenant Replacement** — structured listings for tenants who need to find a replacement before their lease ends
2. **Real Cost Transparency** — crowdsourced data about real rental costs per building/district

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
- **i18n:** next-intl (PL, EN, RU, UA)
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
- All pages must support 4 locales: pl, en, ru, ua
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

- Locale routing: `/{locale}/...` (pl, en, ru, ua)
- Translation files in `src/i18n/messages/{locale}.json`
- Use `next-intl` `useTranslations()` hook in components
- Use `getTranslations()` in server components

## Map

- Interactive split view (list + map) like Airbnb/Booking
- Use `react-map-gl` wrapper for Mapbox GL JS
- Cluster markers for zoom-out views
- Popups with listing preview on marker click
- Bidirectional interaction: hover card ↔ highlight marker

## Key Design Decisions

- **No apartment numbers** in addresses — only building level (street + number). Privacy protection.
- **Free listings, paid promotion** — supply must be free to grow, monetize through promoted/urgent features
- **Contribute-to-unlock model** for cost data — share your data to unlock others' data, or pay to bypass
- **Building-level data aggregation** — costs are averaged per building, not per apartment
- **Multi-country from day 1** — schema supports countries, cities, districts, currencies, locale-specific cost labels
