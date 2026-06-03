/**
 * One-off importer for the early Google Form cost responses.
 *
 * Usage:
 *   tsx prisma/import-responses.ts "<path-to-csv>" [--dry-run] [--reset]
 *
 * Defaults to the CSV in ~/Downloads if no path is given.
 *
 * - Imported reports are owned by IMPORT_AUTHOR_ID until a user logs in with
 *   the matching (normalized) email, at which point they are auto-claimed.
 * - Non-monthly surcharges (e.g. "1000 раз в полгода") become CostReportPeriodicCharge rows.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateBuildingSlug } from '../src/lib/slugify';
import { normalizeAddress, cleanStreet } from '../src/lib/address';
import { IMPORT_AUTHOR_ID, IMPORT_AUTHOR_DISPLAY_NAME } from '../src/lib/import-constants';
import {
  monthlyEquivalent,
  type PeriodicCategory,
  type PeriodicFrequency,
} from '../src/lib/periodic-charges';

const prisma = new PrismaClient();

const DEFAULT_CSV = join(homedir(), 'Downloads', 'Responses Passflat - Form responses 1.csv');

const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');
const csvPath = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_CSV;

// --- Forced importedEmail overrides ---
// Some imported addresses must be linked to a specific account regardless of
// (or in absence of) the email in the CSV row. The override WINS over the row's
// email. Keys are built with the SAME normalization the importer uses to match
// rows to buildings (normalizeAddress(cleanStreet(street), number)), so casing,
// diacritics, and spacing are handled identically. Emails are lowercased to match
// the case-insensitive auto-claim flow in src/app/[locale]/auth/callback/route.ts.
const EMAIL_OVERRIDE_SOURCES: { street: string; buildingNumber: string; email: string }[] = [
  { street: 'Aleja Armii Ludowej', buildingNumber: '6', email: 'ilya21968@gmail.com' },
];

const EMAIL_OVERRIDES: Record<string, string> = Object.fromEntries(
  EMAIL_OVERRIDE_SOURCES.map((o) => [
    normalizeAddress(cleanStreet(o.street), o.buildingNumber),
    o.email.trim().toLowerCase(),
  ]),
);

// --- CSV parsing (RFC-4180-ish: quotes, escaped quotes, commas/newlines in fields) ---

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // ignore, handled by \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- Value normalization ---

const UNIT_RE = /\b(m2|m²|кв\.?\s*м\.?|кв|sqm|метров?|zl|zł|зл|pln|зеленых?)\b/gi;

function normalizeEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return e.includes('@') ? e : null;
}

/** Strict numeric: returns a number only if the cell is essentially numeric. */
function strictNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/&/g, '0'); // "10&0" typo -> "1000"
  s = s.replace(UNIT_RE, '').replace(/[+~]/g, '').trim();
  s = s.replace(',', '.');
  if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
  return null;
}

/** First integer found anywhere in the string (for rooms / floor). */
function firstInt(raw: string | undefined): number | null {
  if (raw == null) return null;
  const m = raw.replace(/&/g, '0').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Remove digits that belong to a frequency phrase (e.g. "2 месяца") so they
 * aren't mistaken for the charge amount. */
function stripPeriodNumbers(s: string): string {
  return s.replace(/\d+\s*мес[а-я]*/gi, ' ').replace(/\d+\s*(?:год[а-я]*|лет)\b/gi, ' ');
}

/** First amount (decimal-aware) found anywhere, e.g. "~1500 зл" -> 1500. */
function firstAmount(raw: string): number | null {
  const cleaned = raw.replace(/&/g, '0').replace(',', '.');
  const m = cleaned.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function isEmptyish(raw: string | undefined): boolean {
  if (raw == null) return true;
  const t = raw.trim().toLowerCase();
  return t === '' || t === '-' || t === 'no' || t === 'нет' || t === 'н/д';
}

function detectFrequency(s: string): PeriodicFrequency | 'monthly' | null {
  const t = s.toLowerCase();
  if (/(раз в пол\s?года|полгода|пол\s?года|раз в 6|раз в шесть|semiann)/.test(t))
    return 'semiannual';
  if (/(раз в 2 мес|в 2 месяца|раз в два мес|каждые 2 мес|bimonth)/.test(t)) return 'bimonthly';
  if (/(квартал|раз в 3 мес|quarter)/.test(t)) return 'quarterly';
  if (/(раз в год|раз в 12|ежегодно|annual)/.test(t)) return 'annual';
  if (/(каждый месяц|в месяц|ежемесяч|monthly|\/\s*мес)/.test(t)) return 'monthly';
  return null;
}

function detectCategory(s: string, fallback: PeriodicCategory): PeriodicCategory {
  const t = s.toLowerCase();
  if (/(вод[а-я]*|water)/.test(t)) return 'water';
  if (/(электр|electric|свет)/.test(t)) return 'electricity';
  if (/(газ|gas)/.test(t)) return 'gas';
  if (/(отопл|heat|тепло)/.test(t)) return 'heating';
  return fallback;
}

interface PeriodicChargeDraft {
  category: PeriodicCategory;
  amount: number;
  frequency: PeriodicFrequency;
  note: string | null;
}

interface UtilityParse {
  monthly: number | null;
  periodic: PeriodicChargeDraft | null;
  note: string | null; // preserved free text when not cleanly numeric
}

function parseUtilityCell(raw: string | undefined, category: PeriodicCategory): UtilityParse {
  const empty: UtilityParse = { monthly: null, periodic: null, note: null };
  if (isEmptyish(raw)) return empty;
  const s = (raw as string).trim();
  const low = s.toLowerCase();

  if (/(входит|включ|в стоимости|в аренд|included)/.test(low)) {
    return { monthly: null, periodic: null, note: s };
  }

  const freq = detectFrequency(low);

  if (freq && freq !== 'monthly') {
    const amount = firstAmount(stripPeriodNumbers(s));
    if (amount != null) {
      return {
        monthly: null,
        periodic: {
          category: detectCategory(low, category),
          amount,
          frequency: freq,
          note: s,
        },
        note: null,
      };
    }
  }

  const num = firstAmount(s);

  // Clean numeric -> monthly value
  const strict = strictNumber(s);
  if (strict != null) return { monthly: strict, periodic: null, note: null };

  // Has a number but messy text (e.g. "100 в месяц") -> use it monthly, keep note
  if (num != null) return { monthly: num, periodic: null, note: freq === 'monthly' ? null : s };

  return { monthly: null, periodic: null, note: s };
}

// --- Address parsing ---

const POSTAL_RE = /\b\d{2}-\d{3}\b/;
const CITY_RE = /\b(warszawa|warsaw|варшава|białystok|bialystok|белосток)\b/i;

interface AddressParse {
  street: string;
  buildingNumber: string;
  cityHint: string | null;
}

function parseAddress(raw: string): AddressParse | null {
  let s = raw.trim();
  const cityMatch = s.match(CITY_RE);
  const cityHint = cityMatch ? cityMatch[1].toLowerCase() : null;
  s = s.replace(POSTAL_RE, '').replace(CITY_RE, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  // Trailing building number: digits + optional letter, drop /apartment part
  const m = s.match(/^(.*?)[\s,]+(\d+[a-zA-Zа-яА-Я]?)(?:\/\S+)?\s*$/);
  if (!m) return null;
  const street = m[1].trim();
  const buildingNumber = m[2].trim();
  if (!street || !buildingNumber) return null;
  return { street, buildingNumber, cityHint };
}

// --- Row mapping (column indices from the form header) ---

const COL = {
  email: 1,
  address: 3,
  area: 4,
  rooms: 5,
  floor: 6,
  rent: 7,
  adminFee: 8,
  deposit: 9,
  other: 10,
  gas: 11,
  electricity: 12,
  heating: 13,
  water: 14,
  internet: 15,
} as const;

interface ReportDraft {
  rowIndex: number;
  street: string;
  buildingNumber: string;
  importedEmail: string | null;
  rent: number | null;
  adminFee: number | null;
  depositAmount: number | null;
  electricityAvg: number | null;
  gas: number | null;
  heating: number | null;
  water: number | null;
  internet: number | null;
  otherCosts: number | null;
  otherCostsNote: string | null;
  rooms: number | null;
  areaM2: number | null;
  floor: number | null;
  periodicCharges: PeriodicChargeDraft[];
  totalMonthlyAvg: number | null;
}

interface SkippedRow {
  rowIndex: number;
  address: string;
  reason: string;
}

function buildDraft(cells: string[], rowIndex: number): ReportDraft | SkippedRow {
  const addressRaw = (cells[COL.address] ?? '').trim();
  if (!addressRaw) return { rowIndex, address: '(empty)', reason: 'no address' };

  const cityMatch = addressRaw.match(CITY_RE);
  if (cityMatch && /biał?ystok|белосток/i.test(cityMatch[1])) {
    return { rowIndex, address: addressRaw, reason: 'unsupported city (Białystok)' };
  }

  const parsed = parseAddress(addressRaw);
  if (!parsed) {
    return { rowIndex, address: addressRaw, reason: 'no building number' };
  }

  // Resolve importedEmail, letting a forced override win over the CSV value.
  // The lookup uses the same normalized address the create loop computes.
  let importedEmail = normalizeEmail(cells[COL.email]);
  const normalizedAddress = normalizeAddress(cleanStreet(parsed.street), parsed.buildingNumber);
  const overrideEmail = EMAIL_OVERRIDES[normalizedAddress];
  if (overrideEmail) {
    importedEmail = overrideEmail;
    console.log(
      `[override] importedEmail for ${parsed.street} ${parsed.buildingNumber} -> ${overrideEmail}`,
    );
  }

  const notes: string[] = [];
  const periodicCharges: PeriodicChargeDraft[] = [];

  const collect = (raw: string | undefined, category: PeriodicCategory): number | null => {
    const r = parseUtilityCell(raw, category);
    if (r.periodic) periodicCharges.push(r.periodic);
    if (r.note) notes.push(`${category}: ${r.note}`);
    return r.monthly;
  };

  const electricityAvg = collect(cells[COL.electricity], 'electricity');
  const gas = collect(cells[COL.gas], 'gas');
  const heating = collect(cells[COL.heating], 'heating');
  const water = collect(cells[COL.water], 'water');
  const internet = collect(cells[COL.internet], 'other');

  // "Доп расходы" column: monthly extra or a periodic recalculation
  const otherParse = parseUtilityCell(cells[COL.other], 'other');
  if (otherParse.periodic) periodicCharges.push(otherParse.periodic);
  const otherCosts = otherParse.monthly;
  if (otherParse.note) notes.push(`other: ${otherParse.note}`);

  // adminFee may be "included in rent" text
  const adminFee = strictNumber(cells[COL.adminFee]);
  if (adminFee == null && !isEmptyish(cells[COL.adminFee])) {
    notes.push(`czynsz: ${(cells[COL.adminFee] as string).trim()}`);
  }

  const rent = strictNumber(cells[COL.rent]);
  if (rent == null && !isEmptyish(cells[COL.rent])) {
    notes.push(`rent: ${(cells[COL.rent] as string).trim()}`);
  }

  const depositAmount = strictNumber(cells[COL.deposit]);

  const periodicMonthly = periodicCharges.reduce(
    (sum, c) => sum + monthlyEquivalent(c.amount, c.frequency),
    0,
  );

  const totalMonthlyAvg =
    (rent ?? 0) +
    (adminFee ?? 0) +
    (electricityAvg ?? 0) +
    (gas ?? 0) +
    (heating ?? 0) +
    (water ?? 0) +
    (internet ?? 0) +
    (otherCosts ?? 0) +
    periodicMonthly;

  return {
    rowIndex,
    street: parsed.street,
    buildingNumber: parsed.buildingNumber,
    importedEmail,
    rent,
    adminFee,
    depositAmount,
    electricityAvg,
    gas,
    heating,
    water,
    internet,
    otherCosts,
    otherCostsNote: notes.length ? notes.join(' | ') : null,
    rooms: firstInt(cells[COL.rooms]),
    areaM2: strictNumber(cells[COL.area]),
    floor: firstInt(cells[COL.floor]),
    periodicCharges,
    totalMonthlyAvg: totalMonthlyAvg > 0 ? Math.round(totalMonthlyAvg) : null,
  };
}

function isSkipped(d: ReportDraft | SkippedRow): d is SkippedRow {
  return 'reason' in d;
}

async function main() {
  console.log(`[import] CSV: ${csvPath}`);
  console.log(`[import] mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}${RESET ? ' (reset)' : ''}\n`);

  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCSV(text);
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''));

  const drafts: ReportDraft[] = [];
  const skipped: SkippedRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const result = buildDraft(dataRows[i], i + 2); // +2: 1-based + header
    if (isSkipped(result)) skipped.push(result);
    else drafts.push(result);
  }

  // --- Print parse summary ---
  for (const d of drafts) {
    const charges = d.periodicCharges
      .map(
        (c) =>
          `${c.category} ${c.amount} ${c.frequency} (~${Math.round(monthlyEquivalent(c.amount, c.frequency))}/mo)`,
      )
      .join(', ');
    console.log(
      `row ${d.rowIndex}: ${d.street} ${d.buildingNumber} | ${d.importedEmail ?? 'no-email'} | ` +
        `rent=${d.rent} admin=${d.adminFee} dep=${d.depositAmount} ` +
        `el=${d.electricityAvg} gas=${d.gas} heat=${d.heating} water=${d.water} net=${d.internet} other=${d.otherCosts} ` +
        `| total≈${d.totalMonthlyAvg}` +
        (charges ? `\n        periodic: ${charges}` : '') +
        (d.otherCostsNote ? `\n        note: ${d.otherCostsNote}` : ''),
    );
  }
  if (skipped.length) {
    console.log('\n[skipped]');
    for (const s of skipped) console.log(`  row ${s.rowIndex}: ${s.address} — ${s.reason}`);
  }
  console.log(`\n[import] ${drafts.length} importable, ${skipped.length} skipped`);

  if (DRY_RUN) {
    console.log('\n[dry-run] no changes written.');
    await prisma.$disconnect();
    return;
  }

  // --- Resolve city (Warsaw) ---
  const city = await prisma.city.findUnique({
    where: { slug: 'warsaw' },
    include: { districts: true },
  });
  if (!city) throw new Error('City "warsaw" not found. Run the seed first.');

  // --- System import profile ---
  await prisma.profile.upsert({
    where: { id: IMPORT_AUTHOR_ID },
    create: { id: IMPORT_AUTHOR_ID, displayName: IMPORT_AUTHOR_DISPLAY_NAME },
    update: {},
  });

  if (RESET) {
    const del = await prisma.costReport.deleteMany({
      where: { source: 'import', authorId: IMPORT_AUTHOR_ID },
    });
    console.log(`[reset] removed ${del.count} previously imported reports`);
  }

  let created = 0;
  let skippedDup = 0;
  for (const d of drafts) {
    const cleanedStreet = cleanStreet(d.street);
    const addressNormalized = normalizeAddress(cleanedStreet, d.buildingNumber);
    const addressFull = `${cleanedStreet} ${d.buildingNumber}`;

    let building = await prisma.building.findUnique({
      where: { cityId_addressNormalized: { cityId: city.id, addressNormalized } },
    });

    if (!building) {
      let slug = generateBuildingSlug(d.street, d.buildingNumber);
      const existing = await prisma.building.findUnique({
        where: { cityId_slug: { cityId: city.id, slug } },
        select: { id: true },
      });
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      building = await prisma.building.create({
        data: {
          cityId: city.id,
          slug,
          street: cleanedStreet,
          buildingNumber: d.buildingNumber,
          addressFull,
          addressNormalized,
        },
      });
    }

    // Idempotency: skip if an equivalent import already exists for this building+email
    const dup = await prisma.costReport.findFirst({
      where: {
        buildingId: building.id,
        source: 'import',
        importedEmail: d.importedEmail,
      },
      select: { id: true },
    });
    if (dup) {
      skippedDup++;
      continue;
    }

    await prisma.costReport.create({
      data: {
        buildingId: building.id,
        authorId: IMPORT_AUTHOR_ID,
        source: 'import',
        importedEmail: d.importedEmail,
        currency: 'PLN',
        rent: d.rent,
        adminFee: d.adminFee,
        depositAmount: d.depositAmount,
        electricityAvg: d.electricityAvg,
        gas: d.gas,
        heating: d.heating,
        water: d.water,
        internet: d.internet,
        otherCosts: d.otherCosts,
        otherCostsNote: d.otherCostsNote,
        totalMonthlyAvg: d.totalMonthlyAvg,
        rooms: d.rooms,
        areaM2: d.areaM2,
        floor: d.floor,
        rentalType: 'apartment',
        isCurrentTenant: true,
        verificationStatus: 'unverified',
        isVisible: true,
        periodicCharges: d.periodicCharges.length
          ? {
              create: d.periodicCharges.map((c) => ({
                category: c.category,
                amount: c.amount,
                frequency: c.frequency,
                note: c.note,
              })),
            }
          : undefined,
      },
    });
    created++;
  }

  console.log(`\n[import] created ${created} reports, skipped ${skippedDup} duplicates.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
