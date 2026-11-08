'use client';
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { formatMoney } from '@wattly/shared';
import { useFetch } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonList, Table } from '@/components/ui';

const TONE: Record<string, any> = { confirmed: 'blue', active: 'violet', completed: 'green', cancelled: 'neutral', expired: 'amber' };

export default function OperatorReservations() {
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useFetch<any>(`/operator/reservations${status ? `?status=${status}` : ''}`);
  return (
    <>
      <PageHeader title="Reservations" subtitle="Bookings at stations with reservations enabled. Ports are held 15 minutes past the start time." />
      <Segmented value={status} onChange={setStatus} className="mb-4" options={[{ value: '', label: 'All' }, { value: 'confirmed', label: 'Upcoming' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'expired', label: 'No-shows' }, { value: 'cancelled', label: 'Cancelled' }]} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.reservations.length ? <EmptyState icon={<CalendarClock className="size-6" />} title="No reservations" body="Enable reservations on a station to let drivers book ports." /> : (
        <Card>
          <Table>
            <thead><tr><th>When</th><th>Station</th><th>Port</th><th>Driver</th><th>Fee</th><th>Status</th></tr></thead>
            <tbody>{data.reservations.map((r: any) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateTime(r.start_at)} – {new Date(r.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="font-medium">{r.station_name}</td><td>{r.port_label} <span className="text-muted">{r.connector_type}</span></td>
                <td>{r.driver_name}</td><td className="tabular">{Number(r.fee) ? formatMoney(r.fee, r.currency) : 'Free'}</td>
                <td><Badge tone={TONE[r.status]}>{r.status}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
