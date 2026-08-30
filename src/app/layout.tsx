import type { Metadata, Viewport } from 'next';
import { Jost } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientLayoutWrapper } from '@/components/layout/client-layout-wrapper';
import { isCustomerAuthConfigured } from '@/auth';

/**
 * Foglihten carries the display headings: a high-contrast serif with real
 * lowercase, where Cinzel before it was an all-capitals face.
 *
 * Self-hosted rather than loaded from Google Fonts, which does not carry it.
 * Licensed under SIL OFL 1.1 (see fonts/Foglihten-OFL.txt), which explicitly
 * permits embedding and commercial use.
 *
 * Subset to latin and latin-ext and converted to woff2: 390KB down to 42KB,
 * an 89% reduction, since the full OTF would otherwise block first paint.
 *
 * Note it has no rupee glyph. That is fine because prices render through the
 * Price component in the body face and never touch this one — but it is why
 * nothing numeric should be set in the headline font.
 */
const foglihten = localFont({
  src: './fonts/foglihten-068.woff2',
  variable: '--font-display',
  display: 'swap',
  // Reduces the layout shift when the webfont replaces the fallback.
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

const jost = Jost({
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://avyora.com'),
  title: {
    default: 'Avyora | Science-Forward Clinical Skincare',
    template: '%s | Avyora Skincare',
  },
  description: 'Pure, effective, and science-backed clinical skincare formulations. Face Wash, Vitamin C Serum, Retinol, and Sunscreen formulated for maximum efficacy.',
  keywords: ['skincare', 'clinical skincare', 'science-backed', 'serums', 'sunscreen', 'face wash', 'body care', 'Avyora'],
  authors: [{ name: 'Avyora Labs' }],
  creator: 'Avyora Labs',
  publisher: 'Avyora Labs',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Avyora | Science-Forward Clinical Skincare',
    description: 'Pure, effective, and science-backed clinical skincare formulations formulated in-house.',
    url: 'https://avyora.com',
    siteName: 'Avyora Skincare',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Avyora Clinical Skincare',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Avyora | Science-Forward Clinical Skincare',
    description: 'Pure, effective, and science-backed clinical skincare formulations.',
    creator: '@avyora',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF8F3' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1330' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${foglihten.variable} ${jost.variable}`}>
      <body className="antialiased font-body bg-background">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ClientLayoutWrapper authEnabled={isCustomerAuthConfigured()}>
            {children}
          </ClientLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
