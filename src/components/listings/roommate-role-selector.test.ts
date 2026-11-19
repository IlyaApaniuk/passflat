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
  const tree = RoommateRoleSelector({ state, onStateChange, onFindRoom });
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

  it('shows two equal choices in one two-column row with 44 px tap targets', () => {
    const { tree } = render({ collapsed: false });
    const row = tree as AnyElement;
    expect(row.props.className).toContain('grid-cols-2');
    const buttons = findAll(tree, (el) => el.type === Button);
    expect(buttons).toHaveLength(2);
    expect(buttons[0].props.className).toBe(buttons[1].props.className);
    expect(buttons[0].props.className).toContain('min-h-11');
    expect(buttons[0].props.className).toContain('min-w-0');
    expect(buttons[0].props.className).toContain('whitespace-normal');
    expect(textOf(buttons[0])).toBe('listings.roommateRoles.find');
    expect(textOf(buttons[1])).toBe('listings.roommateRoles.offer');
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
});
