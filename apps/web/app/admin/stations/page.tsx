'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ExternalLink, Search, X } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useDebounced, useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Segmented, SkeletonList, Table, Textarea } from '@/components/ui';
import { LISTING_TONE } from '@/components/operator/constants';

function Listings() {
  const params = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState(params.get('status') ?? 'pending');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<any>(`/admin/stations${qs({ status, q: dq })}`);
  const [reject, setReject] = useState<{ s: any; decision: 'rejected' | 'suspended'; reason: string } | null>(null);
  const decide = async (id: string, decision: string, reason?: string) => {
    try { await api.post(`/admin/stations/${id}/review`, { decision, reason }); toast('success', `Listing ${decision}`); setReject(null); reload(true); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <>
      <PageHeader title="Station listings" subtitle="Approve new and relocated stations before drivers can see them." />
      <div className="flex flex-wrap gap-3 mb-4">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Live' }, { value: 'rejected', label: 'Rejected' }, { value: 'suspended', label: 'Suspended' }, { value: 'draft', label: 'Drafts' }, { value: '', label: 'All' }]} />
        <div className="relative w-full sm:w-72"><Search className="size-4 absolute left-3 top-3 text-subtle" /><Input className="pl-9" placeholder="Search name, city or company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.stations.length ? <EmptyState title="Nothing to review" body="All caught up." /> : (
        <Card>
          <Table>
            <thead><tr><th>Station</th><th>Company</th><th>Checks</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>{data.stations.map((s: any) => (
              <tr key={s.id}>
                <td><Link href={`/stations/${s.id}`} target="_blank" className="font-medium hover:underline inline-flex items-center gap-1">{s.name}<ExternalLink className="size-3" /></Link><div className="text-xs text-muted">{s.address}, {s.city} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div></td>
                <td>{s.company_name}{s.data_source === 'community' && <Badge tone="violet" className="ml-1">driver submitted</Badge>}{s.coming_soon && <Badge className="ml-1">coming soon</Badge>}<div><Badge tone={s.company_status === 'verified' ? 'green' : 'amber'}>{s.company_status}</Badge></div></td>
                <td className="text-xs space-y-0.5">
                  <div className={s.ports ? 'text-accent' : 'text-danger'}>{s.ports ? `✓ ${s.ports} ports` : '✗ no ports'}</div>
                  <div className={s.has_tariff ? 'text-accent' : 'text-warning'}>{s.has_tariff ? '✓ pricing' : '! no pricing'}</div>
                  <div className={s.images ? 'text-accent' : 'text-muted'}>{s.images ? `✓ ${s.images} photos` : '– no photos'}</div>
                </td>
                <td><Badge tone={LISTING_TONE[s.listing_status]}>{s.listing_status}</Badge>{s.rejection_reason && <div className="text-xs text-muted mt-1 max-w-48">{s.rejection_reason}</div>}</td>
                <td className="text-muted whitespace-nowrap">{timeAgo(s.created_at)}</td>
                <td className="whitespace-nowrap">
                  {s.listing_status !== 'approved' && <Button size="sm" onClick={() => decide(s.id, 'approved')} disabled={!s.ports && !s.coming_soon}><Check className="size-4" />Approve</Button>}
                  {s.listing_status === 'pending' && <Button size="sm" variant="ghost" onClick={() => setReject({ s, decision: 'rejected', reason: '' })}><X className="size-4" />Reject</Button>}
                  {s.listing_status === 'approved' && <Button size="sm" variant="ghost" className="text-danger" onClick={() => setReject({ s, decision: 'suspended', reason: '' })}>Suspend</Button>}
                </td>
              </tr>
            ))}</tbody>
          </Table>
        </Card>
      )}
      <Modal open={!!reject} onClose={() => setReject(null)} title={reject ? `${reject.decision === 'rejected' ? 'Reject' : 'Suspend'} ${reject.s.name}` : ''}
        footer={<><Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" disabled={!reject?.reason} onClick={() => reject && decide(reject.s.id, reject.decision, reject.reason)}>Confirm</Button></>}>
        <Field label="Reason (sent to the operator)"><Textarea value={reject?.reason ?? ''} onChange={(e) => reject && setReject({ ...reject, reason: e.target.value })} placeholder="e.g. Location pin is 300 m from the address; please correct it." /></Field>
      </Modal>
    </>
  );
}
export default function ListingsPage() { return <Suspense><Listings /></Suspense>; }
