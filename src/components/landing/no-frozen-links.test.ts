import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// PRD 4 FR-6 (spec 08 §Home framing surfaces, D5) and FR-7 (§Footer product
// column, D82): the home framing surfaces and the footer no longer promote the
// frozen listings. No landing component (the footer included), nor the home page
// or the 404, links to /replacement, /sublet or /create-listing; the pages stay
// reachable by URL.

const ROOT = process.cwd();
const LANDING_DIR = join(ROOT, 'src/components/landing');
const PAGES = ['src/app/[locale]/page.tsx', 'src/app/[locale]/not-found.tsx'];
/** The frozen pages themselves: nothing is removed or redirected (D5). */
const FROZEN_PAGES = [
  'src/app/[locale]/[city]/replacement/page.tsx',
  'src/app/[locale]/[city]/sublet/page.tsx',
  'src/app/[locale]/create-listing/page.tsx',
];

/** A path segment of a frozen listings route, in any href form (literal or template). */
const FROZEN_ROUTE = /\/(replacement|sublet|create-listing)\b/;

const isTestFile = (path: string) => /\.(test|spec)\.tsx?$/.test(path);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !isTestFile(name) ? [relative(ROOT, path)] : [];
  });
}

const scanned = [...sourceFiles(LANDING_DIR), ...PAGES];

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('no frozen listings links on the home framing surfaces and the footer (PRD 4 FR-6, FR-7)', () => {
  it('scans every landing component (the footer included), the home page and the 404', () => {
    for (const path of [
      'src/components/landing/hero.tsx',
      'src/components/landing/for-whom.tsx',
      'src/components/landing/districts.tsx',
      'src/components/landing/header.tsx',
      'src/components/landing/footer.tsx',
      ...PAGES,
    ]) {
      expect(scanned).toContain(path);
    }
    expect(scanned.some(isTestFile)).toBe(false);
  });

  it('the pattern catches every href form the removed links used', () => {
    for (const href of [
      '`/${DEFAULT_CITY}/replacement`',
      '`/${DEFAULT_CITY}/sublet`',
      "'/create-listing'",
      '"/warsaw/replacement"',
      '/warsaw/sublet?from=home',
    ]) {
      expect(href).toMatch(FROZEN_ROUTE);
    }
    // A listing type named as a value, not a route, is not a link.
    expect("const TABS = ['replacement', 'roommate', 'sublet'];").not.toMatch(FROZEN_ROUTE);
  });

  it('no scanned file contains /replacement, /sublet or /create-listing', () => {
    const offenders = scanned.flatMap((path) =>
      read(path)
        .split('\n')
        .flatMap((line, i) =>
          FROZEN_ROUTE.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('the frozen pages stay reachable by URL: their routes still exist (D5)', () => {
    for (const path of FROZEN_PAGES) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });
});
