'use client';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@voltway/shared';
import { useFetch } from '@/lib/hooks';
import { Skeleton } from '@/components/ui';

const KIND_COLOR: Record<string, string> = { peak: 'var(--danger)', off_peak: 'var(--accent)', super_off_peak: 'var(--accent)', shoulder: 'var(--warning)', weekend: 'var(--violet)', standard: 'var(--electric)' };

export function PriceSchedule({ stationId, currency }: { stationId: string; currency: string }) {
  const { data, loading } = useFetch<any>(`/stations/${stationId}/pricing`);
  if (loading) return <Skeleton className="h-40" />;
  if (!data?.schedule?.length) return <p className="text-sm text-muted">No time-based pricing published.</p>;
  const rows = data.schedule.map((s: any, i: number) => ({ ...s, i }));
  const kinds = [...new Map(rows.map((r: any) => [r.periodKind, r.periodLabel])).entries()];
  return (
    <div>
      <div className="h-40 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap={1}>
            <XAxis dataKey="localLabel" interval={7} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis width={44} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
              formatter={(v: any, _n: any, p: any) => [`${formatMoney(Number(v), currency)}/kWh`, p.payload.periodLabel]} labelFormatter={(l) => `${l} (station time)`} />
            <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
              {rows.map((r: any) => <Cell key={r.i} fill={KIND_COLOR[r.periodKind] ?? 'var(--electric)'} fillOpacity={r.i === 0 ? 1 : 0.75} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
        {kinds.map(([k, label]) => (
          <span key={String(k)} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: KIND_COLOR[String(k)] }} />{String(label)}</span>
        ))}
        <span className="ml-auto">Next 24 h · station local time ({data.timezone})</span>
      </div>
    </div>
  );
}
