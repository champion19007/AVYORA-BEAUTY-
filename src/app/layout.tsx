import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientLayoutWrapper } from '@/components/layout/client-layout-wrapper';

export const metadata: Metadata = {
  title: {
    default: 'Avyora | Science-Forward Clinical Skincare',
    template: '%s | Avyora Skincare',
  },
  description: 'Discover Avyora: Pure, effective, and science-backed clinical skincare formulations. Formulated in-house for maximum efficacy and transparency.',
  keywords: ['skincare', 'clinical skincare', 'science-backed', 'serums', 'sunscreen', 'face wash', 'body care', 'Avyora'],
  authors: [{ name: 'Avyora Labs' }],
  creator: 'Avyora Labs',
  publisher: 'Avyora Labs',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: 'Avyora | Science-Forward Clinical Skincare',
    description: 'Pure, effective, and science-backed clinical skincare formulations formulated in-house.',
    url: 'https://avyora.com',
    siteName: 'Avyora Skincare',
    locale: 'en_US',
    type: 'website',
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
