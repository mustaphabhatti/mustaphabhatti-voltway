'use client';
import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Select, SkeletonList, Textarea } from '@/components/ui';

const PRIO: Record<string, any> = { urgent: 'red', high: 'amber', normal: 'blue', low: 'neutral' };
const STAT: Record<string, any> = { open: 'amber', in_progress: 'blue', resolved: 'green', closed: 'neutral' };

export default function Complaints() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useFetch<any>(`/admin/complaints${status ? `?status=${status}` : ''}`);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const update = async (id: string, patch: any) => { try { await api.patch(`/admin/complaints/${id}`, patch); toast('success', 'Ticket updated'); reload(true); } catch (e: any) { toast('error', e.message); } };
  return (
    <>
      <PageHeader title="Complaints & support" subtitle="Driver tickets about billing, chargers, listings and the app." />
      <Segmented value={status} onChange={setStatus} className="mb-4" options={[{ value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.complaints.length ? <EmptyState icon={<LifeBuoy className="size-6" />} title="No tickets" /> : (
        <div className="space-y-3">{data.complaints.map((c: any) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><div className="font-semibold">{c.subject}</div><div className="text-xs text-muted">{c.user_name} ({c.user_email}) · {c.category.replace('_', ' ')}{c.station_name ? ` · ${c.station_name}` : ''}{c.company_name ? ` (${c.company_name})` : ''} · {timeAgo(c.created_at)}</div></div>
              <div className="flex gap-1.5"><Badge tone={PRIO[c.priority]}>{c.priority}</Badge><Badge tone={STAT[c.status]}>{c.status.replace('_', ' ')}</Badge></div>
            </div>
            <p className="text-sm text-muted mt-2">{c.description}</p>
            {c.admin_notes && <p className="text-[13px] mt-2 pl-3 border-l-2 border-electric">{c.admin_notes}</p>}
            <div className="flex flex-wrap gap-2 mt-3 items-end">
              <Select className="w-36 h-9" value={c.status} onChange={(e) => update(c.id, { status: e.target.value })} aria-label="Status"><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select>
              <Select className="w-32 h-9" value={c.priority} onChange={(e) => update(c.id, { priority: e.target.value })} aria-label="Priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></Select>
              <Textarea className="min-h-9 h-9 flex-1 min-w-48" placeholder="Internal note…" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
              <Button size="sm" variant="outline" disabled={!notes[c.id]} onClick={() => { update(c.id, { adminNotes: notes[c.id] }); setNotes({ ...notes, [c.id]: '' }); }}>Save note</Button>
            </div>
          </Card>
        ))}</div>
      )}
    </>
  );
}
