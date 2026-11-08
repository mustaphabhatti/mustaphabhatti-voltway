'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MapPinned, Plus, Search } from 'lucide-react';
import { formatMoney } from '@voltway/shared';
import { useFetch } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import type { Station } from '@/lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Segmented, SkeletonList, Table } from '@/components/ui';
import { OperationalBadge, SourceBadge } from '@/components/station/badges';

import { LISTING_TONE } from '@/components/operator/constants';

export default function OperatorStations() {
  const { data, error, loading, reload } = useFetch<{ stations: Station[] }>('/operator/stations');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const list = useMemo(() => (data?.stations ?? []).filter((s) => (status === 'all' || s.listingStatus === status) && (!q || `${s.name} ${s.city} ${s.address}`.toLowerCase().includes(q.toLowerCase()))), [data, q, status]);
  return (
    <>
      <PageHeader title="Stations" subtitle="Your charging locations, their listing status and live availability." actions={<Link href="/operator/stations/new"><Button><Plus className="size-4" />Add station</Button></Link>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative w-full sm:w-72"><Search className="size-4 absolute left-3 top-3 text-subtle" /><Input className="pl-9" placeholder="Search stations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Segmented value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'approved', label: 'Live' }, { value: 'pending', label: 'In review' }, { value: 'draft', label: 'Drafts' }, { value: 'rejected', label: 'Rejected' }]} />
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !list.length ? (
        <EmptyState icon={<MapPinned className="size-6" />} title={data?.stations.length ? 'No stations match' : 'No stations yet'} body="Add your first charging location to get started." action={<Link href="/operator/stations/new"><Button>Add station</Button></Link>} />
      ) : (
        <Card>
          <Table>
            <thead><tr><th>Station</th><th>Listing</th><th>Status</th><th>Ports</th><th>Max</th><th>Price now</th><th>Rating</th><th>Updated</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => (window.location.href = `/operator/stations/${s.id}`)}>
                  <td><Link href={`/operator/stations/${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-muted">{s.address}, {s.city}</div></td>
                  <td><Badge tone={LISTING_TONE[s.listingStatus]}>{s.listingStatus === 'approved' ? 'live' : s.listingStatus}</Badge></td>
                  <td><div className="flex flex-col gap-1 items-start"><OperationalBadge status={s.status.operational} /><SourceBadge source={s.status.source} updatedAt={s.status.updatedAt} stale={s.status.stale} compact /></div></td>
                  <td className="tabular whitespace-nowrap"><span className="text-accent font-medium">{s.summary.available}</span> / {s.summary.total} free</td>
                  <td className="tabular">{Math.round(s.maxPowerKw)} kW</td>
                  <td className="tabular whitespace-nowrap">{s.pricing ? formatMoney(s.pricing.currentRate, s.pricing.currency) : <span className="text-warning">No tariff</span>}</td>
                  <td className="tabular">{s.rating ? `${s.rating.toFixed(1)} ★` : '—'}</td>
                  <td className="text-muted whitespace-nowrap">{timeAgo(s.infoUpdatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
