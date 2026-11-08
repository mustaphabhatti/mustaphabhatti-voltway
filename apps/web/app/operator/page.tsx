'use client';
import Link from 'next/link';
import { AlertTriangle, BatteryCharging, CalendarClock, MapPinned, Plus, Star, Wallet, Zap } from 'lucide-react';
import { PORT_STATUS_LABELS, formatMoney, type PortStatus } from '@wattly/shared';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Stat } from '@/components/ui';
import { STATUS_STYLE } from '@/components/station/badges';
import { AnalyticsDashboard } from '@/components/charts';

export default function OperatorDashboard() {
  const { me } = useAuth();
  const company = me.companies?.[0];
  const ov = useFetch<any>('/operator/overview');
  const an = useFetch<any>('/operator/analytics');
  if (ov.error) return <ErrorState error={ov.error} onRetry={ov.reload} />;
  const o = ov.data;
  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}${me.user ? `, ${me.user.fullName.split(' ')[0]}` : ''}`} subtitle={`${company?.name ?? ''} network overview`}
        actions={<Link href="/operator/stations/new"><Button><Plus className="size-4" /> Add station</Button></Link>} />
      {company?.verification_status === 'pending' && (
        <div className="rounded-2xl bg-warning-soft p-4 mb-5 text-sm flex gap-3"><AlertTriangle className="size-5 text-warning shrink-0" /><div><b>Verification pending.</b> You can prepare stations as drafts now. They are submitted for review automatically once an admin verifies your company. Upload your registration documents in <Link href="/operator/settings" className="underline">Settings</Link>.</div></div>
      )}
      {!o ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Stations" value={o.stations.total} sub={`${o.stations.approved} live · ${o.stations.pending} in review · ${o.stations.draft} draft`} icon={<MapPinned className="size-4" />} tone="green" />
            <Stat label="Ports in use" value={(o.ports.statusCounts.charging ?? 0) + (o.ports.statusCounts.occupied ?? 0)} sub={`${o.ports.statusCounts.available ?? 0} of ${o.ports.total} ports available`} icon={<BatteryCharging className="size-4" />} tone="blue" />
            <Stat label="Today" value={`${o.today.sessions} sessions`} sub={`${o.today.energy.toFixed(0)} kWh · ${formatMoney(o.today.revenue, an.data?.totals.revenue?.[0]?.currency ?? 'PKR')}`} icon={<Wallet className="size-4" />} tone="amber" />
            <Stat label="Upcoming reservations" value={o.upcomingReservations} icon={<CalendarClock className="size-4" />} tone="violet" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4 mt-4">
            <Card className="lg:col-span-2">
              <CardHeader title="Live port status" subtitle="Across all your stations" action={<Link href="/operator/ports"><Button size="sm" variant="ghost">Manage ports</Button></Link>} />
              <div className="px-5 pb-5">
                <div className="flex h-3 rounded-md overflow-hidden gap-[2px]">
                  {(Object.entries(o.ports.statusCounts) as [PortStatus, number][]).filter(([, n]) => n > 0).map(([s, n]) => <div key={s} style={{ width: `${(n / o.ports.total) * 100}%`, background: STATUS_STYLE[s].hex }} title={`${PORT_STATUS_LABELS[s]}: ${n}`} />)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {(Object.entries(o.ports.statusCounts) as [PortStatus, number][]).map(([s, n]) => (
                    <div key={s} className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[11.5px] text-muted flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: STATUS_STYLE[s].hex }} />{PORT_STATUS_LABELS[s]}</div><div className="text-lg font-semibold tabular">{n}</div></div>
                  ))}
                </div>
                <h4 className="text-[13px] font-semibold mt-5 mb-2">Needs attention</h4>
                {o.alerts.length === 0 ? <p className="text-sm text-muted">All ports are reporting normally.</p> : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {o.alerts.map((a: any) => (
                      <li key={a.portId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <AlertTriangle className="size-4 text-warning shrink-0" />
                        <Link href={`/operator/stations/${a.stationId}`} className="font-medium hover:underline truncate">{a.stationName}</Link>
                        <span className="text-muted">{a.label}</span>
                        <span className="ml-auto flex gap-1.5">{a.stale && <Badge tone="amber">No update {timeAgo(a.updatedAt)}</Badge>}<Badge tone={STATUS_STYLE[a.status as PortStatus].tone}>{PORT_STATUS_LABELS[a.status as PortStatus]}</Badge></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Latest reviews" action={<Link href="/operator/reviews"><Button size="sm" variant="ghost">All</Button></Link>} />
              <div className="px-5 pb-5 space-y-3">
                {o.recentReviews.length === 0 ? <EmptyState title="No reviews yet" className="py-4" /> : o.recentReviews.map((r: any) => (
                  <div key={r.id} className="text-sm border-b border-border pb-3 last:border-0">
                    <div className="flex justify-between"><span className="font-medium truncate">{r.station_name}</span><span className="flex items-center gap-0.5 text-xs"><Star className="size-3 fill-warning text-warning" />{r.rating}</span></div>
                    <p className="text-muted text-[13px] line-clamp-2 mt-0.5">{r.comment || 'No comment'}</p>
                    <span className="text-[11px] text-subtle">{timeAgo(r.created_at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
      <h2 className="text-lg font-semibold tracking-tight mt-8 mb-3 flex items-center gap-2"><Zap className="size-4" />Last 30 days</h2>
      {an.error ? <ErrorState error={an.error} onRetry={an.reload} /> : !an.data ? <Skeleton className="h-96" /> : <AnalyticsDashboard data={an.data} showTable={false} />}
    </>
  );
}
