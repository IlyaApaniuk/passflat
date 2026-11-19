import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 03 §Marketing copy (FR-31, D25): marketing keys use "costs tenants
// reported" / "reported costs" wording; none says "verified", "checked by
// tenants", "actually pay" or "returned in full" about reported figures.

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
  'costs.building.lookingForApartmentDesc',
  'howItWorksPage.seekers.step1Title',
  'blog.topic4Desc',
  'helpCenter.costTransparency.a1',
  'listings.roommateMetaDescription',
];

/** Claim words per locale; "fully or partly" in any language is allowed. */
const FORBIDDEN: Record<Locale, RegExp> = {
  en: /verified|checked|actually|really|in full/i,
  pl: /zweryfikow|sprawdzon|naprawdę|realn|faktycznie|w całości(?! lub)/i,
  ru: /проверенн|на самом деле|реальн|по факту|полностью(?! или)/i,
  uk: /перевірен|насправді|реальн|за фактом|повністю(?! або)/i,
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

  it('no rewritten key claims verified, checked or actually-paid figures, or returns in full', () => {
    for (const locale of LOCALES) {
      for (const key of REWRITTEN_KEYS) {
        expect(valueAt(locale, key) as string, `${locale}: ${key}`).not.toMatch(FORBIDDEN[locale]);
      }
    }
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

  it('the en.json search finds no claim about reported figures', () => {
    const matches = leaves(messages.en)
      .filter(([, value]) => /verified|checked|actually|in full/i.test(value))
      .map(([path]) => path);

    expect(matches.filter((path) => !(path in ALLOWED_EN_MATCHES))).toEqual([]);
  });
});
