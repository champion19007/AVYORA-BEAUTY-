import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientLayoutWrapper } from '@/components/layout/client-layout-wrapper';

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
    { media: '(prefers-color-scheme: light)', color: '#FAFAF8' },
    { media: '(prefers-color-scheme: dark)', color: '#070707' },
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans bg-[#FAFAF8]">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
