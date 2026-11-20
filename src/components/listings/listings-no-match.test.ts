import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { Button } from '@/components/ui/button';
import { ListingsNoMatch } from './listings-no-match';

type AnyElement = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function collect(node: ReactNode, out: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return out;
  const el = node as AnyElement;
  out.push(el);
  collect(el.props.children, out);
  return out;
}

function text(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return text((node as AnyElement).props.children);
  }
  return '';
}

describe('ListingsNoMatch', () => {
  it('says nothing matches the filters, never that the city is empty', () => {
    const tree = ListingsNoMatch({ onClearFilters: () => {} });
    const all = text(tree);
    expect(all).toContain('listings.noMatch.title');
    expect(all).toContain('listings.noMatch.clearFilters');
    expect(all).not.toContain('listings.demandCapture.title');
    expect(all).not.toContain('listings.empty');
  });

  it('runs the filter reset from the clear button', () => {
    const onClearFilters = vi.fn();
    const tree = ListingsNoMatch({ onClearFilters });
    const button = collect(tree).find((el) => el.type === Button);
    expect(button).toBeDefined();
    button?.props.onClick?.();
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pl', 'Żadna oferta nie pasuje do Twoich filtrów'],
    ['en', 'No offers match your filters'],
    ['ru', 'Нет предложений по твоим фильтрам'],
    ['uk', 'Немає пропозицій за твоїми фільтрами'],
  ])(
    'the %s title addresses the reader as the roommate page does (PRD 4 FR-18, D42)',
    (locale, title) => {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
      ) as { listings: { noMatch: { title: string } } };
      expect(messages.listings.noMatch.title).toBe(title);
      expect(messages.listings.noMatch.title).not.toMatch(/(^|[^а-яіїєґё])ваш/i);
    },
  );
});
