'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Flag, MessageSquareReply, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';
import { Button, EmptyState, SkeletonList, Textarea } from '@/components/ui';

export function Stars({ value, size = 'size-4', onChange }: { value: number; size?: string; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i)} aria-label={onChange ? `${i} star${i > 1 ? 's' : ''}` : undefined} className={cn(!onChange && 'cursor-default')}>
          <Star className={cn(size, i <= Math.round(value) ? 'fill-warning text-warning' : 'text-surface-3 fill-surface-3')} />
        </button>
      ))}
    </span>
  );
}

export function Reviews({ stationId, rating, count }: { stationId: string; rating: number | null; count: number }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch<any>(`/stations/${stationId}/reviews`);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/stations/${stationId}/reviews`, { rating: stars, comment: text });
      toast('success', 'Thanks for your review');
      setStars(0); setText('');
      reload();
    } catch (e: any) {
      toast('error', 'Could not post review', e.message);
    } finally {
      setSaving(false);
    }
  };
  const total = data?.distribution?.reduce((a: number, d: any) => a + d.n, 0) ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex gap-6 items-center">
        <div className="text-center">
          <div className="text-4xl font-semibold tabular">{rating?.toFixed(1) ?? '—'}</div>
          <Stars value={rating ?? 0} />
          <div className="text-xs text-muted mt-1">{count} review{count === 1 ? '' : 's'}</div>
        </div>
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((r) => {
            const n = data?.distribution?.find((d: any) => d.rating === r)?.n ?? 0;
            return (
              <div key={r} className="flex items-center gap-2 text-xs">
                <span className="w-2 text-muted">{r}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-warning rounded-full" style={{ width: total ? `${(n / total) * 100}%` : 0 }} /></div>
                <span className="w-5 text-right text-muted tabular">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
      {me.user ? (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between"><span className="text-[13px] font-medium">Rate this station</span><Stars value={stars} size="size-5" onChange={setStars} /></div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="How was charging here? Speed, reliability, amenities…" className="min-h-20" maxLength={1500} />
          <div className="flex justify-end"><Button size="sm" disabled={!stars} loading={saving} onClick={submit}>Post review</Button></div>
        </div>
      ) : (
        <p className="text-sm text-muted"><Link href="/login" className="text-accent font-medium">Sign in</Link> to leave a review.</p>
      )}
      {loading ? <SkeletonList rows={2} /> : !data?.reviews.length ? <EmptyState title="No reviews yet" body="Be the first to share your experience." className="py-6" /> : (
        <ul className="space-y-4">
          {data.reviews.map((r: any) => (
            <li key={r.id} className="border-b border-border pb-4 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="font-medium text-sm">{r.author}</span><Stars value={r.rating} size="size-3.5" /></div>
                <span className="text-xs text-subtle">{timeAgo(r.created_at)}</span>
              </div>
              {r.comment && <p className="text-sm text-muted mt-1.5">{r.comment}</p>}
              {r.operator_reply && (
                <div className="mt-2 ml-3 pl-3 border-l-2 border-accent text-[13px]">
                  <div className="flex items-center gap-1 text-xs font-medium text-accent"><MessageSquareReply className="size-3" /> Operator reply</div>
                  <p className="text-muted mt-0.5">{r.operator_reply}</p>
                </div>
              )}
              {me.user && me.user.id !== r.user_id && (
                <button className="mt-1.5 text-[11px] text-subtle hover:text-danger inline-flex items-center gap-1"
                  onClick={async () => { const reason = prompt('Why are you reporting this review?'); if (reason) { await api.post(`/reviews/${r.id}/report`, { reason }); toast('success', 'Review reported', 'Our team will take a look.'); } }}>
                  <Flag className="size-3" /> Report
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
