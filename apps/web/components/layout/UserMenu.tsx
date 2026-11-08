'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Building2, LogOut, Shield, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { ThemeToggle } from './ThemeToggle';

export function UserMenu() {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (loading) return <div className="size-9 rounded-full bg-surface-2" />;
  if (!me.user)
    return (
      <div className="flex items-center gap-2">
        <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
        <Link href="/register" className="hidden sm:block"><Button size="sm">Create account</Button></Link>
      </div>
    );
  const initials = me.user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" className="size-9 rounded-full bg-gradient-to-br from-accent to-electric text-white text-[13px] font-semibold grid place-items-center">
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-surface shadow-pop z-[2000] animate-in p-2">
          <div className="px-3 py-2">
            <div className="font-medium text-sm truncate">{me.user.fullName}</div>
            <div className="text-xs text-muted truncate">{me.user.email ?? me.user.phone}</div>
          </div>
          <div className="h-px bg-border my-1" />
          <MenuLink href="/profile" icon={User} onClick={() => setOpen(false)}>Profile & vehicles</MenuLink>
          {(me.user.role === 'operator' || me.user.role === 'admin') && <MenuLink href="/operator" icon={Building2} onClick={() => setOpen(false)}>Wattly Business</MenuLink>}
          {me.user.role === 'driver' && <MenuLink href="/operator/register" icon={Building2} onClick={() => setOpen(false)}>Join Wattly Business</MenuLink>}
          {me.user.role === 'admin' && <MenuLink href="/admin" icon={Shield} onClick={() => setOpen(false)}>Wattly Admin</MenuLink>}
          <div className="h-px bg-border my-1" />
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[13px] text-muted">Theme</span>
            <ThemeToggle />
          </div>
          <button onClick={async () => { await logout(); setOpen(false); router.push('/'); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger-soft">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon: Icon, children, onClick }: { href: string; icon: any; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-surface-2">
      <Icon className="size-4 text-muted" /> {children}
    </Link>
  );
}
