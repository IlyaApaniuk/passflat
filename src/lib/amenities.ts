export const AMENITY_CATEGORIES = [
  {
    categoryKey: "listings.amenityCategories.kitchen",
    items: ["fridge", "stove", "microwave", "dishwasher"],
  },
  {
    categoryKey: "listings.amenityCategories.bathroom",
    items: ["bathtub", "washingMachine", "dryer"],
  },
  {
    categoryKey: "listings.amenityCategories.comfort",
    items: ["furnished", "ac", "tv", "balcony", "terrace", "deskSetup", "wifi"],
  },
  {
    categoryKey: "listings.amenityCategories.building",
    items: ["elevator", "storage", "intercom", "closedArea"],
  },
  {
    categoryKey: "listings.amenityCategories.parking",
    items: ["parking", "garage"],
  },
  {
    categoryKey: "listings.amenityCategories.safety",
    items: ["smokeDetector", "firstAidKit"],
  },
] as const;

export const AMENITY_KEYS = AMENITY_CATEGORIES.flatMap((c) => c.items);

export type AmenityKey = (typeof AMENITY_CATEGORIES)[number]["items"][number];

export type ThingsToKnowSentiment = "good" | "neutral";

export interface ThingsToKnowItem {
  key: string;
  sentiment: ThingsToKnowSentiment;
}

export const THINGS_TO_KNOW_SECTIONS = [
  {
    titleKey: "listings.thingsToKnow.sectionRules",
    items: [
      { key: "petsAllowed", sentiment: "good" as const },
      { key: "smokingAllowed", sentiment: "neutral" as const },
      { key: "noSmoking", sentiment: "good" as const },
      { key: "noParties", sentiment: "neutral" as const },
    ],
  },
  {
    titleKey: "listings.thingsToKnow.sectionNoise",
    items: [
      { key: "quietApartment", sentiment: "good" as const },
      { key: "neighborsAudible", sentiment: "neutral" as const },
      { key: "streetAudible", sentiment: "neutral" as const },
    ],
  },
  {
    titleKey: "listings.thingsToKnow.sectionClimate",
    items: [
      { key: "warmInWinter", sentiment: "good" as const },
      { key: "coolInWinter", sentiment: "neutral" as const },
      { key: "hotInSummer", sentiment: "neutral" as const },
    ],
  },
  {
    titleKey: "listings.thingsToKnow.sectionCondition",
    items: [
      { key: "recentRenovation", sentiment: "good" as const },
      { key: "highHumidity", sentiment: "neutral" as const },
      { key: "poorVentilation", sentiment: "neutral" as const },
      { key: "oldPlumbing", sentiment: "neutral" as const },
    ],
  },
  {
    titleKey: "listings.thingsToKnow.sectionInternet",
    items: [
      { key: "fastInternet", sentiment: "good" as const },
      { key: "slowInternet", sentiment: "neutral" as const },
    ],
  },
] as const;

export const THINGS_TO_KNOW_KEYS = THINGS_TO_KNOW_SECTIONS.flatMap((s) =>
  s.items.map((i) => i.key),
);

const sentimentMap = new Map<string, ThingsToKnowSentiment>(
  THINGS_TO_KNOW_SECTIONS.flatMap((s) =>
    s.items.map((i) => [i.key, i.sentiment] as const),
  ),
);

export function getThingsToKnowSentiment(
  key: string,
): ThingsToKnowSentiment {
  return sentimentMap.get(key) ?? "neutral";
}
