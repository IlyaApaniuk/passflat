# 07 · Roommate matching and safety (PRD 3 M3, M4)

Requirements FR-23 – FR-36 of PRD 3 (`../product/prd/prd-3-roommate-matching.md`, version 0.2).
Data model, module layout, routing, the daily cron and the stage 1 parts are in spec 06; the
testing rules of spec 04 apply. Stage 2 runs only with the switch on (D49); the owner turns it
on (D58). The legal-sounding texts here (safety lines, statement of reasons, terms, privacy) are
**agent drafts** for the owner's approval: the privacy section before the deploy, everything
else before the switch (D56). None is presented as reviewed by a lawyer; the lawyer questions
are kept for later (D69).

## Switch

FR-23, **Decided** (one config switch, D49).

- `isMatchingEnabled()` in `src/lib/roommate/switch.ts`: `process.env.ROOMMATE_MATCHING_ENABLED
=== 'true'`, read per call (per request and per cron run), never cached at module load. Any
  other value or unset → off.
- `.env.example` documents `ROOMMATE_MATCHING_ENABLED=` with an empty placeholder and one comment
  line; no other env file is touched.
- Vercel applies a changed environment variable only to a new deployment, so turning the switch
  on or off is "set the variable, then redeploy" (owner step, named in the handoff and the bot
  README). The owner records the moment in the posting log and as a PostHog annotation; the E15
  queries take that moment as a parameter `{switch_at}` (spec 05 §Stage 2 readout).
- Off: no "Show people" button, no cards, no interest, no reveal, no daily push, no one-time
  message; the capability text says matching opens later (spec 06). On: the opt-in button is
  replaced by "Show people" (`rm:show`), the one-time message (spec 06 §Matching is open) and the
  daily push run.
- Turning it off again: new cards and pushes stop; reveals already sent stay; stored reactions
  stay; a stage 2 button tapped while it is off replies "matching is paused" (RU/UK/EN draft).
  The outcome question and the moderation messages keep working.
- Tests cover both states for `/mate` (the card's buttons), `rm:show`, `rm:i:*`, and the cron's
  stage 2 jobs.

## Usernames

FR-25 criterion 2, FR-26 criterion 3, BRD A28.

- Every roommate handler (`rm:*` callbacks, `/mate`, `mate` links, `/appeal`) stores
  `ctx.from.username` (or null when absent) on the chat's profile with one conditional update when
  it differs from `tg_username` (agent's clarification: "read from each update" is applied to the
  roommate updates, the only ones whose username matters).
- A reveal refreshes the username of the person being revealed with `api.getChat(<their chat
id>)` just before the send (a stored name can be stale, and a released name can belong to a
  stranger by now); the fresh value is stored; no username then → the username prompt of §Reveal.
  A failed `getChat` uses the stored value.
- Each username prompt sends `tg_roommate_username_prompted` with `context` (`browse` /
  `reveal`); a Done tap that finds a username sends `tg_roommate_username_set` with the same
  `context` (BRD A28: "or set one when asked").
- Never logged, never in an event.

## Compatibility

FR-24, **Decided** (district, budget, month; "live with" mutual, D49, D51; languages, D54);
**Assumption** (the tolerances, D68).

`isCompatible(a, b)` in `src/lib/roommate/compatibility.ts`, pure and symmetric, for two
different active profiles; true when all hold:

1. Districts: `a.anyDistrict` or `b.anyDistrict`, or the district sets share at least one slug.
2. Budget: band indices differ by at most 1 (`b2`–`b3` yes, `b2`–`b4` no).
3. Move-in: months differ by at most one calendar month.
4. Languages: at least one shared language.
5. "Live with": `a.prefers` accepts `b` and `b.prefers` accepts `a`; `anyone` accepts every
   profile, `women` only a profile with `gender=woman`, `men` only `gender=man`; a profile without
   a stated gender is accepted only by `anyone`.

`findCompatible(profile, now)` in `src/lib/roommate/store.ts` loads the candidates in one query
(active by the definition of spec 06 §Counts, not the profile itself, not hidden, no reaction from
`profile` to them, no `skip` reaction from them to `profile` (no match is possible; agent's
**Assumption** for the owner's review), no report between the two in either direction) and filters them in memory with
`isCompatible`, so the database result equals the pure rule by construction (**Assumption**:
in-memory filtering is fine up to 2,000 active profiles; above that, the README notes the query
must move into SQL). The order is newest first by `coalesce(renewed_at, activated_at)`.

Golden cases (PRD 3 §5 example 3, unit tests, each also checked with the arguments swapped): A =
Mokotów + Ochota, b3, February 2027, RU + EN, woman, live with women.

| B   | Districts | Band | Month    | Languages | Gender     | Live with | Compatible with A? | Why                                 |
| --- | --------- | ---- | -------- | --------- | ---------- | --------- | ------------------ | ----------------------------------- |
| B   | Ochota    | b4   | Mar 2027 | EN, PL    | woman      | anyone    | yes                | Ochota, adjacent bands, 1 month, EN |
| C   | Wola      | b3   | Feb 2027 | RU        | woman      | anyone    | no                 | no shared district                  |
| D   | any       | b3   | Apr 2027 | RU        | woman      | anyone    | no                 | 2 months apart                      |
| E   | Mokotów   | b3   | Feb 2027 | RU        | not stated | anyone    | no                 | A accepts only a stated woman       |
| F   | Mokotów   | b1   | Feb 2027 | RU        | woman      | anyone    | no                 | bands two steps apart               |
| G   | Mokotów   | b3   | Feb 2027 | UK        | woman      | anyone    | no                 | no shared language                  |
| H   | any       | b2   | Jan 2027 | RU, UK    | woman      | men       | no                 | H accepts only men                  |

A test of `findCompatible` with a mocked Prisma candidate list asserts that it returns exactly the
candidates the pure rule accepts, excludes reacted and reported ones, and keeps the order.

## Cards

FR-25, **Decided** (one at a time with "Interested" / "Skip" / "Report", D49); **Assumption**
(order, fields).

- "Show people" (`rm:show:<via>` with `via` `c` from the card, `o` from the one-time message, `p`
  from the push, `n` from "That's everyone" or a refused card; spec 06 writes `rm:show` for short)
  with the switch on:
  - no profile → "create a profile first" and the intake starts (reciprocity);
  - the person's profile expired → "renew to keep browsing" with Renew;
  - no Telegram username (`ctx.from.username` absent) → "set a username in Telegram Settings, then
    tap Done" with Done (`rm:u:done`) and no card; Done re-reads the username and continues;
  - otherwise one card of the first profile from `findCompatible`, with "Interested"
    (`rm:i:<profileId>`), "Skip" (`rm:x:<profileId>`) and "Report" (`rm:r:<profileId>`); none
    left → "That's everyone for now" and the daily-message state.
- One `tg_roommate_cards_viewed` per `rm:show` tap with `results_band` (`0`, `1-2`, `3-5`, `6+`)
  of the number of compatible profiles at that moment and `via` (`card` / `open_message` / `push`
  / `next`), so the H12 reading can attribute views to the push.
- Card content (`renderRoommateCard`, pure): districts (or "any district"), the budget band label,
  the move-in month, languages, the short text (escaped), answered house rules only. Never own
  gender, "live with", a name, a username or any identifier. A test asserts the rendered card of a
  profile with every field set contains no gender, "live with" value, username or id.
- "Skip" stores a `skip` reaction (unique pair; a repeat changes nothing); that profile is never
  shown to this person again. Then the next card.
- A card button whose profile is gone, hidden, expired or no longer visible to this person
  (reacted, reported either way, the chat blocked or banned) → "this profile is no longer
  available" and the next card. Callback ids are checked against this visibility rule, never
  trusted.

## Interest and mutual match

FR-26, FR-28; **Decided** (mutual interest reveals both usernames with safety lines, D49);
**Assumption** (20 a day, D68).

- "Interested" (`rm:i:<id>`): visibility as §Cards; then the daily limit: when the person's
  profile already has `INTEREST_DAILY_LIMIT = 20` `interest` reactions created in the last 24
  hours, reply "that's the limit for today" and store nothing (no event). Otherwise insert the
  `interest` reaction (unique pair; an existing reaction → "already answered" and the next card)
  and send `tg_roommate_interest_sent` (no properties).
- Then one SQL statement (`$executeRaw`, in one function in `store.ts`) sets `matched_at = now()`
  on both reactions of the pair only where both are `interest`, both have `matched_at` null, and
  both rows exist; the request whose statement changes 2 rows formed the pair (the completer).
  Two concurrent taps form exactly one pair: the second statement re-checks `matched_at` after the
  row lock and changes 0 rows. A unit test covers the decision logic with a mocked
  `$executeRaw` result; the SQL is read in review.
- A pair formed → `tg_roommate_matched` with `role=completer` for the tapping person and
  `role=waiting` for the other (no partner id, match id or username in any event); then §Reveal.
  No counterpart → nothing is sent to the other person; the next card.
- The other profile deleted between the taps → the tap is handled as "no longer available".

## Reveal

FR-26 criteria 3 – 4, FR-30; safety lines **agent draft** (D56).

- For a formed pair A (completer) and B (waiting): when either chat is blocked or either profile
  is no longer active → no reveal (the pair stays matched in the database). When a stored username
  is missing on either side → that person gets "You have a mutual match. Set a Telegram username
  in Settings, then tap Done" with Done (`rm:u:done`), and both reveals wait; Done re-reads the
  username, stores it and retries every waiting pair of that profile.
- Otherwise, B first, then A: claim the reaction of the receiving person (`revealed_at` null →
  now, conditional update), send "You are both interested. Write to @<username>." with the safety
  lines (PRD 3 §8 "Reveal with safety lines": Passflat never asks for money; no deposit or
  "reservation" before a viewing and a signed contract; tap Report if someone asks for money or
  documents), a "Report" button for the partner (`rm:r:<partnerProfileId>`, §Report: report
  eligibility is not card visibility) and the next steps; each delivered message sends
  `tg_roommate_contact_revealed`. Before each send the partner's username is refreshed
  (§Usernames). A 403 to B marks B's chat blocked and A gets no reveal; any other error releases
  B's claim and A waits.
- **`retryPendingReveals(api, now)`** (spec 06 §Daily cron, send hour, switch on or off): every
  pair with `matched_at` set and at least one `revealed_at` null, both profiles active, both chats
  unblocked and both usernames stored, gets the missing reveal(s) in the same order and with the
  same claims. "Waiting on a username" (A28) means matched, not revealed, and a `tg_username` null
  on either side.
- The username prompt to the waiting person (B) is a message the bot sends first; spec 04
  §Promises and capabilities lists it.
- **Next steps** (FR-30, **Assumption**): three callback buttons under the reveal, because a URL
  button sends no callback and could not be counted: `rm:ns:agreement`, `rm:ns:address`,
  `rm:ns:cost`. Each tap sends `tg_roommate_next_step` with `step` (`agreement` /
  `address_check` / `cost`) and replies with: the roommate agreement template in the person's
  locale (`public/documents/umowa-wspollokatorska-<ru|uk|en>.pdf`, served at
  `/documents/…` without a locale prefix, with the Polish original
  `umowa-wspollokatorska.pdf` named next to it; UTM added as query parameters), the bot's address
  prompt (as `startAfterPayload` asks for an address), or the costs page
  link through `webLink('/warsaw/costs', locale, 'roommate')`. Links carry `utm_source=telegram`,
  `utm_medium=bot` and no chat identifier.
- Tests: both usernames present → two messages B then A and two `contact_revealed`; a missing
  username → prompt (with `tg_roommate_username_prompted`) and no reveal, Done →
  `tg_roommate_username_set` and both reveals; a username refreshed by `getChat`; a blocked chat →
  none; a retry after a failed send; the Report button's callback; each next step's event and
  link.

## Daily push

FR-27; **Decided** (daily, opt-out, D49; 10:00 Europe/Warsaw, D68); **Assumption** (what counts
as new, D68).

- In the send-hour run with the switch on (`sendDailyPushes(api, now)` in `roommate-daily.ts`):
  for each active profile with `push_off=false`, N = the profiles from `findCompatible` whose
  `coalesce(renewed_at, activated_at)` is after `coalesce(last_push_at, activated_at)` of this
  profile. N = 0 → no message. Otherwise claim (`updateMany where { id, last_push_at: <read value> }
→ now`), send "<N> new people fit you" with "Show" (`rm:show:p`) and "Stop daily messages"
  (`rm:push:off`), and send `tg_roommate_push_sent` with `count_band`.
- `rm:push:off` sets `push_off=true` and sends `tg_roommate_push_opted_out`; the own card offers
  `rm:push:on` to switch it back (no event).
- Golden case (PRD 3 FR-27): last push 2027-01-10 09:00 UTC; B compatible, created 01-10 15:00; C
  compatible, renewed 01-11 08:00; D not compatible, created 01-10 20:00 → the run of 2027-01-11
  09:00 UTC says 2.
- Switch off, a hidden or expired profile, `push_off` → none. Tests: the golden case, N = 0,
  claim once over two runs, opt-out and back on.

## Outcome question

FR-29, **Assumption** (21 days, once; D68).

- In every send-hour run (switch on or off): each active or expired profile with
  `outcome_asked_at` null whose earliest `matched_at` is at least 21 days old gets, claimed on
  `outcome_asked_at`, "Did you find someone to rent with?" with "Renting together", "Still
  talking", "Did not work out", "Don't ask" (`rm:o:<renting_together|talking|no_fit|dont_ask>`).
- A tap stores `outcome` through `updateMany({ where: { id, outcome_asked_at: { not: null },
outcome: null } })` and only when `count === 1` sends `tg_roommate_outcome` with `outcome` and
  `asked=follow_up`; a second tap, or a tap on a profile that was never asked, changes nothing and
  sends nothing. A profile deleted before day 21 is not asked (spec 06 §Delete covers it). No
  answer → nothing more is sent. The readouts count outcomes only for persons with
  `tg_roommate_matched` (spec 05).
- Tests: asked once, not before day 21, each answer's event, a second tap and an unasked tap
  sending nothing.

## Report

FR-31; **Decided** (report on every card, D49); **Assumption** (the reasons).

- "Report" (`rm:r:<id>`) → reasons: "asks for money or a deposit" (`money`), "fake profile"
  (`fake`), "offensive" (`offensive`), "looks under 18" (`under_18`), "other" (`other`); callback
  `rm:rr:<reason>:<id>`.
- **Who may report whom** (not the card visibility rule, which hides reacted profiles): the
  reporter has an active or expired profile and either holds a reaction to the target (a card
  they saw) or got a reveal of it (the Report button under the reveal, the main scam path); the id
  from the callback is checked against this, never trusted. Otherwise "this profile is no longer
  available".
- A tap stores one report per reporter and target (unique); a repeat → "already reported" and
  nothing else. A stored report sends `tg_roommate_reported` with `reason`, hides the target from
  the reporter at once (spec 06 §Counts and §Compatibility exclude reported pairs both ways), runs
  §Automatic hiding, and replies with a receipt: the check is automated; the profile is now hidden
  from the reporter; it is hidden from everyone when a second person reports it, or at once for
  "looks under 18"; the reporter is told when that happens (agent's draft, so every reporter knows
  the rule that decides; DSA Art. 16(5)).
- The target already hidden → the receipt and no further action.
- People without the bot report through contact@passflat.com, as the terms already say
  (`termsPage.dsa`).
- Tests: one report stored and one event, a repeat, the receipt text per case.

## Automatic hiding

FR-32, FR-34; **Decided** (automatic hiding, D49; the rule, D62; the ban marker kept, D55).

- After each stored report: the target is hidden when it has reports from 2 different reporters
  (rows for the target, whatever their reason), or at once when the new report's reason is
  `under_18`. A report counts toward the 2 only while its reporter's profile exists
  (`reporter_profile_id` not null) and its `decision` is not `lifted` (agent's reading of D62
  "from different people", named for the owner's review: one chat holds one profile at a time, so
  deleting and re-creating a profile cannot add a second reporter; an owner's unhide is not undone
  by the old reports).
- Hiding is one conditional update `where { id, hidden_at: null }` → `status=hidden`,
  `hidden_at=now`, `hidden_reason` (`reports` / `under_18`); only the request whose update changed
  the row continues (two reports in the same second hide once). It then sets the chat's
  `roommate_banned_at` (when null), marks every report of the target `decision=hidden`,
  `automated=true`, `decided_at=now`, sends `tg_roommate_profile_hidden` with `reason`, sends the
  statement of reasons (§Statement of reasons), and tells every reporter of the target, once, that
  the profile was hidden by an automated decision (DSA Art. 16(6)): each notice is claimed on that
  report's `reporter_notified_at` (conditional update from null), a non-403 failure releases it,
  and the daily cron retries unsent notices of `decision=hidden` reports whose reporter profile and
  chat still exist (spec 06 §Daily cron).
- A report stored just after another request hid the target (its check saw the target visible,
  its insert landed after the hide's decision update; FR-32 criterion 4, T113, agent's reading
  of "tell every reporter"): every request whose report did not hide runs one more update,
  conditional on the target's `hidden_at` in the same statement, that decides the target's
  `decision='none'` reports the same way (`hidden`, `automated=true`, `decided_at`), whatever
  the counts; lifted reports stay lifted, a visible target's reports stay undecided. The request
  that decided any replies its receipt and then sends the notices of the target (claimed as
  above, retried by the daily cron). No second statement and no second event: the statement's
  facts are the decided reports at the time it is sent.
- A hidden profile is not counted, not shown and gets no push; it is deleted at `expires_at` +
  14 days with `reason=moderation` (spec 06 §Daily cron); the ban stays. After a hide, `/mate`
  and `mate_*` links give the FR-14 reply (spec 06 §Entry and routing).
- Golden cases: R1 reports X ("fake") → X visible to others; R1 again → no change; R2 reports X
  ("money") → X hidden, `hidden_reason=reports`. R3 reports Y ("under_18") → Y hidden at once,
  `hidden_reason=under_18`. Two concurrent reports → one hide, one statement.

## Statement of reasons

FR-33; **Decided** (automatic, D49); text **agent draft** approved by the owner before the switch
(D56). DSA Art. 17.

- One message to the hidden person, in the chat's locale: what was restricted (the profile is
  hidden from matching and no new profile can be created); the facts (the number of reports and
  their reason categories, never who reported and no other profile); that the decision was made
  automatically; the ground in the terms (link to the moderation section of FR-36 through
  `webLink('/terms#matching', locale, 'roommate')`); redress: reply `/appeal`, write to
  contact@passflat.com, complain to the President of UKE as the Digital Services Coordinator, or go
  to court.
- Claimed on `statement_sent_at` (conditional update from null) right after the hide; a non-403
  failure releases it and the daily cron retries (spec 06 §Daily cron); a blocked chat gets
  nothing and keeps `statement_sent_at` null, which the owner's SQL shows.
- Tests: the text lists counts and categories and no reporter; sent once; retried after a failure.

## Appeals and the owner's review

FR-35; **Decided** (up to 10 minutes a week inside the 30-minute cap; the police on a threat,
D65; telling the appeal decision through a manual route, D73); **Assumption** (the commands).

- `/appeal`: a hidden profile with `appealed_at` null → set it and reply with a fixed
  acknowledgement that names contact@passflat.com and promises no time; a second `/appeal` →
  "already received", no change; a banned chat whose profile is already deleted → the e-mail
  address; any other chat → "nothing to appeal".
- The bot README gets an "Owner review" section: read-only SQL listing hidden profiles with
  `hidden_reason`, report reasons and counts, `appealed_at` and `statement_sent_at`; the SQL to
  unhide one (status back to `active` when `expires_at` is in the future, else `expired`;
  `hidden_at`, `hidden_reason` null; that target's reports `decision='lifted'`) and to clear the
  chat's ban; that the owner spends up to 10
  minutes a week, logs them as manual minutes in the posting log (spec 05 §Posting kit), and
  informs the police when a report suggests a threat to life or safety (DSA Art. 18). No SQL is
  run by the loop.
- `COMMAND_MENU` does not list `/appeal` (it is named in the statement only).
- Tests: the four `/appeal` cases.
- **Telling the person the appeal decision** (DSA Art. 20; the bot is the only channel to them):
  **Decided** (D73, the owner's answer to PRD 3 Q-16, 2026-11-19): a manual, owner-triggered
  route `POST /api/cron/roommate-appeal`, guarded by `requireCronAuth`, never scheduled and not in
  `vercel.json`, with the JSON body
  `{ "profileId": "…", "decision": "lifted" | "upheld", "confirm": true }` (T109).
  - Without the secret → 401; without `confirm: true`, or with an unknown decision → 400 and
    nothing changes. An unknown profile, or one that is not hidden, changes and sends nothing.
  - `lifted` applies the README's owner review steps in one go: the unhide (status back to
    `active` when `expires_at` is in the future, else `expired` with `expired_at` set; `hidden_at`,
    `hidden_reason` null; that target's reports `decision='lifted'`, `automated=false`,
    `decided_at=now`; `appealed_at` kept), clears the chat's ban, then sends "profile restored".
    `upheld` changes nothing and sends "the hide stays, and here is why", naming the hide's reason
    as the statement of reasons does.
  - One fixed message in the chat's locale (RU «ты», UK «ти», EN), new keys in
    `roommate-texts.ts`; both texts are agent drafts for the owner's approval (D56), listed for
    review in the task's progress entry. The send is claimed so a repeat call sends nothing
    (**Assumption**: the claim reuses an existing field; if it needs a new column, and so a second
    migration, block again with that finding). A 403 marks the chat blocked; the response is
    counts only, never a chat id or text.
  - The bot README's owner review names the route as the way to decide an appeal and says the
    owner's time counts in the 10 minutes a week of D65.
  - Tests: 401, 400 without confirm, each decision, one message, a repeat sending nothing.

## Terms and privacy drafts

FR-36; **Decided** (D56: agent drafts, the owner approves; privacy before the deploy, moderation
before the switch; the hiding rule, D62).

- New keys in all four locale files, Polish written first, identical key sets: a privacy section
  `privacy.roommateMatching` (title and items: which fields are stored and why; Telegram as the
  channel; who receives what — other users see the card in stage 2 and, on mutual interest, the
  username; the 30-day life, the end-of-month rule, the 14-day grace and deletion, deletion at
  once on request, drafts after 7 days, reports for 6 months, the ban marker; no profile data in
  analytics beyond bands, counts and booleans; gender and "live with" used only for mutual
  compatibility and never shown) and a terms section `termsPage.matching` (what matching does;
  adults only; content rules for the short text; automatic hiding at 2 reports from different
  people or 1 "looks under 18" report; the ranking "newest first"; the statement of reasons;
  redress: `/appeal`, contact@passflat.com, the President of UKE, court).
- **Existing keys that the new sections would contradict** are redrafted in the same task and
  listed separately for the owner: `privacy.automated.description` (today: no automated
  individual decision-making, GDPR Art. 22; hiding and the ban are automated), `privacy.dataSharing`
  (matching recipients: other users and Telegram), `privacy.retention` (the roommate periods), and
  the list of processors (`privacy.transfers` or wherever the page names them: Telegram). The terms
  section takes the next free number in the numbered titles and sits before "Changes" and
  "Contact", not after them; the privacy section sits after "Data sharing".
- The pages (`src/app/[locale]/privacy/client.tsx`, `terms/client.tsx`) render hardcoded keys in
  `<section>` blocks without ids today: the new sections get `id="roommate-matching"` and
  `id="matching"`, in the existing markup; `lastUpdated` is not changed (the owner sets it when
  approving).
- The intake intro links to the privacy anchor (spec 06 §Entry and routing).
- Every key is listed for the owner in the progress entry as a draft for approval; nothing says it
  was reviewed by a lawyer.
- Tests: key parity (existing test), the two anchors render (a render test of each page section
  or of the section component).

## Events (stage 2)

Bot events through `track` as `tg_<chatId>` (**Assumption**, PRD 3 §6). No event carries a
username, the short text, gender, "live with", a district list, a chat id, a partner id or a
match id.

| Event                          | Sent when                     | Properties                                      |
| ------------------------------ | ----------------------------- | ----------------------------------------------- |
| `tg_roommate_cards_viewed`     | each `rm:show` tap            | `results_band`                                  |
| `tg_roommate_interest_sent`    | a stored "Interested"         | none                                            |
| `tg_roommate_matched`          | a pair forms, once per person | `role` (`completer` / `waiting`)                |
| `tg_roommate_contact_revealed` | a reveal message is delivered | none                                            |
| `tg_roommate_push_sent`        | a daily push is delivered     | `count_band`                                    |
| `tg_roommate_push_opted_out`   | "Stop daily messages"         | none                                            |
| `tg_roommate_reported`         | a stored report               | `reason`                                        |
| `tg_roommate_profile_hidden`   | an automatic hide             | `reason` (`reports` / `under_18`)               |
| `tg_roommate_outcome`          | an outcome answer             | `outcome`, `asked` (`follow_up` / `delete`)     |
| `tg_roommate_next_step`        | a next-step tap               | `step` (`agreement` / `address_check` / `cost`) |

Additions from the architect review (agent's, so H12 and A28 can be read):
`tg_roommate_cards_viewed` also carries `via` (`card` / `open_message` / `push` / `next`);
`tg_roommate_username_prompted` and `tg_roommate_username_set` (§Usernames) carry `context`
(`browse` / `reveal`).

`countBand(n)` (`0`, `1-2`, `3-5`, `6+`) is one pure function in `rules.ts`, shared with spec 06.
