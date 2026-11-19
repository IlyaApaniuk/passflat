import { describe, expect, it } from 'vitest';

import { parseSubmitParams, prefillBuildingWhere, SUBMIT_SOURCES } from './cost-submit-params';

const BUILDING_ID = '3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b';
const PLACE_ID = 'ChIJd8BlQ2BZwokRAFUEcm_qrcA';

describe('parseSubmitParams: source', () => {
  it.each(SUBMIT_SOURCES)('accepts source=%s', (source) => {
    expect(parseSubmitParams({ source }).source).toBe(source);
  });

  it('accepts the bot source', () => {
    expect(SUBMIT_SOURCES).toContain('tgbot');
    expect(parseSubmitParams({ source: 'tgbot' }).source).toBe('tgbot');
  });

  it.each([
    ['an unknown value', { source: 'newsletter' }],
    ['a different case', { source: 'TGBOT' }],
    ['a repeated parameter', { source: ['tgbot', 'checker'] }],
    ['no parameter', {}],
  ])('drops %s', (_, search) => {
    expect(parseSubmitParams(search).source).toBeUndefined();
  });
});

describe('parseSubmitParams: prefill', () => {
  it.each(['checker', 'review', 'tgbot'])('prefills by p with source=%s', (source) => {
    const params = parseSubmitParams({ p: PLACE_ID, source });
    expect(params.prefillPlaceId).toBe(PLACE_ID);
    expect(params.prefillBuildingId).toBeUndefined();
    expect(prefillBuildingWhere(params, 'city-1')).toEqual({ cityId: 'city-1', placeId: PLACE_ID });
  });

  it.each(['building', 'tgbot'])('prefills by b with source=%s', (source) => {
    const params = parseSubmitParams({ b: BUILDING_ID, source });
    expect(params.prefillBuildingId).toBe(BUILDING_ID);
    expect(prefillBuildingWhere(params, 'city-1')).toEqual({ cityId: 'city-1', id: BUILDING_ID });
  });

  it('prefills by b without a source, as before', () => {
    expect(parseSubmitParams({ b: BUILDING_ID }).prefillBuildingId).toBe(BUILDING_ID);
  });

  it('ignores p without an accepted source', () => {
    expect(parseSubmitParams({ p: PLACE_ID }).prefillPlaceId).toBeUndefined();
    expect(parseSubmitParams({ p: PLACE_ID, source: 'spam' }).prefillPlaceId).toBeUndefined();
  });

  it('prefers the building id when the bot sends both b and p', () => {
    const params = parseSubmitParams({ b: BUILDING_ID, p: PLACE_ID, source: 'tgbot' });
    expect(params).toMatchObject({ source: 'tgbot', prefillBuildingId: BUILDING_ID });
    expect(params.prefillPlaceId).toBeUndefined();
    expect(prefillBuildingWhere(params, 'city-1')).toEqual({ cityId: 'city-1', id: BUILDING_ID });
  });

  it('falls back to p when b is not a building id', () => {
    const params = parseSubmitParams({ b: 'not-a-uuid', p: PLACE_ID, source: 'tgbot' });
    expect(params.prefillBuildingId).toBeUndefined();
    expect(params.prefillPlaceId).toBe(PLACE_ID);
  });

  it('trims the values and rejects an empty or overlong place id', () => {
    expect(parseSubmitParams({ b: ` ${BUILDING_ID} ` }).prefillBuildingId).toBe(BUILDING_ID);
    expect(parseSubmitParams({ p: `  ${PLACE_ID}  `, source: 'tgbot' }).prefillPlaceId).toBe(
      PLACE_ID,
    );
    expect(parseSubmitParams({ p: '   ', source: 'tgbot' }).prefillPlaceId).toBeUndefined();
    expect(
      parseSubmitParams({ p: 'x'.repeat(256), source: 'tgbot' }).prefillPlaceId,
    ).toBeUndefined();
  });

  it('opens the bot form without a prefill when there is no building', () => {
    const params = parseSubmitParams({ source: 'tgbot' });
    expect(params).toEqual({
      isEditMode: false,
      reportId: undefined,
      source: 'tgbot',
      prefillBuildingId: undefined,
      prefillPlaceId: undefined,
    });
    expect(prefillBuildingWhere(params, 'city-1')).toBeNull();
  });

  it('never prefills in edit mode', () => {
    const params = parseSubmitParams({
      edit: 'true',
      id: 'report-1',
      b: BUILDING_ID,
      p: PLACE_ID,
      source: 'tgbot',
    });
    expect(params).toMatchObject({ isEditMode: true, reportId: 'report-1' });
    expect(prefillBuildingWhere(params, 'city-1')).toBeNull();
  });
});
