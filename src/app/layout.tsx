import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter, Jost } from 'next/font/google';
import { REDESIGN } from '@/lib/redesign';
import { SiteFooter } from '@/components/nv/shell/site-footer';
import { SITE_URL } from '@/data/business-info';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientLayoutWrapper } from '@/components/layout/client-layout-wrapper';
import { DeliverTo } from '@/components/layout/deliver-to';
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

/**
 * Redesign faces (Nuvē reference, both SIL OFL): Inter 400 and 500 for all
 * text, Instrument Serif 400 for the wordmark only. Self-hosted by next/font
 * (never Framer's copies), swapped in after first paint with a
 * metric-matched fallback so the swap does not shift layout. Not preloaded:
 * next/font options must be literals, so preloading cannot follow the flag,
 * and preloading them while the flag is off would cost every page two
 * unused font downloads. Turn preload on when the redesign becomes the default.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-wordmark',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Avyora | Skincare built around a simple routine',
    template: '%s | Avyora Skincare',
  },
  // No "clinical", "science-backed" or "maximum efficacy": nothing on file
  // substantiates them (audit #09). No author or publisher entity either:
  // the registered business name is not yet confirmed (audit #10).
  description: 'Cleansers, serums, moisturisers and sunscreen, with a routine finder that starts from the essentials.',
  keywords: ['skincare', 'skincare routine', 'serums', 'sunscreen', 'face wash', 'body care', 'Avyora'],
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  // No canonical here: each public page declares its own (a root '/' made every page point at the home page; re-audit A20).
  openGraph: {
    title: 'Avyora | Skincare built around a simple routine',
    description:
      'Cleansers, serums, moisturisers and sunscreen, with a routine finder that starts from the essentials.',
    url: SITE_URL,
    siteName: 'Avyora Skincare',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Avyora Skincare',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Avyora | Skincare built around a simple routine',
    description:
      'Cleansers, serums, moisturisers and sunscreen, with a routine finder that starts from the essentials.',
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${foglihten.variable} ${jost.variable} ${inter.variable} ${instrumentSerif.variable}`}
    >
      <body
        className={
          REDESIGN ? 'nv-theme antialiased bg-nv-page font-nv text-nv-ink' : 'antialiased font-body bg-background'
        }
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ClientLayoutWrapper
            authEnabled={isCustomerAuthConfigured()}
            deliverTo={<DeliverTo />}
            footer={REDESIGN ? <SiteFooter /> : undefined}
          >
            {children}
          </ClientLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
