'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Heart, History, List, Map, Route, User } from 'lucide-react';
import { cn } from '@/lib/format';
import { DemoBanner } from './DemoBanner';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { ActiveSessionPill } from './ActiveSessionPill';

export const DRIVER_NAV = [
  { href: '/', label: 'Explore Map', short: 'Map', icon: Map },
  { href: '/nearby', label: 'Nearby Chargers', short: 'Nearby', icon: List },
  { href: '/route', label: 'Route Planner', short: 'Route', icon: Route },
  { href: '/favorites', label: 'Favorites', short: 'Saved', icon: Heart },
  { href: '/history', label: 'Charging History', short: 'History', icon: History },
  { href: '/profile', label: 'Profile', short: 'Profile', icon: User },
];

export function DriverShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const fullBleed = path === '/' || path === '/route';
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <div className="h-dvh flex flex-col">
      <DemoBanner />
      <header className="h-14 shrink-0 border-b border-border bg-surface/90 backdrop-blur z-[1100] flex items-center gap-4 px-3 md:px-5">
        <Logo />
        <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Main">
          {DRIVER_NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn('flex items-center gap-2 h-9 px-3 rounded-lg text-[13.5px] font-medium transition', active(n.href) ? 'bg-surface-2 text-text' : 'text-muted hover:text-text hover:bg-surface-2/60')}>
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ActiveSessionPill />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
      <main className={cn('flex-1 min-h-0', fullBleed ? 'relative' : 'overflow-y-auto scrollbar-thin pb-20 lg:pb-0')}>{children}</main>
      <nav className="lg:hidden shrink-0 grid grid-cols-6 border-t border-border bg-surface z-[1100] pb-[env(safe-area-inset-bottom)]" aria-label="Main">
        {DRIVER_NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cn('flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium', active(n.href) ? 'text-accent' : 'text-subtle')}>
            <n.icon className="size-5" /> {n.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
