import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { isAdmin } from '@/lib/admin-guard';
import { ConsoleNav, type NavGroup } from '@/components/admin/console-nav';
import { adminSignOut } from './actions';

export const metadata: Metadata = {
  title: { default: 'Operations', template: '%s · Avyora Operations' },
  // Never indexed, never followed: this is the back office.
  robots: { index: false, follow: false },
};

/** Operator data is per-request and must never be cached or prerendered. */
export const dynamic = 'force-dynamic';

/** Grouped by the job the owner came to do, not by when each page was built. */
const GROUPS: NavGroup[] = [
  { title: 'Today', items: [{ href: '/admin', label: 'Overview' }] },
  {
    title: 'Sell',
    items: [
      { href: '/admin/orders', label: 'Orders' },
      { href: '/admin/returns', label: 'Returns & refunds' },
      { href: '/admin/offers', label: 'Offers' },
      { href: '/admin/reviews', label: 'Reviews' },
    ],
  },
  {
    title: 'Products',
    items: [
      { href: '/admin/products', label: 'Products' },
      { href: '/admin/inventory', label: 'Stock' },
    ],
  },
  { title: 'Customers', items: [{ href: '/admin/requests', label: 'Requests' }] },
  {
    title: 'Content',
    items: [
      { href: '/admin/content', label: 'Pages & journal' },
      { href: '/admin/knowledge', label: 'Ingredient knowledge' },
    ],
  },
  { title: 'Reports', items: [{ href: '/admin/analytics', label: 'Analytics' }] },
  {
    title: 'Settings',
    items: [
      { href: '/admin/system', label: 'System health' },
      { href: '/manager', label: 'Stockroom' },
    ],
  },
];

/**
 * The operations shell.
 *
 * Guarding here as well as in middleware means every page beneath `/admin`
 * inherits the check without each one remembering to make it — a page added
 * later is protected by existing, not by its author being careful.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect('/admin-login?next=/admin');

  return (
    <div className="min-h-screen w-full bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="font-headline text-xl font-normal tracking-tight">
            Avyora <span className="text-muted-foreground">Operations</span>
          </Link>
          <form action={adminSignOut} className="ml-auto">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-10">
        <ConsoleNav groups={GROUPS} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
