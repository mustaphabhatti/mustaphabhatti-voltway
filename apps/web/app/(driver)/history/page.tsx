'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BatteryCharging, CalendarClock, FileText, History as HistoryIcon, Receipt, Zap } from 'lucide-react';
import { formatDuration, formatMoney } from '@wattly/shared';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonList, Stat, Table } from '@/components/ui';
import { RequireRole } from '@/components/layout/RequireRole';

const SESSION_TONE: Record<string, any> = { completed: 'green', stopped: 'blue', active: 'violet', pending: 'amber', failed: 'red' };
const RESV_TONE: Record<string, any> = { confirmed: 'blue', active: 'violet', completed: 'green', cancelled: 'neutral', expired: 'amber' };

function HistoryInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<'sessions' | 'reservations'>(params.get('tab') === 'reservations' ? 'reservations' : 'sessions');
  const sessions = useFetch<any>('/me/sessions');
  const resv = useFetch<any>(tab === 'reservations' ? '/me/reservations' : null, [tab]);
  const t = sessions.data?.totals;
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <PageHeader title="Charging history" subtitle="Sessions, invoices and reservations." />
      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Sessions" value={t.sessions} icon={<Zap className="size-4" />} tone="green" />
          <Stat label="Energy charged" value={`${Math.round(t.energy).toLocaleString()} kWh`} icon={<BatteryCharging className="size-4" />} tone="blue" />
          <Stat label="Time plugged in" value={formatDuration(t.minutes)} icon={<HistoryIcon className="size-4" />} tone="violet" />
          <Stat label="Total spent" value={t.spend.length ? t.spend.map((s: any) => formatMoney(s.total, s.currency)).join(' + ') : '—'} icon={<Receipt className="size-4" />} tone="amber" />
        </div>
      )}
      <Segmented value={tab} onChange={setTab} options={[{ value: 'sessions', label: 'Sessions & invoices' }, { value: 'reservations', label: 'Reservations' }]} className="mb-4" />
      {tab === 'sessions' ? (
        sessions.error ? <ErrorState error={sessions.error} onRetry={sessions.reload} /> : sessions.loading ? <SkeletonList /> : !sessions.data.sessions.length ? (
          <EmptyState icon={<Zap className="size-6" />} title="No charging sessions yet" body="Start a session from a station page and it will appear here." action={<Link href="/"><Button>Find a charger</Button></Link>} />
        ) : (
          <Card>
            <Table>
              <thead><tr><th>Date</th><th>Station</th><th>Vehicle</th><th>Energy</th><th>Duration</th><th>Battery</th><th>Cost</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {sessions.data.sessions.map((s: any) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">{dateTime(s.started_at)}</td>
                    <td><Link href={`/stations/${s.station_id}`} className="font-medium hover:underline">{s.station_name}</Link><div className="text-xs text-muted">{s.port_label} · {s.connector_type} {s.max_power_kw} kW</div></td>
                    <td className="text-muted whitespace-nowrap">{s.vehicle_brand ? `${s.vehicle_brand} ${s.vehicle_model}` : '—'}</td>
                    <td className="tabular">{Number(s.energy_kwh).toFixed(1)} kWh</td>
                    <td className="tabular whitespace-nowrap">{s.ended_at ? formatDuration((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000) : '—'}</td>
                    <td className="tabular whitespace-nowrap">{s.start_soc != null ? `${Math.round(s.start_soc)}→${Math.round(s.current_soc)}%` : '—'}</td>
                    <td className="tabular whitespace-nowrap font-medium">{formatMoney(s.cost_total, s.currency)}</td>
                    <td><Badge tone={SESSION_TONE[s.status]}>{s.status}</Badge>{s.is_demo && <Badge tone="outline" className="ml-1">demo</Badge>}</td>
                    <td className="whitespace-nowrap">
                      {['active', 'pending'].includes(s.status) ? <Link href={`/sessions/${s.id}`}><Button size="sm" variant="secondary">Monitor</Button></Link>
                        : s.invoice_id ? <Link href={`/invoices/${s.invoice_id}`}><Button size="sm" variant="ghost"><FileText className="size-3.5" />{s.invoice_number}</Button></Link> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )
      ) : resv.error ? <ErrorState error={resv.error} onRetry={resv.reload} /> : resv.loading ? <SkeletonList /> : !resv.data?.reservations.length ? (
        <EmptyState icon={<CalendarClock className="size-6" />} title="No reservations" body="Stations that support reservations show a Reserve button." />
      ) : (
        <div className="space-y-3">
          {resv.data.reservations.map((r: any) => (
            <Card key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="size-10 rounded-xl bg-electric-soft text-electric grid place-items-center"><CalendarClock className="size-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium"><Link href={`/stations/${r.station_id}`} className="hover:underline">{r.station_name}</Link> · {r.port_label}</div>
                <div className="text-sm text-muted">{dateTime(r.start_at)} – {new Date(r.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {r.connector_type} {r.max_power_kw} kW{Number(r.fee) ? ` · fee ${formatMoney(r.fee, r.currency)}` : ''}</div>
              </div>
              <Badge tone={RESV_TONE[r.status]}>{r.status}</Badge>
              {r.status === 'confirmed' && <Button size="sm" variant="outline" onClick={async () => { try { await api.post(`/reservations/${r.id}/cancel`); toast('success', 'Reservation cancelled'); resv.reload(); } catch (e: any) { toast('error', e.message); } }}>Cancel</Button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
export default function HistoryPage() {
  return <RequireRole><Suspense><HistoryInner /></Suspense></RequireRole>;
}
