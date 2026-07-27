/**
 * Imports OpenStreetMap points of interest for a city into the local `pois`
 * table, which is what the location score reads at request time.
 *
 * Why an import at all: the public Overpass instances answer a city-wide query
 * in tens of seconds when they answer at all, allow two concurrent slots per
 * IP, and their usage policy rules out production traffic. Offline that is
 * fine — this script can be slow and retry as much as it likes.
 *
 * Usage:
 *   npx tsx prisma/import-osm-pois.ts [citySlug]     # default: warsaw
 *
 * Re-running is safe: rows are keyed by (osmType, osmId, category) and
 * upserted, then POIs that disappeared from OSM are pruned.
 */
import { PrismaClient } from '@prisma/client';
import {
  CATEGORIES,
  buildOverpassBboxQuery,
  categorizeTags,
  type BoundingBox,
} from '../src/lib/location-score';

const prisma = new PrismaClient();

// overpass-api.de first (fastest when healthy), then community mirrors. The
// old kumi.systems host moved to private.coffee and no longer resolves.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const REQUEST_TIMEOUT_MS = 300_000;
const MAX_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 15_000;
const WRITE_CHUNK_SIZE = 500;
/** Courtesy gap between queries — the public instances allow two slots per IP. */
const BETWEEN_QUERIES_MS = 2_000;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface PoiRow {
  citySlug: string;
  osmType: string;
  osmId: bigint;
  category: string;
  name: string | null;
  lat: number;
  lng: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const endpoint = OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length];
    const startedAt = Date.now();
    try {
      console.log(`  attempt ${attempt}/${MAX_ATTEMPTS} → ${new URL(endpoint).host}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Passflat/1.0 (poi-import; contact: hello@passflat.com)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) throw new Error(`responded ${res.status}`);

      const json = (await res.json()) as { elements?: OverpassElement[] };
      const elements = json.elements ?? [];
      console.log(
        `  ok in ${Math.round((Date.now() - startedAt) / 1000)}s — ${elements.length} elements`,
      );
      return elements;
    } catch (error) {
      lastError = error;
      console.warn(
        `  failed after ${Math.round((Date.now() - startedAt) / 1000)}s: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Overpass request failed');
}

/** One row per (object, category): a rail station is also public transport. */
function toRows(citySlug: string, elements: OverpassElement[]): PoiRow[] {
  const rows: PoiRow[] = [];

  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (lat == null || lng == null) continue;

    const tags = element.tags ?? {};
    for (const category of categorizeTags(tags)) {
      rows.push({
        citySlug,
        osmType: element.type,
        osmId: BigInt(element.id),
        category,
        name: tags.name ?? null,
        lat,
        lng,
      });
    }
  }

  return rows;
}

async function writeRows(citySlug: string, rows: PoiRow[], importedAt: Date) {
  if (rows.length === 0) return;
  for (let start = 0; start < rows.length; start += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + WRITE_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.poi.upsert({
          where: {
            osmType_osmId_category: {
              osmType: row.osmType,
              osmId: row.osmId,
              category: row.category,
            },
          },
          create: { ...row, importedAt },
          update: {
            citySlug: row.citySlug,
            name: row.name,
            lat: row.lat,
            lng: row.lng,
            importedAt,
          },
        }),
      ),
    );
    if (rows.length > WRITE_CHUNK_SIZE) {
      console.log(`  wrote ${Math.min(start + WRITE_CHUNK_SIZE, rows.length)}/${rows.length}`);
    }
  }
}

async function main() {
  const citySlug = (process.argv[2] ?? 'warsaw').toLowerCase();

  const city = await prisma.city.findUnique({
    where: { slug: citySlug },
    select: { slug: true, bounds: true },
  });
  if (!city) throw new Error(`City "${citySlug}" not found.`);

  const bounds = city.bounds as BoundingBox | null;
  if (
    !bounds ||
    [bounds.north, bounds.south, bounds.east, bounds.west].some((v) => typeof v !== 'number')
  ) {
    throw new Error(`City "${citySlug}" has no usable bounds.`);
  }

  console.log(`Importing OSM POIs for ${citySlug}`);
  console.log(`  bbox: ${bounds.south},${bounds.west} → ${bounds.north},${bounds.east}`);

  // One request per filter. A single query carrying every category over the
  // Warsaw bbox reliably 504s on the public instances; split up, each part
  // answers in seconds. Each filter is written as soon as it lands, so a run
  // that dies halfway still leaves the database better off than it found it.
  const filters = [...new Set(CATEGORIES.flatMap((category) => category.filters))];
  const importedAt = new Date();
  const failed: string[] = [];
  const written: Record<string, number> = {};

  for (const [index, filter] of filters.entries()) {
    console.log(`[${index + 1}/${filters.length}] ${filter}`);
    let elements: OverpassElement[];
    try {
      elements = await fetchOverpass(buildOverpassBboxQuery(bounds, [filter]));
    } catch (error) {
      // Keep going: one unavailable filter should not throw away the ten that
      // did come back. Pruning is skipped below so nothing is lost either.
      console.error(
        `  giving up on ${filter}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failed.push(filter);
      continue;
    }

    const rows = toRows(citySlug, elements);
    await writeRows(citySlug, rows, importedAt);
    for (const row of rows) written[row.category] = (written[row.category] ?? 0) + 1;
    if (index < filters.length - 1) await sleep(BETWEEN_QUERIES_MS);
  }

  const total = Object.values(written).reduce((sum, count) => sum + count, 0);
  console.log(`\n  ${total} rows across ${Object.keys(written).length} categories`);
  for (const [category, count] of Object.entries(written).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${category.padEnd(14)} ${count}`);
  }

  if (failed.length > 0) {
    console.warn(
      `\n  ${failed.length}/${filters.length} filters failed — skipping the prune so existing ` +
        `POIs survive. Re-run to complete:\n    ${failed.join('\n    ')}`,
    );
  } else if (total === 0) {
    console.warn('\n  Overpass returned no POIs at all — skipping the prune.');
  } else {
    // Anything not refreshed by a complete run is gone from OSM (or moved out
    // of the bbox). Pruning keeps the table from accumulating stale POIs.
    const pruned = await prisma.poi.deleteMany({
      where: { citySlug, importedAt: { lt: importedAt } },
    });
    console.log(`  pruned ${pruned.count} stale rows`);
  }

  console.log(`Done: ${await prisma.poi.count({ where: { citySlug } })} POIs for ${citySlug}`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
