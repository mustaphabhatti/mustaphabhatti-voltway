'use client';
import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonList, Textarea } from '@/components/ui';
import { Stars } from '@/components/station/Reviews';

export default function OperatorReviews() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<any>('/operator/reviews');
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'low'>('all');
  const [reply, setReply] = useState<Record<string, string>>({});
  const list = (data?.reviews ?? []).filter((r: any) => filter === 'all' || (filter === 'unanswered' ? !r.operator_reply : r.rating <= 2));
  const avg = data?.reviews.length ? data.reviews.reduce((a: number, r: any) => a + r.rating, 0) / data.reviews.length : 0;
  return (
    <>
      <PageHeader title="Reviews" subtitle={data ? `${data.reviews.length} reviews · average ${avg.toFixed(2)} ★` : undefined} />
      <Segmented value={filter} onChange={setFilter} className="mb-4" options={[{ value: 'all', label: 'All' }, { value: 'unanswered', label: 'Needs reply' }, { value: 'low', label: '1–2 stars' }]} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !list.length ? <EmptyState icon={<MessageSquare className="size-6" />} title="Nothing here" /> : (
        <div className="space-y-3">
          {list.map((r: any) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2"><Stars value={r.rating} size="size-3.5" /><span className="font-medium text-sm">{r.station_name}</span>{r.status !== 'visible' && <Badge tone="amber">{r.status}</Badge>}</div>
                <span className="text-xs text-muted">{r.author} · {timeAgo(r.created_at)}</span>
              </div>
              <p className="text-sm mt-2">{r.comment || <span className="text-muted">No comment</span>}</p>
              {r.operator_reply ? <div className="mt-3 pl-3 border-l-2 border-accent text-[13px]"><div className="text-xs font-medium text-accent">Your reply · {timeAgo(r.operator_replied_at)}</div><p className="text-muted">{r.operator_reply}</p></div> : (
                <div className="mt-3 flex gap-2 items-end">
                  <Textarea className="min-h-16" placeholder="Reply publicly…" value={reply[r.id] ?? ''} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} />
                  <Button size="sm" disabled={(reply[r.id] ?? '').length < 2} onClick={async () => { try { await api.post(`/operator/reviews/${r.id}/reply`, { reply: reply[r.id] }); toast('success', 'Reply posted'); reload(true); } catch (e: any) { toast('error', e.message); } }}>Reply</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
