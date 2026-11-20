import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN, type HonestyLocale } from '@/i18n/honesty-rules';

// Spec 09 §Guide bodies (PRD 4 FR-24, part 1, D25): a guide line that sends the reader to the
// checker, the cost pages or a building page talks about Passflat's figures, so it holds no claim
// word of the honesty rules ("real", "verified", "market", ...): the figures are reported costs.

const BLOG_DIR = join(process.cwd(), 'src/content/blog');
const FILE_NAME = /^(.+)-(en|pl|ru|uk)\.mdx$/;
/** A Markdown link, the same shape `markdownToHtml` (`blog/[slug]/client.tsx`) renders. */
const LINK = /\[([^\]]+)\]\(([^)]+)\)/;
/** An href to the checker, the cost pages (including the submit form) or a building page. */
const COST_HREF = /\/(check|costs|building)(?=[/?#]|$)/;

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

interface LinkLine {
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

const LINK_LINES: LinkLine[] = GUIDES.flatMap(({ file, locale, lines }) =>
  lines.flatMap((text, index) =>
    linksToCosts(text) ? [{ file, locale, number: index + 1, text }] : [],
  ),
);

/** Every claim word of the line once its allowed phrases are taken out. */
function claims(line: LinkLine, allowed = ALLOWED_LINK_LINE_MATCHES): string[] {
  let text = line.text;
  for (const entry of allowed) {
    if (entry.file === line.file) text = text.split(entry.phrase).join(' ');
  }
  const pattern = new RegExp(FORBIDDEN[line.locale].source, 'gi');
  return [...text.matchAll(pattern)].map((match) => match[0]);
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
    const line: LinkLine = {
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
