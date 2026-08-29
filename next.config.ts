import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Type errors must fail the build: a missing import previously shipped to
  // production as a runtime crash on the dashboard.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Ship smaller client bundles: only the icons actually imported, and
  // package-level tree shaking for the heavier UI dependencies.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },

  // The x-powered-by header tells attackers the stack and helps nobody.
  poweredByHeader: false,
  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Optimised images are immutable once generated; cache them hard so the
    // optimiser is not re-invoked per viewer under load.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  async headers() {
    return [
      {
        // Brand assets are content-stable and requested on every page.
        source: '/:file(logo.png|logo-mark.png|og-image.jpg)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
