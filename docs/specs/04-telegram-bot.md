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
- `tg_address_not_found` and `tg_address_outside_city` stop sending the typed `query` (Q-15,
  **Decided**, D32): §Typed text in bot events (T057). Do not add free text to any new event.
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

FR-43, **Decided** (Q-5, D26, 2026-11-19). The owner approved the RU drafts of the decision
review exactly as written; UK is the agent's draft in the same sense (review before deploy,
Q-8). The rules in `deposit.ts`, the deadline computation and the letter text do not change.
The Polish lawyer review (BRD A14) is still needed before the deposit flow is promoted widely.

- **General-rule states.** (1) The contract could not be read (`contractFailed`); (2) the file
  is not a lease (`contractNotLease`); (3) an unsupported case: reason `other`, or a returned
  amount above the deposit. In these states the verdict:
  - uses the header RU «⚖️ <b>Общее правило</b>», UK «⚖️ <b>Загальне правило</b>» instead of
    «Разбор» / «Розбір»;
  - shows no strength word: none of the bold verdict phrases («Скорее всего, закон на твоей
    стороне», «Закон на твоей стороне», «Шансы хорошие», «Позиция слабее», «Здесь тоньше», «Это
    может быть законно» and their UK forms) and no ✅ / ⚠️ strength mark; the statutory deadline
    line and the factual explanation stay;
  - for (1) and (2) adds the approved sentence right after the contract message.
- **Approved RU (verbatim), contract not read:** «Договор прочитать не удалось, поэтому ниже —
  общее правило закона, а не вывод по вашему договору. Срок в вашем договоре может быть
  другим.»
- **Not a lease (RU, the approved sentence with its first clause adapted; draft):** «Это не похоже
  на договор аренды, поэтому ниже — общее правило закона, а не вывод по вашему договору. Срок в
  вашем договоре может быть другим.»
- **UK drafts:** «Договір прочитати не вдалося, тому нижче — загальне правило закону, а не
  висновок щодо вашого договору. Строк у вашому договорі може бути іншим.» and «Це не схоже на
  договір оренди, тому нижче — загальне правило закону, а не висновок щодо вашого договору.
  Строк у вашому договорі може бути іншим.»
- **Disputed sums (approved RU, verbatim):** «Если сумма спорная, лучше показать документы
  юристу или в бесплатный пункт помощи (nieodpłatna pomoc prawna).» UK draft: «Якщо сума
  спірна, краще показати документи юристу або в безоплатний пункт допомоги (nieodpłatna pomoc
  prawna).» Shown in every general-rule state (**Assumption**: placement; the owner may widen it
  to every verdict where the landlord withheld part of the deposit).
- **Returned amount above the deposit:** no verdict and no letter (there is no claim). Reply RU
  draft «Вернули больше, чем был залог, — такой случай бот не разбирает.» UK draft «Повернули
  більше, ніж була застава, — такий випадок бот не розбирає.», followed by the disputed-sums
  line. The case is not recorded as outcome `full` (**Assumption**: status as today, outcome
  left empty). A returned amount equal to the deposit keeps `nothingOwed` as today.
- **Register:** the approved RU sentences use «вы» while the rest of the flow uses «ты». They
  are kept verbatim; the UK drafts follow the approved RU. The progress entry names this for the
  owner. Superseded by D42 (2026-11-19): §Address form «ты» (T061) switches them to «ты».
- `docs/legal-review/deposit-scenarios.md` is updated to the new texts in the same task.
- Tests: one per state (contract failed, not a lease, reason `other`, returned above the
  deposit, returned equal to the deposit) asserting the header, the absence of every strength
  phrase and the presence of the approved sentences, in RU and UK.

## Scenarios for a lawyer

FR-44 (**Decided**). `docs/legal-review/deposit-scenarios.md` (English, Polish legal terms
literal): every scenario the code distinguishes (reason × protocol × overdue × contract status ×
returned amount), what the bot says in each (verdict strength, deadline source, letter or not),
the rules it applies as implemented in `src/lib/bot/deposit.ts` with their statute references as
written in the code, and the known limits (contract read by a model, partial reading, no case
law). It states at the top that it describes the implementation, is not legal advice and has not
been reviewed by a lawyer. It does not add or change any rule.

## Lawyer interest

FR-45, **Decided** (Q-6, D27, 2026-11-19): keep the `wants_lawyer` button with the drafted
texts. RU approved verbatim; UK is the agent's draft in the same sense (review before deploy,
Q-8). `lawyerAck` today promises «напишу сюда первым»; that promise goes.

- `btnWantLawyer` RU: «⚖️ Хочу помощь юриста (сервиса пока нет — отметим интерес)»; UK draft:
  «⚖️ Хочу допомогу юриста (сервісу поки немає — відзначимо інтерес)».
- `lawyerAck` RU: «Записал ваш интерес. Юридической помощи через Passflat пока нет, и мы не
  обещаем, что напишем об этом. Если срок важен, обратитесь к юристу напрямую.» UK draft:
  «Записав ваш інтерес. Юридичної допомоги через Passflat поки немає, і ми не обіцяємо, що
  напишемо про це. Якщо строк важливий, зверніться до юриста напряму.»
- `tg_lawyer_interest` is unchanged and stays separate from any outcome event; it is the only
  money-interest signal of PRD 2 (D34). A test covers the confirmation text in RU and UK and that
  it promises no reply, date or consultation.
- `docs/legal-review/deposit-scenarios.md` is updated to the new texts in the same task.

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

## Typed text in bot events

Owner follow-up (M6), Q-15, **Decided** (D32, 2026-11-19). Today `src/lib/bot/bot.ts:124`
sends `tg_address_not_found` with `{ query }` and `bot.ts:134` sends `tg_address_outside_city`
with `{ query, city }`, where `query` is the address the user typed.

- `tg_address_not_found` sends no `query` (geocoding resolved nothing, so no city exists).
- `tg_address_outside_city` sends only `city`, the resolved city name from geocoding; when no
  city resolves, the property is absent (not `null`, not the typed text).
- Event names stay. No other bot event gains or keeps typed text.
- Tests assert both property sets with a fake `track`.
- `src/lib/bot/README.md` (event table and the note under it) and
  `docs/analytics/activation-funnels.md` stop saying these events carry the typed text.

## Address form «ты»

Owner follow-up (M6), **Decided** (D42, 2026-11-19): the bot addresses the user with «ты» in
RU and «ти» in UK everywhere. The approved RU texts of Q-5 (D26) and Q-6 (D27) keep their
meaning and switch only their address form; the UK texts follow the RU. Copy below is an
**agent draft** of that switch; the owner reviews it with the other draft copy before the
deploy (D29). Nothing else in the meaning, the rules (`deposit.ts`), the deadline or the Polish
letter changes.

- **Scope:** every RU and UK string in `src/lib/bot/texts.ts` and `deposit-texts.ts` that
  addresses the user: pronouns (RU «вы», «вас», «вам», «вами», «ваш…»; UK «ви», «вас», «вам»,
  «вами», «ваш…», any case) and verbs in the plural-polite form (RU «обратитесь», «напишите»;
  UK «зверніться», «напишіть» and the like) become the «ты» / «ти» forms. A «вы» that means the
  user together with someone else is reworded so that no «вы» is left (below). Text that is not
  addressed to the user (Polish letter text, Polish legal terms, quoted statute) is out of scope.
- **Known strings today** (a search on 2026-11-19; the task reads every text, not only these):
  - `contractFailed` RU: «Договор прочитать не удалось, поэтому ниже — общее правило закона, а
    не вывод по твоему договору. Срок в твоём договоре может быть другим.» UK: «Договір
    прочитати не вдалося, тому нижче — загальне правило закону, а не висновок щодо твого
    договору. Строк у твоєму договорі може бути іншим.»
  - `contractNotLease` RU: «Это не похоже на договор аренды, поэтому ниже — общее правило
    закона, а не вывод по твоему договору. Срок в твоём договоре может быть другим.» UK: «Це не
    схоже на договір оренди, тому нижче — загальне правило закону, а не висновок щодо твого
    договору. Строк у твоєму договорі може бути іншим.»
  - `lawyerAck` RU: «Записал твой интерес. Юридической помощи через Passflat пока нет, и мы не
    обещаем, что напишем об этом. Если срок важен, обратись к юристу напрямую.» UK: «Записав
    твій інтерес. Юридичної допомоги через Passflat поки немає, і ми не обіцяємо, що напишемо про
    це. Якщо строк важливий, звернися до юриста напряму.»
  - The letter how-to line (RU «…копией на email или в мессенджер, где вы общались.», UK «…де
    ви спілкувалися.»): RU «…копией на email или в мессенджер, где шла переписка с хозяином.»,
    UK «…копією на email або в месенджер, де йшло листування з власником.»
- The comments next to these texts in `deposit-texts.ts` that say «вы» / «ви» is kept verbatim
  are updated to cite D42.
- **Test** (`src/lib/bot/texts.test.ts` or a new `address-form.test.ts`): walks every RU string
  of both text objects (including functions, called with sample arguments, and the command
  menu) and fails on the whole words «вы», «Вы», «вас», «вам», «вами» and any word starting
  with «ваш» / «Ваш» (Unicode-aware word boundaries, so «выйти», «выбери» and «вывод» pass). The
  same check runs over the UK strings with «ви», «вас», «вам», «вами», «ваш…». An allowlist,
  if one is needed, names each key and the reason and starts empty.
- `docs/legal-review/deposit-scenarios.md`, spec 04 §Deposit helper scope and §Lawyer interest
  quote the new texts; the existing RU/UK tests of the deposit states and of `lawyerAck` assert
  the new wording.
- Bot copy found outside these two files (a search of `src/lib/bot/` and
  `scripts/tg-webhook.ts`) is listed in the progress entry, not changed.
