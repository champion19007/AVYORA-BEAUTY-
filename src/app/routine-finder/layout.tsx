import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Routine finder',
  description: 'A weekly skincare routine from your answers, your budget and the products you already own.',
  // Saved-routine links (?saved=) and photo hand-offs (?scan=) canonicalise here.
  alternates: { canonical: '/routine-finder' },
};

export default function RoutineFinderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
