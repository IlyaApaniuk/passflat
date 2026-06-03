import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
