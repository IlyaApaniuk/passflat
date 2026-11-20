import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN } from './honesty-rules';

// Spec 03 §Marketing copy (FR-31, D25): marketing keys use "costs tenants
// reported" / "reported costs" wording; none says "verified", "checked by
// tenants", "actually pay" or "returned in full" about reported figures.
// The claim words per locale are shared with the guide tests (spec 09 §Honesty keys under test).

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, unknown>,
  ]),
) as Record<Locale, Record<string, unknown>>;

function leaves(value: unknown, prefix = ''): Array<[string, string]> {
  if (value === null || typeof value !== 'object') return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

const valueAt = (locale: Locale, path: string) =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], {
    ...messages[locale],
  });

/** The home "how it works" and FAQ keys rewritten or added by PRD 4 FR-15 (spec 08). */
const HOW_IT_WORKS_KEYS = [
  'landing.howItWorks.subtitle',
  ...[1, 2, 3, 4].flatMap((n) =>
    ['Title', 'Desc'].map((field) => `landing.howItWorks.roommate.step${n}${field}`),
  ),
  'landing.faq.q7',
  'landing.faq.a7',
];

/**
 * The Help "What is Passflat?" answer and the About copy rewritten by PRD 4 FR-15
 * (spec 08). `helpCenter.general.a2` ("Is Passflat free?") is a price statement and
 * stays with FR-16 (Q-3).
 */
const HELP_ABOUT_KEYS = [
  'helpCenter.general.a1',
  ...[1, 2, 3].flatMap((n) =>
    ['Title', 'Desc'].map((field) => `about.solution.pillar${n}${field}`),
  ),
  'about.team.description2',
  'about.values.principle1Desc',
];

/**
 * The cost pages' titles and descriptions and the two cost CTAs rewritten by PRD 4 FR-21, part 1
 * (spec 09 §Honesty keys under test; appendix seo.md tables B, C and G).
 */
const COST_PAGE_KEYS = [
  'costsSeo.buildingMetaTitle',
  'costsSeo.buildingMetaDescription',
  'costsSeo.districtMetaTitle',
  'costsSeo.districtMetaDescription',
  'costsSeo.cityMetaTitle',
  'calculator.metaTitle',
  'calculator.metaDescription',
  'listings.demandCapture.costCtaTitle',
  'listings.detail.buildingCostHint',
];

/** The spec's list as found on 2026-11-19, plus the keys the en.json search found with it. */
const REWRITTEN_KEYS = [
  'landing.hero.subtitle',
  'landing.hero.trustRealCostDesc',
  'landing.hero.trustVerified',
  'landing.hero.trustVerifiedDesc',
  'landing.hero.statsDeposit',
  'landing.bentoGrid.realCostDataDesc',
  'landing.costTransparency.subtitle',
  'landing.costTransparency.anonymousVerified',
  'landing.costTransparency.communityVerified',
  'landing.faq.a5',
  'landing.checkAddress.subtitle',
  'landing.checkAddress.pointCosts',
  'share.landingHeading',
  'share.cardTitleArea',
  'share.cardTitleGeneric',
  'rentReport.storyReality',
  'rentReport.storyNotException',
  'rentReport.faqA1',
  'rentReport.faqA3',
  'rentReport.kaucjaReturnedLabel',
  'checker.subtitle',
  'checker.result.checkedAddress',
  'costsSeo.cityMetaDescription',
  'costsSeo.cityH1',
  'costsSeo.districtIntro',
  'costsSeo.buildingMetaDescriptionWithData',
  'costs.subtitle',
  'costs.overview.title',
  // costs.building.lookingForApartmentDesc was deleted by PRD 4 FR-11 (spec 08 §Callout placements).
  'howItWorksPage.seekers.step1Title',
  'blog.topic4Desc',
  'helpCenter.costTransparency.a1',
  'listings.roommateMetaDescription',
  // PRD 4 FR-3 (spec 08 §Roommate page shell and metadata).
  'listings.titleRoommate',
  'listings.roommateH1',
  // PRD 4 FR-10 (spec 08 §Home copy); landing.hero.subtitle is above.
  'meta.homeTitle',
  'meta.homeDescription',
  'landing.footer.tagline',
  'landing.hero.costsCta',
  'landing.tools.templatesDescription',
  // PRD 4 FR-12 (spec 08 §Callout placements).
  'blog.ctaText',
  // PRD 4 FR-13 (spec 08 §Per-person line): the bot's roomSplit wording.
  'listings.flatmateCallout.perPerson',
  // PRD 4 FR-15 (spec 08 §How it works, Help and About); about.values.principle1Desc
  // is owned here, not by spec 09 §Honesty keys.
  ...HOW_IT_WORKS_KEYS,
  ...HELP_ABOUT_KEYS,
  // PRD 4 FR-21, part 1 (spec 09 §Honesty keys under test).
  ...COST_PAGE_KEYS,
];

/**
 * `<locale>:<key>` entries of REWRITTEN_KEYS whose value matches FORBIDDEN in a sense that is
 * not a claim about figures (for example a disclaimer telling the reader to check the real
 * bill), each with a one-line reason. Never loosen a pattern instead. Empty on 2026-11-20: the
 * wider lists of spec 09 flagged no rewritten value.
 */
const ALLOWED_KEY_MATCHES: Record<string, string> = {};

/** The home keys rewritten by PRD 4 FR-10 (spec 08 §Home copy), cost-first positioning kept. */
const HOME_COPY_KEYS = [
  'meta.homeTitle',
  'meta.homeDescription',
  'landing.footer.tagline',
  'landing.hero.costsCta',
  'landing.hero.subtitle',
  'landing.tools.templatesDescription',
];

/**
 * The "real" family and "the full truth" (D25), per locale. "Truth" needs a word
 * start: "sprawdzenie" (a check) contains "prawd".
 */
const REAL_OR_TRUTH: Record<Locale, RegExp> = {
  en: /\breal\b|truth|true price/i,
  pl: /realn|(^|[^a-ząćęłńóśźż])prawd/i,
  ru: /реальн|(^|[^а-яё])правд|настоящ/i,
  uk: /реальн|(^|[^а-яіїєґ'ʼ])правд|справжн/i,
};

/** Listings, frozen and not promoted (D5). */
const LISTINGS: Record<Locale, RegExp> = {
  en: /listing/i,
  pl: /ogłosze/i,
  ru: /объявлен/i,
  uk: /оголошен/i,
};

/** Document templates, which the hero subtitle no longer names. */
const TEMPLATES: Record<Locale, RegExp> = {
  en: /template/i,
  pl: /wzor|wzór/i,
  ru: /шаблон/i,
  uk: /шаблон/i,
};

/** The cost sentence the hero subtitle keeps. */
const SUBTITLE_COST_SENTENCE: Record<Locale, string> = {
  en: 'See the costs tenants reported — before the deal.',
  pl: 'Sprawdź koszty zgłoszone przez najemców — przed decyzją.',
  ru: 'Посмотри, о каких расходах сообщили жильцы, — до сделки.',
  uk: 'Подивись, про які витрати повідомили мешканці, — до угоди.',
};

/** The roommate page's title, description and h1 (PRD 4 FR-3, appendix seo.md table A, §8). */
const ROOMMATE_SHELL_KEYS = [
  'listings.titleRoommate',
  'listings.roommateMetaDescription',
  'listings.roommateH1',
];

/** The home framing keys rewritten by PRD 4 FR-6 (spec 08 §Home framing surfaces, §8). */
const HOME_FRAMING_KEYS = [
  ...['rentTogether', 'findRoom', 'checkFlat'].flatMap((card) =>
    ['title', 'description', 'cta'].map((field) => `landing.forWhom.${card}.${field}`),
  ),
  'landing.cta.subtitle',
  'landing.cta.freeNote',
  'errors.notFound.browse',
];

/** "Free" in any locale: whether snippets may say so is Q-12, held by a blocked task. */
const FREE: RegExp = /\bfree\b|bezpłat|darmow|za darmo|бесплатн|безкоштовн|безплатн/i;

/** A promised match, date or result (EN wording; the other locales are the same drafts). */
const PROMISE: Record<Locale, RegExp> = {
  en: /guarantee|we will|we'll|you will|you'll|within \d|in \d+ (day|week)|match(ed)? you/i,
  pl: /gwarant|znajdziemy|znajdziesz|w ciągu \d|dopasujemy/i,
  ru: /гарантир|найдём|найдем|найдёшь|найдешь|за \d+ (дн|недел)|подберём|подберем/i,
  uk: /гарант|знайдемо|знайдеш|за \d+ (дн|тижн)|підберемо/i,
};

/** "Actual" as a quality claim; FORBIDDEN catches "actually" but not the adjective. */
const ACTUAL: Record<Locale, RegExp> = {
  en: /actual/i,
  pl: /faktyczn|rzeczywist/i,
  ru: /фактическ|действительн/i,
  uk: /фактичн|дійсн/i,
};

/** The room and flatmate words the district description adds only with the district section. */
const ROOMS_OR_FLATMATES: Record<Locale, RegExp> = {
  en: /room|flatmate/i,
  pl: /pok[oó]j|współlokator/i,
  ru: /комнат|сосед/i,
  uk: /кімнат|сусід/i,
};

/**
 * en.json matches of the spec's search ("verified", "checked", "actually",
 * "in full") that are not claims about reported figures.
 */
const ALLOWED_EN_MATCHES: Record<string, string> = {
  'landing.bentoGrid.depositReturnDesc':
    'describes the form: whether the deposit came back in full',
  'rentReport.kaucjaCta': 'title of the deposit guide, advice rather than a figure',
  'costs.submit.depositFull': 'answer option of the submit form',
  'howItWorksPage.testimonials.t3Text':
    'a tenant checking reports before signing, not a verification claim',
  'helpCenter.payments.a2': 'legal text: services provided in full',
  'termsPage.payments.immediate': 'legal text: services provided in full',
  'termsPage.payments.serviceOutcome': 'legal text: services provided in full',
  'termsPage.withdrawal.p2': 'legal text: services provided in full',
};

describe('honesty copy (spec 03 §Marketing copy)', () => {
  it('every rewritten key exists in all four locales', () => {
    for (const locale of LOCALES) {
      for (const key of REWRITTEN_KEYS) {
        expect(typeof valueAt(locale, key), `${locale}: ${key}`).toBe('string');
      }
    }
  });

  it('no rewritten key claims verified, checked, real or market figures, or returns in full', () => {
    for (const locale of LOCALES) {
      for (const key of REWRITTEN_KEYS) {
        if (`${locale}:${key}` in ALLOWED_KEY_MATCHES) continue;
        expect(valueAt(locale, key) as string, `${locale}: ${key}`).not.toMatch(FORBIDDEN[locale]);
      }
    }
  });

  it('every allowed match is a rewritten key that still matches, with a reason', () => {
    for (const [entry, reason] of Object.entries(ALLOWED_KEY_MATCHES)) {
      const [locale, key] = entry.split(':') as [Locale, string];
      expect(LOCALES, entry).toContain(locale);
      expect(REWRITTEN_KEYS, entry).toContain(key);
      expect(valueAt(locale, key) as string, entry).toMatch(FORBIDDEN[locale]);
      expect(reason.trim().length, entry).toBeGreaterThan(0);
    }
  });

  it('the shared lists keep every earlier word and lookahead and catch the wider family', () => {
    const caught: Record<Locale, string[]> = {
      en: [
        'verified',
        'checked',
        'actually',
        'really',
        'in full',
        'real costs',
        'Real rental costs',
        'market prices',
        'the truth',
      ],
      pl: [
        'zweryfikowane',
        'sprawdzone',
        'naprawdę',
        'realne koszty',
        'faktycznie',
        'w całości',
        'rzeczywiste koszty',
        'prawdziwa cena',
        'ceny rynkowe',
        'na rynku najmu',
      ],
      ru: [
        'проверенные',
        'на самом деле',
        'реальные расходы',
        'по факту',
        'полностью',
        'настоящая цена',
        'рыночные цены',
      ],
      uk: [
        'перевірені',
        'насправді',
        'реальні витрати',
        'за фактом',
        'повністю',
        'справжня ціна',
        'ринкові ціни',
      ],
    };
    const passed: Record<Locale, string[]> = {
      en: ['fully or partly', 'reported costs', 'realistic budget', 'sprawdzenie'],
      pl: ['w całości lub częściowo', 'zgłoszone koszty', 'sprawdzenie adresu'],
      ru: ['полностью или частично', 'расходы по отчётам'],
      uk: ['повністю або частково', 'витрати за звітами'],
    };
    for (const locale of LOCALES) {
      for (const text of caught[locale]) expect(text, locale).toMatch(FORBIDDEN[locale]);
      for (const text of passed[locale]) expect(text, locale).not.toMatch(FORBIDDEN[locale]);
    }
    // Shared patterns carry no `g` flag, so repeated tests give the same answer.
    for (const locale of LOCALES) expect(FORBIDDEN[locale].flags, locale).not.toContain('g');
  });

  it('the cost-page titles, descriptions and CTAs (PRD 4 FR-21): no claim, "actual", market or percentage', () => {
    expect(COST_PAGE_KEYS).toHaveLength(9);
    for (const locale of LOCALES) {
      for (const key of COST_PAGE_KEYS) {
        const value = valueAt(locale, key) as string;
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        expect(value, `${locale}: ${key}`).not.toMatch(FORBIDDEN[locale]);
        expect(value, `${locale}: ${key}`).not.toMatch(REAL_OR_TRUTH[locale]);
        expect(value, `${locale}: ${key}`).not.toMatch(ACTUAL[locale]);
        expect(value, `${locale}: ${key}`).not.toMatch(/market|rynk|рын|ринк/i);
        expect(value, `${locale}: ${key}`).not.toMatch(/%|procent|процент|відсот/i);
        expect(value, `${locale}: ${key}`).not.toMatch(FREE);
        expect(value, `${locale}: ${key}`).not.toMatch(PROMISE[locale]);
      }
      // The templates keep their placeholders; the calculator names Warsaw literally (D6).
      for (const key of ['costsSeo.buildingMetaTitle', 'costsSeo.buildingMetaDescription']) {
        const value = valueAt(locale, key) as string;
        expect(value, `${locale}: ${key}`).toContain('{address}');
        expect(value, `${locale}: ${key}`).toContain('{city}');
      }
      for (const key of ['costsSeo.districtMetaTitle', 'costsSeo.districtMetaDescription']) {
        const value = valueAt(locale, key) as string;
        expect(value, `${locale}: ${key}`).toContain('{district}');
        expect(value, `${locale}: ${key}`).toContain('{city}');
      }
      expect(valueAt(locale, 'costsSeo.cityMetaTitle') as string, locale).toContain('{city}');
      for (const key of ['calculator.metaTitle', 'calculator.metaDescription']) {
        const value = valueAt(locale, key) as string;
        expect(value, `${locale}: ${key}`).not.toContain('{');
        expect(value, `${locale}: ${key}`).toMatch(/Warsz|Warsaw|Варшав/);
      }
      // The shorter table C variant until the district section ships (spec 09 §District section).
      expect(valueAt(locale, 'costsSeo.districtMetaDescription') as string, locale).not.toMatch(
        ROOMS_OR_FLATMATES[locale],
      );
      expect(valueAt(locale, 'listings.detail.buildingCostHint') as string, locale).not.toContain(
        '{',
      );
      expect(
        valueAt(locale, 'listings.demandCapture.costCtaTitle') as string,
        locale,
      ).not.toContain('{');
    }
  });

  it('the building page without a figure: no report yet, a district or Warsaw reference with its group and N (table B)', () => {
    expect(valueAt('en', 'costsSeo.buildingMetaTitle')).toBe(
      '{address}, {city} — reported rental costs',
    );
    expect(valueAt('en', 'costsSeo.buildingMetaDescription')).toBe(
      '{address}, {city}: no report for this building yet — we show the district or Warsaw reference with its group and N. Add your own costs.',
    );
    const parts: Record<Locale, RegExp[]> = {
      en: [/no report for this building yet/, /district or Warsaw/, /group and N/],
      pl: [/brak zgłoszeń dla tego budynku/, /dzielnicy lub Warszawy/, /z grupą i liczbą zgłoszeń/],
      ru: [/отчётов по этому дому пока нет/, /по району или Варшаве/, /с группой и числом N/],
      uk: [/звітів по цьому будинку ще немає/, /по району або Варшаві/, /з групою і числом N/],
    };
    for (const locale of LOCALES) {
      const value = valueAt(locale, 'costsSeo.buildingMetaDescription') as string;
      for (const part of parts[locale]) expect(value, locale).toMatch(part);
      // No figure in this variant: no number, no currency.
      expect(value, locale).not.toMatch(/\d|zł|PLN/);
    }
  });

  it('the district, city and calculator EN drafts (tables C and G)', () => {
    expect(valueAt('en', 'costsSeo.districtMetaTitle')).toBe(
      '{district}, {city} — rent costs and room prices',
    );
    expect(valueAt('en', 'costsSeo.districtMetaDescription')).toBe(
      'Rent costs in {district}, {city} as reported: rent, utilities and deposits building by building.',
    );
    expect(valueAt('pl', 'costsSeo.districtMetaTitle')).toBe(
      '{district}, {city} — koszty najmu i pokoju',
    );
    expect(valueAt('en', 'costsSeo.cityMetaTitle')).toBe(
      '{city}: reported rental costs by district',
    );
    expect(valueAt('en', 'calculator.metaTitle')).toBe(
      'Warsaw rent calculator: rent plus utilities per month',
    );
    expect(valueAt('en', 'calculator.metaDescription')).toBe(
      "Estimate a month of renting in Warsaw: the district's median rent with its source and N plus utilities at Warsaw tariffs: czynsz, heating, water, internet.",
    );
    expect(valueAt('pl', 'calculator.metaTitle')).toBe(
      'Kalkulator kosztów najmu w Warszawie: czynsz i media',
    );
  });

  it('the deposit claims say "got it back, fully or partly" with both counts', () => {
    expect(valueAt('en', 'rentReport.faqA3')).toContain('got the deposit back, fully or partly');
    expect(valueAt('en', 'landing.hero.statsDeposit')).toContain('got it back, fully or partly');
    expect(valueAt('en', 'rentReport.kaucjaReturnedLabel')).toContain('fully or partly');
    for (const locale of LOCALES) {
      for (const key of ['rentReport.faqA3', 'landing.hero.statsDeposit']) {
        const value = valueAt(locale, key) as string;
        expect(value, `${locale}: ${key}`).toContain('{gotBack}');
        expect(value, `${locale}: ${key}`).toContain('{answered}');
        expect(value, `${locale}: ${key}`).not.toContain('{pct}');
      }
    }
  });

  it('the roommate page title, description and h1 (PRD 4 FR-3): no "free", no promise, Warsaw named', () => {
    for (const locale of LOCALES) {
      for (const key of ROOMMATE_SHELL_KEYS) {
        const value = valueAt(locale, key) as string;
        expect(value, `${locale}: ${key}`).not.toMatch(FREE);
        expect(value, `${locale}: ${key}`).not.toMatch(PROMISE[locale]);
        // The city is literal ("w Warszawie"), never a nominative {city} placeholder (spec 09).
        expect(value, `${locale}: ${key}`).not.toContain('{');
        expect(value, `${locale}: ${key}`).toMatch(/Warsz|Warsaw|Варшав/);
      }
    }
    // The ranking query stays the first words of the Polish title.
    expect(valueAt('pl', 'listings.titleRoommate')).toMatch(/^Szukam współlokatora/);
  });

  it('the home framing keys (PRD 4 FR-6): no "free", no promise, no placeholder', () => {
    for (const locale of LOCALES) {
      for (const key of HOME_FRAMING_KEYS) {
        const value = valueAt(locale, key);
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        expect(value as string, `${locale}: ${key}`).not.toMatch(FREE);
        expect(value as string, `${locale}: ${key}`).not.toMatch(PROMISE[locale]);
        expect(value as string, `${locale}: ${key}`).not.toContain('{');
      }
    }
  });

  it('the home copy (PRD 4 FR-10): no "real", no "truth", no listings, no "free", no placeholder', () => {
    for (const locale of LOCALES) {
      for (const key of HOME_COPY_KEYS) {
        const value = valueAt(locale, key);
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        expect(value as string, `${locale}: ${key}`).not.toMatch(REAL_OR_TRUTH[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(LISTINGS[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(FREE);
        expect(value as string, `${locale}: ${key}`).not.toMatch(PROMISE[locale]);
        expect(value as string, `${locale}: ${key}`).not.toContain('{');
      }
    }
  });

  it('the how-it-works and FAQ keys (PRD 4 FR-15): no price, date, listing, claim, promise or "free"', () => {
    expect(HOW_IT_WORKS_KEYS).toHaveLength(11);
    for (const locale of LOCALES) {
      for (const key of HOW_IT_WORKS_KEYS) {
        const value = valueAt(locale, key);
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        // A price or a date needs a digit or a currency; none of these keys has one.
        expect(value as string, `${locale}: ${key}`).not.toMatch(/\d|PLN|zł|€/i);
        expect(value as string, `${locale}: ${key}`).not.toMatch(LISTINGS[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(FORBIDDEN[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(REAL_OR_TRUTH[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(PROMISE[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(FREE);
        expect(value as string, `${locale}: ${key}`).not.toContain('{');
      }
    }
  });

  it('the how-it-works check catches a price, a date, a listing and a promised match', () => {
    const caught = (value: string, locale: Locale) =>
      [/\d|PLN|zł|€/i, LISTINGS[locale], FORBIDDEN[locale], PROMISE[locale]].some((pattern) =>
        pattern.test(value),
      );
    expect(caught('Profiles from 39 PLN', 'en')).toBe(true);
    expect(caught('Open from 1 December', 'en')).toBe(true);
    expect(caught('Browse room listings', 'en')).toBe(true);
    expect(caught('Verified flatmates', 'en')).toBe(true);
    expect(caught('We guarantee a match', 'en')).toBe(true);
    expect(caught('Znajdziesz współlokatora', 'pl')).toBe(true);
    expect(caught('Подберём соседа', 'ru')).toBe(true);
    expect(caught('Знайдемо сусіда', 'uk')).toBe(true);
    expect(caught('Contacts open on mutual interest', 'en')).toBe(false);
  });

  it('the Help and About keys (PRD 4 FR-15): no PLN, zł, "verified", price, date, listing or promise', () => {
    expect(HELP_ABOUT_KEYS).toHaveLength(9);
    for (const locale of LOCALES) {
      for (const key of HELP_ABOUT_KEYS) {
        const value = valueAt(locale, key);
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        expect(value as string, `${locale}: ${key}`).not.toMatch(/PLN/);
        expect(value as string, `${locale}: ${key}`).not.toMatch(/zł/i);
        expect(value as string, `${locale}: ${key}`).not.toMatch(/verified/i);
        expect(value as string, `${locale}: ${key}`).not.toMatch(FORBIDDEN[locale]);
        // A price or a date needs a digit or a currency; "free" is a price statement (Q-12).
        expect(value as string, `${locale}: ${key}`).not.toMatch(/\d|€/);
        expect(value as string, `${locale}: ${key}`).not.toMatch(FREE);
        expect(value as string, `${locale}: ${key}`).not.toMatch(LISTINGS[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(REAL_OR_TRUTH[locale]);
        expect(value as string, `${locale}: ${key}`).not.toMatch(PROMISE[locale]);
        expect(value as string, `${locale}: ${key}`).not.toContain('{');
      }
    }
  });

  it('the Help and About EN drafts: the thesis first, then the costs tenants reported', () => {
    expect(valueAt('en', 'helpCenter.general.a1')).toBe(
      'Passflat helps people in Warsaw find someone to rent with (a profile in our Telegram bot) and see what renting costs per person: costs tenants reported per building and district, an address checker, a calculator, guides and document templates.',
    );
    expect(valueAt('en', 'about.values.principle1Desc')).toBe(
      'We show the figures tenants reported, with their counts — also when they are inconvenient.',
    );
    // The old principle blamed "the market"; the honesty rules never call a figure that.
    for (const locale of LOCALES) {
      expect(valueAt(locale, 'about.values.principle1Desc') as string, locale).not.toMatch(
        /market|rynk|рын|ринк/i,
      );
    }
  });

  it('the home copy keeps the cost-first positioning and the EN drafts of spec 08', () => {
    expect(valueAt('en', 'meta.homeTitle')).toBe(
      'Passflat — Warsaw rentals: reported costs, guides, documents',
    );
    expect(valueAt('en', 'meta.homeDescription')).toBe(
      'Rental costs in Warsaw as tenants reported them, by building and district, each with its number of reports; an address check, a calculator, guides and document templates.',
    );
    expect(valueAt('en', 'landing.footer.tagline')).toBe(
      'Rental costs in Warsaw as tenants reported them, with their counts; guides and document templates.',
    );
    expect(valueAt('en', 'landing.hero.costsCta')).toBe('See reported costs');
    for (const locale of LOCALES) {
      const title = valueAt(locale, 'meta.homeTitle') as string;
      // The thesis-first title is Q-6 (T125): the cost site stays first.
      expect(title, locale).toMatch(/^Passflat — /);
      for (const key of ['meta.homeTitle', 'meta.homeDescription', 'landing.footer.tagline']) {
        expect(valueAt(locale, key) as string, `${locale}: ${key}`).toMatch(/Warsz|Warsaw|Варшав/);
      }
      const subtitle = valueAt(locale, 'landing.hero.subtitle') as string;
      expect(subtitle, locale).toContain(SUBTITLE_COST_SENTENCE[locale]);
      expect(subtitle.endsWith(SUBTITLE_COST_SENTENCE[locale]), locale).toBe(true);
      expect(subtitle, locale).not.toMatch(TEMPLATES[locale]);
    }
  });

  it('the home copy patterns catch the old wording', () => {
    expect('See real costs').toMatch(REAL_OR_TRUTH.en);
    expect('the full truth on costs').toMatch(REAL_OR_TRUTH.en);
    expect('Zobacz prawdziwe koszty').toMatch(REAL_OR_TRUTH.pl);
    expect('cała prawda o kosztach').toMatch(REAL_OR_TRUTH.pl);
    expect('Realne koszty').toMatch(REAL_OR_TRUTH.pl);
    expect('sprawdzenie adresu').not.toMatch(REAL_OR_TRUTH.pl);
    expect('вся правда о расходах').toMatch(REAL_OR_TRUTH.ru);
    expect('вся правда про витрати').toMatch(REAL_OR_TRUTH.uk);
    expect('Смотреть реальные расходы').toMatch(REAL_OR_TRUTH.ru);
    expect('Узнай настоящую цену').toMatch(REAL_OR_TRUTH.ru);
    expect('Дізнайся справжню ціну').toMatch(REAL_OR_TRUTH.uk);
    expect('costs, listings, documents').toMatch(LISTINGS.en);
    expect('koszty, ogłoszenia, dokumenty').toMatch(LISTINGS.pl);
    expect('расходы, объявления, документы').toMatch(LISTINGS.ru);
    expect('витрати, оголошення, документи').toMatch(LISTINGS.uk);
    expect('free document templates').toMatch(FREE);
    expect('ready-made document templates').toMatch(TEMPLATES.en);
    expect('na gotowych wzorach dokumentów').toMatch(TEMPLATES.pl);
  });

  it('the en.json search finds no claim about reported figures', () => {
    const matches = leaves(messages.en)
      .filter(([, value]) => /verified|checked|actually|in full/i.test(value))
      .map(([path]) => path);

    expect(matches.filter((path) => !(path in ALLOWED_EN_MATCHES))).toEqual([]);
  });
});
