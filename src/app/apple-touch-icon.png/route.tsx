import { ImageResponse } from 'next/og';
import { BRAND_ICON_HEADERS, BrandMark } from '@/lib/brand-mark';

const SIZE = 180;

/**
 * `/apple-touch-icon.png`, which iOS requests by convention and `metadata.icons.apple` names: a
 * 180 × 180 PNG of the brand mark. This static segment wins over `[locale]`, which used to answer
 * the path with a 500 (FR-30). `/apple-touch-icon-precomposed.png` is not served (it is a 404).
 */
export function GET() {
  return new ImageResponse(<BrandMark size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    headers: BRAND_ICON_HEADERS,
  });
}
