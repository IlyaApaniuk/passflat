/**
 * What tenants can report about a building.
 *
 * Building-level on purpose. The listing vocabulary in `amenities.ts` mixes in
 * flat-and-lease facts ("pets allowed", "recent renovation") that differ
 * between landlords in the same stairwell; publishing those as properties of a
 * building would be misinformation. Only attributes that transfer to the next
 * tenant of the same address belong here.
 *
 * Sentiment is stated from the tenant's point of view, which is why damp and
 * poor ventilation are negative here while the listing vocabulary — where an
 * owner describes their own flat — softens them to neutral.
 */

export type TagSentiment = 'good' | 'neutral' | 'bad';

export interface BuildingTagConfig {
  key: string;
  sentiment: TagSentiment;
}

export interface BuildingTagSection {
  key: string;
  items: BuildingTagConfig[];
}

export const BUILDING_TAG_SECTIONS: BuildingTagSection[] = [
  {
    key: 'noise',
    items: [
      { key: 'quietBuilding', sentiment: 'good' },
      { key: 'neighborsAudible', sentiment: 'bad' },
      { key: 'streetAudible', sentiment: 'bad' },
      { key: 'thinFloors', sentiment: 'bad' },
    ],
  },
  {
    key: 'climate',
    items: [
      { key: 'warmInWinter', sentiment: 'good' },
      { key: 'coldInWinter', sentiment: 'bad' },
      { key: 'hotInSummer', sentiment: 'bad' },
      { key: 'highHumidity', sentiment: 'bad' },
      { key: 'poorVentilation', sentiment: 'bad' },
    ],
  },
  {
    key: 'condition',
    items: [
      { key: 'workingElevator', sentiment: 'good' },
      { key: 'noElevator', sentiment: 'neutral' },
      { key: 'elevatorBreaks', sentiment: 'bad' },
      { key: 'tidyEntrance', sentiment: 'good' },
      { key: 'neglectedEntrance', sentiment: 'bad' },
      { key: 'oldPlumbing', sentiment: 'bad' },
    ],
  },
  {
    key: 'management',
    items: [
      { key: 'repairsHandledFast', sentiment: 'good' },
      { key: 'repairsIgnored', sentiment: 'bad' },
      { key: 'intercomWorks', sentiment: 'good' },
      { key: 'binsOverflowing', sentiment: 'bad' },
    ],
  },
  {
    key: 'outside',
    items: [
      { key: 'easyParking', sentiment: 'good' },
      { key: 'hardParking', sentiment: 'bad' },
      { key: 'greenYard', sentiment: 'good' },
    ],
  },
];

export const BUILDING_TAGS: BuildingTagConfig[] = BUILDING_TAG_SECTIONS.flatMap(
  (section) => section.items,
);

const SENTIMENT_BY_KEY = new Map(BUILDING_TAGS.map((tag) => [tag.key, tag.sentiment]));

export function isBuildingTagKey(key: string): boolean {
  return SENTIMENT_BY_KEY.has(key);
}

export function tagSentiment(key: string): TagSentiment | null {
  return SENTIMENT_BY_KEY.get(key) ?? null;
}

/**
 * Votes a negative tag needs before it is published.
 *
 * In a four-flat building "repairs ignored" names one identifiable person, and
 * the "it's about the building, not the landlord" defence stops working — the
 * exposure Poland's criminal defamation rules (art. 212 k.k.) create. A second
 * independent voice is the cheapest guard we can apply without knowing how many
 * flats a building has, which the data almost never tells us.
 */
export const NEGATIVE_TAG_MIN_VOTES = 2;

export interface TagVote {
  tagKey: string;
  /** Whether this voter also submitted a cost report for the building. */
  fromCostReport: boolean;
}

interface AggregatedTag {
  key: string;
  sentiment: TagSentiment;
  votes: number;
  /** Of those votes, how many came from someone who also reported costs. */
  costReportVotes: number;
}

export interface BuildingTagSummary {
  tags: AggregatedTag[];
  /** Distinct voters behind the published tags. */
  voters: number;
  costReportVoters: number;
}

/**
 * Aggregates votes into what may be shown.
 *
 * Positive and neutral tags publish from the first voice: with a closed
 * vocabulary the worst a single vote can say is "someone found damp", and the
 * count shown next to it lets the reader discount it. Negatives wait for a
 * second voice (see NEGATIVE_TAG_MIN_VOTES).
 */
export function aggregateTagVotes(
  votes: TagVote[],
  voterKeys: { total: number; fromCostReports: number },
): BuildingTagSummary {
  const byKey = new Map<string, AggregatedTag>();

  for (const vote of votes) {
    const sentiment = SENTIMENT_BY_KEY.get(vote.tagKey);
    if (!sentiment) continue;

    const existing = byKey.get(vote.tagKey) ?? {
      key: vote.tagKey,
      sentiment,
      votes: 0,
      costReportVotes: 0,
    };
    existing.votes += 1;
    if (vote.fromCostReport) existing.costReportVotes += 1;
    byKey.set(vote.tagKey, existing);
  }

  const tags = [...byKey.values()]
    .filter((tag) => tag.sentiment !== 'bad' || tag.votes >= NEGATIVE_TAG_MIN_VOTES)
    // Cost-report-backed tags lead, then the most-reported ones.
    .sort(
      (a, b) =>
        b.costReportVotes - a.costReportVotes || b.votes - a.votes || a.key.localeCompare(b.key),
    );

  return { tags, voters: voterKeys.total, costReportVoters: voterKeys.fromCostReports };
}
