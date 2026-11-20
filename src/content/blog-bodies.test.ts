import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN, type HonestyLocale } from '@/i18n/honesty-rules';

// Spec 09 §Guide bodies (PRD 4 FR-24, parts 1 and 2, D25): a guide line that sends the reader to
// the checker, the cost pages or a building page talks about Passflat's figures, so it holds no
// claim word of the honesty rules ("real", "verified", "market", ...): the figures are reported
// costs. No body line calls anything verified, and no sentence states a figure as Passflat data:
// a guide links to the data report (`/blog/warsaw-rent-prices`) instead of copying its numbers.

const BLOG_DIR = join(process.cwd(), 'src/content/blog');
const FILE_NAME = /^(.+)-(en|pl|ru|uk)\.mdx$/;
/** A Markdown link, the same shape `markdownToHtml` (`src/lib/blog-markdown.ts`) renders. */
const LINK = /\[([^\]]+)\]\(([^)]+)\)/;
/** An href to the checker, the cost pages (including the submit form) or a building page. */
const COST_HREF = /\/(check|costs|building)(?=[/?#]|$)/;

/** The verification family, in every locale (a guide may quote another language). */
const VERIFICATION = /verified|checked by|zweryfikow|sprawdzon|проверенн|перевірен/i;
/** An amount with "%" or a currency. */
const AMOUNT = /\d[\d\s.,]*\s?(%|zł|pln)/i;
/**
 * "Median" or "average" at a word start, so the agent ("pośrednik", «посредник», «посередник»)
 * and Śródmieście («Середмістя») do not count.
 */
const MEDIAN_OR_AVERAGE =
  /(^|[^a-ząćęłńóśźżа-яёіїєґ])(median|average|średni|средн|середн|медиан|медіан)/i;
/** Passflat or the tenants' reports named as the source of a figure. */
const FIGURE_SOURCE =
  /passflat|tenants? (data|reports?)|zgłosze|raport|dane najemców|według danych|отч[её]т|по данным|звіт|за даними/i;
/** Sentence ends inside a line; enough to keep a figure and its source together. */
const SENTENCE_END = /[.!?]\s+/;

/**
 * A phrase that matches `FORBIDDEN` in a link line but is not a claim about figures, with a
 * one-line reason. Only the phrase is exempt: the rest of its line is still checked. Every entry
 * must still occur in a link line of its file and still match, or the allow-list test fails.
 */
const ALLOWED_LINK_LINE_MATCHES: { file: string; phrase: string; reason: string }[] = [];

/** The submit-form invitation names the deposit answer to give, per locale. */
const DEPOSIT_QUESTION: Record<HonestyLocale, string> = {
  en: 'whether the deposit came back in full',
  pl: 'czy kaucja wróciła w całości',
  ru: 'вернули ли залог полностью',
  uk: 'чи повернули кауцію повністю',
};
for (const slug of [
  'move-out-cleaning-warsaw',
  'protokol-zdawczo-odbiorczy-warsaw',
  'rental-deposit-kaucja-warsaw',
]) {
  for (const [locale, phrase] of Object.entries(DEPOSIT_QUESTION)) {
    ALLOWED_LINK_LINE_MATCHES.push({
      file: `${slug}-${locale}.mdx`,
      phrase,
      reason: 'asks which deposit answer to report (fully or partly), not a claim about figures',
    });
  }
}

/**
 * A body phrase of the verification family that is not a quality claim, with a one-line reason.
 * Only the phrase is exempt; every entry must still occur in a body line of its file and match.
 */
const KW_REASON =
  "the reader's own check of the land register (księga wieczysta), not a claim about Passflat data";
const ALLOWED_VERIFICATION_MATCHES: { file: string; phrase: string; reason: string }[] = [
  { file: 'renting-without-agent-warsaw-en.mdx', phrase: 'with a verified KW', reason: KW_REASON },
  { file: 'renting-without-agent-warsaw-pl.mdx', phrase: 'ze sprawdzoną KW', reason: KW_REASON },
  { file: 'renting-without-agent-warsaw-ru.mdx', phrase: 'с проверенной KW', reason: KW_REASON },
  { file: 'renting-without-agent-warsaw-uk.mdx', phrase: 'з перевіреною KW', reason: KW_REASON },
  {
    file: 'renting-without-agent-warsaw-pl.mdx',
    phrase: 'Jak zweryfikować',
    reason: 'a how-to heading: the reader checks the owner in the land register',
  },
];

interface GuideLine {
  file: string;
  locale: HonestyLocale;
  number: number;
  text: string;
}

function hrefs(line: string): string[] {
  return [...line.matchAll(new RegExp(LINK.source, 'g'))].map((match) => match[2]);
}

function linksToCosts(line: string): boolean {
  return hrefs(line).some((href) => COST_HREF.test(href));
}

function loadGuides(): { file: string; locale: HonestyLocale; lines: string[] }[] {
  return readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .sort()
    .map((file) => {
      const match = file.match(FILE_NAME);
      if (!match) throw new Error(`${file}: the name does not end in -<locale>.mdx`);
      const lines = readFileSync(join(BLOG_DIR, file), 'utf-8').split('\n');
      return { file, locale: match[2] as HonestyLocale, lines };
    });
}

const GUIDES = loadGuides();

const LINK_LINES: GuideLine[] = GUIDES.flatMap(({ file, locale, lines }) =>
  lines.flatMap((text, index) =>
    linksToCosts(text) ? [{ file, locale, number: index + 1, text }] : [],
  ),
);

/** The index of the first line after the frontmatter (`blog-frontmatter.test.ts` covers it). */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return end === -1 ? 0 : end + 1;
}

const BODY_LINES: GuideLine[] = GUIDES.flatMap(({ file, locale, lines }) =>
  lines.flatMap((text, index) =>
    index >= bodyStart(lines) && text.trim() !== ''
      ? [{ file, locale, number: index + 1, text }]
      : [],
  ),
);

type AllowedPhrase = { file: string; phrase: string };

/** Every match of `pattern` in the line once its allowed phrases are taken out. */
function matchesWithout(line: GuideLine, pattern: RegExp, allowed: AllowedPhrase[]): string[] {
  let text = line.text;
  for (const entry of allowed) {
    if (entry.file === line.file) text = text.split(entry.phrase).join(' ');
  }
  return [...text.matchAll(new RegExp(pattern.source, 'gi'))].map((match) => match[0]);
}

/** Every claim word of the line once its allowed phrases are taken out. */
function claims(line: GuideLine, allowed: AllowedPhrase[] = ALLOWED_LINK_LINE_MATCHES): string[] {
  return matchesWithout(line, FORBIDDEN[line.locale], allowed);
}

/** Every word of the verification family once the line's allowed phrases are taken out. */
function verificationWords(
  line: GuideLine,
  allowed: AllowedPhrase[] = ALLOWED_VERIFICATION_MATCHES,
): string[] {
  return matchesWithout(line, VERIFICATION, allowed);
}

/**
 * Every sentence of the text that states a figure as Passflat data: an amount next to a median
 * or an average, or next to Passflat or the tenants' reports as its source.
 */
function statedFigures(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .filter(
      (sentence) =>
        AMOUNT.test(sentence) && (MEDIAN_OR_AVERAGE.test(sentence) || FIGURE_SOURCE.test(sentence)),
    );
}

describe('guide bodies: link lines (spec 09 §Guide bodies)', () => {
  it('finds a link to the checker or the cost pages in every guide', () => {
    expect(GUIDES.length).toBeGreaterThan(0);
    for (const { file } of GUIDES) {
      expect(
        LINK_LINES.some((line) => line.file === file),
        file,
      ).toBe(true);
    }
  });

  it('no line that links to /check, /costs or /building holds a claim word', () => {
    const flagged = LINK_LINES.flatMap((line) => {
      const found = claims(line);
      return found.length > 0 ? [`${line.file}:${line.number}: ${found.join(', ')}`] : [];
    });
    expect(flagged).toEqual([]);
  });

  it('every allowed phrase still occurs in a link line of its file and still matches', () => {
    for (const entry of ALLOWED_LINK_LINE_MATCHES) {
      const label = `${entry.file}: ${entry.phrase}`;
      const guide = GUIDES.find((candidate) => candidate.file === entry.file);
      expect(guide, label).toBeDefined();
      expect(
        LINK_LINES.some((line) => line.file === entry.file && line.text.includes(entry.phrase)),
        label,
      ).toBe(true);
      expect(entry.phrase, label).toMatch(FORBIDDEN[guide!.locale]);
      expect(entry.reason.trim().length, label).toBeGreaterThan(0);
    }
  });

  it('recognises links to the checker, the cost pages and a building page only', () => {
    expect(linksToCosts('[check the address](/en/warsaw/check)')).toBe(true);
    expect(linksToCosts('[mapa](https://passflat.com/warsaw/costs)')).toBe(true);
    expect(linksToCosts('[add yours](/ru/warsaw/costs/submit): two minutes')).toBe(true);
    expect(linksToCosts('[the building](/en/warsaw/building/marszalkowska-1)')).toBe(true);
    expect(linksToCosts('[check](/warsaw/check?address=Marsza%C5%82kowska)')).toBe(true);
    expect(linksToCosts('[report](https://passflat.com/en/blog/warsaw-rent-prices)')).toBe(false);
    expect(linksToCosts('[cesja](https://passflat.com/warsaw/replacement)')).toBe(false);
    expect(linksToCosts('[Cleanwhale](https://cleanwhale.pl)')).toBe(false);
    expect(linksToCosts('check the costs page /warsaw/costs without a link')).toBe(false);
  });

  it('takes out only the allowed phrase: another claim on the same line is still caught', () => {
    const line: GuideLine = {
      file: 'x-en.mdx',
      locale: 'en',
      number: 1,
      text: '[Check](/en/warsaw/check) the real costs and say whether the deposit came back in full.',
    };
    const allowed = [
      { file: 'x-en.mdx', phrase: 'whether the deposit came back in full', reason: 'r' },
    ];
    expect(claims(line, allowed)).toEqual(['real']);
    expect(claims({ ...line, file: 'y-en.mdx' }, allowed)).toEqual(['real', 'in full']);
    expect(claims({ ...line, text: line.text.replace('real ', 'reported ') }, allowed)).toEqual([]);
  });
});

describe('guide bodies: claims (spec 09 §Guide bodies)', () => {
  it('reads the body of every guide, without the frontmatter', () => {
    expect(BODY_LINES.length).toBeGreaterThan(GUIDES.length);
    expect(BODY_LINES.some((line) => /^(title|description|slug|locale):/.test(line.text))).toBe(
      false,
    );
    expect(bodyStart(['---', 'title: "x"', '---', '', 'Body'])).toBe(3);
    expect(bodyStart(['Body without frontmatter'])).toBe(0);
  });

  it('no body line holds a word of the verification family', () => {
    const flagged = BODY_LINES.flatMap((line) => {
      const found = verificationWords(line);
      return found.length > 0 ? [`${line.file}:${line.number}: ${found.join(', ')}`] : [];
    });
    expect(flagged).toEqual([]);
  });

  it('every allowed verification phrase still occurs in a body line of its file and matches', () => {
    for (const entry of ALLOWED_VERIFICATION_MATCHES) {
      const label = `${entry.file}: ${entry.phrase}`;
      expect(
        GUIDES.some((guide) => guide.file === entry.file),
        label,
      ).toBe(true);
      expect(
        BODY_LINES.some((line) => line.file === entry.file && line.text.includes(entry.phrase)),
        label,
      ).toBe(true);
      expect(entry.phrase, label).toMatch(VERIFICATION);
      expect(entry.reason.trim().length, label).toBeGreaterThan(0);
    }
  });

  it('no body sentence states a figure as Passflat data (link to the data report instead)', () => {
    const flagged = BODY_LINES.flatMap((line) =>
      statedFigures(line.text).map((sentence) => `${line.file}:${line.number}: ${sentence}`),
    );
    expect(flagged).toEqual([]);
  });

  it('recognises the verification family in every locale', () => {
    for (const phrase of [
      'tenant reports and verified listings',
      'Checked by our team',
      'zweryfikowane ogłoszenia',
      'ze sprawdzoną KW',
      'проверенные объявления',
      'перевірені оголошення',
    ]) {
      expect(phrase).toMatch(VERIFICATION);
    }
    for (const phrase of [
      'verify the owner',
      'sprawdź budynek',
      'проверьте дом',
      'перевірте адресу',
    ]) {
      expect(phrase).not.toMatch(VERIFICATION);
    }
  });

  it('recognises a figure stated as Passflat data, not an example, a fee or a legal amount', () => {
    for (const text of [
      'the median deposit in Warsaw is about 5 000 zł.',
      '77% of tenants got it back in full (Passflat tenant data, August 2026).',
      'tenant reports put the figure at roughly 800 zł per month on top of rent.',
      'Średnie ceny najmu wahają się od 3 000 zł.',
      'według zgłoszeń najemców to około 800 zł miesięcznie.',
      'сверх аренды жильцы платят в среднем 800 zł.',
      'Охота — около 3 420 PLN (по данным жильцов).',
      'медіанна кауція — близько 5 000 zł.',
    ]) {
      expect(statedFigures(text), text).toHaveLength(1);
    }
    for (const text of [
      'Expect to pay anywhere from 2,500 to 5,000 PLN per month for a one-bedroom apartment.',
      'Many private listings are agency-free (bez pośredników), so 3 000 zł stays 3 000 zł.',
      'Посредник берёт 3 000 zł, посередник — 3 000 zł.',
      'Compare your total against the district median. A 3,000 PLN listing becomes 3,800 PLN.',
      'The deposit cannot exceed twelve times the rent; one or two months is standard.',
      'Reported deposits are in our [report](/en/blog/warsaw-rent-prices).',
    ]) {
      expect(statedFigures(text), text).toEqual([]);
    }
  });
});
