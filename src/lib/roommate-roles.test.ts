import { describe, expect, it } from 'vitest';
import {
  INITIAL_ROOMMATE_ROLE_STATE,
  ROOMMATE_OFFER_HREF,
  chooseRoommateRole,
  reopenRoommateRoles,
  roommatePageLayout,
  showsFlatmateBlock,
  showsRoomMoneyBlock,
} from './roommate-roles';

describe('roommate role selector logic', () => {
  it('starts open with no intent', () => {
    expect(INITIAL_ROOMMATE_ROLE_STATE).toEqual({ collapsed: false });
    expect(INITIAL_ROOMMATE_ROLE_STATE.intent).toBeUndefined();
  });

  it('find_room sets the intent, collapses the choices and scrolls the list to the top', () => {
    expect(chooseRoommateRole('find_room')).toEqual({
      state: { intent: 'find_room', collapsed: true },
      event: 'roommate_intent_selected',
      properties: { intent: 'find_room' },
      scrollListToTop: true,
    });
  });

  it('offer_room sets the intent, keeps the choices open and does not scroll', () => {
    expect(chooseRoommateRole('offer_room')).toEqual({
      state: { intent: 'offer_room', collapsed: false },
      event: 'roommate_intent_selected',
      properties: { intent: 'offer_room' },
      scrollListToTop: false,
    });
  });

  it('find_flatmate sets the intent, collapses into a chip, scrolls to the block and does not navigate', () => {
    expect(chooseRoommateRole('find_flatmate')).toEqual({
      state: { intent: 'find_flatmate', collapsed: true },
      event: 'roommate_intent_selected',
      properties: { intent: 'find_flatmate' },
      scrollListToTop: true,
    });
  });

  it('sends only the intent as an event property', () => {
    expect(Object.keys(chooseRoommateRole('find_room').properties)).toEqual(['intent']);
    expect(Object.keys(chooseRoommateRole('offer_room').properties)).toEqual(['intent']);
    expect(Object.keys(chooseRoommateRole('find_flatmate').properties)).toEqual(['intent']);
  });

  it('the flatmate block shows by default and for find_flatmate, not for find_room or offer_room (PRD 4 FR-1)', () => {
    // All four intents: undefined (no role chosen), find_flatmate, find_room, offer_room.
    expect(showsFlatmateBlock(INITIAL_ROOMMATE_ROLE_STATE)).toBe(true);
    expect(showsFlatmateBlock({ intent: undefined, collapsed: false })).toBe(true);
    const flatmate = chooseRoommateRole('find_flatmate').state;
    expect(showsFlatmateBlock(flatmate)).toBe(true);
    expect(showsFlatmateBlock(reopenRoommateRoles(flatmate))).toBe(true);
    expect(showsFlatmateBlock(chooseRoommateRole('find_room').state)).toBe(false);
    expect(showsFlatmateBlock(chooseRoommateRole('offer_room').state)).toBe(false);
    // The chip reopened keeps the chosen intent, so the block stays hidden.
    expect(showsFlatmateBlock(reopenRoommateRoles(chooseRoommateRole('find_room').state))).toBe(
      false,
    );
  });

  it('the room money block shows for find_room and on a city without offers, whatever the role', () => {
    const findRoom = chooseRoommateRole('find_room').state;
    expect(showsRoomMoneyBlock(findRoom, 'none')).toBe(true);
    expect(showsRoomMoneyBlock(findRoom, 'no_match_for_filters')).toBe(true);
    expect(showsRoomMoneyBlock(findRoom, 'no_offers_in_city')).toBe(true);
    // The chip reopened keeps the intent, so the block stays.
    expect(showsRoomMoneyBlock(reopenRoommateRoles(findRoom), 'none')).toBe(true);

    for (const state of [
      INITIAL_ROOMMATE_ROLE_STATE,
      chooseRoommateRole('offer_room').state,
      chooseRoommateRole('find_flatmate').state,
    ]) {
      expect(showsRoomMoneyBlock(state, 'none')).toBe(false);
      expect(showsRoomMoneyBlock(state, 'no_match_for_filters')).toBe(false);
      expect(showsRoomMoneyBlock(state, 'no_offers_in_city')).toBe(true);
    }
  });

  it('the chip reopens the choices and keeps the chosen intent', () => {
    const collapsed = chooseRoommateRole('find_room').state;
    expect(reopenRoommateRoles(collapsed)).toEqual({ intent: 'find_room', collapsed: false });
    expect(collapsed).toEqual({ intent: 'find_room', collapsed: true });
  });

  it('a second choice replaces the first', () => {
    const reopened = reopenRoommateRoles(chooseRoommateRole('find_room').state);
    expect(reopened.intent).toBe('find_room');
    expect(chooseRoommateRole('offer_room').state.intent).toBe('offer_room');
    expect(chooseRoommateRole('find_flatmate').state.intent).toBe('find_flatmate');
  });

  it('offers a room on /create-listing?type=roommate', () => {
    expect(ROOMMATE_OFFER_HREF).toEqual({
      pathname: '/create-listing',
      query: { type: 'roommate' },
    });
  });
});

describe('roommatePageLayout (spec 08 §Roommate page default view)', () => {
  type Input = Parameters<typeof roommatePageLayout>[0];
  const DEFAULT_VIEW: Input = {
    listingType: 'roommate',
    citySlug: 'warsaw',
    cityOfferCount: 0,
    roleState: INITIAL_ROOMMATE_ROLE_STATE,
    emptyKind: 'no_offers_in_city',
    hasUsername: true,
  };
  const layout = (overrides: Partial<Input> = {}) =>
    roommatePageLayout({ ...DEFAULT_VIEW, ...overrides });

  it('the default view: the flatmate block, room money, no count line and no type tabs at 0 offers, the selector above the tabs', () => {
    expect(layout()).toEqual({
      showFlatmateBlock: true,
      showRoomMoney: true,
      showCountLine: false,
      showBotButton: true,
      selectorAboveTabs: true,
      showTypeTabs: false,
      showH1: true,
    });
  });

  it('each intent: find_flatmate keeps the block, find_room and offer_room hide it', () => {
    const at = (intent: 'find_room' | 'offer_room' | 'find_flatmate') =>
      layout({ roleState: chooseRoommateRole(intent).state });
    expect(at('find_flatmate')).toMatchObject({ showFlatmateBlock: true, showBotButton: true });
    expect(at('find_room')).toMatchObject({ showFlatmateBlock: false, showBotButton: false });
    expect(at('offer_room')).toMatchObject({ showFlatmateBlock: false, showBotButton: false });
    // The rest does not depend on the role.
    for (const intent of ['find_room', 'offer_room', 'find_flatmate'] as const) {
      expect(at(intent)).toMatchObject({
        showCountLine: false,
        selectorAboveTabs: true,
        showTypeTabs: false,
      });
    }
    // Room money keeps its own rule (find_room, or no offer in the city whatever the role).
    expect(at('find_room').showRoomMoney).toBe(true);
    expect(at('offer_room').showRoomMoney).toBe(true);
    expect(
      layout({ roleState: chooseRoommateRole('offer_room').state, emptyKind: 'none' })
        .showRoomMoney,
    ).toBe(false);
  });

  it('offers present: the block stays first, the count line and the type tabs are back, no room money by default', () => {
    expect(layout({ cityOfferCount: 3, emptyKind: 'none' })).toEqual({
      showFlatmateBlock: true,
      showRoomMoney: false,
      showCountLine: true,
      showBotButton: true,
      selectorAboveTabs: true,
      showTypeTabs: true,
      showH1: true,
    });
    // Filters that match nothing in a city with offers: still offers, so the count line shows.
    expect(layout({ cityOfferCount: 3, emptyKind: 'no_match_for_filters' }).showCountLine).toBe(
      true,
    );
  });

  it('no username: the block without its bot button, the rest unchanged', () => {
    expect(layout({ hasUsername: false })).toEqual({
      showFlatmateBlock: true,
      showRoomMoney: true,
      showCountLine: false,
      showBotButton: false,
      selectorAboveTabs: true,
      showTypeTabs: false,
      showH1: true,
    });
  });

  it('another city: no flatmate block and no room money; the selector, the count rule and the tabs rule stay', () => {
    expect(layout({ citySlug: 'krakow' })).toEqual({
      showFlatmateBlock: false,
      showRoomMoney: false,
      showCountLine: false,
      showBotButton: false,
      selectorAboveTabs: true,
      showTypeTabs: false,
      showH1: true,
    });
  });

  it('/replacement and /sublet are unchanged: count line, type tabs, no selector, no blocks', () => {
    for (const listingType of ['replacement', 'sublet'] as const) {
      expect(layout({ listingType, cityOfferCount: undefined })).toEqual({
        showFlatmateBlock: false,
        showRoomMoney: false,
        showCountLine: true,
        showBotButton: false,
        selectorAboveTabs: false,
        showTypeTabs: true,
        showH1: false,
      });
    }
  });
});

describe('roommatePageLayout: the type tabs (spec 08 §Footer product column, PRD 4 FR-7, D82)', () => {
  const at = (
    listingType: 'roommate' | 'replacement' | 'sublet',
    cityOfferCount: number | undefined,
    overrides: Partial<Parameters<typeof roommatePageLayout>[0]> = {},
  ) =>
    roommatePageLayout({
      listingType,
      citySlug: 'warsaw',
      cityOfferCount,
      roleState: INITIAL_ROOMMATE_ROLE_STATE,
      emptyKind: cityOfferCount === 0 ? 'no_offers_in_city' : 'none',
      hasUsername: true,
      ...overrides,
    }).showTypeTabs;

  it('the roommate page with no offer in the city: no type tabs, whatever the role, username or city', () => {
    expect(at('roommate', 0)).toBe(false);
    for (const intent of ['find_room', 'offer_room', 'find_flatmate'] as const) {
      expect(at('roommate', 0, { roleState: chooseRoommateRole(intent).state }), intent).toBe(
        false,
      );
    }
    expect(at('roommate', 0, { hasUsername: false })).toBe(false);
    expect(at('roommate', 0, { citySlug: 'krakow' })).toBe(false);
  });

  it('the roommate page once the city has an offer: the type tabs are back', () => {
    expect(at('roommate', 1)).toBe(true);
    expect(at('roommate', 3)).toBe(true);
    // Filters that match nothing in a city with offers: the city still has offers.
    expect(at('roommate', 3, { emptyKind: 'no_match_for_filters' })).toBe(true);
  });

  it('/replacement and /sublet keep their type tabs, also with nothing listed', () => {
    for (const listingType of ['replacement', 'sublet'] as const) {
      expect(at(listingType, undefined), listingType).toBe(true);
      expect(at(listingType, 0), listingType).toBe(true);
    }
  });
});

describe('roommatePageLayout: the page shell (spec 08 §Roommate page shell and metadata)', () => {
  const at = (
    listingType: 'roommate' | 'replacement' | 'sublet',
    overrides: Partial<Parameters<typeof roommatePageLayout>[0]> = {},
  ) =>
    roommatePageLayout({
      listingType,
      citySlug: 'warsaw',
      cityOfferCount: listingType === 'roommate' ? 0 : undefined,
      roleState: INITIAL_ROOMMATE_ROLE_STATE,
      emptyKind: 'no_offers_in_city',
      hasUsername: true,
      ...overrides,
    });

  it('the h1 is on the roommate page only (PRD 4 FR-3)', () => {
    expect(at('roommate').showH1).toBe(true);
    expect(at('replacement').showH1).toBe(false);
    expect(at('sublet').showH1).toBe(false);
  });

  it('the h1 does not depend on the role, the offers, the username or the city', () => {
    for (const intent of ['find_room', 'offer_room', 'find_flatmate'] as const) {
      expect(at('roommate', { roleState: chooseRoommateRole(intent).state }).showH1).toBe(true);
    }
    expect(at('roommate', { cityOfferCount: 3, emptyKind: 'none' }).showH1).toBe(true);
    expect(at('roommate', { hasUsername: false }).showH1).toBe(true);
    expect(at('roommate', { citySlug: 'krakow' }).showH1).toBe(true);
  });
});
