import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// PRD 4 FR-15 (spec 08 §How it works, Help and About): the home FAQ pairs each
// question with its own answer explicitly, and the roommate question (q7) comes
// first.

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];
type Dictionary = Record<string, Record<string, unknown>>;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Dictionary,
  ]),
) as Record<Locale, Dictionary>;

const state = vi.hoisted(() => ({ locale: 'en' as 'pl' | 'en' | 'ru' | 'uk' }));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    // A missing key throws instead of rendering its path.
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: state.locale,
        messages: messages[state.locale] as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FAQ } from './faq';
import { FAQ_ITEMS } from './faq-items';

const faq = (locale: Locale) => messages[locale].landing.faq as Record<string, string>;

/** Every element of `type` in the tree, in document order. */
function findAll(node: ReactNode, type: unknown): ReactElement<{ children?: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === type ? [node] : [];
  return [...own, ...findAll(node.props.children, type)];
}

const textOf = (element: ReactElement<{ children?: ReactNode }>) => {
  const { children } = element.props;
  return typeof children === 'string' ? children : JSON.stringify(children);
};

describe('FAQ_ITEMS (PRD 4 FR-15)', () => {
  it('starts with the roommate question', () => {
    expect(FAQ_ITEMS[0]).toEqual({ q: 'q7', a: 'a7' });
    expect(FAQ_ITEMS.map((item) => item.q)).toEqual(['q7', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
  });

  it('pairs every question with the answer of the same number, each once', () => {
    for (const { q, a } of FAQ_ITEMS) {
      expect(q, `${q} / ${a}`).toMatch(/^q\d+$/);
      expect(a, `${q} / ${a}`).toBe(`a${q.slice(1)}`);
    }
    expect(new Set(FAQ_ITEMS.map((item) => item.q)).size).toBe(FAQ_ITEMS.length);
  });

  it.each(LOCALES)('%s: every pair exists under landing.faq', (locale) => {
    for (const { q, a } of FAQ_ITEMS) {
      expect(typeof faq(locale)[q], `${locale}: ${q}`).toBe('string');
      expect(typeof faq(locale)[a], `${locale}: ${a}`).toBe('string');
    }
  });

  it.each(LOCALES)('%s: no question or answer under landing.faq is left out', (locale) => {
    const listed = FAQ_ITEMS.flatMap(({ q, a }) => [q, a]).sort();
    const present = Object.keys(faq(locale))
      .filter((key) => /^[qa]\d+$/.test(key))
      .sort();
    expect(present).toEqual(listed);
  });

  it('the EN roommate question and answer are the PRD 4 §8 drafts', () => {
    expect(faq('en').q7).toBe('How do I find someone to rent with?');
    expect(faq('en').a7).toBe(
      'Open the Passflat bot in Telegram and create a short profile: district, budget per person, move-in month. You see honest counts of who else is looking and what a flat costs per person; contacts appear only when the interest is mutual.',
    );
  });
});

describe('FAQ section (PRD 4 FR-15)', () => {
  it.each(LOCALES)('%s: renders each question over its own answer, q7 first', async (locale) => {
    state.locale = locale;
    const tree = await FAQ();
    const items = findAll(tree, AccordionItem);

    expect(items.map((item) => (item.props as { value?: string }).value)).toEqual(
      FAQ_ITEMS.map((item) => item.q),
    );
    const shown = items.map((item) => [
      textOf(findAll(item, AccordionTrigger)[0]),
      textOf(findAll(item, AccordionContent)[0]),
    ]);
    expect(shown).toEqual(FAQ_ITEMS.map(({ q, a }) => [faq(locale)[q], faq(locale)[a]]));
    expect(shown[0]).toEqual([faq(locale).q7, faq(locale).a7]);
  });
});
