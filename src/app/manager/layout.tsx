import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getStaffSession } from '@/lib/staff-auth';
import { ConsoleNav, type NavGroup } from '@/components/admin/console-nav';
import { managerSignOut } from './actions';

export const metadata: Metadata = {
  title: { default: 'Stockroom', template: '%s · Avyora Stockroom' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const GROUPS: NavGroup[] = [
  {
    title: 'Stockroom',
    items: [
      { href: '/manager', label: 'Dispatch' },
      { href: '/manager/stock', label: 'Stock' },
      { href: '/manager/requests', label: 'Restock requests' },
    ],
  },
  { title: 'Help', items: [{ href: '/manager/help', label: 'How to' }] },
];

/** The owner also sees a way back to their own console. */
const OWNER_GROUP: NavGroup = { title: 'Owner', items: [{ href: '/admin', label: 'Owner console' }] };

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
    <div className="min-h-screen w-full bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/manager" className="font-headline text-xl font-normal tracking-tight">
            Avyora <span className="text-muted-foreground">Stockroom</span>
          </Link>
          <span className="ml-auto hidden text-xs uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            {session.username} · {session.role}
          </span>
          <form action={managerSignOut} className="ml-auto sm:ml-0">
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
        <ConsoleNav groups={session.role === 'owner' ? [...GROUPS, OWNER_GROUP] : GROUPS} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
