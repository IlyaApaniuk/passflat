import { describe, expect, it } from 'vitest';

import { FLATMATE_SURFACES } from '@/lib/analytics/telegram-events';

import type { FlatmateBlockCounts } from './flatmate-block';
import { flatmateCalloutView } from './flatmate-callout';

// PRD 4 FR-8 (spec 08 §Flatmate callout): the pure props mapper of the shared callout.

const COUNTS: FlatmateBlockCounts = {
  status: 'counts',
  total: 7,
  top: [{ slug: 'mokotow', count: 4 }],
};

describe('flatmateCalloutView', () => {
  describe('the count line per counts state', () => {
    it.each<[string, FlatmateBlockCounts | undefined, 'count' | 'first' | 'none', number]>([
      ['counts above zero → the number', COUNTS, 'count', 7],
      [
        'zero profiles → "be among the first", no number',
        { status: 'counts', total: 0, top: [] },
        'first',
        0,
      ],
      ['unavailable (database error) → no line', { status: 'unavailable' }, 'none', 0],
      ['not loaded (static page, rejected loader) → no line', undefined, 'none', 0],
    ])('%s', (_name, counts, countLine, total) => {
      const view = flatmateCalloutView({ surface: 'hub', counts, hasUsername: true });
      expect(view.countLine).toBe(countLine);
      expect(view.total).toBe(total);
    });

    it('the count line does not depend on the username', () => {
      expect(
        flatmateCalloutView({ surface: 'home', counts: COUNTS, hasUsername: false }).countLine,
      ).toBe('count');
    });
  });

  describe.each(FLATMATE_SURFACES)('surface %s', (surface) => {
    const view = flatmateCalloutView({ surface, counts: COUNTS, hasUsername: true });

    it('payload mate_web_<surface>, placement flatmate_callout_<surface>', () => {
      expect(view.payload).toBe(`mate_web_${surface}`);
      expect(view.placement).toBe(`flatmate_callout_${surface}`);
    });

    it('the thesis title only on home, the question elsewhere', () => {
      expect(view.titleKey).toBe(
        surface === 'home' ? 'flatmateCallout.homeTitle' : 'flatmateCallout.title',
      );
    });

    it('with the username: the bot button', () => {
      expect(view.showBotButton).toBe(true);
    });
  });

  describe('the placements of PRD 4 FR-11, FR-12 (spec 08 §Callout placements)', () => {
    it('building: no counts are passed → the question, no count line, mate_web_building', () => {
      expect(flatmateCalloutView({ surface: 'building', hasUsername: true })).toEqual({
        titleKey: 'flatmateCallout.title',
        countLine: 'none',
        total: 0,
        showBotButton: true,
        payload: 'mate_web_building',
        placement: 'flatmate_callout_building',
      });
    });

    it('hub: the loaded counts → the question, the count line, mate_web_hub', () => {
      expect(flatmateCalloutView({ surface: 'hub', counts: COUNTS, hasUsername: true })).toEqual({
        titleKey: 'flatmateCallout.title',
        countLine: 'count',
        total: 7,
        showBotButton: true,
        payload: 'mate_web_hub',
        placement: 'flatmate_callout_hub',
      });
    });

    it('hub: a rejected load (counts undefined) → no count line', () => {
      expect(flatmateCalloutView({ surface: 'hub', hasUsername: true }).countLine).toBe('none');
    });

    it('calculator (FR-12): no counts are passed → the question, no count line, mate_web_calculator', () => {
      expect(flatmateCalloutView({ surface: 'calculator', hasUsername: true })).toEqual({
        titleKey: 'flatmateCallout.title',
        countLine: 'none',
        total: 0,
        showBotButton: true,
        payload: 'mate_web_calculator',
        placement: 'flatmate_callout_calculator',
      });
    });

    it('guide (FR-12): a static page passes no counts → the question, no count line, mate_web_guide', () => {
      expect(flatmateCalloutView({ surface: 'guide', hasUsername: true })).toEqual({
        titleKey: 'flatmateCallout.title',
        countLine: 'none',
        total: 0,
        showBotButton: true,
        payload: 'mate_web_guide',
        placement: 'flatmate_callout_guide',
      });
    });

    it('report (FR-12): no counts → the question, no count line, its own mate_web_report', () => {
      expect(flatmateCalloutView({ surface: 'report', hasUsername: true })).toEqual({
        titleKey: 'flatmateCallout.title',
        countLine: 'none',
        total: 0,
        showBotButton: true,
        payload: 'mate_web_report',
        placement: 'flatmate_callout_report',
      });
    });
  });

  it('without the username: no bot button, the rest unchanged', () => {
    const withBot = flatmateCalloutView({
      surface: 'calculator',
      counts: COUNTS,
      hasUsername: true,
    });
    const without = flatmateCalloutView({
      surface: 'calculator',
      counts: COUNTS,
      hasUsername: false,
    });
    expect(without.showBotButton).toBe(false);
    expect({ ...without, showBotButton: true }).toEqual(withBot);
  });
});
