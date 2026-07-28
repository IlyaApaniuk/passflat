import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Vercel Image Optimization (WebP/AVIF, resizing, CDN caching). Listing and
    // cost-report photos are served from Supabase Storage public buckets.
    remotePatterns: [
      {
        // Pinned to this project's Supabase host on purpose: a `*.supabase.co`
        // wildcard would let anyone proxy images from any Supabase project
        // through /_next/image on our optimization bill.
        protocol: 'https',
        hostname: 'owjyitulkmauajraoyhf.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Prod Supabase lives behind the custom domain — without it the image
        // optimizer 400s (INVALID_IMAGE_OPTIMIZE_REQUEST) on every listing photo.
        protocol: 'https',
        hostname: 'auth.passflat.com',
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
