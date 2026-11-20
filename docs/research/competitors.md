# Competitive analysis

Translated from COMPETITORS.md (Russian, last edited 2026-06-21). Facts are as of their original dates and have not been re-checked.

Strategic conclusions are marked with the month they were written, taken from the git history of COMPETITORS.md.

## Direct competitors (Poland)

### Rentspect

- **Website:** rentspect.com
- **What it does:** reviews of flats by address (PL, UA, US, Moldova)
- **Traction:** practically zero — 1 property found in Kraków, with 2 reviews
- **Conclusion (as of 2026-05):** the idea is there, the execution is dead. The focus is on reviews, not on replacement/costs

### Otodom

- **Website:** otodom.pl
- **What it does:** the largest real-estate listings marketplace in Poland
- **What it does NOT do:** no real costs, no reviews, no tenant replacement
- **23K+ active listings** (January 2026)
- **Risk (as of 2026-05):** it may copy the feature, but marketplaces usually do not move into review/transparency

### Flatka (flatka.pl) — added 2026-06

- **Website:** flatka.pl
- **What it does:** a meta-search engine/aggregator of listings on top of OLX + Otodom. 30K+ flats in one place, AI dedup of cross-posts (shows the cheapest duplicate with merged photos), search "in plain human language", commute shape on the map. Freemium (alerts/history are paid).
- **What it does NOT do:** no real costs/komunalki, no reviews, no data on "what tenants pay". They state it directly: they are not an agent, they **do not verify listings and do not guarantee accuracy**.
- **Maturity:** a real product in discovery, noticeably more mature than our listings.
- **Relation to us (as of 2026-06):** mostly a **different direction** — Flatka = "find a flat" (discovery on the ASK prices of listings), Passflat = "understand the real price" (transparency on tenants' PAY data). They are stronger in search → do not compete there. Our moat is real payments + komunalka, which a listings aggregator structurally does not have.
- **Threat (as of 2026-06):** if they add "is the price fair" on top of search, that is a move into our territory; but for that they need a community-cost engine (our cold-start moat).
- **Positioning against them (as of 2026-06):** "Flatka — how much they ASK. Passflat — how much people actually PAY." («Flatka — сколько ПРОСЯТ. Passflat — сколько реально ПЛАТЯТ.»)

### Rendin / simpl.rent

- **What they do:** a safe rental process, verification, contracts
- **Overlap (as of 2026-05):** minimal — they are about the process, we are about data/transparency

## Analogues worldwide — Rental reviews

| Platform           | Country        | Users        | Price    | What it does                                                                                               |
| ------------------ | -------------- | ------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| **Openigloo**      | USA (NYC)      | 3M+          | Freemium | Reviews of buildings + city data (violations, bedbugs, court cases). The best case. Launched B2B (IglooIQ) |
| **Rebo**           | USA (VA/MD/DC) | 50K+         | Free     | Verified reviews, maps, photos                                                                             |
| **Lease Lounge**   | International  | 10K+ reviews | Free     | Two-way reviews (tenant ↔ landlord)                                                                        |
| **RateMyLandlord** | USA            | Unknown      | Free     | Landlord search by name/address                                                                            |
| **Doorskor**       | USA            | Unknown      | Free     | Reviews of buildings and landlords                                                                         |
| **Rentalk**        | Australia      | Unknown      | Free     | Reviews of condition, responsiveness                                                                       |
| **RentWise**       | International  | Unknown      | Free     | AI analytics, anonymous reviews                                                                            |
| **The Find**       | USA (NYC)      | Unknown      | Free     | Early access + reviews from verified tenants                                                               |

## Analogues — Cost transparency

| Platform           | Country | What it does                                     |
| ------------------ | ------- | ------------------------------------------------ |
| **apartments.fyi** | USA     | Decodes the full cost: rent + additional charges |
| **Utilio**         | USA     | Anonymous utilities data by ZIP code             |
| **RentSpy**        | USA     | Real rental prices and lease data                |

## Analogues — Tenant Replacement / Lease Transfer

| Platform                | Country                      | What it does                                   |
| ----------------------- | ---------------------------- | ---------------------------------------------- |
| **LeaseSwap**           | USA (Chicago)                | Marketplace for short leases, 1K+ MAU          |
| **Apartment.app**       | USA (NYC, Brooklyn, Chicago) | Listings from departing tenants, no broker fee |
| **Project Havenbridge** | USA                          | Lease-exit service for 1.5x the rent           |
| **SwapFlat**            | Germany                      | Student project for swapping flats             |
| **HomeSwapping**        | UK                           | Social housing swaps                           |

## Key conclusions

1. **Our differentiator is tenants' real costs** (rent + komunalka, district medians), and after that **agency reputation** (pillar 2). Nobody combines real payments with agency reputation. _(Tenant replacement as a product was FROZEN in 2026-06 and is no longer our differentiator; the replacement tables below are kept as market context.)_ _(As of 2026-06.)_

2. **Europe is empty.** All the serious players are in the USA (Openigloo, Rebo, LeaseSwap). In Poland, Rentspect is dead. In Germany, SwapFlat is a student project. _(As of 2026-05.)_

3. **Openigloo is the best case to study.** 3M+ users. The key to its success: it pulled in public data (violations, court cases) to solve the cold start. _(As of 2026-05.)_

4. **The contribute-to-unlock model (Utilio) is validated.** People are willing to share data about their costs in exchange for access to other people's data. _(As of 2026-05.)_

5. **Apartment.app is the closest analogue** for tenant replacement. It works only in the USA. _(As of 2026-05.)_

## Polish market

- **1.68M flats** on the private rental market (+39% since 2020)
- **92% of landlords** own 1-2 flats
- **50% of listings** are concentrated in 6 cities: Warszawa, Kraków, Tricity, Wrocław, Łódź, Poznań
- **January 2026:** 23.6K listings on Otodom, 15.6K new listings/month
- The market is professionalising, the grey segment is shrinking

## Facebook/Telegram groups (launch channels)

### Facebook — Warsaw

| Group                                                              | Members |
| ------------------------------------------------------------------ | ------- |
| Warszawa – pokoje / mieszkania wynajem                             | 208K    |
| Warszawa wynajmę mieszkanie/pokój, szukam mieszkania/współlokatora | 130K    |
| Wynajem mieszkanie / pokój w Warszawie                             | 126K    |
| Nieruchomości w Warszawie (wynajem, sprzedaż)                      | 43K     |
| Pokoje do wynajęcia w Warszawie                                    | 37K     |
| Warsaw Apartments 4 Rent                                           | Unknown |

### Telegram — Warsaw

| Channel                        | Members | Audience |
| ------------------------------ | ------- | -------- |
| @warszawa_nasza_home           | 20K     | RU/UA    |
| @mieszkanie_w_warszawe_RIEL_GO | 11.6K   | RU/UA    |
| @warszawakvartira              | 3.8K    | RU/PL    |
| @rentapartaments_waw           | Unknown | PL/RU/UA |

### Facebook — other cities

| City    | Group                                    | Members |
| ------- | ---------------------------------------- | ------- |
| Wrocław | Mieszkania i pokoje do wynajęcia Wrocław | 80K     |
| Wrocław | Wrocław – Mieszkania i Pokoje            | 34K     |
| Kraków  | Arenda Kraków                            | Unknown |
