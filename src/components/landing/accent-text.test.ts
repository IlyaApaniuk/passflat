import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PRD 4 FR-34, spec 09 §Contrast, tap targets and the hamburger. The accent
// (a light green) fails text contrast on the light background: figures are
// `text-foreground`, badge chips and link texts `text-primary`, and only icons
// keep `text-accent`.

const LANDING = 'src/components/landing';

/** The data report's deposit figure (T159, the FR-34 follow-up). */
const DATA_REPORT = 'src/app/[locale]/blog/warsaw-rent-prices/page.tsx';

/** The 28 px icon circle of the access card: an icon, so `text-accent` stays (T159). */
const ACCESS_CARD = 'src/components/costs/cost-access-card.tsx';

const FILES = [
  ...[
    'hero.tsx',
    'faq.tsx',
    'check-address.tsx',
    'cost-transparency-card.tsx',
    'tools.tsx',
    'bento-grid.tsx',
    'cost-transparency.tsx',
    'city-notify.tsx',
  ].map((file) => `${LANDING}/${file}`),
  DATA_REPORT,
];

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** `text-accent` as a colour class, also behind a variant (`group-hover:`); not `text-accent-foreground`. */
const ACCENT_TEXT = /(?<![\w-])text-accent(?![\w-])/;

/** An icon line by its own markers (spec 09). */
const ICON_MARKERS = ['<svg', 'Icon', 'className="h-4 w-4'];

/**
 * Icon lines whose markup has none of the markers: the trimmed line, exactly.
 * A change to one of these lines fails the test until the entry is updated.
 */
const ICON_LINES: Record<string, string[]> = {
  [`${LANDING}/check-address.tsx`]: [
    '<Search className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />',
  ],
  [`${LANDING}/bento-grid.tsx`]: [
    "<item.icon className={`text-accent ${item.featured ? 'h-7 w-7' : 'h-5 w-5'}`} />",
  ],
  [`${LANDING}/city-notify.tsx`]: [
    '<MapPin className="h-5 w-5 text-accent" />',
    '<CheckCircle2 className="h-7 w-7 text-accent" />',
  ],
};

const accentLines = (file: string) =>
  read(file)
    .split('\n')
    .map((line, index) => ({ number: index + 1, line: line.trim() }))
    .filter(({ line }) => ACCENT_TEXT.test(line));

describe('text-accent only on icons (PRD 4 FR-34)', () => {
  it.each(FILES)('%s uses text-accent only on icon lines', (file) => {
    const allowed = ICON_LINES[file] ?? [];
    const offending = accentLines(file).filter(
      ({ line }) =>
        !ICON_MARKERS.some((marker) => line.includes(marker)) && !allowed.includes(line),
    );
    expect(offending).toEqual([]);
  });

  it('keeps every allow-listed icon line present (no stale entries)', () => {
    for (const [file, lines] of Object.entries(ICON_LINES)) {
      expect(FILES, file).toContain(file);
      const present = accentLines(file).map(({ line }) => line);
      for (const line of lines) expect(present, file).toContain(line);
    }
  });

  it('treats text-accent-foreground and bg/border-accent as other classes', () => {
    expect(ACCENT_TEXT.test('bg-accent text-accent-foreground')).toBe(false);
    expect(ACCENT_TEXT.test('border border-accent/30 bg-accent/10')).toBe(false);
    expect(ACCENT_TEXT.test('text-sm text-accent')).toBe(true);
    expect(ACCENT_TEXT.test('group-hover:text-accent')).toBe(true);
    expect(ACCENT_TEXT.test('`text-accent ${x}`')).toBe(true);
  });

  it('shows the hero figures in text-foreground and the source line in text-xs text-muted-foreground', () => {
    const hero = read(`${LANDING}/hero.tsx`);
    expect(hero).toMatch(
      /<div className="text-2xl font-bold text-foreground[^"]*">\s*\{stat\.value\}/,
    );
    expect(hero).toMatch(
      /<div className="mt-0\.5 text-xs text-muted-foreground">\s*\{stat\.source\}/,
    );
    expect(hero).not.toContain('text-[11px]');
    expect(hero).not.toContain('text-muted-foreground/80');
  });

  it('shows the cost card total in text-foreground and its links in text-primary', () => {
    const card = read(`${LANDING}/cost-transparency-card.tsx`);
    expect(card).toMatch(/<span className="shrink-0 text-2xl font-bold text-foreground">/);
    expect(
      card.match(/className="text-sm font-medium text-primary hover:underline"/g),
    ).toHaveLength(2);
  });

  it('shows the data report deposit figure in text-foreground on the accent card (T159)', () => {
    const report = read(DATA_REPORT);
    expect(report).toContain('<Card className="mt-4 border-accent/30 bg-accent/5">');
    expect(report).toMatch(
      /<p className="shrink-0 text-4xl font-bold tabular-nums text-foreground">\s*\{t\('costs\.building\.figures\.countOfTotal'/,
    );
  });

  it('keeps text-accent on the access card icon circle (an icon, T159)', () => {
    const card = read(ACCESS_CARD);
    expect(card).toContain(
      "accent: { card: 'border-accent/50 bg-accent/5', badge: 'bg-accent/10 text-accent' }",
    );
    expect(card).toMatch(
      /className=\{`flex h-7 w-7 shrink-0 items-center justify-center rounded-full \$\{TONE\[tone\]\.badge\}`\}/,
    );
  });
});
