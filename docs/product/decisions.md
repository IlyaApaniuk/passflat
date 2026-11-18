# Decisions

Every owner decision with its date and reason. The latest decision wins over older documents.
Numbers are never reused; a changed decision gets a new row that supersedes the old one.
Rows D1–D19 were reconstructed on 2026-11-18 from the owner's working sessions of June–October
2026; exact dates are given where they were recorded.

Status: **Accepted**, **Superseded by D<n>**, **Reversed**.

| ID  | Date           | Area        | Decision                                                                                                                                                                                              | Status            |
| --- | -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| D1  | 2026-06        | Product     | Open all cost data during the cold start; keep the contribute-to-unlock gate and Stripe access behind a feature flag for later                                                                        | Accepted          |
| D2  | 2026-06        | Audience    | First audience: Russian- and Ukrainian-speaking newcomers in Warsaw                                                                                                                                   | Accepted          |
| D3  | 2026-06-14     | Product     | Audit findings declined: honesty copy stays as is, unused DB fields stay, the shadcn UI kit stays                                                                                                     | Accepted          |
| D4  | 2026-06-14     | Data        | Medians blend `user`, `import` and `scraped` reports (cold start); clean up by deleting scraped rows as user reports grow, not by filtering display                                                   | Accepted          |
| D5  | 2026-06-20     | Strategy    | Passflat is a rental transparency product on two pillars: real costs (now) and agency reputation (later, on a trigger); listings frozen, search ceded to Flatka                                       | Accepted          |
| D6  | 2026-06-21     | Strategy    | Geographic expansion parked until the Warsaw loop works; next would be a second Polish city, the US never                                                                                             | Accepted          |
| D7  | 2026-06-22     | Money       | Paid cost-data access parked until data is dense and traffic is large enough for small conversion to matter                                                                                           | Accepted          |
| D8  | 2026-07-19     | Channels    | Paid posts in Telegram groups stopped: two deals gave about 1–2 visits a week and no form starts                                                                                                      | Accepted          |
| D9  | 2026-07-28     | Engineering | RLS is managed by hand in the Supabase dashboard, never in migrations; new tables are a checklist item for the owner                                                                                  | Accepted          |
| D10 | 2026-07-28     | Analytics   | PostHog collects anonymously without device storage until consent, also after "Decline"; GA stays consent-gated; banner wording is known debt                                                         | Accepted          |
| D11 | 2026-07-29     | Metrics     | North star is `cost_form_started`; reviews and tags are the low-friction first ask; the message test (medians vs checker) is decided by form starts per `ref`                                         | Superseded by D17 |
| D12 | 2026-07-29     | Marketing   | No Markdown content plans; the owner asks for the next post on demand                                                                                                                                 | Accepted          |
| D13 | 2026-08-27     | Strategy    | No pivot to software for rental agents; take two features instead: a consumer move checklist (later) and the Telegram bot for the RU/UA audience                                                      | Accepted          |
| D14 | 2026-08-29     | Bot         | Build a cut-down Telegram bot MVP; a channel only mirrors content; no email; kill/scale thresholds count 30 days from the production launch                                                           | Accepted          |
| D15 | 2026-10-04     | Strategy    | The feature freeze of 2026-06-21 is lifted: the distribution-only plan did not work; B2B and product reframes are back on the table                                                                   | Accepted          |
| D16 | 2026-10-04     | Strategy    | Owner-side "verified cost cards" for agencies and PRS parked the same day; research kept                                                                                                              | Accepted          |
| D17 | 2026-10-05     | Strategy    | Acquisition reframe: sell solving a money problem ("get your deposit back") instead of cost information; data becomes a by-product; lawyers as a later escalation                                     | Accepted          |
| D18 | before 2026-07 | Engineering | Every production migration needs the owner's explicit approval, migration by migration; development runs on the local database                                                                        | Accepted          |
| D19 | 2026-07-26     | Engineering | Never commit to `main`; work on branches, the owner pushes and merges pull requests                                                                                                                   | Accepted          |
| D20 | 2026-11-18     | Process     | Adopt the Kwitax build harness (PRD → specs → tasks → loop) without Notion: all product documents in `docs/product/`, English; conversation in Russian; PostHog MCP read-only                         | Accepted          |
| D21 | 2026-11-18     | Process     | Night run 2026-11-18/19: PRD 1 is decomposed and built by the loop before the owner answers its decision review; owner decisions become blocked tasks; PostHog read-only; legacy Russian docs removed | Accepted          |

## Details

- **D1, D7.** Reason: a gated magnet kills SEO and sharing during the cold start, and a paywall on
  an empty funnel earns nothing while starving contributions. Trigger for paid access: a working
  contribution loop, most districts at N ≥ 5, and enough traffic for a small conversion to be
  real money.
- **D4.** Reason: "don't look dead" during the cold start. Do not re-propose a source filter on
  displayed medians. PRD 1 package C (owner's brief of 2026-10-07) labels sources separately,
  which refines the display without removing scraped data.
- **D5.** Positioning: "Flatka shows what landlords ask; Passflat shows what tenants pay."
  Agency reviews are built when the cost loop works without manual asking (visit → form start
  above 2 % and steady weekly real submissions from a channel) or a free demand probe is hot.
- **D10.** Legal basis named in the privacy policy: Art. 6(1)(f) for analytics; consent is needed
  only for device storage. Open debt: the banner says "cookies and analytics" with "Decline".
- **D11 → D17.** The north star of the contribution loop stays measurable, but the acquisition
  bet moved to money problems. A new north star is not yet decided.
- **D14.** Kill within 30 days after launch if fewer than 50 `/start`, or activation (sent an
  address) below 30 %, or zero submissions from the bot; scale if at least 300 `/start` or D14
  retention at least 30 %.
- **D17.** Hooks ranked: (1) get your deposit back (about 5,000 zł at stake, clear statutory
  deadline, language barrier), (2) check a utility surcharge, (3) check a lease. The bot flow was
  built on `feat/tg-bot` (commits 41366fe, a612f76, 37817ef); it is not in production: four
  migrations are unapplied and the production bot token is not set.
- **D21.** Reason: the owner asked for an unattended night without approvals. Everything happens
  on branch `chore/agent-harness`: commits only, no push, no deploy, no production database.
