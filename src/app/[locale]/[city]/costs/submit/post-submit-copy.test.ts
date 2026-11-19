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
