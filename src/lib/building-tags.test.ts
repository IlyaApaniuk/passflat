import { describe, expect, it } from 'vitest';

import {
  BUILDING_TAGS,
  BUILDING_TAG_SECTIONS,
  NEGATIVE_TAG_MIN_VOTES,
  aggregateTagVotes,
  isBuildingTagKey,
  tagSentiment,
  type TagVote,
} from './building-tags';

const voters = (total: number, fromCostReports = 0) => ({ total, fromCostReports });

describe('vocabulary', () => {
  it('has unique keys across sections', () => {
    const keys = BUILDING_TAGS.map((tag) => tag.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries no flat-or-lease facts that differ between landlords in one building', () => {
    // Pets, smoking and renovation belong to a specific flat's lease; publishing
    // them as building properties would misinform.
    const keys = new Set(BUILDING_TAGS.map((tag) => tag.key));
    for (const flatLevel of ['petsAllowed', 'smokingAllowed', 'noParties', 'recentRenovation']) {
      expect(keys.has(flatLevel)).toBe(false);
    }
  });

  it('resolves sentiment only for known keys', () => {
    expect(tagSentiment('highHumidity')).toBe('bad');
    expect(tagSentiment('warmInWinter')).toBe('good');
    expect(tagSentiment('nope')).toBeNull();
    expect(isBuildingTagKey('nope')).toBe(false);
  });

  it('groups every tag under a section', () => {
    expect(BUILDING_TAG_SECTIONS.flatMap((s) => s.items)).toHaveLength(BUILDING_TAGS.length);
  });
});

describe('aggregateTagVotes', () => {
  it('publishes a positive tag from a single voice', () => {
    const votes: TagVote[] = [{ tagKey: 'warmInWinter', fromCostReport: false }];
    const { tags } = aggregateTagVotes(votes, voters(1));
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ key: 'warmInWinter', votes: 1, sentiment: 'good' });
  });

  it('holds a lone negative back until a second voice confirms it', () => {
    // In a small building a single negative names one identifiable person.
    const one: TagVote[] = [{ tagKey: 'repairsIgnored', fromCostReport: true }];
    expect(aggregateTagVotes(one, voters(1, 1)).tags).toHaveLength(0);

    const two: TagVote[] = [
      { tagKey: 'repairsIgnored', fromCostReport: true },
      { tagKey: 'repairsIgnored', fromCostReport: false },
    ];
    const published = aggregateTagVotes(two, voters(2, 1)).tags;
    expect(published).toHaveLength(1);
    expect(published[0].votes).toBe(NEGATIVE_TAG_MIN_VOTES);
  });

  it('counts how many of a tag’s votes came with a cost report', () => {
    const votes: TagVote[] = [
      { tagKey: 'quietBuilding', fromCostReport: true },
      { tagKey: 'quietBuilding', fromCostReport: false },
    ];
    const [tag] = aggregateTagVotes(votes, voters(2, 1)).tags;
    expect(tag).toMatchObject({ votes: 2, costReportVotes: 1 });
  });

  it('sorts cost-report-backed tags first, then by weight of agreement', () => {
    const votes: TagVote[] = [
      { tagKey: 'greenYard', fromCostReport: false },
      { tagKey: 'greenYard', fromCostReport: false },
      { tagKey: 'greenYard', fromCostReport: false },
      { tagKey: 'workingElevator', fromCostReport: true },
      { tagKey: 'easyParking', fromCostReport: false },
    ];
    const keys = aggregateTagVotes(votes, voters(4, 1)).tags.map((tag) => tag.key);
    expect(keys[0]).toBe('workingElevator');
    expect(keys[1]).toBe('greenYard');
  });

  it('ignores votes for keys that left the vocabulary', () => {
    const votes: TagVote[] = [
      { tagKey: 'retiredTag', fromCostReport: true },
      { tagKey: 'tidyEntrance', fromCostReport: true },
    ];
    const { tags } = aggregateTagVotes(votes, voters(1, 1));
    expect(tags.map((tag) => tag.key)).toEqual(['tidyEntrance']);
  });

  it('reports the voter counts it was given', () => {
    const summary = aggregateTagVotes(
      [{ tagKey: 'greenYard', fromCostReport: true }],
      voters(5, 3),
    );
    expect(summary).toMatchObject({ voters: 5, costReportVoters: 3 });
  });
});
