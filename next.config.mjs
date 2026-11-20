import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Sent on every route (spec 09 §HTTP headers, FR-31, Assumption values). The site uses no
 * camera, microphone or geolocation (checked 2026-11-20). No framing header (Q-13, T154) and no
 * Content-Security-Policy.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  // Playwright builds and serves into `.next-e2e` so an e2e run never touches the
  // `.next` directory of a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // Vercel Image Optimization (WebP/AVIF, resizing, CDN caching). Listing and
    // cost-report photos are served from Supabase Storage public buckets.
    remotePatterns: [
      {
        // The custom domain every stored photo URL actually uses. Without it the
        // image optimizer 400s (INVALID_IMAGE_OPTIMIZE_REQUEST) on every one.
        protocol: 'https',
        hostname: 'auth.passflat.com',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // The same project's direct host, for URLs generated without the custom
        // domain. Pinned rather than a `*.supabase.co` wildcard, which would let
        // anyone proxy images from any Supabase project on our optimization bill.
        protocol: 'https',
        hostname: 'wmanxshrqghrzwwykjns.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Local `supabase start` storage (dev only — never shipped to prod).
      ...(process.env.NODE_ENV === 'production'
        ? []
        : ['127.0.0.1', 'localhost'].map((hostname) => ({
            protocol: 'http',
            hostname,
            port: '54321',
            pathname: '/storage/v1/object/public/**',
          }))),
    ],
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    // Tree-shake large, frequently-imported packages so only the icons/utils
    // actually used are bundled instead of the whole library. Big win for
    // client bundle size / parse time on every route.
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'date-fns',
      'recharts',
      '@radix-ui/react-icons',
    ],
  },
};

export default withNextIntl(nextConfig);
