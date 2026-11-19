import { readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SHARED_CLIENT_NAMESPACES } from '@/i18n/messages';

/**
 * The roommate page's client components receive only `SHARED_CLIENT_NAMESPACES` from the
 * shared locale layout's `NextIntlClientProvider`; `checker` is kept off this route on purpose
 * (`src/i18n/messages.ts`). A missing namespace fails only at runtime, so this test walks the
 * static and dynamic imports of the page's client tree (spec 02 §Find a flatmate).
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const IMPORT =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The project file an import specifier points to, or null for a package or an asset. */
function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
  else return null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (/\.tsx?$/.test(candidate) && isFile(candidate)) return candidate;
  }
  return null;
}

/** Every project module reachable from `entry` (the entry included), as paths under the root. */
function moduleTree(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [join(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    const key = relative(ROOT, file);
    if (seen.has(key)) continue;
    const source = readFileSync(file, 'utf8');
    seen.set(key, source);
    for (const match of source.matchAll(IMPORT)) {
      const target = resolveImport(file, match[1] ?? match[2]);
      if (target) queue.push(target);
    }
  }
  return seen;
}

/**
 * Top-level namespaces a module reads: `useTranslations('<ns>...')` and root `t('<ns>.key')`.
 * A key under a scoped translator (`t('costs.x')` after `useTranslations('checker')`) is also
 * read as a namespace: the check errs towards flagging, never towards hiding.
 */
function namespacesRead(source: string): Set<string> {
  const read = new Set<string>();
  for (const match of source.matchAll(/useTranslations\(\s*['"`]([A-Za-z]+)/g)) read.add(match[1]);
  for (const match of source.matchAll(
    /\bt(?:\.rich|\.markup|\.raw|\.has)?\(\s*['"`]([A-Za-z]+)\./g,
  )) {
    read.add(match[1]);
  }
  return read;
}

const CLIENT_ENTRY = 'src/components/listings/listings-page-client.tsx';

describe('roommate page client tree', () => {
  const tree = moduleTree(CLIENT_ENTRY);

  it('the page renders ListingsPageClient as its client root', () => {
    const page = readFileSync(join(ROOT, 'src/app/[locale]/[city]/roommate/page.tsx'), 'utf8');
    expect(page).toContain("from '@/components/listings/listings-page-client'");
    expect(page).toContain('<ListingsPageClient');
  });

  it('contains the role selector and the flatmate block, not TelegramBotCta', () => {
    expect(tree.has('src/components/listings/roommate-role-selector.tsx')).toBe(true);
    expect(tree.has('src/components/listings/find-flatmate-block.tsx')).toBe(true);
    expect(tree.has('src/components/costs/telegram-bot-cta.tsx')).toBe(false);
    // The walk follows dynamic imports too (the map is code-split).
    expect(tree.has('src/components/listings/listings-map.tsx')).toBe(true);
  });

  it('no module of the tree reads the checker namespace', () => {
    const offenders = [...tree].filter(([, source]) => namespacesRead(source).has('checker'));
    expect(offenders.map(([path]) => path)).toEqual([]);
  });

  it('every namespace the tree reads is one the shared layout provider passes', () => {
    const shared = new Set<string>(SHARED_CLIENT_NAMESPACES);
    const missing = [...tree].flatMap(([path, source]) =>
      [...namespacesRead(source)].filter((ns) => !shared.has(ns)).map((ns) => `${path}: ${ns}`),
    );
    expect(missing).toEqual([]);
  });

  it('the detector catches the checker namespace where it is used (TelegramBotCta)', () => {
    const cta = moduleTree('src/components/costs/telegram-bot-cta.tsx');
    expect(
      namespacesRead(cta.get('src/components/costs/telegram-bot-cta.tsx') ?? '').has('checker'),
    ).toBe(true);
    expect(namespacesRead("const t = useTranslations(); t('checker.costs.x')")).toEqual(
      new Set(['checker']),
    );
  });
});
