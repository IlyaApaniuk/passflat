import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { capture, setState, stateQueue } = vi.hoisted(() => ({
  capture: vi.fn(),
  setState: vi.fn(),
  // Values handed out by the mocked useState in call order (email, consent, consentError,
  // status); an empty queue returns the initial value.
  stateQueue: [] as unknown[],
}));

// The hooks are mocked, so the component can be called as a plain function and its element
// tree inspected without a DOM. Effects do not run (district_waitlist_viewed is not under test).
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => [stateQueue.length > 0 ? stateQueue.shift() : initial, setState],
  useEffect: () => {},
}));
vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => 'ru',
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));

import { Button } from '@/components/ui/button';
import { ListingsEmptyState } from './listings-empty-state';

type Props = Parameters<typeof ListingsEmptyState>[0];
type AnyElement = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
  onSubmit?: (e: { preventDefault: () => void }) => void;
}>;

function findElement(node: ReactNode, match: (el: AnyElement) => boolean): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return null;
  const el = node as AnyElement;
  if (match(el)) return el;
  return findElement(el.props.children, match);
}

/** Every string leaf of the element tree (the mocked `t` returns the key itself). */
function collectText(node: ReactNode): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  return collectText((node as AnyElement).props.children);
}

const baseProps: Props = {
  citySlug: 'warsaw',
  listingType: 'roommate',
  districtSlug: 'mokotow',
  selectedDistrict: 'Mokotów',
  isLoggedIn: true,
};

/** Clicks the logged-in one-tap subscribe button and waits for the submit to settle. */
async function clickSubscribe(props: Partial<Props> = {}) {
  const tree = ListingsEmptyState({ ...baseProps, ...props });
  const button = findElement(tree, (el) => el.type === Button && Boolean(el.props.onClick));
  expect(button).not.toBeNull();
  button?.props.onClick?.();
  await vi.waitFor(() => expect(capture).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ListingsEmptyState interest events', () => {
  beforeEach(() => {
    capture.mockClear();
    setState.mockClear();
    stateQueue.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fires one listing_interest_saved after a 2xx with district scope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
    await clickSubscribe();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('listing_interest_saved', {
      listing_type: 'roommate',
      district_scope: 'district',
    });
    expect(setState).toHaveBeenCalledWith('success');
  });

  it('sends city scope and the intent prop when set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
    await clickSubscribe({ districtSlug: '', selectedDistrict: undefined, intent: 'find_room' });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('listing_interest_saved', {
      listing_type: 'roommate',
      district_scope: 'city',
      intent: 'find_room',
    });
  });

  it('fires one listing_interest_failed with the response code and no success event', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'Unknown district', code: 'unknown_district' }, { status: 400 }),
        ),
    );
    await clickSubscribe();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('listing_interest_failed', {
      error_code: 'unknown_district',
    });
    expect(setState).toHaveBeenCalledWith('error');
    expect(setState).not.toHaveBeenCalledWith('success');
  });

  it('falls back to the status when the response has no code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Too many requests.' }, { status: 429 })),
    );
    await clickSubscribe();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('listing_interest_failed', { error_code: 'rate_limited' });
  });

  it('fires one listing_interest_failed with network_error when fetch threw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await clickSubscribe();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('listing_interest_failed', {
      error_code: 'network_error',
    });
    expect(setState).toHaveBeenCalledWith('error');
  });

  it('shows the district title by default and hides it below the no-match heading', () => {
    const isTitle = (el: AnyElement) => el.type === 'h3';
    expect(findElement(ListingsEmptyState(baseProps), isTitle)?.props.children).toBe(
      'listings.demandCapture.titleWithDistrict',
    );
    const below = ListingsEmptyState({ ...baseProps, showTitle: false });
    expect(findElement(below, isTitle)).toBeNull();
    // The district interest capture itself stays.
    expect(findElement(below, (el) => el.type === Button && Boolean(el.props.onClick))).not.toBe(
      null,
    );
  });

  it.each(['roommate', 'sublet', 'replacement'] as const)(
    'labels both forms "save interest" and keeps the consent text (%s)',
    (listingType) => {
      for (const isLoggedIn of [true, false]) {
        const text = collectText(ListingsEmptyState({ ...baseProps, listingType, isLoggedIn }));
        expect(text).toContain('listings.demandCapture.saveInterestButton');
        expect(text).toContain(
          isLoggedIn
            ? 'listings.demandCapture.subtitleLoggedIn'
            : 'listings.demandCapture.subtitle',
        );
        expect(text).not.toContain('listings.demandCapture.notifyMeButton');
        if (!isLoggedIn) {
          expect(text).toContain('landing.cityNotify.consent');
          expect(text).toContain('landing.cityNotify.privacyNote');
        }
      }
    },
  );

  it.each(['roommate', 'sublet', 'replacement'] as const)(
    'shows its own interest-saved message, not the city-launch one (%s)',
    (listingType) => {
      // useState call order: email, consent, consentError, status.
      stateQueue.push('', false, false, 'success');
      const text = collectText(ListingsEmptyState({ ...baseProps, listingType }));
      expect(text).toContain('listings.demandCapture.interestSaved');
      expect(text).not.toContain('landing.cityNotify.success');
    },
  );

  it('sends the email to the API but never to the event (logged-out form)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    stateQueue.push('tenant@example.com', true);
    const tree = ListingsEmptyState({ ...baseProps, isLoggedIn: false });
    const form = findElement(tree, (el) => el.type === 'form');
    form?.props.onSubmit?.({ preventDefault: () => {} });
    await vi.waitFor(() => expect(capture).toHaveBeenCalled());

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      email: 'tenant@example.com',
      city: 'warsaw',
      districtSlug: 'mokotow',
      listingType: 'roommate',
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(capture.mock.calls[0])).not.toContain('tenant@example.com');
  });
});

describe('honest interest copy in the locale files (spec 02 §Honest interest copy)', () => {
  type Messages = {
    listings: {
      roommateCostsBridge: string;
      roommateCostsBridgeCta: string;
      demandCapture: Record<string, string>;
    };
    landing: { cityNotify: { success: string } };
  };
  const load = (locale: string): Messages =>
    JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'));

  it('uses the given RU button and checker-link copy', () => {
    const ru = load('ru');
    expect(ru.listings.demandCapture.saveInterestButton).toBe('Сохранить интерес');
    // The bridge renders `roommateCostsBridge` + ' ' + the linked `roommateCostsBridgeCta`.
    expect(`${ru.listings.roommateCostsBridge} ${ru.listings.roommateCostsBridgeCta}`).toBe(
      'Нашёл вариант? Проверь адрес и известные расходы',
    );
  });

  it('uses the spec drafts for the button in PL, EN, UK and for the EN subtitle and success', () => {
    expect(load('pl').listings.demandCapture.saveInterestButton).toBe('Zapisz zainteresowanie');
    expect(load('uk').listings.demandCapture.saveInterestButton).toBe('Зберегти інтерес');
    const en = load('en').listings.demandCapture;
    expect(en.saveInterestButton).toBe('Save interest');
    expect(en.subtitle).toBe(
      "Leave your email and we'll save your interest. There are no automatic notifications about new offers yet.",
    );
    expect(en.interestSaved).toBe(
      "Your interest is saved. We don't send automatic notifications about new offers yet.",
    );
  });

  it.each(['pl', 'en', 'ru', 'uk'])(
    'keeps a success message separate from the city-launch one (%s)',
    (locale) => {
      const messages = load(locale);
      expect(messages.listings.demandCapture.interestSaved).toBeTruthy();
      expect(messages.listings.demandCapture.interestSaved).not.toBe(
        messages.landing.cityNotify.success,
      );
      expect(messages.listings.demandCapture).not.toHaveProperty('notifyMeButton');
    },
  );
});
