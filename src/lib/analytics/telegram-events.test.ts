import { describe, expect, it } from 'vitest';

import { telegramBotOpenedProperties } from './telegram-events';

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

  it('sends only the two properties (no ids, no free text)', () => {
    expect(Object.keys(telegramBotOpenedProperties('checker', 'bld_1')).sort()).toEqual([
      'has_building_context',
      'source',
    ]);
  });
});
