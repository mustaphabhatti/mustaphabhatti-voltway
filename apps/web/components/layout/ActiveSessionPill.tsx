'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BatteryCharging } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';

export function ActiveSessionPill() {
  const { me } = useAuth();
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    if (!me.user) return setS(null);
    api.get('/sessions/active').then((d) => setS(d.session)).catch(() => {});
  }, [me.user?.id]);
  useRealtime(me.user ? 'user' : null, (event, data) => {
    if (event !== 'session.update') return;
    if (['completed', 'stopped', 'failed'].includes(data.status)) setS(null);
    else setS((x: any) => ({ ...(x ?? {}), ...data, current_soc: data.currentSoc, power_kw: data.powerKw }));
  });
  if (!s) return null;
  return (
    <Link href={`/sessions/${s.id}`} className="hidden sm:flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-full bg-accent-soft text-accent-strong dark:text-accent text-[13px] font-medium">
      <BatteryCharging className="size-4 animate-pulse" />
      {Math.round(Number(s.current_soc ?? 0))}% · {Number(s.power_kw ?? 0).toFixed(0)} kW
    </Link>
  );
}
