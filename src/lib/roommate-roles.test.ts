import { describe, expect, it } from 'vitest';
import {
  INITIAL_ROOMMATE_ROLE_STATE,
  ROOMMATE_OFFER_HREF,
  chooseRoommateRole,
  reopenRoommateRoles,
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

  it('sends only the intent as an event property', () => {
    expect(Object.keys(chooseRoommateRole('find_room').properties)).toEqual(['intent']);
    expect(Object.keys(chooseRoommateRole('offer_room').properties)).toEqual(['intent']);
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
  });

  it('offers a room on /create-listing?type=roommate', () => {
    expect(ROOMMATE_OFFER_HREF).toEqual({
      pathname: '/create-listing',
      query: { type: 'roommate' },
    });
  });
});
