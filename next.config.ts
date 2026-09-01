import type {NextConfig} from 'next';

import path from 'node:path';

const nextConfig: NextConfig = {
  /**
   * Pin the workspace root to this project.
   *
   * There is a package-lock.json in the user's home directory, and Next's
   * root inference picked that over the project, warning "We detected multiple
   * lockfiles". Left alone it traces server dependencies from the wrong
   * directory, which matters for the standalone output the Dockerfile builds:
   * files can be missed or the wrong tree copied into the image.
   */
  outputFileTracingRoot: path.join(__dirname),

  // Type errors must fail the build: a missing import previously shipped to
  // production as a runtime crash on the dashboard.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Lint runs in CI and in the build. It was disabled here, which is the same
  // pattern that let a missing import ship as a runtime crash.
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Ship smaller client bundles: only the icons actually imported, and
  // package-level tree shaking for the heavier UI dependencies.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },

  // A self-contained server bundle for container deploys (ECS, App Runner).
  // Only enabled for Docker builds so Vercel's own build pipeline is untouched.
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' as const } : {}),

  // The x-powered-by header tells attackers the stack and helps nobody.
  poweredByHeader: false,
  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
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
        source: '/:file(logo.png|logo-on-dark.png|logo-mark.png|logo-beauty.png|logo-beauty-full.png|og-image.jpg)',
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
