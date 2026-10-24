'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NavItem = { href: string; label: string };
export type NavGroup = { title: string; items: NavItem[] };

/** The section a path belongs to: the longest matching item, so /admin does not light up for /admin/orders. */
function activeHref(pathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null;
  for (const item of groups.flatMap((g) => g.items)) {
    const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

function Links({ groups, onPick }: { groups: NavGroup[]; onPick?: () => void }) {
  const pathname = usePathname() ?? '';
  const active = activeHref(pathname, groups);
  return (
    <nav aria-label="Console" className="space-y-6">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            {group.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onPick}
                  aria-current={active === item.href ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm transition-colors',
                    active === item.href
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Link
        href="/"
        className="flex items-center gap-2 px-3 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        View shop
      </Link>
    </nav>
  );
}

/**
 * Grouped navigation for the owner and stockroom consoles: a sidebar on wide
 * screens, one "Menu" button on phones. Every page in a console is reachable
 * from every other, and "View shop" is always there, so no page is a dead end.
 */
export function ConsoleNav({ groups }: { groups: NavGroup[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <>
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-6">
          <Links groups={groups} />
        </div>
      </aside>
      <details ref={menu} className="group md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium">
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menu
        </summary>
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <Links groups={groups} onPick={() => menu.current?.removeAttribute('open')} />
        </div>
      </details>
    </>
  );
}
