import { describe, expect, it } from 'vitest';

import { parseStartPayload } from '@/lib/bot/start-payload';

import {
  botStartPayload,
  botStartUrl,
  FLATMATE_SURFACES,
  type FlatmateSurface,
  type TelegramBotSource,
  telegramBotOpenedProperties,
} from './telegram-events';

// Every source of the union, with its payload (spec 08 §Flatmate callout). A source missing here
// fails typecheck through `satisfies`.
const PAYLOADS = {
  checker: 'web_checker',
  empty: 'web_empty',
  roommate: 'mate_web_roommate',
  home: 'mate_web_home',
  building: 'mate_web_building',
  district: 'mate_web_district',
  hub: 'mate_web_hub',
  calculator: 'mate_web_calculator',
  guide: 'mate_web_guide',
  report: 'mate_web_report',
} as const satisfies Record<TelegramBotSource, string>;

const SOURCES = Object.keys(PAYLOADS) as TelegramBotSource[];

describe('TelegramBotSource (PRD 4 values, spec 01)', () => {
  it('the flatmate surfaces are the seven callout surfaces, in the spec order', () => {
    expect(FLATMATE_SURFACES).toEqual([
      'home',
      'building',
      'district',
      'hub',
      'calculator',
      'guide',
      'report',
    ]);
  });

  it('the table covers exactly the old three sources plus the seven surfaces', () => {
    expect([...SOURCES].sort()).toEqual(
      ['checker', 'empty', 'roommate', ...FLATMATE_SURFACES].sort(),
    );
  });

  it.each(SOURCES)('%s: no building → its payload; a building → b_<id>', (source) => {
    expect(botStartPayload(source)).toBe(PAYLOADS[source]);
    expect(botStartPayload(source, '')).toBe(PAYLOADS[source]);
    expect(botStartPayload(source, 'bld_1')).toBe('b_bld_1');
    expect(botStartPayload(source)).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it.each(FLATMATE_SURFACES)(
    'mate_web_%s round-trips through the bot into the roommate entry',
    (surface: FlatmateSurface) => {
      expect(parseStartPayload(botStartPayload(surface))).toEqual({
        kind: 'roommate',
        source: 'web',
        detail: surface,
      });
    },
  );

  it.each(FLATMATE_SURFACES)(
    '%s: telegram_bot_opened has the surface as source and no building context',
    (surface) => {
      expect(telegramBotOpenedProperties(surface)).toEqual({
        source: surface,
        has_building_context: false,
      });
    },
  );

  it('the checker payloads stay web_<source> in the bot', () => {
    expect(parseStartPayload(botStartPayload('checker'))).toEqual({
      kind: 'web',
      source: 'checker',
    });
    expect(parseStartPayload(botStartPayload('empty'))).toEqual({ kind: 'web', source: 'empty' });
    expect(parseStartPayload(botStartPayload('roommate'))).toEqual({
      kind: 'roommate',
      source: 'web',
      detail: 'roommate',
    });
  });
});

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
