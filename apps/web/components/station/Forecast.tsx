'use client';
import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from 'recharts';
import { useFetch } from '@/lib/hooks';
import { Segmented, Skeleton } from '@/components/ui';
import { SourceBadge } from './badges';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Forecast({ stationId, timezone }: { stationId: string; timezone: string }) {
  const { data, loading } = useFetch<any>(`/stations/${stationId}/forecast`);
  const todayLocal = DAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date()));
  const hourLocal = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const [day, setDay] = useState(String(todayLocal));
  if (loading) return <Skeleton className="h-32" />;
  if (!data) return null;
  const row = (data.grid[Number(day)] as number[]).map((v, h) => ({ h, v, label: h % 3 === 0 ? `${h}` : '' }));
  const now = row[hourLocal]?.v ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <Segmented size="sm" value={day} onChange={setDay} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
        <SourceBadge source="estimated" />
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={row} barCategoryGap={2}>
            <XAxis dataKey="label" interval={0} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <Bar dataKey="v" radius={[3, 3, 0, 0]}>
              {row.map((r) => <Cell key={r.h} fill={Number(day) === todayLocal && r.h === hourLocal ? 'var(--electric)' : 'var(--surface-3)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted mt-1">
        {Number(day) === todayLocal ? (now > 0.45 ? 'Usually busy at this hour.' : now > 0.2 ? 'Usually moderately busy at this hour.' : 'Usually not busy at this hour.') + ' ' : ''}
        Based on {data.basis}; a prediction, not live occupancy.
      </p>
    </div>
  );
}
