'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useFetch } from '@/lib/hooks';
import { Button, ErrorState, Field, Input, PageHeader, Segmented, Select, Skeleton } from '@/components/ui';
import { AnalyticsDashboard } from '@/components/charts';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function OperatorAnalytics() {
  const [range, setRange] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [stationId, setStationId] = useState('');
  const { data: stations } = useFetch<any>('/operator/stations');
  const f = range === 'custom' ? from : iso(new Date(Date.now() - Number(range) * 86400_000));
  const t = range === 'custom' ? new Date(new Date(to).getTime() + 86400_000).toISOString() : new Date().toISOString();
  const { data, error, loading, reload } = useFetch<any>(`/operator/analytics?from=${f}&to=${t}${stationId ? `&stationId=${stationId}` : ''}`);
  const exportCsv = () => {
    if (!data) return;
    const rows = [['day', 'sessions', 'energy_kwh', 'revenue', 'avg_duration_min'], ...data.daily.map((d: any) => [d.day, d.sessions, d.energy_kwh.toFixed(2), d.revenue.toFixed(2), d.avg_duration_min.toFixed(1)])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `voltway-analytics-${f}-to-${iso(new Date(t))}.csv`;
    a.click();
  };
  return (
    <>
      <PageHeader title="Analytics" subtitle="Sessions, energy, revenue, utilization and availability." actions={<Button variant="outline" onClick={exportCsv} disabled={!data}><Download className="size-4" /> Export CSV</Button>} />
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <Segmented value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'custom', label: 'Custom' }]} />
        {range === 'custom' && (<><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} /></Field></>)}
        <Select value={stationId} onChange={(e) => setStationId(e.target.value)} className="w-64" aria-label="Station">
          <option value="">All stations</option>
          {stations?.stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-[600px]" /> : <div className={loading ? 'opacity-60 transition' : ''}><AnalyticsDashboard data={data} /></div>}
    </>
  );
}
