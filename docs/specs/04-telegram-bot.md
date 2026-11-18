# 04 · Telegram bot: handoff, honest figures and promises (PRD 1 package D)

Requirements FR-35 – FR-46 of PRD 1. Bot locales stay RU and UK. No new notifier, mailing or
outbound message; the existing deposit follow-ups stay (**Decided**). Tests mock Telegram,
Google, Anthropic and Prisma; nothing starts the bot or calls an API for real. Bot identity
`tg_<chatId>` is never joined with web identities, and chat ids never appear in website URLs.

## Current state (2026-11-19)

- `/start` (`src/lib/bot/bot.ts:207-242`): `dep` starts the deposit flow; `d_<slug>` subscribes
  the chat to the district automatically and replies `subscribedDistrict`; `b_<uuid>` (the only
  payload the website produces, `telegram-bot-cta.tsx`) and `web_*` fall through to
  `startAfterPayload`. `tg_bot_started {payload, is_new}` fires for every start.
- `lookup.ts` has `lookupAddress(geo)` (building → district → city, `MIN_AREA_REPORTS = 5`) and
  no lookup by building id. `format.ts` never uses `sourceKind`; `basedOn` says "по N жильцов"
  for counts that include scraped listings; `verdict` compares with the area median and says
  "района" even when the figure is the city's; `depositLine` says "возвращают полностью" while
  partial returns are stored as `depositReturned = true`.
- Texts that promise messages no code sends: `subscribedBuilding`, `subscribedDistrict`,
  `mySubsEmpty`, `outsideCityNamed`, `cityWaitAdded`, `cityWaitAlready` (texts.ts) and
  `lawyerAck` (deposit-texts.ts). Deposit follow-ups are real (`letterHowTo`, `letterSentAck`,
  `remindSetAck`): they stay.
- `submitLink` sends `p=<placeId>&source=tgbot`, but `costs/submit/page.tsx` accepts `source`
  only from `checker|review|building` and uses `p` only when `source` is accepted, so the bot's
  address prefill is lost.
- `sendDueFollowUps` clears `followUpAt` after sending, without a claim: overlapping runs can
  send twice. `/cancel` abandons only `intake` cases and leaves pending follow-ups.
- `subscribedDistrict` / `subscribedBuilding` interpolate `name` without `escapeHtml`.
- No tests for `bot.ts`, `deposit-flow.ts`, `lookup.ts` or the cron route; `format.test.ts` has a
  `lookup(overrides)` fixture helper.

## Testing rules

- Extract decisions into pure functions (payload parsing, card rendering, event properties) and
  test them directly.
- Handlers: export the handler body as a function that takes the grammY context (or a minimal
  `{ chat, from, reply, ... }` fake) and its dependencies, so a test can call it with mocks;
  do not start a `Bot` or call `bot.init()`.
- Prisma through `vi.mock('@/lib/prisma')` with `vi.hoisted` state (pattern of
  `src/app/api/location-score/route.test.ts`); `trackServerEvent` through
  `vi.mock('@/lib/posthog-server')`.
- Every new or changed text exists in RU and UK; values from data pass through `escapeHtml`.

## Start payloads

FR-35, FR-36. `src/lib/bot/start-payload.ts`: `parseStartPayload(raw)` →

| Payload                                         | Result                             |
| ----------------------------------------------- | ---------------------------------- |
| empty                                           | `{ kind: 'none' }`                 |
| `dep`                                           | `{ kind: 'deposit' }`              |
| `b_<uuid>` (RFC 4122 shape, case-insensitive)   | `{ kind: 'building', buildingId }` |
| `b_<anything else>`                             | `{ kind: 'invalid_building' }`     |
| `d_<slug>` (`[a-z0-9-]{1,48}`)                  | `{ kind: 'district', slug }`       |
| `web_<source>`                                  | `{ kind: 'web', source }`          |
| longer than 64 chars or outside `[A-Za-z0-9_-]` | `{ kind: 'unknown' }`              |
| anything else (for example `thr_med`)           | `{ kind: 'unknown' }`              |

PRD 2 FR-2 later adds `dep_<source>`; keep the parser one function with a table-driven test.
`tg_bot_started` keeps the raw `payload` and `is_new`. `TelegramChat.startPayload` stays
first-touch.

The bot's check-event `entry_source` values live in one exported constant next to the parser
(**Assumption**): `typed_address`, `typed_district`, `link_building`, `link_district`. PRD 2
adds the deposit-flow values to the same module.

## Building deep link

FR-35 (**Decided**).

- `lookupBuilding(buildingId)` in `lookup.ts`: loads the building (city `warsaw`, coordinates,
  district) and returns the same `AddressLookup` shape `lookupAddress` returns, through a shared
  internal function, so both paths render identically. Read-only: never creates a building.
- `/start b_<uuid>` with a known building in the checker city → the bot immediately replies with
  that building's card (same as typing its address) and its buttons. No request to type the
  address.
- Unknown, deleted, or outside the checker city, and `invalid_building` → a short fallback
  ("Couldn't open this building, send its address", draft RU/UK) and the normal address prompt.
- The checker creates a building row for every checked address, so a `b_` id usually points to
  a building with zero reports: then the reply is the area card that starts with
  `noBuildingData` ("по дому данных нет"), exactly as for a typed address of that building.
- A building with null coordinates or no district → the card with the city reference.
- `/start b_` while a deposit intake is open: show the building reply and add one line that
  `/cancel` leaves the deposit questions (draft); the intake stays open.
- A database error → `genericError` (texts.ts, currently unused), never silence.
- The website CTA label stops promising to "follow" (`checker.costs.telegramCta`: EN "Follow this
  building on Telegram"); draft EN "Open this building in the Telegram bot", RU «Открыть этот
  дом в Telegram-боте», UK «Відкрити цей будинок у Telegram-боті», PL «Otwórz ten budynek w
  bocie Telegram» (four locale files).
- Tests: valid id → card rendered from the lookup; unknown id → fallback; malformed → fallback
  without a DB query; outside city → fallback.

## District deep link

FR-36 (**Decided**). `/start d_<slug>` with a known district → the district reply
(`renderDistrict`) plus a button "Save interest in <district>" (callback `sub:d:<slug>`, the
existing subscription path). Opening the link creates no `TelegramSubscription`. Unknown slug →
the generic start reply. `dep`, `b_`, `d_` and `web_*` links all keep working. Names in replies
are escaped.

## Cards on the shared contract

FR-37, FR-34 (**Decided**). `lookup.ts` gets building figures and the area reference from
`src/lib/cost-figures-query.ts` (spec 03); `format.ts` renders them:

- Building card: per group (tenant, asking) the headline value with its N and label ("по 3
  отчётам жильцов, из них 1 внесён Passflat", "по 2 объявлениям — цены из объявлений", draft);
  "одно наблюдение по этому адресу" for `observation one`; "известная часть расходов" for a
  known-part total.
- Remove `verdict` (no "дороже/дешевле района"): the bot has no comparable sample. Instead, a
  reference line labelled with its level and N: "Район Мокотув, отчёты жильцов: 3 900 zł (37)"
  or "Варшава, …" when the level is city.
- District and city cards: groups with N; neighbours show their own N.
- `cardFooter` and `start` copy no longer say "реальные расходы" (draft: "расходы, о которых
  сообщили жильцы").
- Consistency test: the same fixture through the checker summary (spec 03) and the bot card
  gives the same median and N for the same group and metric.

## Deposit statistics in the bot

FR-38 (**Decided**); copy **agent draft**. `depositLine` uses `summarizeDepositReturns` (spec
03): «Вернули залог полностью или частично: 2 из 3 ответивших (Мокотув)»; UK equivalent. Shown
only when `answered ≥ 3` (existing gate). No individual probability ("у вас шанс …"). Never
includes `DepositCase` rows. The same applies to the `/deposit` command's `depositStats`
(`bot.ts:262-280`, `texts.ts:142`, "Возвращают полностью X%"): city-level
`summarizeDepositReturns`, same wording, same gate.

## Promises and capabilities

FR-39, FR-40 (**Decided**); copy **agent draft** (RU and UK), listed for review.

- Replace the six notification promises: building or district interest → «Сохранил интерес к
  <name>. Автоматических уведомлений о новых данных пока нет.»; city waitlist → «Записал, что
  вы ждёте <city>. Автоматических сообщений о запуске пока нет.»; `/my` empty → no "напишу".
- Buttons `subscribeBuilding`, `subscribeDistrict` → «Сохранить интерес к дому» / «… к району
  <district>»; unsubscribe in `/my` keeps working (`unsub:<targetKey>`).
- `/help`, `start`, `startAfterPayload` and the command menu describe the same real set: address
  or district check, `/districts`, the deposit helper (`/deposit`), saved interests (`/my`),
  `/lang`, `/cancel`. No roommate search, no notifications.
- The command menu is `COMMANDS` in `scripts/tg-webhook.ts:9-15` (RU only, no `/cancel`, "Мои
  подписки"): add `/cancel`, rename `/my` to saved interests, and add a UK menu with
  `language_code: 'uk'`. It takes effect only when the owner runs `npm run bot:webhook`; the
  final check lists that step for the owner. Iterations never run it.
- Deposit follow-up texts stay (they are real).

## Bot analytics

FR-41 (**Decided**); values **Assumption**.

- `tg_address_checked` keeps `level`, `district`, `has_building`, `report_count` and adds
  `entry_source` (constant above), `lookup_level` (= `level`), `source_kind`
  (`tenant|mixed|asking|none`, from the groups), `n` (the headline metric's N of the tenant
  group when it exists, else of the asking group, else 0), and `incomplete` (true when that
  headline is a known-part total). Built by the shared `answerProperties` (spec 01 §Answer
  quality) so web and bot use one definition.
- Bot events are server events: the webhook route (`src/app/api/telegram/webhook/route.ts`)
  and the follow-ups cron call `flushPostHog()` after handling (`after()` from `next/server`
  in the webhook, awaited in the cron), with a test that the flush is called. Today the webhook
  never flushes, so events can be lost in production.
- `tg_district_checked` adds `entry_source`, `source_kind`, `n`, `incomplete`.
- A building opened by `b_` fires one `tg_address_checked` with `entry_source=link_building`
  and no second event from the address path.
- `tg_address_not_found` and `tg_address_outside_city` keep sending the typed `query` (free
  text) until the owner answers Q-15; do not add free text to any new event.
- A pure `checkEventProperties(lookup, entrySource)` is tested.

## Links to the website

FR-42 (**Decided**). `costs/submit/page.tsx` accepts `source=tgbot` (add it to the whitelist),
so `cost_form_started` has `source: 'tgbot'`. The page prefills only from an existing Building
(by `b=<id>`, or by `p` matching a building's `placeId`), and the bot never creates buildings,
so `submitLink` sends `b=<buildingId>` whenever the lookup has a `buildingId` (any level) and
`p` as today. Without a building row there is no prefill and the form works normally
(resolving a bare place id would need a paid Google call: not done). UTM
(`utm_source=telegram`, `utm_medium=bot`, `utm_campaign`) stays on every bot link. A test of
`submitLink` / `webLink` asserts the parameters and that no chat id is present; a test of the
submit page's param parsing (extract it into a pure function) asserts the prefill for
`source=tgbot`.

## Deposit helper scope

FR-43, **Open** (Q-5): wording for an unread contract, a non-lease and an unsupported case, the
"⚖️ Разбор" header, and pointing disputed cases to qualified help. Do not change the verdict, the
rules, the letter or these texts until the owner answers. Drafts are in the decision review.

## Scenarios for a lawyer

FR-44 (**Decided**). `docs/legal-review/deposit-scenarios.md` (English, Polish legal terms
literal): every scenario the code distinguishes (reason × protocol × overdue × contract status ×
returned amount), what the bot says in each (verdict strength, deadline source, letter or not),
the rules it applies as implemented in `src/lib/bot/deposit.ts` with their statute references as
written in the code, and the known limits (contract read by a model, partial reading, no case
law). It states at the top that it describes the implementation, is not legal advice and has not
been reviewed by a lawyer. It does not add or change any rule.

## Lawyer interest

FR-45, **Open** (Q-6): text before the `wants_lawyer` tap and the confirmation. `lawyerAck`
currently promises «напишу сюда первым». Do not change until the owner answers. Keep
`tg_lawyer_interest` separate from any outcome event.

## Deposit reminders

FR-46 (**Decided**); copy **agent draft**.

- Opt-in exists: a reminder is set only by the "remind me" or "I sent the letter" tap. Keep.
- `/cancel` also clears `followUpAt` (not `followUpKind`: the outcome buttons of messages
  already sent branch on it, `deposit-flow.ts:669`, `:693`) of the chat's open cases
  (`verdict`, `letter_sent`) and says so: draft «Напоминания отключены.»; with nothing to
  cancel, the existing reply.
- `sendDueFollowUps` claims each row before sending: `updateMany({ where: { id, followUpAt:
<the value read> }, data: { followUpAt: null } })`; send only when `count === 1`. On a non-403
  send error, restore `followUpAt` so tomorrow's run retries; 403 marks the chat blocked as
  today. This is at-most-once: a crash between the claim and the send loses that reminder
  (accepted, documented in the README).
- Tests with mocked Prisma and a fake `api.sendMessage`: two runs over the same due row send
  once; a failed send restores the row; `/cancel` clears pending follow-ups; the cron route
  without auth → 401.
