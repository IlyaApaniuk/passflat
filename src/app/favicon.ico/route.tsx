import { ImageResponse } from 'next/og';
import { BRAND_ICON_HEADERS, BrandMark } from '@/lib/brand-mark';

const SIZE = 48;

/**
 * `/favicon.ico`, where browsers ask for it without reading the page's `<link rel="icon">`: a
 * 48 × 48 PNG of the brand mark (browsers accept a PNG body here). This static segment wins over
 * `[locale]`, which used to answer the path with a 500 (FR-30). No redirect: that would be a URL
 * change.
 */
export function GET() {
  return new ImageResponse(<BrandMark size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    headers: BRAND_ICON_HEADERS,
  });
}
