# Thesis

Version 2, 2026-11-19 (D48). The top product document: read it before the BRD. It changes only by
an owner decision. Thresholds are **Assumptions** the owner may change (D52).

## The thesis

**Passflat helps people in Warsaw find someone to rent with and see what it costs per person.**

Seekers create a short profile in the Telegram bot (district, budget per person, move-in month)
and find each other by mutual interest; Passflat's honest rent figures sit next to every step.
The deposit letter stays a free automatic tool in the bot (D44). Everything runs without the
owner's personal help and without staff (D39); the owner's part is posting links in chats and
groups (D46, D53). The cost site, building pages, the checker, guides and the roommate page are
entries into this. Listings stay frozen (D5) and other platforms' listings are not aggregated
(D45).

## For whom

| Segment                                                                                                  | Evidence                                                                                                                                                                                                                                                          | Role                                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| RU, UA and English-speaking newcomers and young professionals who want to rent a whole flat with someone | 301,200 foreigners, ~14.5 % of Warsaw (GUS, end of 2025); no RU/UA/EN roommate chat for Warsaw found; WG-Gesucht showed 22 Warsaw flatshare seekers in 24 hours and 0 offers; a whole flat averages > 4,900 zł, ~2,450 zł each for two (research 2026-11-19, A26) | Primary: the matching pool, reached through chat posts                 |
| Polish roommate searchers from Google                                                                    | `/warsaw/roommate`: 25 clicks, 1,409 impressions, position 8.8; 16 of 27 roommate landings since August were Polish; 0 useful actions from 41 roommate landings (readout 2026-11-18, A5)                                                                          | Entry through the roommate page; Polish bot only after stage 1 (D50)   |
| Students looking for a room in an existing flat (~1,300–1,500 zł)                                        | Room in a shared flat 1,480 zł; students spend 37 % of their budget on housing (research 2026-11-19)                                                                                                                                                              | Served by the roommate page's room money answer (D41), not by matching |
| Tenants with a kept deposit                                                                              | Bot flow built; no production data yet (A3)                                                                                                                                                                                                                       | Free tool and a reason to share (D44)                                  |

## In focus

- Stage 1 and 2 of roommate matching in the bot (PRD 3, D49), in RU, UK and EN (D50).
- The room cost reference and per-person figures from the figure contract, with group and N
  (`CLAUDE.md` cost data honesty).
- The roommate page as an entry (H10, D41) and the owner's link posts as the channel (D46, D53).
- Measurement: the ladder below, counted in persons and database rows, never in invented rates.

## Out of focus

| What                                                           | Why                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Own room listings, listing promotion, tenant replacement       | Frozen (D5); no roommate listing since June 2026 (A18 Contradicted)         |
| Aggregating other platforms' listings                          | Rejected (D45)                                                              |
| The deposit as the main bet, a paid deposit step, lawyers      | D39, D34, D44; the owner cannot help people personally or hire a lawyer now |
| Agency reputation                                              | D48 supersedes D5's pillar 2; no trigger reached                            |
| Paid cost data, B2B cost cards, a second city                  | D7, D16, D6                                                                 |
| Web profiles, photos, a chat of our own, payments              | Personal data and staff cost; contact goes through Telegram usernames (D49) |
| A Polish bot locale                                            | Only after stage 1 passes (D50)                                             |
| On-site tests that need Google traffic to be read in two weeks | About 6 Google clicks a week (A21 Contradicted)                             |

## The ladder

Persons are bot identities `tg_<chatId>`; profiles are database rows. Events are defined in PRD 3.

| Stage                      | What is built                                                                                                                 | Question                                                                                            | Metric (events)                                                                                                                                                                     | Threshold (D52, Assumption)                                                                                                                             | Date                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0. Launch                  | PRD 1 deploy with the bot (D29)                                                                                               | —                                                                                                   | `tg_bot_started` (E5)                                                                                                                                                               | D14 numbers reported at day 30 as a value metric; no kill rule (D57)                                                                                    | The owner's deploy, target before 2026-12-01                           |
| 1. Structured waiting list | Profile in the bot, honest counts per district, room cost reference, "message me once when matching opens" (PRD 3 M1, M2, M5) | Do the owner's posts bring profiles at a rate one founder can sustain, dense enough to match? (H14) | `tg_roommate_flow_started` → `tg_roommate_profile_created` by `entry_source`; database: profiles, active profiles per district; owner-hours and manual minutes from the posting log | Stop: < 15 profiles, < 1 profile per owner-hour, or > 30 min a week manual handling. Go: ≥ 30 profiles, ≥ 20 active, ≥ 3 districts with ≥ 3 active each | Posting from about 2026-12-01; readout 2027-01-18; decision 2027-01-20 |
| 2. Mutual matching         | Cards, "Interested" / "Skip" / "Report", username reveal, daily push, auto-hide (PRD 3 M3, M4), behind one switch             | Do compatible people find each other and act? (H15)                                                 | `tg_roommate_cards_viewed`, `tg_roommate_interest_sent`, `tg_roommate_matched`, `tg_roommate_outcome`; database: mutual pairs                                                       | ≥ 30 % of profiles older than 14 days with ≥ 1 mutual match within 14 days; by about 2027-03-31 ≥ 10 pairs and ≥ 3 "renting together" or "talking"      | Switch around 2027-01-07, only if stage 1 passes                       |
| 3. Money                   | Paid speed: instant alerts, "who marked you"; never paid contact; Telegram Stars for in-bot sales                             | Will people pay for speed? (H16, A25)                                                               | To be designed after stage 2                                                                                                                                                        | To be set                                                                                                                                               | Not before stage 2 passes                                              |

## If stage 1 fails

On 2027-01-20 the owner decides (D43, D52): shrink Passflat to content plus the free tools (cost
site, checker, guides, the deposit bot) with near-zero owner time, or stop. A null result in the
December–January trough is weaker evidence than one in August–September (research 2026-11-19);
whether to rerun from 2027-08-01 is the owner's call.

## The owner's weekly commitment

- Two 30-minute posting slots a day, about 7 hours a week (D46), under the posting rules (D53):
  reply to people who look for a roommate, vary the wording, at most 3–4 groups per slot, ask
  admins first, prefer Telegram, no identical links across Facebook groups.
- A posting log: date, minutes, groups, link tag; and minutes of manual handling (PRD 3 FR-41).
- Copy review before each deploy, one production migration approval, RLS on the new tables.
- Nothing else: no support, no personal walk-throughs (D39). Manual handling above 30 minutes a
  week is a stop signal.

## Risks and early warning signs

| Risk                                                            | Early warning sign                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The pool stays too thin to match (A22, A24)                     | Fewer than 7 profiles after the first full week of posting                                          |
| People start the profile but do not finish it (A23)             | Fewer than half of `tg_roommate_flow_started` persons reach `tg_roommate_profile_created` in a week |
| Budgets do not fit renting a whole flat together (A26)          | More than half of profiles in the two lowest budget bands                                           |
| Groups remove posts or block the domain (D53)                   | A removed post, a Telegram spam limit or a Facebook warning in the posting log                      |
| Scams and fake profiles need the owner (A27)                    | A report with reason `scam`, or manual minutes above 15 in any week                                 |
| Season: the December trough                                     | Weekly profiles fall in the holiday weeks; the readout says so                                      |
| Legal: gender preference, profile data, DSA duties (D51)        | A complaint to contact@passflat.com or to UKE; the lawyer questions in PRD 3 stay unanswered        |
| Owner time falls short                                          | Fewer than 5 posting hours logged in a week                                                         |
| Success makes users leave (the need comes once every 1–2 years) | Expected; measured by outcomes, not retention                                                       |
