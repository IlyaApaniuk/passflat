/**
 * The brand mark of `public/icon.svg` as JSX for `next/og` (satori), so the PNG icons served at
 * `/favicon.ico` and `/apple-touch-icon.png` (FR-30, spec 09 §Icons and the locale guard) draw the
 * same rounded-square gradient in the same colours without an image dependency. Keep it in step
 * with `public/icon.svg`: `brand-mark.test.ts` compares the two.
 */
export function BrandMark({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 180 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
        <rect width="180" height="180" rx="37" fill="url(#grad)" />
        <path d="M52 130V68l38-28 38 28v62h-26V96H78v34H52z" fill="white" />
        <rect x="80" y="70" width="20" height="18" rx="3" fill="url(#grad)" />
      </svg>
    </div>
  );
}

/**
 * Response headers of both icon routes (**Assumption**, spec 09 FR-30): a day in the browser, a
 * week at the CDN.
 */
export const BRAND_ICON_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=604800',
} as const;
