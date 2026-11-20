import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pickMessages, SHARED_CLIENT_NAMESPACES } from '@/i18n/messages';

// PRD 4 FR-12 (spec 08 §Callout placements): the blog list gets a second button to the roommate
// page, and every guide ends with the roommate page's bridge line to the checker and the flatmate
// callout. Guides are static pages: the callout carries no counts (Assumption).

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
const BLOG_DIR = join(process.cwd(), 'src/app/[locale]/blog');
const GUIDE_CLIENT_SOURCE = readFileSync(join(BLOG_DIR, '[slug]/client.tsx'), 'utf8');
const GUIDE_PAGE_SOURCE = readFileSync(join(BLOG_DIR, '[slug]/page.tsx'), 'utf8');
const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, Record<string, unknown>>,
  ]),
) as Record<(typeof LOCALES)[number], Record<string, Record<string, unknown>>>;
const en = messages.en;

const { state } = vi.hoisted(() => ({
  state: {
    templatesEnabled: true,
    post: undefined as
      | {
          slug: string;
          locale: string;
          title: string;
          description: string;
          date: string;
          tags: string[];
          content: string;
        }
      | undefined,
  },
}));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getLocale: async () => 'en',
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: 'en',
        messages: en as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'en',
    // Client components see only the locale layout's shared namespaces; a missing key throws.
    useTranslations: (namespace?: string) =>
      actual.createTranslator({
        locale: 'en',
        messages: pickMessages(en, SHARED_CLIENT_NAMESPACES) as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/lib/feature-flags', () => ({
  isDocumentTemplatesEnabled: () => state.templatesEnabled,
}));
vi.mock('@/components/documents/template-download', () => ({
  TemplateDownload: ({ documentKey }: { documentKey: string }) =>
    createElement('div', { 'data-template': documentKey }),
}));
vi.mock('@/lib/blog', () => ({
  getPostBySlug: () => state.post,
  getPostSlugs: () => [],
}));

import { FlatmateCallout } from '@/components/roommate/flatmate-callout';

import { BlogArticle } from './[slug]/client';
import BlogPostPage from './[slug]/page';
import { BlogClient } from './client';

const BOT = 'passflat_test_bot';
const BODY_END = 'END_OF_THE_ARTICLE_BODY';

const guide = (slug: string) => ({
  slug,
  locale: 'en',
  title: 'A guide',
  description: 'About renting',
  date: '2026-11-01',
  tags: ['rent'],
  content: `## Heading\n\nThe article body. ${BODY_END}`,
});

function findElement(
  node: ReactNode,
  match: (element: ReactElement) => boolean,
): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  if (match(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, match);
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

async function guideArticleElement(slug: string) {
  state.post = guide(slug);
  const tree = (await BlogPostPage({ params: Promise.resolve({ slug }) })) as ReactElement;
  const article = findElement(tree, (element) => element.type === BlogArticle);
  expect(article).toBeDefined();
  return article as ReactElement<Parameters<typeof BlogArticle>[0]>;
}

/** The guide client rendered with the server callout's output in its slot. */
async function renderGuide(slug: string) {
  const article = await guideArticleElement(slug);
  const callout = article.props.flatmateCallout as ReactElement<
    Parameters<typeof FlatmateCallout>[0]
  >;
  const rendered = await FlatmateCallout(callout.props);
  return renderToStaticMarkup(
    createElement(BlogArticle, { ...article.props, flatmateCallout: rendered }),
  );
}

describe('blog list: the second button to the roommate page', () => {
  const posts = [guide('cesja-najmu-guide')].map(({ content: _content, ...rest }) => rest);

  it.each([
    ['with posts', posts],
    ['coming soon (no posts)', []],
  ])(
    '%s: the CTA text, the costs button, then "Find a flatmate" → /warsaw/roommate',
    (_n, list) => {
      const html = renderToStaticMarkup(createElement(BlogClient, { posts: list }));
      const visible = text(html);

      expect(visible).toContain(
        'Looking for someone to rent with, or checking a flat? Start with the figures tenants reported.',
      );
      const costs = html.indexOf('href="/warsaw/costs"');
      const roommate = html.indexOf('href="/warsaw/roommate"');
      expect(costs).toBeGreaterThan(-1);
      expect(roommate).toBeGreaterThan(costs);
      expect(html.split('href="/warsaw/roommate"').length - 1).toBe(1);
      expect(text(html.slice(html.indexOf('>', roommate) + 1))).toMatch(/^ ?Find a flatmate /);
      expect(text(html.slice(costs, roommate))).toContain(en.blog.ctaButton as string);
    },
  );
});

describe('blog list copy (PRD 4 §8)', () => {
  it.each(LOCALES)('%s: blog.ctaFlatmate is common.findFlatmate', (locale) => {
    expect(messages[locale].blog.ctaFlatmate).toBe(messages[locale].common.findFlatmate);
  });

  it('the EN drafts are the PRD 4 §8 values', () => {
    expect(en.blog.ctaFlatmate).toBe('Find a flatmate');
    expect(en.blog.ctaText).toBe(
      'Looking for someone to rent with, or checking a flat? Start with the figures tenants reported.',
    );
  });

  it.each(LOCALES)(
    '%s: blog.ctaText names both: renting together and checking a flat',
    (locale) => {
      const both: Record<(typeof LOCALES)[number], [RegExp, RegExp]> = {
        en: [/rent with/, /checking a flat/],
        pl: [/wspólnego wynajmu/, /sprawdzasz mieszkanie/],
        ru: [/с кем снять/, /проверяешь вариант/],
        uk: [/з ким зняти/, /перевіряєш варіант/],
      };
      const value = messages[locale].blog.ctaText as string;
      for (const pattern of both[locale]) expect(value).toMatch(pattern);
    },
  );
});

describe('guide: the bridge line and FlatmateCallout surface="guide"', () => {
  beforeEach(() => {
    state.templatesEnabled = true;
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', BOT);
  });

  it('the server page passes the callout as a ReactNode prop, without counts', async () => {
    const article = await guideArticleElement('cesja-najmu-guide');
    const callout = article.props.flatmateCallout;
    expect(isValidElement(callout)).toBe(true);
    expect((callout as ReactElement).type).toBe(FlatmateCallout);
    expect((callout as ReactElement).props).toEqual({ surface: 'guide' });
    expect(GUIDE_PAGE_SOURCE).not.toContain('loadFlatmateBlockCounts');
  });

  it('the callout renders the question, no count line, the roommate link and mate_web_guide', async () => {
    const article = await guideArticleElement('cesja-najmu-guide');
    const callout = article.props.flatmateCallout as ReactElement<
      Parameters<typeof FlatmateCallout>[0]
    >;
    const html = renderToStaticMarkup(await FlatmateCallout(callout.props));
    expect(html).toMatch(/^<section aria-labelledby="flatmate-callout-guide-title"/);
    expect(text(html)).toContain('Looking for someone to rent with in Warsaw?');
    expect(html).not.toContain('already ha');
    expect(html).not.toContain('Be among the first');
    expect(html).toContain('href="/warsaw/roommate"');
    expect(html).toContain(`https://t.me/${BOT}?start=mate_web_guide`);
  });

  it('order: the body, the template block, the bridge line to /warsaw/check, then the callout', async () => {
    const html = await renderGuide('cesja-najmu-guide');
    const body = html.indexOf(BODY_END);
    const template = html.indexOf('data-template="cesja"');
    const bridge = html.indexOf('href="/warsaw/check"');
    const callout = html.indexOf('<section aria-labelledby="flatmate-callout-guide-title"');
    expect(body).toBeGreaterThan(-1);
    expect(template).toBeGreaterThan(body);
    expect(bridge).toBeGreaterThan(template);
    expect(callout).toBeGreaterThan(bridge);
    expect(html.split('href="/warsaw/check"').length - 1).toBe(1);
    expect(text(html.slice(bridge, callout))).toContain(
      'Found a place? Check the address and known costs',
    );
    expect(html).toContain(`https://t.me/${BOT}?start=mate_web_guide`);
  });

  it.each([
    ['a guide without a template', 'hidden-costs-warsaw', true],
    ['a template guide with templates switched off', 'cesja-najmu-guide', false],
  ])('%s: the bridge line and the callout follow the body directly', async (_n, slug, enabled) => {
    state.templatesEnabled = enabled;
    const html = await renderGuide(slug);
    expect(html).not.toContain('data-template=');
    const body = html.indexOf(BODY_END);
    const bridge = html.indexOf('href="/warsaw/check"');
    const callout = html.indexOf('<section aria-labelledby="flatmate-callout-guide-title"');
    expect(bridge).toBeGreaterThan(body);
    expect(callout).toBeGreaterThan(bridge);
  });

  it('without the bot username: the bridge line and the callout stay, no bot button', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    const html = await renderGuide('cesja-najmu-guide');
    expect(html).toContain('href="/warsaw/check"');
    expect(html).toContain('<section aria-labelledby="flatmate-callout-guide-title"');
    expect(html).not.toContain('t.me/');
  });

  describe('the guide client (static scan)', () => {
    it('places the flatmateCallout prop once and does not import the async server callout', () => {
      expect(GUIDE_CLIENT_SOURCE.split('{flatmateCallout}').length - 1).toBe(1);
      expect(GUIDE_CLIENT_SOURCE).not.toContain('roommate/flatmate-callout');
    });

    it('the bridge line sends no cost_data_cta_clicked (that event is the roommate bridge)', () => {
      expect(GUIDE_CLIENT_SOURCE).not.toMatch(/capture\(\s*'cost_data_cta_clicked'/);
      // The only captures are the affiliate clicks inside the article body.
      expect([...GUIDE_CLIENT_SOURCE.matchAll(/capture\(\s*'([^']+)'/g)].map((m) => m[1])).toEqual([
        'affiliate_link_clicked',
      ]);
    });

    it('reads blog, documents and listings, all shared namespaces; no scoped provider on the page', () => {
      const read = [...GUIDE_CLIENT_SOURCE.matchAll(/useTranslations\('([^']+)'\)/g)].map(
        (match) => match[1],
      );
      expect(read.sort()).toEqual(['blog', 'documents', 'listings']);
      for (const namespace of read) {
        expect(SHARED_CLIENT_NAMESPACES as readonly string[]).toContain(namespace);
      }
      expect(GUIDE_PAGE_SOURCE).not.toContain('NextIntlClientProvider');
    });
  });
});
