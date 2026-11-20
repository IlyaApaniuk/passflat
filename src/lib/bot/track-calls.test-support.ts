import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { profileCreatedProperties, profileEditedProperties } from '@/lib/roommate/rules';

/**
 * Test support, never imported by app code: every bot event the code sends through `track`, with
 * the property keys of each call. Read by the documentation checks (`roommate-readme.test.ts`,
 * `roommate-readouts.test.ts`), so the README and the readout queries are checked against one
 * reading of the code.
 */

const ROOT = process.cwd();

/** The folders whose non-test TypeScript files may call the bot's `track`. */
const SOURCE_DIRS = ['src/lib/bot', 'src/lib/roommate', 'src/app/api/telegram', 'src/app/api/cron'];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test(-support)?\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The text between a call's parentheses, from the index just after its `(`. */
function callArguments(source: string, start: number): string {
  let depth = 1;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === "'" || char === '"' || char === '`') {
      const close = source.indexOf(char, i + 1);
      if (close === -1) break;
      i = close;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  throw new Error(`unclosed call at ${start}`);
}

/** Builders that return a roommate event's properties, with the keys they return. */
const PROPERTY_BUILDERS: Record<string, () => string[]> = {
  profileCreatedProperties: () =>
    Object.keys(
      profileCreatedProperties(
        {
          districtSlugs: ['mokotow'],
          anyDistrict: false,
          budgetBand: 'b2',
          moveInMonth: new Date(Date.UTC(2027, 0, 1)),
          languages: ['ru'],
          about: null,
          smoking: null,
          pets: null,
          entrySource: 'tg',
          tgUsername: null,
        },
        new Date(Date.UTC(2026, 11, 1)),
      ),
    ),
  profileEditedProperties: () => Object.keys(profileEditedProperties('budget')),
};

export type TrackCall = { file: string; event: string; keys: string[]; unknownBuilder: boolean };

/** Every bot `track` call with a `'tg_…'` event name in the sources, with its property keys. */
export function trackCalls(): TrackCall[] {
  const calls: TrackCall[] = [];
  const files = SOURCE_DIRS.flatMap(sourceFiles);
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const callStart = /(^|[^\w.])track\(/g;
    for (const match of source.matchAll(callStart)) {
      const args = callArguments(source, (match.index ?? 0) + match[0].length);
      const name = /'(tg_[a-z_]+)'/.exec(args);
      if (!name) continue; // the definition of `track` in analytics.ts
      const rest = args.slice((name.index ?? 0) + name[0].length).trim();
      const properties = rest.startsWith(',') ? rest.slice(1).trim() : '';
      const keys = new Set<string>();
      for (const [, body] of properties.matchAll(/\{([^{}]*)\}/g)) {
        for (const part of body.split(',')) {
          const key = part.split(':')[0].trim();
          if (/^\w+$/.test(key)) keys.add(key);
        }
      }
      let unknownBuilder = false;
      if (properties && keys.size === 0) {
        const builder = Object.keys(PROPERTY_BUILDERS).find((b) => properties.startsWith(`${b}(`));
        if (builder) PROPERTY_BUILDERS[builder]().forEach((key) => keys.add(key));
        else unknownBuilder = true;
      }
      calls.push({ file, event: name[1], keys: [...keys], unknownBuilder });
    }
  }
  return calls;
}
