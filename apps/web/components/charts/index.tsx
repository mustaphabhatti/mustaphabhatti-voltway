'use client';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BatteryCharging, Clock, Gauge, Star, Users, Wallet, Zap } from 'lucide-react';
import { PORT_STATUS_LABELS, formatDuration, formatMoney, type PortStatus } from '@wattly/shared';
import { Card, CardHeader, Segmented, Stat, Table } from '@/components/ui';
import { STATUS_STYLE } from '@/components/station/badges';
import { pct, shortDate } from '@/lib/format';

export const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, color: 'var(--text)', boxShadow: 'var(--shadow)' };
const axis = { tick: { fontSize: 11, fill: 'var(--muted)' }, axisLine: false, tickLine: false } as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function compact(n: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

type Metric = 'sessions' | 'energy_kwh' | 'revenue' | 'avg_duration_min';
const METRIC_LABEL: Record<Metric, string> = { sessions: 'Sessions', energy_kwh: 'Energy (kWh)', revenue: 'Revenue', avg_duration_min: 'Avg duration (min)' };

/** Analytics view shared by the operator and admin dashboards. */
export function AnalyticsDashboard({ data, showTable = true }: { data: any; showTable?: boolean }) {
  const [metric, setMetric] = useState<Metric>('sessions');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const t = data.totals;
  const currency = t.revenue?.[0]?.currency ?? 'PKR';
  const daily = data.daily.map((d: any) => ({ ...d, label: shortDate(d.day) }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-7 gap-3">
        <Stat label="Sessions" value={t.sessions.toLocaleString()} icon={<Zap className="size-4" />} tone="blue" />
        <Stat label="Energy delivered" value={`${compact(t.energy_kwh)} kWh`} icon={<BatteryCharging className="size-4" />} tone="green" />
        <Stat label="Revenue" value={t.revenue.length ? t.revenue.map((r: any) => `${r.currency} ${compact(r.total)}`).join(' + ') : '—'} sub={t.revenue.length ? t.revenue.map((r: any) => formatMoney(r.total, r.currency)).join(' + ') : undefined} icon={<Wallet className="size-4" />} tone="amber" />
        <Stat label="Avg duration" value={formatDuration(t.avg_duration_min)} sub={`${t.avg_energy_kwh.toFixed(1)} kWh per session`} icon={<Clock className="size-4" />} />
        <Stat label="Utilization" value={pct(t.utilization, 1)} sub="share of port-hours in use" icon={<Gauge className="size-4" />} tone="violet" />
        <Stat label="Unique drivers" value={t.unique_drivers.toLocaleString()} icon={<Users className="size-4" />} />
        <Stat label="Customer rating" value={data.ratings?.avg ? `${data.ratings.avg.toFixed(2)} ★` : '—'} sub={`${data.ratings?.count ?? 0} reviews`} icon={<Star className="size-4" />} tone="amber" />
      </div>

      <Card>
        <CardHeader title={`${METRIC_LABEL[metric]} per day`} subtitle={`${shortDate(data.range.from)} – ${shortDate(data.range.to)} · ${data.range.timezone}`}
          action={<div className="flex gap-2 flex-wrap justify-end"><Segmented size="sm" value={metric} onChange={setMetric} options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m].replace(' (kWh)', '').replace(' (min)', '') }))} /><Segmented size="sm" value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} /></div>} />
        <div className="px-3 pb-4">
          {view === 'chart' ? (
            <div className="h-64">
              {daily.length === 0 ? <p className="text-sm text-muted p-4">No sessions in this period.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ left: 4, right: 12, top: 8 }}>
                    <defs><linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" {...axis} minTickGap={24} />
                    <YAxis {...axis} width={48} tickFormatter={(v) => compact(v)} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--subtle)', strokeDasharray: '3 3' }}
                      formatter={(v: any) => [metric === 'revenue' ? formatMoney(Number(v), currency) : metric === 'avg_duration_min' ? formatDuration(Number(v)) : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }), METRIC_LABEL[metric]]} />
                    <Area type="monotone" dataKey={metric} stroke="var(--series-1)" strokeWidth={2} fill="url(#dailyFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <Table className="max-h-72 overflow-y-auto">
              <thead><tr><th>Day</th><th>Sessions</th><th>Energy</th><th>Revenue</th><th>Avg duration</th></tr></thead>
              <tbody>{daily.map((d: any) => <tr key={d.day}><td>{d.day}</td><td className="tabular">{d.sessions}</td><td className="tabular">{d.energy_kwh.toFixed(0)} kWh</td><td className="tabular">{formatMoney(d.revenue, currency)}</td><td className="tabular">{formatDuration(d.avg_duration_min)}</td></tr>)}</tbody>
            </Table>
          )}
        </div>
      </Card>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Peak usage hours" subtitle="Session starts by weekday and hour (local time)" />
          <div className="px-5 pb-5"><Heatmap hourly={data.hourly} /></div>
        </Card>
        <Card>
          <CardHeader title="Port availability" subtitle="Share of port-time in each status during the period" />
          <div className="px-5 pb-5"><PortStatusBar stats={data.portStats} /></div>
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Most used stations" subtitle="By sessions in the period" />
          <div className="px-3 pb-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stations.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={6}>
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="name" {...axis} width={170} tickFormatter={(n: string) => (n.length > 24 ? n.slice(0, 23) + '…' : n)} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} formatter={(v: any, _n, p: any) => [`${v} sessions · ${p.payload.energy_kwh.toFixed(0)} kWh · ${formatMoney(p.payload.revenue, currency)}`, p.payload.city]} />
                <Bar dataKey="sessions" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Charger utilization" subtitle="Port-hours in use ÷ port-hours available" />
          <div className="px-3 pb-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...data.stations].sort((a: any, b: any) => b.utilization - a.utilization).slice(0, 8)} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={6}>
                <XAxis type="number" {...axis} tickFormatter={(v) => pct(v)} domain={[0, 'auto']} />
                <YAxis type="category" dataKey="name" {...axis} width={170} tickFormatter={(n: string) => (n.length > 24 ? n.slice(0, 23) + '…' : n)} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} formatter={(v: any, _n, p: any) => [`${pct(Number(v), 1)} · ${p.payload.ports} ports`, 'Utilization']} />
                <Bar dataKey="utilization" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {showTable && (
        <Card>
          <CardHeader title="Station performance" subtitle={`${data.stations.length} stations`} />
          <Table>
            <thead><tr><th>Station</th><th>City</th><th>Ports</th><th>Sessions</th><th>Energy</th><th>Revenue</th><th>Utilization</th><th>Rating</th></tr></thead>
            <tbody>
              {data.stations.map((s: any) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td><td className="text-muted">{s.city}</td><td className="tabular">{s.ports}</td><td className="tabular">{s.sessions}</td>
                  <td className="tabular">{s.energy_kwh.toFixed(0)} kWh</td><td className="tabular">{formatMoney(s.revenue, currency)}</td>
                  <td><div className="flex items-center gap-2"><div className="w-20 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.min(100, s.utilization * 100 * 3)}%` }} /></div><span className="tabular text-xs">{pct(s.utilization, 1)}</span></div></td>
                  <td className="tabular">{s.rating ? `${s.rating.toFixed(1)} ★` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {data.byConnector?.length > 0 && (
            <div className="px-5 py-4 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
              <span className="text-muted">Sessions by connector:</span>
              {data.byConnector.map((c: any) => <span key={c.connector_type}><b>{c.connector_type}</b> <span className="text-muted tabular">{c.sessions} · {c.energy_kwh.toFixed(0)} kWh</span></span>)}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Heatmap({ hourly }: { hourly: { dow: number; hour: number; sessions: number }[] }) {
  const [hover, setHover] = useState<{ d: number; h: number; v: number } | null>(null);
  const { grid, max } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of hourly) g[r.dow][r.hour] = r.sessions;
    return { grid: g, max: Math.max(1, ...g.flat()) };
  }, [hourly]);
  const step = (v: number) => (v === 0 ? 'var(--surface-2)' : `var(--seq-${Math.min(6, 1 + Math.floor((v / max) * 5.999))})`);
  const peak = useMemo(() => { let b = { d: 0, h: 0, v: 0 }; grid.forEach((row, d) => row.forEach((v: number, h: number) => { if (v > b.v) b = { d, h, v }; })); return b; }, [grid]);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: '36px repeat(24, 1fr)' }}>
            {grid.map((row, d) => (
              <div key={d} className="contents">
                <div className="text-[11px] text-muted pr-1 flex items-center">{DAYS[d]}</div>
                {row.map((v: number, h: number) => (
                  <div key={h} onMouseEnter={() => setHover({ d, h, v })} onMouseLeave={() => setHover(null)}
                    className="h-6 rounded-[3px] cursor-default ring-offset-1 hover:ring-2 hover:ring-[var(--text)]" style={{ background: step(v) }} aria-label={`${DAYS[d]} ${h}:00 — ${v} sessions`} />
                ))}
              </div>
            ))}
            <div />
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-[10px] text-subtle text-center pt-1">{h % 3 === 0 ? h : ''}</div>)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted gap-3 flex-wrap">
        <span>{hover ? <><b className="text-text">{DAYS[hover.d]} {String(hover.h).padStart(2, '0')}:00</b> · {hover.v} sessions</> : <>Busiest: <b className="text-text">{DAYS[peak.d]} {String(peak.h).padStart(2, '0')}:00</b> ({peak.v} sessions)</>}</span>
        <span className="flex items-center gap-1">Fewer {[1, 2, 3, 4, 5, 6].map((i) => <span key={i} className="size-3 rounded-[2px]" style={{ background: `var(--seq-${i})` }} />)} More</span>
      </div>
    </div>
  );
}

function PortStatusBar({ stats }: { stats: { status: PortStatus; minutes: number }[] }) {
  const total = stats.reduce((a, s) => a + s.minutes, 0) || 1;
  const order: PortStatus[] = ['available', 'charging', 'occupied', 'reserved', 'out_of_service', 'offline', 'no_power', 'unknown'];
  const rows = order.map((s) => ({ status: s, minutes: stats.find((x) => x.status === s)?.minutes ?? 0 })).filter((r) => r.minutes > 0);
  const uptime = 1 - rows.filter((r) => ['out_of_service', 'offline', 'no_power'].includes(r.status)).reduce((a, r) => a + r.minutes, 0) / total;
  return (
    <div>
      <div className="flex items-end gap-6 mb-4">
        <div><div className="text-3xl font-semibold tabular">{pct(uptime, 2)}</div><div className="text-xs text-muted">charger uptime</div></div>
        <div><div className="text-3xl font-semibold tabular">{pct((rows.find((r) => r.status === 'available')?.minutes ?? 0) / total, 1)}</div><div className="text-xs text-muted">time available to drivers</div></div>
      </div>
      <div className="flex h-4 rounded-md overflow-hidden gap-[2px] bg-surface">
        {rows.map((r) => <div key={r.status} title={`${PORT_STATUS_LABELS[r.status]}: ${pct(r.minutes / total, 2)}`} style={{ width: `${(r.minutes / total) * 100}%`, background: STATUS_STYLE[r.status].hex, minWidth: 2 }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4 text-[13px]">
        {rows.map((r) => (
          <li key={r.status} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: STATUS_STYLE[r.status].hex }} />{PORT_STATUS_LABELS[r.status]}</span>
            <span className="tabular text-muted">{pct(r.minutes / total, r.minutes / total < 0.01 ? 2 : 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
