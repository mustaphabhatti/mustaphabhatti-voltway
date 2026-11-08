'use client';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BatteryCharging, Building2, ChevronRight, MapPinned, PlugZap, Users, Wallet, Zap } from 'lucide-react';
import { formatMoney } from '@wattly/shared';
import { useFetch } from '@/lib/hooks';
import { shortDate } from '@/lib/format';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, Stat } from '@/components/ui';
import { compact, tooltipStyle } from '@/components/charts';

export default function AdminOverview() {
  const { data, error, loading, reload } = useFetch<any>('/admin/overview');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[600px]" />;
  const count = (arr: any[], key: string) => arr.find((x) => x.role === key || x.status === key)?.n ?? 0;
  const t = data.analytics.totals;
  const queues = [
    { label: 'Companies awaiting verification', n: data.queues.pending_companies, href: '/admin/companies?status=pending' },
    { label: 'Station listings to review', n: data.queues.pending_stations, href: '/admin/stations?status=pending' },
    { label: 'Flagged reviews', n: data.queues.flagged_reviews, href: '/admin/reviews?status=flagged' },
    { label: 'Open complaints', n: data.queues.complaints, href: '/admin/complaints' },
    { label: 'Driver station reports', n: data.queues.station_reports, href: '/admin/quality' },
  ];
  const daily = data.analytics.daily.map((d: any) => ({ ...d, label: shortDate(d.day) }));
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Last 30 days across all operators" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Users" value={data.users.reduce((a: number, u: any) => a + u.n, 0)} sub={`${count(data.users, 'driver')} drivers · ${count(data.users, 'operator')} operators`} icon={<Users className="size-4" />} tone="blue" />
        <Stat label="Companies" value={data.companies.reduce((a: number, u: any) => a + u.n, 0)} sub={`${count(data.companies, 'verified')} verified · ${count(data.companies, 'pending')} pending`} icon={<Building2 className="size-4" />} tone="violet" />
        <Stat label="Live stations" value={count(data.stations, 'approved')} sub={`${data.ports.total} ports · ${data.ports.available} available now`} icon={<MapPinned className="size-4" />} tone="green" />
        <Stat label="Ports down" value={data.ports.down} sub={`${((data.ports.down / Math.max(1, data.ports.total)) * 100).toFixed(1)}% of live ports`} icon={<PlugZap className="size-4" />} tone="red" />
        <Stat label="Sessions (30d)" value={t.sessions.toLocaleString()} icon={<Zap className="size-4" />} tone="blue" />
        <Stat label="Energy (30d)" value={`${compact(t.energy_kwh)} kWh`} icon={<BatteryCharging className="size-4" />} tone="green" />
        <Stat label="Gross charging revenue" value={t.revenue.map((r: any) => `${r.currency} ${compact(r.total)}`).join(' + ') || '—'} icon={<Wallet className="size-4" />} tone="amber" />
        <Stat label="Network utilization" value={`${(t.utilization * 100).toFixed(1)}%`} sub="port-hours in use" icon={<Zap className="size-4" />} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Sessions per day" subtitle="All networks" action={<Link href="/admin/analytics" className="text-sm text-accent">Full analytics</Link>} />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ right: 12 }}>
                <defs><linearGradient id="adm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'Sessions']} />
                <Area type="monotone" dataKey="sessions" stroke="var(--series-1)" strokeWidth={2} fill="url(#adm)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Work queues" />
          <div className="px-3 pb-3">
            {queues.map((q) => (
              <Link key={q.label} href={q.href} className="flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-surface-2 text-sm">
                <span>{q.label}</span>
                <span className="flex items-center gap-2"><span className={q.n ? 'font-semibold tabular' : 'text-muted tabular'}>{q.n}</span><ChevronRight className="size-4 text-subtle" /></span>
              </Link>
            ))}
          </div>
          <CardHeader title="Top stations (30d)" className="pt-2" />
          <ul className="px-5 pb-5 space-y-1.5 text-sm">
            {data.analytics.topStations.slice(0, 5).map((s: any) => <li key={s.id} className="flex justify-between gap-2"><span className="truncate">{s.name}</span><span className="text-muted tabular">{s.sessions}</span></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
