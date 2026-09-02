import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Boxes, PackagePlus, LogOut } from 'lucide-react';
import { getStaffSession } from '@/lib/staff-auth';
import { managerSignOut } from './actions';

export const metadata: Metadata = {
  title: { default: 'Stockroom', template: '%s · Avyora Stockroom' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The stockroom shell.
 *
 * Open to both roles. The manager lives here; the owner can come in to pack
 * parcels when the manager is away, which is why this checks for any staff
 * session rather than the manager role specifically. The reverse is not true —
 * `/admin` is owner-only, because it shows revenue and sets prices.
 */
export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  if (!session) redirect('/admin-login?next=/manager');

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <span className="font-headline text-xl font-normal tracking-tight">Stockroom</span>

          <nav className="flex items-center gap-1" aria-label="Stockroom">
            <NavLink href="/manager" icon={<ClipboardList className="h-4 w-4" />} label="Dispatch" />
            <NavLink href="/manager/stock" icon={<Boxes className="h-4 w-4" />} label="Stock" />
            <NavLink href="/manager/requests" icon={<PackagePlus className="h-4 w-4" />} label="Requests" />
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {session.username} · {session.role}
            </span>

            {/* The owner gets a way back to their own console. */}
            {session.role === 'owner' && (
              <Link
                href="/admin"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary hover:opacity-70"
              >
                Owner view
              </Link>
            )}

            <form action={managerSignOut}>
              <button
                type="submit"
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
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
