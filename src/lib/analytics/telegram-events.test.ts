import { describe, expect, it } from 'vitest';

import { botStartPayload, botStartUrl, telegramBotOpenedProperties } from './telegram-events';

describe('telegramBotOpenedProperties', () => {
  it('marks a checker link that carries a building', () => {
    expect(telegramBotOpenedProperties('checker', 'bld_1')).toEqual({
      source: 'checker',
      has_building_context: true,
    });
  });

  it('marks an empty-state link that carries a building', () => {
    expect(telegramBotOpenedProperties('empty', 'bld_1')).toEqual({
      source: 'empty',
      has_building_context: true,
    });
  });

  it('reports no building context without a building id', () => {
    expect(telegramBotOpenedProperties('checker')).toEqual({
      source: 'checker',
      has_building_context: false,
    });
    expect(telegramBotOpenedProperties('empty', '')).toEqual({
      source: 'empty',
      has_building_context: false,
    });
  });

  it('the roommate block: source=roommate without building context (spec 02 §Find a flatmate)', () => {
    expect(telegramBotOpenedProperties('roommate')).toEqual({
      source: 'roommate',
      has_building_context: false,
    });
  });

  it('sends only the two properties (no ids, no free text)', () => {
    expect(Object.keys(telegramBotOpenedProperties('checker', 'bld_1')).sort()).toEqual([
      'has_building_context',
      'source',
    ]);
    expect(Object.keys(telegramBotOpenedProperties('roommate')).sort()).toEqual([
      'has_building_context',
      'source',
    ]);
  });
});

describe('botStartPayload', () => {
  it('a building link carries the building, whatever the surface', () => {
    expect(botStartPayload('checker', 'bld_1')).toBe('b_bld_1');
    expect(botStartPayload('empty', 'bld_1')).toBe('b_bld_1');
    expect(botStartPayload('roommate', 'bld_1')).toBe('b_bld_1');
  });

  it('the roommate block opens the roommate entry with its source', () => {
    expect(botStartPayload('roommate')).toBe('mate_web_roommate');
  });

  it('any other surface without a building sends web_<source>', () => {
    expect(botStartPayload('checker')).toBe('web_checker');
    expect(botStartPayload('empty')).toBe('web_empty');
    expect(botStartPayload('checker', '')).toBe('web_checker');
  });

  it('every payload fits the Telegram start parameter (64 chars of A-Z a-z 0-9 _ -)', () => {
    for (const payload of [
      botStartPayload('roommate'),
      botStartPayload('checker'),
      botStartPayload('empty'),
      botStartPayload('checker', '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f'),
    ]) {
      expect(payload).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });
});

describe('botStartUrl', () => {
  it('builds the t.me deep link with the payload', () => {
    expect(botStartUrl('passflat_test_bot', 'roommate')).toBe(
      'https://t.me/passflat_test_bot?start=mate_web_roommate',
    );
    expect(botStartUrl('passflat_test_bot', 'checker', 'bld_1')).toBe(
      'https://t.me/passflat_test_bot?start=b_bld_1',
    );
  });
});
