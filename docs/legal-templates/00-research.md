# Legal research: rental documents for the Polish market (2025/2026)

> **Status:** Internal working document for the PassFlat team. Written in English for the team,
> with Polish legal terms preserved. **This is not legal advice.** Everything below — and every
> template in this folder — MUST be reviewed and signed off by a Polish lawyer (radca prawny /
> adwokat) before being offered to users. Flagged uncertainties are marked with ⚠️.

This file backs three downloadable, fill-in-the-blank templates, one per PassFlat listing type:

| Listing type  | Polish name                | Document we ship                        |
| ------------- | -------------------------- | --------------------------------------- |
| `replacement` | cesja umowy najmu          | `cesja-umowy-najmu.md` (3-way transfer) |
| `sublet`      | podnajem                   | `umowa-podnajmu.md`                     |
| `roommate`    | poszukiwanie współlokatora | `umowa-wspollokatorska.md`              |

---

## 0. Shared legal background (applies to all three)

- **Kodeks cywilny (k.c.)** — Ustawa z dnia 23 kwietnia 1964 r. (Dz.U. 1964 nr 16 poz. 93, z późn. zm.).
  Najem: art. 659–692; przelew wierzytelności: art. 509–516; przejęcie długu: art. 519–526.
- **Ustawa o ochronie praw lokatorów (u.o.p.l.)** — Ustawa z dnia 21 czerwca 2001 r. o ochronie praw
  lokatorów, mieszkaniowym zasobie gminy i o zmianie Kodeksu cywilnego (tekst jedn. Dz.U. 2024 poz. 183,
  z późn. zm.). Najem okazjonalny: art. 19a–19e. Kaucja: art. 6. Protokół: art. 6c.
- **Ustawa o ewidencji ludności** — Ustawa z dnia 24 września 2010 r. (obowiązek meldunkowy).

### Kaucja (security deposit) — confirmed limits

- **Standard najem (lokal mieszkalny):** kaucja max **12× miesięczny czynsz**, liczona wg stawki z dnia
  zawarcia umowy (art. 6 ust. 1 u.o.p.l.). In market practice it is almost always **1–3× czynsz**.
- **Najem okazjonalny / instytucjonalny:** max **6× miesięczny czynsz**.
- **Zwrot:** within **30 dni** of vacating the flat (opróżnienie lokalu) and handover, after deducting
  the landlord's documented claims (art. 6 ust. 4 u.o.p.l.). Late return → ustawowe odsetki za opóźnienie
  (art. 481 k.c.).
- **Waloryzacja:** for contracts after 10 July 2001, the returned amount tracks the current rent × the
  multiplier used when the deposit was paid, but **not below the nominal amount paid**.
- ⚠️ Note: the 12×/6× limits in u.o.p.l. are written around the landlord–tenant relationship. For a
  **podnajem** and a **roommate cost-share**, treat them as a safe ceiling/analogy rather than a
  guaranteed statutory cap — lawyer to confirm applicability.

### Protokół zdawczo-odbiorczy (handover protocol)

- **Statutory:** art. 6c u.o.p.l. requires the parties to draw up a protocol describing the technical
  state and degree of wear of installations and equipment **before the flat is handed over**.
- Made **twice**: at handover (przy wydaniu) and at return (przy zwrocie). The end protocol is the basis
  for settling the deposit.
- Should contain: date + place, parties, address, link to the lease, **meter readings** (woda/prąd/gaz/CO),
  per-room technical condition, **itemised inventory** of furniture/appliances, number of key sets, photos.
  Two identical copies, signed by both/all parties.
- Best practice: attach the protocol as a **załącznik** to the main agreement.

### Meldunek (registration of residence)

- Administrative duty only (ustawa o ewidencji ludności). A tenant should register within **30 dni** of
  moving in. Meldunek **does not create any civil-law right** to the flat and does not give a tenant a
  title to occupy. A tenant can register based on the lease and does not need the owner's separate consent.
- Practical point for templates: state who is responsible for registration and that it confers no
  occupancy rights beyond the agreement itself.

---

## 1. `replacement` — Cesja umowy najmu (lease assignment / takeover)

### What it legally is

"Cesja umowy najmu" is a colloquial label. There is **no single statutory institution** that transfers
an entire contractual position. To move a tenant's **whole** position (rights **and** obligations) to a
new tenant you must combine **two** instruments:

1. **Przelew wierzytelności / cesja** — art. 509–516 k.c. Transfers _rights/claims_ (e.g. the claim to use
   the flat). By default **does not require the debtor's consent** (art. 509 § 1 k.c.) — _unless_ it is
   excluded by statute, a contractual clause (pactum de non cedendo, art. 514 k.c.), or **właściwość
   zobowiązania** (the nature of the obligation).
2. **Przejęcie długu** — art. 519–526 k.c. Transfers _obligations_ (paying rent, returning the flat in
   good order). This **ALWAYS requires the creditor's (landlord's) consent** — it is _conditio iuris_:
   without it the assumption of debt produces **no legal effect at all, even between the assignor and
   assignee** (confirmed e.g. Sąd Najwyższy, wyrok z 14.01.2021 r., II CSK 456/19).

### 🔴 Landlord consent — the critical finding

**For a residential lease, the landlord's consent is, in practice, REQUIRED for a valid cesja umowy najmu.**

- Because a lease is a relationship of trust, courts commonly treat **właściwość zobowiązania** as
  blocking a free transfer of the tenant's position even on the rights side.
- More decisively, the **obligations** (rent, return of the flat) can only move by **przejęcie długu**,
  which needs the landlord's consent (art. 519 § 2 k.c.).
- **Form:** the assumption-of-debt agreement **and** the creditor's consent must be **in writing under
  pain of nullity** (art. 522 k.c., forma pisemna pod rygorem nieważności).
- ⚠️ **Blanket / advance consent is risky.** A clause in the original lease letting the tenant transfer the
  position "to anyone" without naming the incoming tenant is legally doubtful and criticised in case law,
  because the landlord cannot assess the new tenant's solvency (art. 519 § 2 pkt 2 k.c. — consent is
  ineffective if the creditor did not know the assignee was insolvent). The safe path is **case-specific
  consent naming the incoming tenant**.

### Recommended structure → a 3-way (trójstronna) agreement

The safest, cleanest instrument is a **single tripartite agreement** signed by:

- **Cedent / Dotychczasowy Najemca** (outgoing tenant),
- **Cesjonariusz / Nowy Najemca** (incoming tenant),
- **Wynajmujący / Właściciel** (landlord — giving consent in the same document).

This simultaneously satisfies the cesja, the przejęcie długu, and the written consent requirement, and
fixes the **handover date** from which the new tenant takes over rights and obligations.

### Mandatory vs recommended clauses

- **Mandatory:** identification of all three parties; identification of the original lease (date, parties,
  flat address); precise scope of what is transferred (all rights + all obligations from date X);
  **landlord's written consent**; effective/handover date; written form + signatures.
- **Strongly recommended:** deposit handling (see below); settlement of arrears as of the transfer date;
  statement that the original lease terms continue unchanged for the new tenant; protokół zdawczo-odbiorczy
  between outgoing and incoming tenant (+ meter readings); release of the outgoing tenant from future
  liability; handover of keys and documents.

### Kaucja in a cesja

There is no single correct rule — it must be expressly agreed. Two common models, both should be stated
explicitly:

- **(A)** Landlord returns the deposit to the outgoing tenant and collects a fresh deposit from the
  incoming tenant; **or**
- **(B)** The incoming tenant reimburses the deposit directly to the outgoing tenant and "inherits" the
  deposit already held by the landlord.
  ⚠️ Whichever is chosen, the landlord must be a party to / acknowledge it, and the protokół fixes the flat's
  condition so the deposit is not unfairly charged against the new tenant for pre-existing wear.

### Media / utilities, meldunek

- Re-register utility/account holders (prąd, gaz, internet, wspólnota/spółdzielnia) as of the transfer date;
  read meters into the protokół.
- New tenant handles their own meldunek (30 dni).

### Common pitfalls / what protects each party

- **Outgoing tenant:** without the landlord's written consent + an explicit release, they may **remain
  liable** for rent and damage caused by the new tenant. Get a clear "zwolnienie z długu / od
  odpowiedzialności" and a signed protokół.
- **Incoming tenant:** must verify the **original lease terms** they are stepping into (rent, term, notice,
  whether it is najem okazjonalny with notarial enforcement obligations, any arrears, deposit amount held).
- **Landlord:** wants to vet the incoming tenant's solvency before consenting; should avoid blanket consent.

### ⚠️ Must be verified by a lawyer

- Whether the original lease forbids or conditions assignment, and whether it is **najem okazjonalny**
  (art. 19a–19e) — if so, the incoming tenant likely needs to repeat the **notarial submission to
  enforcement** and indicate a replacement dwelling; a simple cesja will **not** carry these over.
- Exact wording of the release of the outgoing tenant and the deposit mechanics.
- Whether any landlord pre-consent in the original lease is valid or must be re-given case-specifically.

---

## 2. `sublet` — Umowa podnajmu (sublease)

### What it legally is

A sublease: the main tenant (Najemca / **Podnajmujący**) gives the flat (or part of it) for use to a third
party (**Podnajemca**) for rent, while the main lease stays in force. The main tenant stays in the
relationship with the landlord. Legal basis: **art. 668 k.c.** (general) and the residential-specific
**art. 668² k.c.** (often cited as art. 688² — the residential lease rule on consent).

### 🔴 Landlord consent — the critical finding

**Art. 668² k.c.: without the landlord's consent, a residential tenant may NOT give the flat (or part of
it) for free use or sublease it.** The only statutory exception: a person toward whom the tenant has a
**maintenance obligation (obowiązek alimentacyjny)** — e.g. their child — needs no consent.

- **Form of consent:** the statute does not require a specific form, but **written consent is strongly
  recommended for evidentiary purposes** (na wypadek sporu). Consent can be limited to a specific named
  sub-tenant.
- **Consequence of subletting without consent:** it is a **breach of the main lease**; the landlord may
  **terminate** the lease (with a one-month notice, even under tenant-protection rules).
- ⚠️ **Validity nuance:** a sublease entered without the required consent is generally **not automatically
  void** (art. 58 § 1 k.c.); it is commonly treated as concluded under a **suspensive condition (warunek
  zawieszający)** — namely obtaining the landlord's written consent. Lawyer to confirm the framing.

### Key statutory effects (art. 668 k.c.)

- **§ 1:** both the main tenant **and** the sub-tenant are liable to the landlord for using the flat in line
  with the main lease. → The sub-tenant must be bound to respect the main lease terms.
- **§ 2:** the sublease **ends at the latest when the main lease ends** — even if the sublease term is
  longer. The sub-tenant must be warned of this dependency.

### Mandatory vs recommended clauses

- **Mandatory:** parties; flat / part of flat being sublet; term (and the art. 668 § 2 dependency on the
  main lease); rent + payment terms; **landlord's consent** (attached or referenced); written form.
- **Recommended:** kaucja; utilities/media split; deposit return; house rules; statement that the
  sub-tenant has read and accepts the main lease; protokół zdawczo-odbiorczy + meters; termination grounds;
  liability and insurance; max occupancy.

### Kaucja, media, meldunek, protokół

- **Kaucja:** freely agreed; safe analogy is to keep it modest (1–2× rent). ⚠️ Apply u.o.p.l. limits with
  caution in a sublease (see §0).
- **Media:** specify which utilities are included in rent vs paid on top, and how readings/settlement work.
- **Meldunek:** sub-tenant may register for the sublease period; confers no occupancy right beyond the
  agreement; depends on main lease/landlord arrangements.
- **Protokół:** between Podnajmujący and Podnajemca at start and end; fixes condition + meters for deposit.

### Common pitfalls / what protects each party

- **Sub-tenant:** their right is **derivative** — if the main lease ends, they must leave. They should see
  the main lease and the landlord's consent, and confirm the sublease term ≤ the safe main-lease horizon.
- **Main tenant (Podnajmujący):** stays fully liable to the landlord; should mirror the main lease
  obligations onto the sub-tenant and take a deposit.
- **Landlord:** protected by the consent requirement; can refuse or condition consent.

### ⚠️ Must be verified by a lawyer

- Whether the main lease bans subletting outright (then even consent may need a lease amendment).
- The suspensive-condition framing and the exact consent wording.
- Tax treatment of sublease income for the main tenant.

---

## 3. `roommate` — Umowa współlokatorska (roommate / flat-share)

### What it legally is

The most flexible of the three and the one with the **weakest single statutory base**. "Współlokator" is
defined in u.o.p.l. (art. 2) as a lokator who holds a legal title to use the flat **jointly** with another.
In practice a flat-share is set up in one of several ways, and the right template depends on which:

1. **Co-tenancy (współnajem):** all flatmates sign the lease **with the landlord** as joint tenants. The
   "umowa współlokatorska" is then an **internal cost-sharing + house-rules agreement** between flatmates
   (who pays what share of rent/media, deposit split, chores, leaving rules). It does **not** bind the
   landlord and does **not** create a tenancy by itself.
2. **One main tenant takes in a roommate:** legally this is effectively a **podnajem or użyczenie**, so the
   **landlord's consent under art. 668²/688² k.c. is required** (see §2). Use the sublease template plus an
   internal agreement, not a bare roommate agreement.
3. **Separate per-room leases** with the landlord (common in najem na pokoje): each room has its own lease;
   the roommate agreement again governs shared spaces and shared costs.

⚠️ This is the biggest source of confusion: a "roommate agreement" between two people **cannot grant a
right to occupy** a flat that one of them does not control. Our template is drafted as an **internal
cost-sharing and coexistence agreement (umowa o wspólnym korzystaniu z lokalu / podziale kosztów)** and
explicitly states it does not replace the lease and does not bypass the landlord-consent rules.

### Landlord consent

- **Co-tenants on one lease (model 1):** no extra consent needed for the internal agreement itself, but
  adding/removing a person on the lease needs the landlord.
- **Taking in a roommate (model 2):** **landlord consent required** (art. 668²/688² k.c.), unless the person
  is one toward whom the tenant has a maintenance obligation.

### Mandatory vs recommended clauses (internal agreement)

- **Mandatory-ish:** parties (all flatmates); the flat + which rooms are private vs shared; reference to the
  underlying lease(s) and the landlord arrangement; **split of rent, media and other costs** and payment
  mechanics; term and how someone moves out / is replaced.
- **Recommended:** deposit pooling and return between flatmates; house rules (guests, quiet hours,
  cleaning, pets, smoking); handling of joint purchases; dispute resolution; what happens if one stops
  paying (joint-and-several liability awareness); inventory of shared items; protokół for shared spaces.

### Kaucja, media, meldunek, protokół

- **Kaucja:** typically the flatmates pool the landlord's deposit; the agreement records each person's
  contribution and how it is returned when someone leaves (after deducting their share of any damage/arrears).
- **Media:** define the split method (equal / by room size / by metered use) and the settlement cadence.
- **Meldunek:** each flatmate handles their own; confers no rights beyond their title.
- **Protokół:** shared-space condition + meters; per-room protocol if private rooms.

### Common pitfalls / what protects each party

- **Joint-and-several liability:** co-tenants on one lease are usually **solidarnie** liable to the landlord
  — if one stops paying, the others can be pursued for the whole rent. The internal agreement should make
  this explicit and set recourse between flatmates.
- A roommate with **no title** (informal) has weak protection; the agreement should be honest about this and
  point them to either co-tenancy or a proper sublease.

### ⚠️ Must be verified by a lawyer

- Which of the three structures applies, and whether the underlying lease permits it.
- Enforceability of the internal cost-share against a non-paying flatmate.
- Whether model 2 triggers podnajem rules and tax consequences.

---

## Sources consulted (verify against ISAP for the authoritative text)

- Kodeks cywilny, art. 509, 510, 511, 514, 519, 522 — arslege.pl/kodeks-cywilny, dlajurysty.pl/prawo/art/509kc
  (ISAP: isap.sejm.gov.pl, Dz.U. 1964 nr 16 poz. 93).
- Art. 668 / 668² (688²) k.c. — arslege.pl (Tytuł XVII. Najem i dzierżawa); poradnikprzedsiebiorcy.pl;
  kodekscywilny.pl ("Kiedy dopuszczalna umowa podnajmu mieszkania?"); mikroporady.pl (umowa podnajmu lokalu).
- Przeniesienie ogółu praw i obowiązków = cesja + przejęcie długu, landlord consent required —
  prawo.pl ("Potrzebna zgoda wynajmującego gdy przenosimy umowę na inny podmiot"); bdrp.pl (umowa cesji);
  SN II CSK 456/19 (via ulgomat.pl encyklopedia, przejęcie długu).
- Najem okazjonalny, art. 19a–19e u.o.p.l. — laws.pl; sfera-nieruchomosci.pl; mikulski.krakow.pl;
  samorzad.pap.pl (tekst jednolity u.o.p.l.).
- Kaucja (art. 6 u.o.p.l., 12×/6×, 30-day return, waloryzacja) — adwokat360.pl; gazetaprawna.pl;
  zarzadzanienajmem.eu; link4.pl.
- Protokół zdawczo-odbiorczy (art. 6c u.o.p.l.) — houser.pl; rentli.pl; axeco.pl; rentmasters.pl.

_Last verified: 2026-05 via web search. Legal acts change — re-verify before launch._
