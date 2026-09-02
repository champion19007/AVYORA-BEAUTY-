import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Package, Boxes, LogOut, Tag, LineChart, PackagePlus } from 'lucide-react';
import { isAdmin } from '@/lib/admin-guard';
import { adminSignOut } from './actions';

export const metadata: Metadata = {
  title: { default: 'Operations', template: '%s · Avyora Operations' },
  // Never indexed, never followed: this is the back office.
  robots: { index: false, follow: false },
};

/** Operator data is per-request and must never be cached or prerendered. */
export const dynamic = 'force-dynamic';

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
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <span className="font-headline text-xl font-normal tracking-tight">Operations</span>

          <nav className="flex items-center gap-1" aria-label="Operations">
            <NavLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />} label="Overview" />
            <NavLink href="/admin/orders" icon={<Package className="h-4 w-4" />} label="Orders" />
            <NavLink href="/admin/inventory" icon={<Boxes className="h-4 w-4" />} label="Inventory" />
            <NavLink href="/admin/pricing" icon={<Tag className="h-4 w-4" />} label="Pricing" />
            <NavLink href="/admin/analytics" icon={<LineChart className="h-4 w-4" />} label="Analytics" />
            <NavLink href="/admin/requests" icon={<PackagePlus className="h-4 w-4" />} label="Requests" />
          </nav>

          {/* The owner can step into the stockroom to pack when needed. */}
          <Link
            href="/manager"
            className="ml-auto text-[11px] font-semibold uppercase tracking-[0.16em] text-primary hover:opacity-70"
          >
            Stockroom
          </Link>

          <form action={adminSignOut}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
    >
      {icon}
      {label}
    </Link>
  );
}
