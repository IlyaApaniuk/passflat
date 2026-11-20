import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PRD 4 FR-34, spec 09 §Contrast, tap targets and the hamburger: the controls
// that were under 44 px get min-h-11 (and min-w-11 when square). The header's
// hamburger, pill and language buttons are rendered in
// `landing/header.test.ts`.

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** Every opening tag `<Name …>` (multi-line, `=>` inside handlers allowed) whose attributes contain `marker`. */
function tags(source: string, name: string, marker: string): string[] {
  return [...source.matchAll(new RegExp(`<${name}\\b(?:=>|[^>])*>`, 'g'))]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes(marker));
}

const MIN_H = /\bmin-h-11\b/;

describe('44 px tap targets (PRD 4 FR-34)', () => {
  it('gives both cookie banner buttons min-h-11', () => {
    const source = read('src/components/cookie-consent.tsx');
    for (const handler of ['onClick={handleDecline}', 'onClick={handleAccept}']) {
      const [tag, ...rest] = tags(source, 'Button', handler);
      expect(rest, handler).toEqual([]);
      expect(tag, handler).toMatch(MIN_H);
    }
  });

  it('gives the costs list/map toggle buttons min-h-11', () => {
    const source = read('src/app/[locale]/[city]/costs/client.tsx');
    for (const mode of ['list', 'map']) {
      const marker = `onClick={() => setViewMode('${mode}')}`;
      const [tag, ...rest] = tags(source, 'button', marker);
      expect(rest, mode).toEqual([]);
      expect(tag, mode).toMatch(MIN_H);
    }
  });

  it('gives the listings sort trigger min-h-11 and the square map toggle min-h-11 min-w-11', () => {
    const source = read('src/components/listings/listings-page-client.tsx');
    const triggers = [...source.matchAll(/<SelectTrigger\b[^>]*>/g)].map(([tag]) => tag);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatch(MIN_H);
    const [toggle, ...rest] = tags(source, 'Button', 'onClick={() => setShowMap(!showMap)}');
    expect(rest).toEqual([]);
    expect(toggle).toMatch(/\bmin-h-11 min-w-11\b/);
  });
});
