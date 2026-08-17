import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientLayoutWrapper } from '@/components/layout/client-layout-wrapper';

export const metadata: Metadata = {
  title: 'AVYORA | Science-Forward Skincare',
  description: 'Pure, effective, and science-backed skincare formulations by Avyora.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
