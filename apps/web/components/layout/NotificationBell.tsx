'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, BatteryLow, CalendarClock, CircleDollarSign, PlugZap, Radio, Route, ShieldAlert, TrendingDown, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';

export const NOTIF_ICON: Record<string, any> = {
  session_complete: PlugZap, reservation_reminder: CalendarClock, price_change: CircleDollarSign, peak_schedule: CircleDollarSign,
  station_outage: ShieldAlert, traffic: Route, low_battery: BatteryLow, better_alternative: TrendingDown, availability_change: Zap,
  nearby_available: Radio, system: Bell,
};

export function NotificationBell() {
  const { me } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const load = () => api.get('/me/notifications').then((d) => { setItems(d.notifications); setUnread(d.unread); }).catch(() => {});
  useEffect(() => { if (me.user) load(); }, [me.user?.id]);
  useRealtime(me.user ? 'user' : null, (event, data) => {
    if (event === 'notification') {
      setItems((x) => [data, ...x].slice(0, 100));
      setUnread((n) => n + 1);
      toast('info', data.title, data.body);
    }
  });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!me.user) return null;
  return (
    <div className="relative" ref={ref}>
      <button aria-label={`Notifications (${unread} unread)`} onClick={() => setOpen((o) => !o)} className="relative size-10 grid place-items-center rounded-xl text-muted hover:text-text hover:bg-surface-2">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[10px] font-semibold grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-2xl border border-border bg-surface shadow-pop z-[2000] animate-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && <button className="text-xs text-accent font-medium" onClick={async () => { await api.post('/me/notifications/read'); setUnread(0); setItems((x) => x.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))); }}>Mark all read</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            {items.length === 0 && <p className="text-sm text-muted p-6 text-center">You&apos;re all caught up.</p>}
            {items.slice(0, 12).map((n) => {
              const Icon = NOTIF_ICON[n.type] ?? Bell;
              return (
                <div key={n.id} className={cn('flex gap-3 px-4 py-3 border-b border-border last:border-0', !n.read_at && 'bg-accent-soft/40')}>
                  <span className="size-8 shrink-0 rounded-lg bg-surface-2 grid place-items-center text-muted"><Icon className="size-4" /></span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{n.title}</div>
                    <div className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</div>
                    <div className="text-[11px] text-subtle mt-1">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block text-center text-[13px] font-medium py-2.5 border-t border-border hover:bg-surface-2">View all & preferences</Link>
        </div>
      )}
    </div>
  );
}
