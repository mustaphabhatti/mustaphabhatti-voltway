'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/format';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { DemoBanner } from './DemoBanner';

export interface NavItem { href: string; label: string; icon: any; exact?: boolean }

export function DashboardShell({ nav, children, badge, header, footer }: { nav: NavItem[]; children: ReactNode; badge: 'Business' | 'Admin' | 'Network'; header?: ReactNode; footer?: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + '/'));
  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b border-border"><Logo href={nav[0].href} product={badge} /></div>
      {header && <div className="px-3 pt-3">{header}</div>}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5 scrollbar-thin" aria-label={`${badge} navigation`}>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
            className={cn('flex items-center gap-3 h-9 px-3 rounded-lg text-[13.5px] font-medium transition', active(n) ? 'bg-accent-soft text-accent-strong dark:text-accent' : 'text-muted hover:text-text hover:bg-surface-2')}>
            <n.icon className="size-4" /> {n.label}
          </Link>
        ))}
      </nav>
      {footer && <div className="p-3 border-t border-border">{footer}</div>}
    </div>
  );
  return (
    <div className="h-dvh flex flex-col">
      <DemoBanner />
      <div className="flex-1 min-h-0 flex">
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-surface">{sidebar}</aside>
        {open && (
          <div className="lg:hidden fixed inset-0 z-[2000]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-surface border-r border-border animate-in">{sidebar}</aside>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 shrink-0 border-b border-border bg-surface/90 backdrop-blur flex items-center gap-2 px-3 md:px-6">
            <button className="lg:hidden size-10 grid place-items-center rounded-xl hover:bg-surface-2" onClick={() => setOpen(true)} aria-label="Open navigation">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <div className="lg:hidden"><Logo href={nav[0].href} product={badge} /></div>
            <div className="ml-auto flex items-center gap-1.5">
              <Link href="/" className="hidden sm:inline text-[13px] text-muted hover:text-text px-3">Wattly Drive ↗</Link>
              <NotificationBell />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="max-w-[1400px] mx-auto p-4 md:p-6 lg:p-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
