import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BRAND_ICON_HEADERS, BrandMark } from './brand-mark';

type Tag = { name: string; attributes: string[] };

/** Opening tags in document order with their attributes sorted; closing tags are dropped. */
function tags(markup: string): Tag[] {
  return [...markup.matchAll(/<([a-zA-Z][\w-]*)([^>]*?)\/?>/g)].map(([, name, rest]) => ({
    name,
    attributes: [...rest.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .map(([, key, value]) => `${key}=${value}`)
      .sort(),
  }));
}

/** The `<svg>` element and everything inside it, without the root's own width and height. */
function svgTags(markup: string): Tag[] {
  const svg = markup.slice(markup.indexOf('<svg'));
  return tags(svg).map((tag, index) =>
    index === 0
      ? { ...tag, attributes: tag.attributes.filter((a) => !/^(width|height)=/.test(a)) }
      : tag,
  );
}

describe('BrandMark', () => {
  const iconSvg = readFileSync(join(process.cwd(), 'public/icon.svg'), 'utf8');

  it('draws exactly the elements of public/icon.svg: the same gradient colours, shape and path', () => {
    const rendered = renderToStaticMarkup(createElement(BrandMark, { size: 48 }));
    expect(svgTags(rendered)).toEqual(svgTags(iconSvg));
  });

  it('keeps the two brand colours of the gradient', () => {
    const rendered = renderToStaticMarkup(createElement(BrandMark, { size: 180 }));
    expect(rendered).toContain('stop-color="#4F46E5"');
    expect(rendered).toContain('stop-color="#22C55E"');
  });

  it.each([48, 180])('fills a %i px square', (size) => {
    const rendered = renderToStaticMarkup(createElement(BrandMark, { size }));
    expect(rendered).toContain(`width:${size}px;height:${size}px`);
    expect(tags(rendered).find((tag) => tag.name === 'svg')?.attributes).toEqual(
      expect.arrayContaining([`width=${size}`, `height=${size}`, 'viewBox=0 0 180 180']),
    );
  });

  it('caches a day in the browser and a week at the CDN', () => {
    expect(BRAND_ICON_HEADERS).toEqual({
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    });
  });
});
