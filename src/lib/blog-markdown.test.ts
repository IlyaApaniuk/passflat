import { describe, expect, it } from 'vitest';

import { affiliateHost, markdownToHtml } from './blog-markdown';

// Spec 09 §Guide bodies (PRD 4 FR-24, part 3): links to passflat.com open in the same tab as
// relative paths; other absolute links open in a new tab; affiliate links stay sponsored.

describe('markdownToHtml links', () => {
  it.each([
    [
      'an own page renders as its path, without target and rel',
      'https://passflat.com/en/warsaw/check',
      '<p><a href="/en/warsaw/check">the checker</a></p>',
    ],
    [
      'another absolute link opens in a new tab',
      'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20010710733',
      '<p><a href="https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20010710733" target="_blank" rel="noopener">the checker</a></p>',
    ],
    [
      'an affiliate link stays sponsored',
      'https://prf.hn/click/camref:abc',
      '<p><a href="https://prf.hn/click/camref:abc" target="_blank" rel="sponsored nofollow noopener">the checker</a></p>',
    ],
    [
      'a relative link stays as written',
      '/blog/warsaw-rent-prices',
      '<p><a href="/blog/warsaw-rent-prices">the checker</a></p>',
    ],
  ])('%s', (_name, href, html) => {
    expect(markdownToHtml(`[the checker](${href})`)).toBe(html);
  });

  it('keeps the Polish default-locale path and a link inside a sentence and a list item', () => {
    const md = [
      'See [costs](https://passflat.com/warsaw/costs) first.',
      '- [Submit](https://passflat.com/uk/warsaw/costs/submit)',
    ].join('\n');
    expect(markdownToHtml(md)).toBe(
      [
        '<p>See <a href="/warsaw/costs">costs</a> first.</p>',
        '<ul>',
        '<li><a href="/uk/warsaw/costs/submit">Submit</a></li>',
        '</ul>',
      ].join('\n'),
    );
  });

  it('does not treat another host that starts with passflat.com as an own page', () => {
    expect(markdownToHtml('[x](https://passflat.com.example.org/a)')).toBe(
      '<p><a href="https://passflat.com.example.org/a" target="_blank" rel="noopener">x</a></p>',
    );
  });
});

describe('markdownToHtml blocks', () => {
  it('renders headings, emphasis, lists and paragraphs as before', () => {
    const md = [
      '# Title',
      '',
      '## Section',
      '### Sub',
      'A **bold** and *italic* line.',
      '* one',
      '* two',
      'After the list.',
    ].join('\n');
    expect(markdownToHtml(md)).toBe(
      [
        '<h1>Title</h1>',
        '<h2>Section</h2>',
        '<h3>Sub</h3>',
        '<p>A <strong>bold</strong> and <em>italic</em> line.</p>',
        '<ul>',
        '<li>one</li>',
        '<li>two</li>',
        '</ul>',
        '<p>After the list.</p>',
      ].join('\n'),
    );
  });
});

describe('affiliateHost', () => {
  it('names an affiliate host, including a subdomain, and nothing else', () => {
    expect(affiliateHost('https://www.connectorlink.online/x')).toBe('connectorlink.online');
    expect(affiliateHost('https://go.prf.hn/x')).toBe('go.prf.hn');
    expect(affiliateHost('https://passflat.com/en/warsaw/check')).toBeNull();
    expect(affiliateHost('/warsaw/check')).toBeNull();
  });
});
