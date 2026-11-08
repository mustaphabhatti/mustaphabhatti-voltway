'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CONNECTOR_LABELS, PORT_STATUSES, PORT_STATUS_LABELS, type ConnectorType, type PortStatus } from '@wattly/shared';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useRealtime } from '@/lib/realtime';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Card, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonList, Table } from '@/components/ui';
import { PortStatusBadge, SourceBadge } from '@/components/station/badges';

export default function OperatorPorts() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useFetch<{ ports: any[] }>('/operator/ports');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  useRealtime('stations', (event, d) => {
    if (event === 'port.status' && data) setData({ ports: data.ports.map((p) => (p.id === d.portId ? { ...p, status: d.status, status_source: d.source, status_updated_at: d.updatedAt } : p)) });
  });
  const list = useMemo(() => (data?.ports ?? []).filter((p) => (!status || p.status === status) && (!type || p.current_type === type) && (!q || `${p.station_name} ${p.label} ${p.connector_type}`.toLowerCase().includes(q.toLowerCase()))), [data, q, status, type]);
  const setPortStatus = async (id: string, st: string) => { try { await api.post(`/operator/ports/${id}/status`, { status: st }); toast('success', 'Status updated'); reload(true); } catch (e: any) { toast('error', e.message); } };
  return (
    <>
      <PageHeader title="Charging ports" subtitle={`${data?.ports.length ?? '…'} ports across your network. Changes broadcast to drivers instantly.`} />
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative w-full sm:w-72"><Search className="size-4 absolute left-3 top-3 text-subtle" /><Input className="pl-9" placeholder="Search station or port" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48" aria-label="Status filter"><option value="">All statuses</option>{PORT_STATUSES.map((s) => <option key={s} value={s}>{PORT_STATUS_LABELS[s]}</option>)}</Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-36" aria-label="Type filter"><option value="">AC & DC</option><option value="AC">AC</option><option value="DC">DC</option></Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !list.length ? <EmptyState title="No ports match" /> : (
        <Card>
          <Table>
            <thead><tr><th>Station</th><th>Port</th><th>Connector</th><th>Power</th><th>Status</th><th>Source</th><th>Sessions (30d)</th><th>Update</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/operator/stations/${p.station_id}`} className="font-medium hover:underline">{p.station_name}</Link><div className="text-xs text-muted">{p.city}</div></td>
                  <td className="font-medium">{p.label}</td>
                  <td>{CONNECTOR_LABELS[p.connector_type as ConnectorType]} <span className="text-muted">{p.current_type}</span></td>
                  <td className="tabular whitespace-nowrap">{p.max_power_kw} kW{p.power_group ? <span className="text-xs text-muted"> · grp {p.power_group}</span> : ''}</td>
                  <td><PortStatusBadge status={p.status as PortStatus} /></td>
                  <td><SourceBadge source={p.status_source} updatedAt={p.status_updated_at} compact /><div className="text-[11px] text-subtle mt-0.5">{timeAgo(p.status_updated_at)}</div></td>
                  <td className="tabular">{p.sessions_30d}</td>
                  <td><Select className="h-8 w-40 text-xs" value="" aria-label="Set status" onChange={(e) => e.target.value && setPortStatus(p.id, e.target.value)}><option value="">Set status…</option>{PORT_STATUSES.map((s) => <option key={s} value={s}>{PORT_STATUS_LABELS[s]}</option>)}</Select></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
