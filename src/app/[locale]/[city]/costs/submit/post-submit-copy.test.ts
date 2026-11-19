import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The post-submit screen sets the user's own total beside the area reference with
// no verdict (spec 03 §Comparisons, FR-29). The login unlock list and the share
// invite next to it must not promise a ranking (a position bar needs
// `isComparable`, which no PRD 1 surface meets) or ask whether anyone overpays.
const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
const KEYS = ['unlockItemPosition', 'shareInviteDesc'] as const;

const FORBIDDEN =
  /rank|position|overpay|cheaper|pricier|позиц|рейтинг|переплач|дешевле|дороже|позиці|переплачу|дешевше|дорожче|pozycj|ranking|przepłac|taniej|drożej/i;

// Login gives the claimed report in the dashboard and the gated per-utility
// breakdown. Deposit returns and tenure are public on the building page
// (outside `GatedSection`), so the unlock block must not offer them.
const UNLOCK_HEADER_KEYS = ['unlockTitle', 'unlockDesc'] as const;
const DROPPED_KEYS = ['unlockItemDeposit', 'unlockItemTenure'] as const;
const PUBLIC_FIGURES =
  /deposit|tenure|stay|full statistics|deeper|депозит|залог|живут|полную статистику|глубокие|депозиту|живуть|повну статистику|глибокі|kaucj|mieszkaj|pełne statystyki|szczegółowe dane/i;

const CLIENT = join(
  process.cwd(),
  'src',
  'app',
  '[locale]',
  '[city]',
  'costs',
  'submit',
  'client.tsx',
);

function submitCopy(locale: string): Record<string, string> {
  const file = join(process.cwd(), 'src', 'i18n', 'messages', `${locale}.json`);
  const messages = JSON.parse(readFileSync(file, 'utf8')) as {
    costs: { submit: Record<string, string> };
  };
  return messages.costs.submit;
}

describe('post-submit copy (spec 03 §Comparisons, FR-29)', () => {
  for (const locale of LOCALES) {
    for (const key of KEYS) {
      it(`costs.submit.${key} (${locale}) has no ranking or overpay framing`, () => {
        const text = submitCopy(locale)[key];
        expect(text).toBeTruthy();
        expect(text).not.toMatch(FORBIDDEN);
      });
    }
  }
});

describe('post-submit unlock block offers only what login gives', () => {
  for (const locale of LOCALES) {
    it(`costs.submit has no deposit or tenure unlock items (${locale})`, () => {
      const copy = submitCopy(locale);
      for (const key of DROPPED_KEYS) expect(copy).not.toHaveProperty(key);
    });

    for (const key of UNLOCK_HEADER_KEYS) {
      it(`costs.submit.${key} (${locale}) names no public figure as locked`, () => {
        const text = submitCopy(locale)[key];
        expect(text).toBeTruthy();
        expect(text).not.toMatch(PUBLIC_FIGURES);
        expect(text).not.toMatch(FORBIDDEN);
      });
    }
  }

  it('the submit client reads only unlock keys that exist in every locale', () => {
    const source = readFileSync(CLIENT, 'utf8');
    const used = [...source.matchAll(/'costs\.submit\.(unlock\w+)'/g)].map((m) => m[1]);
    expect(used).toEqual(
      expect.arrayContaining(['unlockTitle', 'unlockDesc', 'unlockItemUtilities', 'unlockCta']),
    );
    for (const key of DROPPED_KEYS) expect(used).not.toContain(key);
    for (const locale of LOCALES) {
      const copy = submitCopy(locale);
      for (const key of used) expect(copy, `${locale}: ${key}`).toHaveProperty(key);
    }
  });
});
