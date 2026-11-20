import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 08 §Checker handoff (PRD 4 FR-14): the bot hint sits after each
// `onClickCapture` wrapper of the bot button, never inside one, so a tap on the
// hint fires no `checker_cta_clicked`. Static, because the checker is a city page
// that cannot render in the e2e build and its client holds the whole lookup state.

const SOURCE = readFileSync(
  join(process.cwd(), 'src/app/[locale]/[city]/check/client.tsx'),
  'utf8',
);

type Wrapper = { cta: string; inner: string; after: string };

const WRAPPER_OPEN = /<div\s+onClickCapture=\{\(\) => captureCta\('([a-z_]+)'\)\}>/g;
const DIV_TAG = /<div\b|<\/div>/g;
/** Whitespace and JSX comments between two siblings. */
const SIBLING_GAP = /^(?:\s|\{\/\*[\s\S]*?\*\/\})*/;

/** Every `<div onClickCapture={() => captureCta('…')}>` with what it wraps and what follows it. */
function captureWrappers(source: string): Wrapper[] {
  const wrappers: Wrapper[] = [];
  for (const open of source.matchAll(WRAPPER_OPEN)) {
    const start = (open.index ?? 0) + open[0].length;
    const tag = new RegExp(DIV_TAG.source, 'g');
    tag.lastIndex = start;
    let depth = 1;
    for (let match = tag.exec(source); match; match = tag.exec(source)) {
      depth += match[0] === '</div>' ? -1 : 1;
      if (depth === 0) {
        const after = source.slice(match.index + match[0].length);
        wrappers.push({
          cta: open[1],
          inner: source.slice(start, match.index),
          after: after.replace(SIBLING_GAP, ''),
        });
        break;
      }
    }
  }
  return wrappers;
}

function count(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe('checker bot handoff placement (spec 08 §Checker handoff)', () => {
  const wrappers = captureWrappers(SOURCE);
  const telegram = wrappers.filter((wrapper) => wrapper.cta === 'telegram');

  it('finds every onClickCapture wrapper in the checker client', () => {
    expect(wrappers).toHaveLength(count(SOURCE, 'onClickCapture'));
    expect(telegram).toHaveLength(2);
  });

  it("keeps the bot button inside the wrappers that fire checker_cta_clicked {cta: 'telegram'}", () => {
    expect(telegram.map((wrapper) => wrapper.inner.match(/source="([a-z]+)"/)?.[1])).toEqual([
      'checker',
      'empty',
    ]);
    for (const wrapper of telegram) expect(wrapper.inner).toContain('<TelegramBotCta ');
    expect(SOURCE).toContain("posthog?.capture('checker_cta_clicked'");
  });

  it('never puts the hint inside an onClickCapture wrapper', () => {
    for (const wrapper of wrappers) expect(wrapper.inner).not.toContain('TelegramBotHint');
  });

  it('renders the hint right after each bot button wrapper, twice', () => {
    for (const wrapper of telegram)
      expect(wrapper.after.startsWith('<TelegramBotHint />')).toBe(true);
    expect(count(SOURCE, '<TelegramBotHint />')).toBe(2);
    expect(SOURCE).toContain(
      "import { TelegramBotCta, TelegramBotHint } from '@/components/costs/telegram-bot-cta';",
    );
  });

  it('adds no roommate callout to the checker', () => {
    expect(SOURCE).not.toMatch(/flatmate-callout|FlatmateCallout|mate_web_/);
  });

  describe('the check itself', () => {
    it('catches a hint inside the wrapper', () => {
      const inside = [
        "<div onClickCapture={() => captureCta('telegram')}>",
        '  <div className="x"><TelegramBotCta source="empty" /></div>',
        '  <TelegramBotHint />',
        '</div>',
      ].join('\n');
      const [wrapper] = captureWrappers(inside);
      expect(wrapper.inner).toContain('TelegramBotHint');
      expect(wrapper.after).toBe('');
    });

    it('reads a hint after a nested wrapper and a comment as its next sibling', () => {
      const after = [
        "<div onClickCapture={() => captureCta('telegram')}>",
        '  <div><TelegramBotCta source="checker" /></div>',
        '</div>',
        '{/* outside */}',
        '<TelegramBotHint />',
      ].join('\n');
      const [wrapper] = captureWrappers(after);
      expect(wrapper.inner).not.toContain('TelegramBotHint');
      expect(wrapper.after.startsWith('<TelegramBotHint />')).toBe(true);
    });
  });
});
