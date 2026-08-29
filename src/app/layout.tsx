import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientLayoutWrapper } from '@/components/layout/client-layout-wrapper';

/**
 * Cormorant Garamond echoes the high-contrast serif of the AVYORA
 * wordmark and carries every display heading. Inter handles UI text.
 */
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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
    <html lang="en" suppressHydrationWarning className={`${cormorant.variable} ${inter.variable}`}>
      <body className="antialiased font-body bg-background">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
