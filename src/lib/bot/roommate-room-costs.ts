import type { RoommateProfile } from '@prisma/client';

import { MIN_AREA_REPORTS } from '@/lib/cost-figures';
import {
  loadRoomCostAreas,
  type PerPersonSplit,
  type RoomCostArea,
} from '@/lib/roommate/room-costs';

import { areaGroupLines, escapeHtml, money } from './format';
import { getCity } from './lookup';
import { rt } from './roommate-texts';
import { t, type BotLocale } from './texts';

/**
 * The room cost reference under the roommate counts (PRD 3 FR-17, spec 06 §Room cost
 * reference): per chosen district, or Warsaw for "any", the room figures of each group in one
 * line with its N (`areaGroupLines`, the area cards' rule and wording), the level said when a
 * district falls back to Warsaw, then D61's per-person line. Groups stay apart: no number is
 * blended over tenant reports and asking prices, and nothing is ranked or compared.
 */

/** A chosen district by its Polish name, or the city for "any", escaped. */
function areaLeadName(area: RoomCostArea, locale: BotLocale): string {
  return area.district ? escapeHtml(area.district.name) : t(locale, 'cityName');
}

/** D61's line, the one place it is worded; the flat figures name their own area. */
function splitLine(split: PerPersonSplit, locale: BotLocale): string {
  return rt(locale, 'roomSplit', {
    value: money(split.value) ?? '—',
    area: split.level === 'district' ? escapeHtml(split.name) : t(locale, 'cityName'),
    count: String(split.n),
  });
}

/**
 * One area's lines: the lead, one line per group (or "no room figures"), then the split of
 * each chosen district in it, once per flat area (districts that fall back to the same flat
 * figures share one line).
 */
function areaBlock(
  lead: string,
  room: RoomCostArea['room'],
  members: readonly RoomCostArea[],
  locale: BotLocale,
): string[] {
  const groups = room ? areaGroupLines(room.summary, locale) : [];
  const lines = [lead, ...(groups.length > 0 ? groups : [rt(locale, 'roomNoFigures')])];
  const shown = new Set<string>();
  for (const { split } of members) {
    const key = split && `${split.level}:${split.name}`;
    if (!split || !key || shown.has(key)) continue;
    shown.add(key);
    lines.push(splitLine(split, locale));
  }
  return lines;
}

/**
 * The reference's text: districts that answer on their own in the person's order, then the
 * Warsaw lines once for every district below MIN_AREA_REPORTS room reports (introduced with
 * all their names), then the areas without any room report.
 */
function roomCostsText(areas: readonly RoomCostArea[], locale: BotLocale): string {
  const blocks: string[][] = [];
  const fallbacks: RoomCostArea[] = [];
  const empty: RoomCostArea[] = [];
  for (const area of areas) {
    if (!area.room) empty.push(area);
    else if (area.district && area.room.level === 'city') fallbacks.push(area);
    else {
      const lead = rt(locale, 'roomAreaLead', { area: areaLeadName(area, locale) });
      blocks.push(areaBlock(lead, area.room, [area], locale));
    }
  }
  if (fallbacks.length > 0) {
    const names = fallbacks.map((area) => areaLeadName(area, locale));
    const min = String(MIN_AREA_REPORTS);
    const lead =
      names.length === 1
        ? rt(locale, 'roomFallback', { district: names[0], min })
        : rt(locale, 'roomFallbackMany', { districts: names.join(', '), min });
    blocks.push(areaBlock(lead, fallbacks[0].room, fallbacks, locale));
  }
  if (empty.length > 0) {
    const names = empty.map((area) => areaLeadName(area, locale)).join(', ');
    blocks.push(areaBlock(rt(locale, 'roomAreaLead', { area: names }), null, empty, locale));
  }
  return `${rt(locale, 'roomHeader')}\n${blocks.map((block) => block.join('\n')).join('\n\n')}`;
}

/**
 * The room cost reference for a saved profile, or null when it is left out of the counts
 * reply: the city is missing, or a loader failed (only the error's message is logged).
 * Every chat locale has the area texts (`texts.ts` has English too).
 */
export async function roomCostsReply(
  profile: Pick<RoommateProfile, 'districtSlugs' | 'anyDistrict'>,
  locale: BotLocale,
): Promise<string | null> {
  try {
    const city = await getCity();
    if (!city) return null;
    const areas = await loadRoomCostAreas(city, profile.anyDistrict ? [] : profile.districtSlugs);
    return roomCostsText(areas, locale);
  } catch (error) {
    console.error(
      '[bot/roommate] room costs failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return null;
  }
}
