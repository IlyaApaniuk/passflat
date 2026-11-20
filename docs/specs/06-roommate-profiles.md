# 06 · Roommate profiles, intake and the stage 1 sender (PRD 3 M1, M2 bot part)

Requirements FR-1, FR-3 – FR-20 of PRD 3 (`../product/prd/prd-3-roommate-matching.md`, version
0.2). FR-2 (the `mate` payload) is in spec 04 §Start payloads; the website parts of M2 (FR-21,
FR-22) are in spec 02; matching and safety (FR-23 – FR-36) are in spec 07. Thesis v2 (D48), the
stages (D49), the bot languages (D50), the profile fields (D51, D54), retention (D55), the legal
drafts (D56), the owner's defaults and the 10:00 Warsaw send time (D68). No requirement is cut
(D70).

Testing rules of spec 04 apply: pure functions for every rule, handlers exported and called with
a fake context, Prisma through `vi.mock('@/lib/prisma')`, `trackServerEvent` through
`vi.mock('@/lib/posthog-server')`, the Telegram API faked. Nothing starts the bot, calls Telegram
or sends a real message. Every value from data or from the user passes through `escapeHtml`.

## Boundaries

- **Nobody sees anybody in stage 1** (**Decided**, D49): no card of another person, no username,
  no identifier of another person is ever sent while the switch (spec 07 §Switch) is off. The
  only thing about other people a person sees in stage 1 is the counts of §Counts.
- **Personal data** (**Decided**, D51, D54): district choice, budget band, move-in month,
  languages, own gender (optional), "live with" (optional), the short text (optional), house
  rules (optional), the 18+ confirmation time and the Telegram username. Never a name, photo,
  birth date, age band, length of stay, phone, e-mail or document. Gender and "live with" are
  never shown to anyone but the person, never counted, never put into an event (D51).
- **Analytics** (**Decided**): only the events and properties of §Events; no username, text,
  district list, gender, "live with", chat id, partner id or match id in any event. Bot identity
  stays `tg_<chatId>` (`src/lib/bot/analytics.ts`).
- **Outward messages**: the bot writes first only through the roommate cron of §Daily cron and
  the moderation messages of spec 07; nothing is sent by a check or a test.
- **RLS** (**Decided**, D9): the migration has no RLS statement; the handoff names the three new
  tables.
- **Logs** (CLAUDE.md "Privacy"): roommate code logs only an error's message, never the error
  object, the update, the context, query arguments, callback data, a username, a text or a chat
  id. `bot.catch` in `bot.ts` (today it logs the whole `BotError`, whose `ctx` holds the update)
  changes to log only `error.message` and the update type, as `runInBackground` does; a test
  asserts the logged line holds no chat id or text.

## Module layout

**Assumption** (one place each, so later tasks agree):

| File                                       | Holds                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/lib/roommate/rules.ts`                | Constants and pure rules: bands, district picks, languages, gender, house rules, event props |
| `src/lib/roommate/time.ts`                 | Europe/Warsaw calendar: move-in options, month end, expiry, the send hour                    |
| `src/lib/roommate/text-filter.ts`          | The contact filter of the short text (FR-10)                                                 |
| `src/lib/roommate/counts.ts`               | The counting rule (FR-16) and its loader, shared by the bot and the website                  |
| `src/lib/roommate/room-costs.ts`           | The room cost areas and the per-person split (FR-17), shared by the bot and the website      |
| `src/lib/roommate/store.ts`                | Prisma access for profiles, reactions and reports (server only)                              |
| `src/lib/roommate/switch.ts`               | `isMatchingEnabled()` (spec 07 §Switch)                                                      |
| `src/lib/roommate/compatibility.ts`        | The compatibility rule (spec 07)                                                             |
| `src/lib/bot/roommate-texts.ts`            | Bot copy for matching, RU, UK and EN, with `rt(locale, key, vars)` like `t()`                |
| `src/lib/bot/roommate-flow.ts`             | Entry, intake, own card, edit, delete, renew, counts reply, opt-in                           |
| `src/lib/bot/roommate-matching.ts`         | Spec 07: cards, interest, reveal, push and outcome handlers                                  |
| `src/lib/bot/roommate-safety.ts`           | Spec 07: report, hide, statement of reasons, appeal                                          |
| `src/lib/bot/roommate-daily.ts`            | The jobs of the daily cron (housekeeping and messages)                                       |
| `src/lib/bot/roommate-close.ts`            | The closing run (FR-20) behind the closing route, through the daily cron's sender            |
| `src/app/api/cron/roommate-daily/route.ts` | The daily cron route                                                                         |
| `src/app/api/cron/roommate-close/route.ts` | The manual closing route (FR-20)                                                             |

`roommate-texts.ts` is bot copy in its audience's languages: the task that creates it adds it to
the copy exceptions in `CLAUDE.md` ("Repository language") and to the copy rules of
`README.md`. Until spec 04 §English bot locale lands, `BotLocale` is `'ru' | 'uk'`; the roommate
texts are typed with their own `'ru' | 'uk' | 'en'` key so English copy exists from the start
and becomes reachable when a chat can have the `en` locale.

## Data model

FR-1, **Decided** (one migration for both stages, D49; RLS by hand, D9); column names
**Assumption**. One Prisma migration, created on the local stack with
`npx prisma migrate dev --name roommate_matching`; its folder sorts after
`20261005140000_deposit_contract`. It is never applied to production by the loop (D18). Personal
data in **bold**.

`RoommateProfile` → `roommate_profiles` (at most one row per chat):

| Column                                                           | Type                                                  | Notes                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `id`                                                             | uuid                                                  |                                                        |
| `chat_id`                                                        | uuid, unique, FK `telegram_chats` cascade             |                                                        |
| `status`                                                         | text, default `draft`                                 | `draft` / `active` / `expired` / `hidden`              |
| `step`                                                           | text null                                             | the intake or edit step awaiting an answer             |
| `entry_source`                                                   | text null                                             | first touch of the intake (§Events); not personal data |
| **`district_slugs`**, **`any_district`**                         | text[] default `{}`, boolean default false            | FR-4                                                   |
| **`budget_band`**                                                | text null                                             | `b1` – `b5`                                            |
| **`move_in_month`**                                              | date null                                             | first day of the month                                 |
| **`languages`**                                                  | text[] default `{}`                                   | `pl`, `en`, `ru`, `uk`                                 |
| **`gender`**, **`prefers`**                                      | text null, text default `anyone`                      | `woman` / `man`; `anyone` / `women` / `men`            |
| **`about`**                                                      | varchar(280) null                                     | FR-10                                                  |
| **`smoking`**, **`pets`**                                        | text null                                             | FR-11                                                  |
| `adult_confirmed_at`                                             | timestamptz null                                      | FR-9                                                   |
| **`tg_username`**                                                | text null                                             | spec 07 §Usernames                                     |
| `activated_at`, `expires_at`                                     | timestamptz null                                      | set when the intake completes                          |
| `renewal_reminded_at`, `expired_at`, `renewed_at`                | timestamptz null                                      | FR-15                                                  |
| `notify_on_open_at`, `notified_open_at`                          | timestamptz null                                      | FR-18, FR-19                                           |
| `push_off`, `last_push_at`                                       | boolean default false, timestamptz null               | spec 07 FR-27                                          |
| `hidden_at`, `hidden_reason`, `statement_sent_at`, `appealed_at` | timestamptz, text, timestamptz, timestamptz, all null | spec 07 FR-32 – FR-35                                  |
| `outcome_asked_at`, `outcome`                                    | timestamptz null, text null                           | spec 07 FR-29; FR-13                                   |
| `created_at`, `updated_at`                                       | timestamptz (`@updatedAt`)                            | `updated_at` drives the draft lifetime                 |

Index on (`status`, `expires_at`).

`RoommateReaction` → `roommate_reactions`: `id`, `from_profile_id`, `to_profile_id` (both FK
`roommate_profiles(id)` cascade, unique pair), `kind` (`interest` / `skip`), `created_at`,
`matched_at` null, `revealed_at` null (the reveal message to the `from` person was claimed; spec
07 FR-26). Index on `to_profile_id`.

`RoommateReport` → `roommate_reports`: `id`, `reporter_profile_id`, `target_profile_id` (both FK
`roommate_profiles(id)` `ON DELETE SET NULL`, nullable), `reason`, `decision` (`none` / `hidden`
/ `lifted`, default `none`), `automated` boolean default true, `created_at`, `decided_at` null,
`reporter_notified_at` null (the hide notice to this reporter was claimed; spec 07 §Automatic
hiding); unique (`reporter_profile_id`, `target_profile_id`).

`TelegramChat` gets `roommate_banned_at` timestamptz null and the relation `roommateProfile`.

Clarifications against PRD 3 §4 (agent's, marked so): `entry_source` (so
`tg_roommate_profile_created` can carry it after a multi-message intake), `activated_at` (the
intake creates the row as a draft, so creation is not activation), `statement_sent_at` (the
statement of reasons is claimed and retried, spec 07 FR-33), `revealed_at` per reaction
instead of one `reveal_pending` flag per profile (a profile can wait on several pairs), and
`reporter_notified_at` plus the `lifted` decision on reports (the hide notice is claimed and
retried; an owner's unhide stops old reports from counting). Every column of PRD 3 lives in this
one migration: a later task that finds a missing column blocks instead of adding a migration.

Tests: the migration contains no `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` or `GRANT`
(a test reads the migration file); `prisma validate` passes inside `npm run verify` (`build`
generates the client).

## Retention

**Decided** (D49, D55). All deletions run in §Daily cron unless stated.

| What                        | Rule                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Active profile              | `expires_at` = the earlier of `activated_at` (or `renewed_at`) + 30 days and the end of the move-in month |
| After expiry                | `status=expired`, not counted or shown; renewable for 14 days; then deleted with its reactions            |
| Delete on request           | at once, with its reactions (FR-13)                                                                       |
| Draft never finished        | deleted when `updated_at` is 7 days old (`/cancel` deletes it at once)                                    |
| Hidden profile (moderation) | deleted when `expires_at` + 14 days has passed, event `reason=moderation`                                 |
| Reports                     | deleted when `created_at` is 6 months old; a deleted profile nulls its references (FK `SET NULL`)         |
| Ban marker                  | `telegram_chats.roommate_banned_at` stays while the chat row exists                                       |

Every number is one constant in `rules.ts` (`PROFILE_LIFE_DAYS = 30`, `GRACE_DAYS = 14`,
`DRAFT_LIFE_DAYS = 7`, `REPORT_LIFE_MONTHS = 6`, `RENEWAL_REMINDER_DAYS = 3`).

## Warsaw calendar

FR-6, FR-15, D68. `src/lib/roommate/time.ts`, pure, no new dependency (use
`Intl.DateTimeFormat` with `timeZone: 'Europe/Warsaw'`). Golden tests:

| Function                         | Input                                   | Output                                         |
| -------------------------------- | --------------------------------------- | ---------------------------------------------- |
| `moveInMonthOptions(now)`        | 2026-12-05T10:00Z                       | 2026-12-01, 2027-01-01, 2027-02-01, 2027-03-01 |
| `moveInMonthOptions(now)`        | 2026-12-31T23:30Z (00:30 Warsaw, 1 Jan) | starts with 2027-01-01                         |
| `endOfWarsawMonth(month)`        | 2026-12-01                              | 2026-12-31T22:59:59Z (CET)                     |
| `endOfWarsawMonth(month)`        | 2027-03-01                              | 2027-03-31T21:59:59Z (CEST from 2027-03-28)    |
| `computeExpiresAt(from, moveIn)` | 2026-12-03T08:00Z, 2027-02-01           | 2027-01-02T08:00Z (30 days come first)         |
| `computeExpiresAt(from, moveIn)` | 2026-12-20T12:00Z, 2026-12-01           | 2026-12-31T22:59:59Z (the month ends first)    |
| `computeExpiresAt(from, moveIn)` | 2026-12-31T10:00Z (renewal), 2027-02-01 | 2027-01-30T10:00Z                              |
| `isMoveInMonthPast(month, now)`  | 2026-12-01, 2027-01-02T10:00Z           | true                                           |
| `isRoommateSendHour(now)`        | 2026-12-30T09:15Z / 2026-12-30T08:15Z   | true / false (10:xx and 09:xx Warsaw)          |
| `isRoommateSendHour(now)`        | 2027-04-01T08:15Z / 2027-04-01T09:15Z   | true / false (summer time)                     |
| `monthOffset(moveIn, now)`       | 2027-02-01, 2026-12-05T10:00Z           | 2 (for `move_in_offset_months`)                |

Month names in the bot locale come from `Intl.DateTimeFormat(<ru|uk|en>, { month: 'long',
year: 'numeric', timeZone: 'Europe/Warsaw' })` with the nominative form where the locale needs it
(RU and UK: `month: 'long'` gives the genitive; use the standalone form, for example
`formatToParts` with `month: 'long'` from a `{ month: 'long' }`-only formatter, and test
"декабрь 2026" / "грудень 2026" / "December 2026").

## Entry and routing

FR-3, FR-14, FR-2 (handler part); **Assumption** (`/mate`, button placement; accepted, D68).

- **Ways in:** `/mate`; the button "Find someone to rent with" (callback `rm:start`) in the
  replies `start` and `startAfterPayload` (`bot.ts` `handleStart`, which today sends them without
  a keyboard); a `mate…` deep link (spec 04 §Start payloads gives `{ kind: 'roommate', source,
detail }`).
- **What opens** (one function `openRoommate(ctx, chat, locale, entry)` that every way in calls):
  1. Chat banned (`roommate_banned_at` set) → the FR-14 reply ("you cannot create a matching
     profile"; it points to the statement of reasons the person received) and nothing else: no
     event except the `tg_bot_started` the start handler already sent. When the chat still has
     its hidden profile, the reply carries "Delete my profile" (`rm:c:del`): deletion at once on
     request holds for every profile (D49); the ban marker and the reports (references nulled)
     stay (D55). Agent's reading of D49 and D55, named for the owner's review.
  2. Active or expired profile → the own card (§Own card); no `tg_roommate_flow_started`.
  3. Hidden profile without a ban marker (cannot happen after spec 07 §Automatic hiding; kept as
     a guard) → the FR-14 reply as in rule 1.
  4. Draft → the current step is sent again; no second `tg_roommate_flow_started`; the draft
     keeps its first `entry_source`.
  5. An open deposit intake (`hasOpenIntake`) → one line "/cancel leaves the deposit questions"
     (`intakeStillOpen`-style, RU/UK/EN) and the roommate intake does not start.
  6. Otherwise → create the draft (`status=draft`, `step=districts`, `entry_source`), send
     `tg_roommate_flow_started` with `entry_source` and `entry_detail` (absent when none), the
     intro (PRD 3 §8 "Intake intro", with the link to the privacy section of spec 07 FR-36 through
     `webLink('/privacy#roommate-matching', locale, 'roommate')`, locale mapped ru → `ru`, uk →
     `uk`, en → `en`) and the districts step.
- `entry_source` values (one exported constant in `start-payload.ts`, separate from the check
  events' `ENTRY_SOURCE`): `direct`, `tg`, `fb`, `ig`, `threads`, `web`, `bot_menu`, `other`.
  `/mate` and `rm:start` give `bot_menu`.
- **One open intake per chat** (**Assumption**, D68): the deposit flow's start (`dep` link,
  `/deposit` button `dep:start`, the deposit keyword offer) while a roommate draft or an edit step
  is open replies "/cancel leaves the roommate questions" and does not start; the roommate
  intake does not start while the deposit intake is open (rule 5).
- **Typed text** (FR-3 criterion 5, "as the deposit intake does"): `handleText` asks the roommate
  flow first. At a step that takes text (districts typed, a budget number, the short text) the
  text goes to that step and never reaches the deposit flow, the district check or the address
  lookup. At a button-only step (and for a district or budget text that matches nothing) the text
  goes on to the district check or the address lookup as today, with one extra line "/cancel
  leaves the roommate questions", as `deposit-flow.ts` lets text through at its button steps; the
  roommate step stays open.
- **`/cancel`:** with a roommate draft or edit step, deletes the draft (a draft row is removed; an
  edit step is cleared, the active profile stays) and replies "roommate questions closed";
  otherwise the deposit behaviour of today. The existing deposit-reminder clearing is unchanged.
  An edit step left open is cleared by the daily cron after 24 hours (§Daily cron).
- **Stale and repeated taps** (FR-4 edge case; Telegram can redeliver an update and people double
  tap): every intake callback checks that `profile.step` is the step the button belongs to,
  otherwise "this step is done" and the current step is sent again; a step advances only through
  `updateMany({ where: { id, step: <expected> } })` and continues when `count === 1`; toggle
  buttons carry the target state (`rm:d:<slug>:1` / `:0`, `rm:l:<code>:1` / `:0`), so a repeated
  tap sets the same state instead of flipping it back. Every `rm:` handler answers the callback
  query (refusals such as "up to 3 districts" as the callback toast) and ignores Telegram's
  "message is not modified" error on an in-place edit.
- **Username:** every roommate handler stores `ctx.from.username` (or null) on the chat's
  profile when it differs (spec 07 §Usernames).
- Callback data (≤ 64 bytes, prefix `rm:`): `rm:start`, `rm:d:<slug>:<1|0>`, `rm:d:any`,
  `rm:d:done`, `rm:b:<b1..b5>`, `rm:m:<YYYY-MM>`, `rm:l:<pl|en|ru|uk>:<1|0>`, `rm:l:done`,
  `rm:g:<woman|man|skip>`,
  `rm:p:<anyone|women|men>`, `rm:t:skip`, `rm:s:<no|outside|fine|skip>`,
  `rm:pt:<no|have|fine|skip>`, `rm:a:<yes|no>`; card buttons in §Own card. Spec 07 adds its own.
- Tests: each of the six cases of "What opens", `/cancel` with a draft, with an edit step and with
  a deposit intake, typed text at a text step and at a button step, a stale button, and that a
  banned chat sends no roommate event.

## Capability text and command menu

FR-3 criteria 2 and 4 (**Decided**: no text promises a date).

- `start`, `startAfterPayload` and `help` in `texts.ts` share one capability list; it gains the
  roommate entry with `/mate`: switch off (spec 07) → "create a profile, see how many people look
  per district, matching opens later"; switch on → "find someone to rent with: compatible people,
  mutual contacts". The texts take the line as a variable chosen by `isMatchingEnabled()` at reply
  time, so the menu and the replies never disagree.
- `COMMAND_MENU` gets `mate` in every locale (RU «Найти, с кем снять квартиру», UK «Знайти, з ким
  зняти квартиру», EN "Find someone to rent with"; drafts), and the `cancel` description, which
  today names only the deposit questions, covers both (RU draft «Выйти из вопросов»).
- `texts.test.ts`: the capability check (`NOT_A_CAPABILITY` today fails on «соседа по квартире»
  and `roommate`) changes to require that every listed capability has a command in the menu and
  that the roommate line names `/mate`; the notification-promise check stays (§Opt-in names its one
  exception).

## Intake steps

FR-4 – FR-11, FR-9. Order (**Decided**, D54): districts → budget → move-in month → languages →
own gender → "live with" → short text (optional) → smoking (optional) → pets (optional) → 18+
confirmation → save. Inline keyboards in the style of the deposit intake (`deposit-flow.ts`).
Copy: PRD 3 §8 drafts verbatim where it has them (intro, gender and "live with", short text,
adult confirmation); every other step is an **agent draft** in RU, UK and EN, listed for review.

1. **Districts** (FR-4; at most 3 and "any" are **Assumption**, D68). Buttons for the districts of
   the checker city from the `District` table (`getCity()` in `lookup.ts`; display name
   `nameKey`, the Polish name the bot's cards already show in every locale, so a draft that writes
   «Мокотув» renders "Mokotów"), two per row, plus "Any district" and "Done". A tap toggles a district and marks it
   ✓ (the message is edited in place); a 4th pick replies "up to 3 districts" and changes nothing;
   "Any district" stores `any_district=true` and empty `district_slugs`; picking a district after
   "any" clears it; "Done" with nothing picked asks again; a typed district name is matched with
   `matchDistrict` (`districts.ts`) and toggled like a tap, an unmatched text gets "tap a
   district"; a slug not in the table is ignored.
2. **Budget** (FR-5; the bands are **Assumption**, D68). `BUDGET_BANDS` in `rules.ts`: b1 ≤ 1,199;
   b2 1,200 – 1,599; b3 1,600 – 1,999; b4 2,000 – 2,499; b5 ≥ 2,500 zł per person a month, all-in.
   The step says "per person, all-in a month". A typed number maps to its band (`1650` → b3,
   `1 650 zł` → b3, `2500` → b5); text without a number → "tap a band".
3. **Move-in month** (FR-6). Four buttons from `moveInMonthOptions(now)` in the locale's month
   names; a tap stores the first day; a button for a month that has passed → the step again with
   current months.
4. **Languages** (FR-7, D54). Multi-select of Polish, English, Russian, Ukrainian with the chat's
   bot language ticked in advance (ru → ru, uk → uk, en → en); "Done" needs at least one. Used only
   for compatibility and shown on the card in stage 2.
5. **Own gender** (FR-8, D51): "You are: a woman / a man / skip"; skip keeps `gender=null`.
6. **Live with** (FR-8, D51): "anyone / women / men"; the step says why it is asked and that it is
   never shown (PRD 3 §8). A choice of "women" without an own gender is stored as chosen.
7. **Short text** (FR-10, D54): up to 280 characters or "Skip"; only spaces = skip; filtered by
   §Text filter; the step asks not to write health, religion or other sensitive facts.
8. **Smoking** (FR-11): no / outside only / fine / skip. **Pets**: no pets / I have a pet / fine
   with pets / skip. One tap each; skip stores null; not used for compatibility.
9. **18+** (FR-9, D54): "I'm 18+" saves the profile (§Save); "I'm under 18" replies that matching
   is for adults only and that nothing was saved, and deletes the draft at once. No birth date or
   age band is asked.

Tests per step: the happy path, every edge case above, the stale-button rule, the 4th-district
refusal, the "any" toggle, band mapping of typed numbers, a passed month, "Done" without a
language, and a whole intake run that ends with exactly one active row.

## Text filter

FR-10. `checkAboutText(raw)` in `text-filter.ts` → `{ ok: true, value } | { ok: false, found:
'too_long' | 'link' | 'handle' | 'email' | 'phone' | 'iban' }`; the reply names what was found
and, for `too_long`, the length. The text is normalised with `normalize('NFKC')` before the
checks (so full-width digits and letters cannot slip past) and stored normalised. Rules: over 280 characters after trimming; a link (`http`,
`www.`, `t.me/`, `telegram.me/`); an @handle (`@` followed by 3+ word characters, not inside an
e-mail); an e-mail; a phone (7 or more digits with only spaces, dashes, dots, brackets or `+`
between them); an IBAN-like run (`PL` followed by 26 digits, spaces allowed, or 15 or more digits
in a row). Golden cases (unit tests):

| Input                              | Result   |
| ---------------------------------- | -------- |
| `Pracuję w IT, spokojna, nie palę` | accepted |
| `Мне 25, есть 2 кота`              | accepted |
| `пиши @anna_w`                     | handle   |
| `zadzwoń 501 234 567`              | phone    |
| `see https://x.pl`                 | link     |
| `PL61109010140000071219812874`     | iban     |
| `anna@x.pl`                        | email    |
| 281 × `a`                          | too_long |
| `   `                              | skip     |

## Save and the own card

FR-12; **Decided** (stage 1: nobody sees anybody, D49); **Assumption** (the draft lifetime and
"edit keeps expiry", D68).

- **Save:** `updateMany({ where: { id, status: 'draft' }, data: { status: 'active', step: null,
activated_at: now, expires_at: computeExpiresAt(now, move_in_month), adult_confirmed_at: now } })`;
  only when `count === 1` send one `tg_roommate_profile_created` (§Events) and the replies, so a
  double tap on "I'm 18+" gives one row and one event. Then the own card and the counts reply
  (§Counts).
- **A move-in month that passed while the draft was open** (a draft lives `DRAFT_LIFE_DAYS`;
  agent's clarification, the renewal's rule of §Renewal, T111): when
  `isMoveInMonthPast(move_in_month, now)` at "I'm 18+", nothing is saved; the draft moves from
  `adult` to `step = 'save_month'` through the conditional `updateMany({ where: { id, step:
'adult' } })`, the reply is "that month has passed" (`monthPassed`) and the move-in step with
  the current months. A current month tapped there saves as above in one write that also stores
  the month (`where: { id, status: 'draft', step: 'save_month' }`), with one
  `tg_roommate_profile_created`; the later steps are not asked again.
- **Own card** (shown only to its owner): every field the person chose, including own gender and
  "live with", the opt-in state (switch off) or the daily-message state (switch on), and the date
  the profile hides (`expires_at` in the locale, Europe/Warsaw). Buttons: Edit (`rm:c:edit`),
  Delete (`rm:c:del`), "How many are looking?" (`rm:c:counts`, switch off) or "Show people"
  (`rm:show`, switch on, spec 07), the opt-in toggle (`rm:c:optin` / `rm:c:optout`, switch off),
  the daily-message toggle (`rm:push:off` / `rm:push:on`, switch on, spec 07), and Renew
  (`rm:c:renew`) only within `RENEWAL_REMINDER_DAYS` of `expires_at` or while expired.
- **Edit:** a field picker (`rm:e:<field>` with field `districts`, `budget`, `month`,
  `languages`, `preferences` (own gender and "live with" together), `about`, `rules`) opens that
  step with `step = 'edit_<field>'`; the profile stays active and counted; the answer changes only
  that field, returns to the card and sends `tg_roommate_profile_edited` with `field`. Editing
  keeps `expires_at`, except that a new move-in month whose end comes before `expires_at` lowers
  it to that end (D55 "the earlier of"; agent's clarification: an edit never extends a profile's
  life).
- No name or photo is asked or stored (D54).
- Tests: save once on a double tap, the card for a full and a minimal profile (gender and "live
  with" visible only here), each edit field, the month edit that lowers `expires_at`, and the
  Renew button's visibility at 4, 3 and 0 days before expiry.

## Delete

FR-13; **Decided** (at once, D49; reports kept with nulled references, D55); **Assumption** (the
optional reason).

- Delete → a confirmation that says the deletion is immediate and final and that a contact
  already revealed stays with the other person (PRD 3 §8 "Delete"), with "Delete" (`rm:c:delok`)
  and "Keep".
- Confirmed → in one request: delete the profile (reactions cascade; reports keep their rows
  with the reference nulled), reply that it is deleted, send `tg_roommate_profile_deleted` with
  `reason=user` once, then offer an optional reason: "Found someone here" (`rm:dr:here`, offered
  only when the deleted profile had at least one reaction with `matched_at`, read before the
  delete), "Found someone elsewhere" (`rm:dr:elsewhere`), "Other" (`rm:dr:other`). "Found someone
  here" sends `tg_roommate_outcome` with `outcome=renting_together`, `asked=delete`; the other
  two send nothing. The reason buttons work after the row is gone (they carry no id); a second tap
  on a reason sends nothing (the reply message's buttons are removed after the first tap).
- The chat can create a new profile at once unless it is banned.
- Tests: no profile or reaction row of that profile remains, a report row keeps its reason with
  `target_profile_id` null, one event, the three reasons, a second confirm tap on a deleted
  profile replies "already deleted" and sends nothing.

## Daily cron

FR-15, FR-12 criterion 4, D55, D68. `GET /api/cron/roommate-daily`, guarded by `requireCronAuth`
(401 without it), `maxDuration = 60` (**Assumption**). Two entries in `vercel.json`,
`0 8 * * *` and `0 9 * * *`, because Vercel crons run in UTC and 10:00 Europe/Warsaw is 09:00 UTC
in winter and 08:00 UTC in summer (D68). Each run:

1. **Housekeeping, every run** (idempotent; Vercel can invoke a cron twice): delete drafts whose
   `updated_at` is `DRAFT_LIFE_DAYS` old; clear `step` on active profiles whose `updated_at` is 24
   hours old (an abandoned edit); mark each `active` row with `expires_at ≤ now` as `expired`
   (`expired_at = now`) through `updateMany({ where: { id, status: 'active' } })` and send one
   `tg_roommate_profile_expired` only when `count === 1`; delete `expired` rows whose
   `expired_at` is `GRACE_DAYS` old (`reason=expired`) and `hidden` rows whose `expires_at` plus
   `GRACE_DAYS` has passed (`reason=moderation`), each through
   `deleteMany({ where: { id, status } })` with one `tg_roommate_profile_deleted` only when
   `count === 1`; delete reports whose `created_at` is `REPORT_LIFE_MONTHS` old.
2. **Messages, only when `isRoommateSendHour(now)`** (the run at 10:xx Warsaw), in this priority
   order so the important ones go first when time runs out: the retry of unsent statements of
   reasons (spec 07 FR-33), the retry of waiting reveals (`retryPendingReveals`, spec 07 §Reveal),
   the retry of unsent hide notices to reporters (spec 07 §Automatic hiding); then the renewal
   reminders (§Renewal), the outcome question (spec 07 FR-29); then, with the switch on only, the
   one-time message (§Matching is open) and the daily push (spec 07 FR-27). The retries and the
   outcome question run with the switch on or off.
3. `flushPostHog()` is awaited before the response; the response is counts only (sent, blocked,
   deleted per kind), never a chat id, username or text.

Rules for every message of the cron (the pattern of `sendDueFollowUps`, spec 04 §Deposit
reminders): select only rows whose chat has `blocked_at` null; claim the row before the send with
a conditional `updateMany` on the column the message sets; send only when `count === 1`; a 403
marks the chat blocked (`blocked_at = now`) and keeps the claim; any other send error releases the
claim so the next day retries; a 429 (Too Many Requests) releases the claim and stops all sending
for this run. Messages go one by one, at most 25 a second (**Assumption**), and at most
`MAX_MESSAGES_PER_RUN = 1000` (**Assumption**) per run; no new send starts after
`SEND_BUDGET_MS = 45_000` from the start of the run (**Assumption**: the function has 60 s, and
PostHog sends one request per event); the rest wait for the next day. The bot not configured
(`getBot()` null) → housekeeping only, the response says so. One shared helper in
`roommate-daily.ts` holds these rules; every message job uses it.

Tests (mocked Prisma, fake `api.sendMessage`, fixed `now`): 401 without auth; housekeeping
deletes and events for each kind; a run outside the send hour sends nothing; two runs over the
same due row send once; a failed send releases the claim; a 403 marks the chat blocked; a 429
stops the run; the time budget stops new sends; housekeeping run twice sends each event once; the
`vercel.json` entries exist (a test reads the file).

## Renewal

FR-15; **Decided** (D55), **Assumption** (3 days, D68).

- Reminder: the first send-hour run at or after `expires_at − 3 days` sends one message per
  active profile with `renewal_reminded_at` null: the date it hides (not "in 3 days", because a
  profile created close to its month's end can have less), "Renew for 30 days" (`rm:c:renew`) and
  "Delete" (`rm:c:del`). Claim on `renewal_reminded_at`. PRD 3 §8 "Renewal reminder" is the draft
  with the date in place of "in 3 days".
- Renew (from the reminder, the card or an expired card within the grace period; never for a
  hidden profile): when `isMoveInMonthPast(move_in_month, now)`, or when the move-in month ends
  within `RENEWAL_REMINDER_DAYS` (a renewal would end with the month and remind again the next
  day), the move-in step runs first (`step = 'renew_month'`); then `status=active`, `renewed_at=now`,
  `expires_at=computeExpiresAt(now, move_in_month)`, `renewal_reminded_at=null`,
  `expired_at=null`; one `tg_roommate_profile_renewed`; the card again.
- Golden cases (from PRD 3 FR-15): created 2026-12-03 08:00 UTC, move-in February 2027 →
  `expires_at` 2027-01-02 08:00 UTC, reminder on the run of 2026-12-30 (09:00 UTC = 10:00
  Warsaw), renewed 2026-12-31 10:00 UTC → `expires_at` 2027-01-30 10:00 UTC; created 2026-12-20
  with move-in December 2026 → `expires_at` 2026-12-31 23:59:59 Warsaw, reminder on the run of
  2026-12-29.
- Tests: both golden cases, a second run sends no second reminder, renewal of an expired profile
  inside the grace period, the past-month renewal and the month-ending-within-3-days renewal
  asking for a month first, a hidden profile's Renew tap refused.

## Blocked chats

FR-16 rule "the chat not blocked". Today `blocked_at` is set only when a send fails with 403, and
stage 1 sends almost nothing, so people who blocked the bot would keep counting. The webhook
already receives `my_chat_member` updates (`scripts/tg-webhook.ts` `allowed_updates`), but no
handler exists. Add `bot.on('my_chat_member')` for private chats: new status `kicked` → set
`blocked_at = now`; `member` → set it to null (as `touchChat` already does on any message). No
event, no reply. Tests with a fake update for both transitions and a group chat ignored.

## Counts

FR-16; **Decided** (honest counts per district, nobody sees anybody, D49; no combination with
gender or "live with", D51); **Assumption** (the counting rules, D68).

- `countRoommates(viewer, others)` in `src/lib/roommate/counts.ts` (pure) over
  `{ id, districtSlugs, anyDistrict }[]` of **active** profiles: `status=active`,
  `expires_at > now`, the chat not blocked and not banned (the expiry is checked by time, so a
  profile past `expires_at` that the cron has not marked yet is not counted). The viewer is
  excluded.
- Result: for each district the viewer chose, the number of other active profiles naming it; the
  number open to any district; the Warsaw total of other active profiles. A viewer who chose
  "any" gets the Warsaw total and the three districts named by most other profiles (ties in
  alphabetical order of slug, **Assumption**). A profile naming several districts counts in each;
  "any" profiles are never added to a district; no line sums district numbers; no count is
  combined with budget, month, language, gender or "live with"; zero reads "nobody yet"; no
  percentage, rate or "verified".
- `loadRoommateCounts()` (server) loads the active profiles' district fields in one query and
  serves both the bot (with the viewer) and the website (spec 02 §Find a flatmate, without a
  viewer: the Warsaw total and the top 5 districts). **PRD 4 FR-26 (spec 09 §District section):**
  without a viewer the result also carries `byDistrict`, the count of counted profiles naming each
  district (same rules: "any" profiles in no district, no combination, no sum), so the district
  pages can say "{district}: {n} people with a profile name this district" or "nobody yet"; the
  website cache key becomes `roommate-website-counts-v2` and carries the tag `roommate-counts`,
  which `revalidateRoommateCounts()` expires after every profile write that changes who is counted
  (save, edit, delete, moderation hide or restore, the daily cron's expiry and deletion).
- Golden case (PRD 3 §5 example 1), a unit test: P1 Mokotów + Ochota, P2 Mokotów, P3 any, P4 Wola,
  P5 Mokotów hidden, P6 Mokotów expired, P7 Ochota, P9 Mokotów with a blocked chat; viewer P8
  Mokotów + Wola → Mokotów 2, Wola 1, open to any district 1, Warsaw 5 besides you; a viewer with
  "any" → Warsaw 5 and Mokotów 2, Ochota 2, Wola 1.
- Reply (after save and on "How many are looking?", `rm:c:counts`): PRD 3 §8 "Counts" in the
  locale, with "nobody else yet" when the Warsaw total is 0; then §Room cost reference; then the
  opt-in button (§Opt-in). A database error saves the profile anyway and replies that the counts
  are not available now.

## Room cost reference

FR-17; **Decided** (room figures from the figure contract, groups apart with their N, D23; the
per-person split, D61; apartments with 2 or more rooms only, D71).

- For each district the person chose (or Warsaw for "any"):
  `loadAreaReference({ districtId, cityId, rentalType: 'room' })` from
  `@/lib/cost-figures-query`, rendered with the bot's existing area helpers (`format.ts`,
  `groupFigureRows`): one line per group (tenant reports, then asking prices) with its N, labels
  and the known-part wording exactly as the bot's area cards. The level comes from the contract
  (the district from `MIN_AREA_REPORTS` room reports, else Warsaw) and is said: "Wesoła has fewer
  than 5 room reports; Warsaw:". When several chosen districts fall back to Warsaw, the Warsaw
  lines appear once, introduced with all their names (agent's clarification). No room report at
  any level → "No room figures for this area yet". One tenant report → "one observation", as the
  cards.
- **Per-person split** (D61): after the room lines of an area, one line "for two people about X
  each (half of the median flat, N tenant reports, <area>)" from
  `loadAreaReference({ districtId, cityId, rentalType: 'apartment' })`'s tenant group, only when
  its headline is an all-in total (not a known part) with N ≥ 2; X = the median ÷ 2 rounded half up
  to 10 zł (`roundHalfUpTo10`: 2,425 → 2,430; 2,424 → 2,420). Never from the asking group or a
  known part; the apartment area has its own level and says so. No percentage, no "cheaper",
  never "market". **Decided** (D71, the owner's answer to PRD 3 Q-17, 2026-11-19): the split is
  computed only from apartments with 2 or more rooms, so studios are left out (halving a studio's
  median can overstate what two people can share). The figure contract's area loader gains a
  rooms filter (`CostReport.rooms` ≥ 2; agent's reading: a report without a room count is left
  out), the split's call passes it, and the level, N and "one observation" are those of the
  filtered set; the room lines and every other caller of the loader are unchanged. Fewer reports
  qualify, so the line appears less often. A consistency test (pattern of
  `checker-consistency.test.ts`) shows the filtered loader and the split give the same median and
  N over one fixture, and the checker's unfiltered area summary is unchanged. Built first as
  D61 said (all whole apartments, T080); the line's rendering sits in one function, so the answer
  changes one filter (T107).
- Golden case (PRD 3 §5 example 2): Mokotów room reports R1 `user` 1,600 complete, R2 `import`
  1,800 complete, R3 – R7 `scraped` 1,400 / 1,500 / 1,550 / 1,700 / 2,000 known part → "tenant
  reports: 1,700 zł a month all-in (2 reports); asking prices in listings: 1,550 zł, known part of
  the costs (5 listings)"; Mokotów tenant apartment totals 4,200 / 4,600 / 4,800 / 4,900 / 5,100 /
  5,400 → "for two people about 2,430 zł each (half of the median flat, 6 tenant reports,
  Mokotów)" under D61. Under D71 the same totals carry rooms 1 / 2 / 2 / 3 / 2 / 3: the studio
  (4,200) is left out, the median of 4,600 / 4,800 / 4,900 / 5,100 / 5,400 is 4,900 → "for two
  people about 2,450 zł each (half of the median flat, 5 tenant reports, Mokotów)".
- Consistency test (pattern of `checker-consistency.test.ts`): the same fixture through the
  checker's area summary and this reply gives the same median and N per group.

## Opt-in

FR-18; **Decided** (D49; the closing sentence, D64 as reworded by D72).

- Under the counts reply while the switch is off: "Message me when matching opens"
  (`rm:c:optin`). The first tap sets `notify_on_open_at` and sends `tg_roommate_browse_opted_in`
  with `already=false`; a repeat tap replies "already on" and sends it with `already=true`. The
  reply: "I'll message you once when matching opens." and "If matching does not open while your
  profile is active, we'll tell you and delete it." (D72; PRD 3 §8, RU «ты», UK «ти», EN).
- The card shows the opt-in and lets the person switch it off (`rm:c:optout` clears
  `notify_on_open_at`).
- With the switch on the button is not shown (people browse at once).
- The profile expires before matching opens → no message (§Matching is open sends to active
  profiles only); the opt-in reply says the message comes while the profile is active (PRD 3
  FR-18 edge case). A profile that expires and is deleted before the closing route gets no
  closing message; **Decided** (D72, the owner's answer to PRD 3 Q-18, 2026-11-19): the closing
  sentence is reworded to "If matching does not open while your profile is active, we'll tell you
  and delete it" in RU, UK and EN, copy only: no new column, no second migration, and the closing
  route is unchanged (T108; built first as D64 worded it, T084).
- `texts.test.ts` (or `roommate-texts.test.ts`): the notification-promise check runs over the
  roommate texts too; the two sentences are allowed only for their two keys, and the test names
  the key with its backing code: the one-time message → `sendMatchingOpenMessages`
  (`roommate-daily.ts`), the closing sentence → the FR-20 route. Every other "we will write"
  promise fails.

## Matching is open

FR-19; **Decided** (D49). Built after spec 07 §Compatibility (it counts compatible people).

- `sendMatchingOpenMessages(api, now)` in `roommate-daily.ts`, called by the send-hour run only
  when the switch is on: every active profile with `notify_on_open_at` set and
  `notified_open_at` null, claimed on `notified_open_at`, gets "Matching is open. <N> people fit
  you right now." with "Show" (`rm:show`); N from `findCompatible` (spec 07). N = 0 → the message
  still goes and says "nobody fits yet; we write once a day when someone new fits".
- Each delivered message sends `tg_roommate_open_notified` with `count_band` (`0`, `1-2`, `3-5`,
  `6+`).
- A profile that got this message today gets no daily push the same day: the job sets its
  `last_push_at` to the send time (agent's clarification, so the first day brings one message).
- With the switch off nothing is sent. A profile created after the switch went on never opted in
  and gets no such message.
- Tests: claim once over two runs, switch off sends nothing, N = 0 wording, the count band, no
  push on the same day.

## Closing route

FR-20; **Decided** (D64: manual, owner-triggered, never scheduled).

- `POST /api/cron/roommate-close`, guarded by `requireCronAuth`; not in `vercel.json`. Without
  the secret → 401; without the JSON body `{ "confirm": true }` → 400 and nothing changes; with
  the switch on → 409 and nothing changes (**Assumption**: closing applies only while matching is
  off).
- With confirmation: drafts are deleted silently; for every other profile (active, expired,
  hidden): delete the row first (`deleteMany({ where: { id } })`, the claim: only `count === 1`
  continues), send `tg_roommate_profile_deleted` with `reason=closed`, then, when the chat is not
  blocked, the closing message (PRD 3 §8 "Closing message", RU/UK/EN). When no profile row is
  left at the end of the run, all `roommate_reports` rows are deleted; a run cut short by the cap,
  the time budget or a 429 leaves the reports for the next run and its response says how many
  profiles remain. Ban markers stay (D55). A 403 marks the chat blocked. Rate, cap and time budget
  as §Daily cron; the response is counts only.
- A second run deletes what is left; a run with nothing left sends nothing.
- Tests: 401, 400 without confirm, 409 with the switch on, one message and one event per profile,
  drafts deleted without a message, a second run sends nothing.

## Events

Bot events through `track` as `tg_<chatId>` (**Assumption**: names and properties, PRD 3 §6).

| Event                         | Sent when                                       | Properties                                                                                                                                       |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tg_roommate_flow_started`    | a draft is created (§Entry and routing)         | `entry_source`, `entry_detail` (absent when none)                                                                                                |
| `tg_roommate_profile_created` | §Save                                           | `district_count` (0–3), `any_district`, `budget_band`, `move_in_offset_months` (0–3), `language_count`, `has_text`, `rule_count`, `entry_source` |
| `tg_roommate_profile_edited`  | §Save and the own card, Edit                    | `field`                                                                                                                                          |
| `tg_roommate_profile_renewed` | §Renewal                                        | none                                                                                                                                             |
| `tg_roommate_profile_deleted` | §Delete, §Daily cron, §Closing route            | `reason` (`user` / `expired` / `moderation` / `closed`)                                                                                          |
| `tg_roommate_browse_opted_in` | §Opt-in                                         | `already`                                                                                                                                        |
| `tg_roommate_open_notified`   | §Matching is open, per delivered message        | `count_band`                                                                                                                                     |
| `tg_roommate_outcome`         | §Delete with "Found someone here" (and spec 07) | `outcome`, `asked`                                                                                                                               |

Two additions from the architect review (agent's, so E15 and A28 can be read):
`tg_roommate_profile_created` also carries `has_username` (boolean: `ctx.from.username` present
at save), and `tg_roommate_profile_expired` (no properties) is sent once when §Daily cron marks a
profile expired, so a readout can tell profiles active at the switch from expired ones.

`profileCreatedProperties(profile, now)` in `rules.ts` is a pure function with a test that its
keys are exactly the list above plus `has_username`, so no gender, "live with", text, username or
district slug can leak; the same test covers `tg_roommate_profile_edited` (`field` only). Spec 07
adds the stage 2 events.
