import type { ComponentProps, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CostSubmitClient } from './client';

/**
 * Spec 04 §Links to the website: the bot's link reaches the form with its
 * attribution and, when the bot found a building row, with the address
 * prefilled. The client is stubbed: `cost_form_started` sends the `source`
 * prop it receives (`source ?? 'direct'`), so the prop is what is asserted.
 */

const BUILDING_ID = '3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b';
const PLACE_ID = 'ChIJd8BlQ2BZwokRAFUEcm_qrcA';

const building = {
  id: BUILDING_ID,
  street: 'Grójecka',
  buildingNumber: '45',
  addressFull: 'Grójecka 45, Warszawa',
  placeId: PLACE_ID as string | null,
  lat: 52.22,
  lng: 20.98,
  district: { slug: 'ochota' },
};

const state = vi.hoisted(() => ({
  building: null as unknown,
  findFirst: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => (key === 'cities.warsaw' ? 'Warszawa' : key),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    city: {
      findUnique: vi.fn(async () => ({
        id: 'city-1',
        slug: 'warsaw',
        isActive: true,
        nameKey: 'cities.warsaw',
        bounds: null,
        country: { defaultLocale: 'pl' },
      })),
    },
    building: {
      findFirst: state.findFirst,
    },
    costReport: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/import-constants', () => ({
  isCostImportAdmin: () => false,
  getAdminImportMode: () => 'off',
}));
vi.mock('@/lib/seo', () => ({ getAlternates: () => ({}) }));
vi.mock('./client', () => ({ CostSubmitClient: () => null }));

import SubmitCostsPage from './page';

type ClientProps = ComponentProps<typeof CostSubmitClient>;

async function renderPage(search: Record<string, string>): Promise<ClientProps> {
  const element = (await SubmitCostsPage({
    params: Promise.resolve({ locale: 'ru', city: 'warsaw' }),
    searchParams: Promise.resolve(search),
  })) as ReactElement<ClientProps>;
  return element.props;
}

beforeEach(() => {
  state.findFirst.mockReset();
  state.findFirst.mockImplementation(async () => state.building);
  state.building = building;
});

describe('submit page: links from the Telegram bot', () => {
  it('prefills by b and attributes the form to tgbot', async () => {
    const props = await renderPage({
      b: BUILDING_ID,
      p: PLACE_ID,
      source: 'tgbot',
      utm_source: 'telegram',
      utm_medium: 'bot',
      utm_campaign: 'submit',
    });

    expect(props.source).toBe('tgbot');
    expect(state.findFirst).toHaveBeenCalledTimes(1);
    expect(state.findFirst.mock.calls[0][0].where).toEqual({ cityId: 'city-1', id: BUILDING_ID });
    expect(props.prefill).toEqual({
      buildingId: BUILDING_ID,
      street: 'Grójecka',
      buildingNumber: '45',
      district: 'ochota',
      placeId: PLACE_ID,
      lat: 52.22,
      lng: 20.98,
      addressFull: 'Grójecka 45, Warszawa',
    });
  });

  it('prefills a building without a place id of its own', async () => {
    state.building = { ...building, placeId: null };
    const props = await renderPage({ b: BUILDING_ID, p: 'geocoded-place', source: 'tgbot' });

    expect(state.findFirst.mock.calls[0][0].where).toEqual({ cityId: 'city-1', id: BUILDING_ID });
    expect(props.prefill?.buildingId).toBe(BUILDING_ID);
    expect(props.prefill?.placeId).toBe('');
  });

  it('prefills by p with source=tgbot, as for the checker', async () => {
    const props = await renderPage({ p: PLACE_ID, source: 'tgbot' });

    expect(state.findFirst.mock.calls[0][0].where).toEqual({ cityId: 'city-1', placeId: PLACE_ID });
    expect(props.source).toBe('tgbot');
    expect(props.prefill?.buildingId).toBe(BUILDING_ID);
  });

  it('opens the form without a prefill when the place id matches no building', async () => {
    state.building = null;
    const props = await renderPage({ p: 'unknown-place', source: 'tgbot' });

    expect(props.source).toBe('tgbot');
    expect(props.prefill).toBeNull();
    expect(props.editMode).toBe(false);
  });

  it('opens the form without a prefill and without a lookup when there is no building', async () => {
    const props = await renderPage({ source: 'tgbot', utm_source: 'telegram' });

    expect(state.findFirst).not.toHaveBeenCalled();
    expect(props.source).toBe('tgbot');
    expect(props.prefill).toBeNull();
  });

  it('keeps an unknown source out of the attribution', async () => {
    const props = await renderPage({ p: PLACE_ID, source: 'tg_123456789' });

    expect(props.source).toBeUndefined();
    expect(state.findFirst).not.toHaveBeenCalled();
    expect(props.prefill).toBeNull();
  });
});
