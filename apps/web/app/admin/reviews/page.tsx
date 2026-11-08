'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonList } from '@/components/ui';
import { Stars } from '@/components/station/Reviews';

function Moderation() {
  const params = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState(params.get('status') ?? 'flagged');
  const { data, error, loading, reload } = useFetch<any>(`/admin/reviews${status ? `?status=${status}` : ''}`);
  const moderate = async (id: string, st: 'visible' | 'hidden') => { await api.post(`/admin/reviews/${id}/moderate`, { status: st }); toast('success', st === 'hidden' ? 'Review hidden' : 'Review restored'); reload(true); };
  return (
    <>
      <PageHeader title="Review moderation" subtitle="Reviews reported by 3+ drivers are flagged automatically." />
      <Segmented value={status} onChange={setStatus} className="mb-4" options={[{ value: 'flagged', label: 'Flagged' }, { value: 'hidden', label: 'Hidden' }, { value: 'visible', label: 'Visible' }, { value: '', label: 'All' }]} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.reviews.length ? <EmptyState title="No reviews here" /> : (
        <div className="space-y-3">{data.reviews.map((r: any) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap justify-between gap-2"><div className="flex items-center gap-2"><Stars value={r.rating} size="size-3.5" /><span className="font-medium text-sm">{r.station_name}</span><Badge tone={r.status === 'flagged' ? 'red' : r.status === 'hidden' ? 'neutral' : 'green'}>{r.status}</Badge></div><span className="text-xs text-muted">{r.author} ({r.author_email}) · {timeAgo(r.created_at)}</span></div>
            <p className="text-sm mt-2">{r.comment}</p>
            {r.reports?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{r.reports.map((p: any, i: number) => <Badge key={i} tone="amber">Reported: {p.reason}</Badge>)}</div>}
            <div className="flex gap-2 mt-3">
              {r.status !== 'hidden' && <Button size="sm" variant="outline" onClick={() => moderate(r.id, 'hidden')}><EyeOff className="size-4" />Hide</Button>}
              {r.status !== 'visible' && <Button size="sm" variant="ghost" onClick={() => moderate(r.id, 'visible')}><Eye className="size-4" />Keep visible</Button>}
            </div>
          </Card>
        ))}</div>
      )}
    </>
  );
}
export default function ReviewsPage() { return <Suspense><Moderation /></Suspense>; }
