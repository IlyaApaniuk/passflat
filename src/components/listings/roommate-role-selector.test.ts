import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

// The hooks are mocked, so the component can be called as a plain function and its element
// tree inspected without a DOM.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { RoommateRoleState } from '@/lib/roommate-roles';
import { RoommateRoleSelector } from './roommate-role-selector';

type AnyElement = ReactElement<{
  children?: ReactNode;
  className?: string;
  href?: unknown;
  asChild?: boolean;
  onClick?: () => void;
}>;

function findAll(node: ReactNode, match: (el: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, match));
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as AnyElement;
  return [...(match(el) ? [el] : []), ...findAll(el.props.children, match)];
}

function render(state: RoommateRoleState) {
  const onStateChange = vi.fn();
  const onFindRoom = vi.fn();
  const tree = RoommateRoleSelector({ state, onStateChange, onScrollListToTop: onFindRoom });
  return { tree, onStateChange, onFindRoom };
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as AnyElement).props.children);
  }
  return '';
}

describe('RoommateRoleSelector', () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it('shows three choices: two columns at 360 px, the third on its own line, 44 px tap targets', () => {
    const { tree } = render({ collapsed: false });
    const row = tree as AnyElement;
    expect(row.props.className).toContain('grid-cols-2');
    expect(row.props.className).toContain('sm:grid-cols-3');
    expect(row.props.className).not.toContain('overflow-x');
    const buttons = findAll(tree, (el) => el.type === Button);
    expect(buttons).toHaveLength(3);
    expect(buttons[0].props.className).toBe(buttons[1].props.className);
    for (const button of buttons) {
      expect(button.props.className).toContain('min-h-11');
      expect(button.props.className).toContain('min-w-0');
      expect(button.props.className).toContain('whitespace-normal');
    }
    // Spans both columns on a phone (the row wraps to two lines), one column from `sm`.
    expect(buttons[2].props.className).toContain('col-span-2');
    expect(buttons[2].props.className).toContain('sm:col-span-1');
    expect(textOf(buttons[0])).toBe('listings.roommateRoles.find');
    expect(textOf(buttons[1])).toBe('listings.roommateRoles.offer');
    expect(textOf(buttons[2])).toBe('listings.roommateRoles.findFlatmate');
  });

  it('find_flatmate: one roommate_intent_selected, collapses into the chip, no navigation', () => {
    const { tree, onStateChange, onFindRoom } = render({ collapsed: false });
    const flatmate = findAll(tree, (el) => el.type === Button)[2];
    expect(flatmate.props.asChild).toBeUndefined();
    expect(findAll(flatmate, (el) => el.type === Link)).toHaveLength(0);
    flatmate.props.onClick?.();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('roommate_intent_selected', { intent: 'find_flatmate' });
    expect(onStateChange).toHaveBeenCalledWith({ intent: 'find_flatmate', collapsed: true });
    // Scrolls the list container to its top, where the block is.
    expect(onFindRoom).toHaveBeenCalledTimes(1);
  });

  it('the find_flatmate chip names the role and reopens the choices without an event', () => {
    const { tree, onStateChange } = render({ intent: 'find_flatmate', collapsed: true });
    const chips = findAll(tree, (el) => el.type === Button);
    expect(chips).toHaveLength(1);
    expect(textOf(chips[0])).toContain('listings.roommateRoles.findFlatmate');
    expect(textOf(chips[0])).toContain('listings.roommateRoles.change');
    chips[0].props.onClick?.();
    expect(onStateChange).toHaveBeenCalledWith({ intent: 'find_flatmate', collapsed: false });
    expect(capture).not.toHaveBeenCalled();
  });

  it('find: one roommate_intent_selected, collapses into the chip and scrolls the list', () => {
    const { tree, onStateChange, onFindRoom } = render({ collapsed: false });
    const [find] = findAll(tree, (el) => el.type === Button);
    find.props.onClick?.();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('roommate_intent_selected', { intent: 'find_room' });
    expect(onStateChange).toHaveBeenCalledWith({ intent: 'find_room', collapsed: true });
    expect(onFindRoom).toHaveBeenCalledTimes(1);
  });

  it('offer: a locale-aware Link to /create-listing?type=roommate that fires one event', () => {
    const { tree, onStateChange, onFindRoom } = render({ collapsed: false });
    const [link] = findAll(tree, (el) => el.type === Link);
    expect(link.props.href).toEqual({ pathname: '/create-listing', query: { type: 'roommate' } });
    link.props.onClick?.();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('roommate_intent_selected', { intent: 'offer_room' });
    expect(onStateChange).toHaveBeenCalledWith({ intent: 'offer_room', collapsed: false });
    expect(onFindRoom).not.toHaveBeenCalled();
  });

  it('the collapsed chip reopens the choices without an event', () => {
    const { tree, onStateChange } = render({ intent: 'find_room', collapsed: true });
    const chips = findAll(tree, (el) => el.type === Button);
    expect(chips).toHaveLength(1);
    expect(findAll(tree, (el) => el.type === Link)).toHaveLength(0);
    expect(textOf(chips[0])).toContain('listings.roommateRoles.findChosen');
    expect(textOf(chips[0])).toContain('listings.roommateRoles.change');
    expect(chips[0].props.className).toContain('min-h-11');
    chips[0].props.onClick?.();
    expect(onStateChange).toHaveBeenCalledWith({ intent: 'find_room', collapsed: false });
    expect(capture).not.toHaveBeenCalled();
  });

  // The choice and its chip read the same key, and so does the home hero chip.
  it.each([
    ['pl', 'Szukam kogoś do wspólnego wynajmu'],
    ['en', 'Looking for someone to rent with'],
    ['ru', 'Ищу, с кем снять квартиру'],
    ['uk', 'Шукаю, з ким зняти квартиру'],
  ])('labels the third role as the seeker side in %s (PRD 4 FR-17)', (locale, label) => {
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as { listings: { roommateRoles: { findFlatmate: string } } };
    expect(messages.listings.roommateRoles.findFlatmate).toBe(label);
  });
});
