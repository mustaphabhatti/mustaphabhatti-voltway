'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AlertOctagon, Camera, CheckCircle2, Clock, Hourglass, ImagePlus, MessageCircle, PlugZap, ShieldCheck, Trash2, Users } from 'lucide-react';
import { CHECKIN_OUTCOMES, CHECKIN_PROBLEMS, reliabilityLabel, type CheckinOutcome, type CheckinProblem } from '@wattly/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/format';
import type { Station } from '@/lib/types';
import { Button, EmptyState, Field, Input, Modal, Select, SkeletonList, Textarea } from '@/components/ui';

export function scoreColor(score: number | null) {
  if (score == null) return { bg: 'var(--surface-3)', fg: 'var(--muted)' };
  if (score >= 8.5) return { bg: '#0b8f58', fg: '#fff' };
  if (score >= 7) return { bg: '#0fa968', fg: '#fff' };
  if (score >= 5) return { bg: '#e08a00', fg: '#fff' };
  return { bg: '#e5484d', fg: '#fff' };
}

/** Community reliability score (0–10) derived from driver check-ins. */
export function ReliabilityBadge({ score, checkins, size = 'sm', showLabel }: { score: number | null; checkins?: number; size?: 'sm' | 'lg'; showLabel?: boolean }) {
  const c = scoreColor(score);
  return (
    <span className="inline-flex items-center gap-2" title={`Reliability ${score ?? '—'}/10 · ${reliabilityLabel(score)}${checkins != null ? ` · ${checkins} check-ins in the last year` : ''}`}>
      <span className={cn('inline-grid place-items-center font-bold tabular rounded-lg', size === 'lg' ? 'h-11 min-w-11 px-2 text-lg' : 'h-6 min-w-7 px-1.5 text-[12px]')} style={{ background: c.bg, color: c.fg }}>
        {score == null ? '–' : score.toFixed(1)}
      </span>
      {showLabel && <span className="leading-tight"><span className="block text-sm font-semibold">{reliabilityLabel(score)}</span>{checkins != null && <span className="block text-xs text-muted">{checkins} driver check-in{checkins === 1 ? '' : 's'} (12 months)</span>}</span>}
    </span>
  );
}

export const OUTCOME_STYLE: Record<CheckinOutcome, { icon: any; cls: string }> = {
  charged: { icon: CheckCircle2, cls: 'text-accent bg-accent-soft' },
  charging_now: { icon: PlugZap, cls: 'text-electric bg-electric-soft' },
  waiting: { icon: Hourglass, cls: 'text-warning bg-warning-soft' },
  could_not_charge: { icon: AlertOctagon, cls: 'text-danger bg-danger-soft' },
  comment: { icon: MessageCircle, cls: 'text-muted bg-surface-2' },
};

export function CheckinModal({ open, onClose, station, onDone }: { open: boolean; onClose: () => void; station: Station; onDone: () => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<CheckinOutcome>('charged');
  const [portId, setPortId] = useState('');
  const [problem, setProblem] = useState<CheckinProblem>('broken');
  const [kw, setKw] = useState('');
  const [duration, setDuration] = useState('');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/stations/${station.id}/checkins`, {
        outcome, portId: portId || null, problem: outcome === 'could_not_charge' ? problem : null,
        kwObserved: kw ? Number(kw) : null, durationMin: duration ? Number(duration) : null, comment,
      });
      if (photo) {
        const fd = new FormData();
        fd.append('checkinId', r.checkin.id);
        fd.append('file', photo);
        await api.post(`/stations/${station.id}/photos`, fd).catch(() => toast('error', 'Photo upload failed'));
      }
      toast('success', 'Thanks for checking in!', r.statusUpdated ? 'Port status updated for other drivers (shown as a driver report).' : 'Your check-in helps other drivers.');
      setComment(''); setKw(''); setDuration(''); setPhoto(null);
      onDone(); onClose();
    } catch (e: any) {
      toast('error', 'Could not check in', e.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Check in at ${station.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Post check-in</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CHECKIN_OUTCOMES) as CheckinOutcome[]).map((o) => {
            const S = OUTCOME_STYLE[o];
            return (
              <button key={o} type="button" onClick={() => setOutcome(o)} className={cn('flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-medium transition', outcome === o ? 'border-accent ring-4 ring-[var(--ring)]' : 'border-border hover:bg-surface-2', o === 'comment' && 'col-span-2')}>
                <span className={cn('size-7 rounded-lg grid place-items-center', S.cls)}><S.icon className="size-4" /></span>{CHECKIN_OUTCOMES[o]}
              </button>
            );
          })}
        </div>
        {outcome === 'could_not_charge' && (
          <Field label="What went wrong?"><Select value={problem} onChange={(e) => setProblem(e.target.value as CheckinProblem)}>{(Object.keys(CHECKIN_PROBLEMS) as CheckinProblem[]).map((p) => <option key={p} value={p}>{CHECKIN_PROBLEMS[p]}</option>)}</Select></Field>
        )}
        {outcome !== 'comment' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Port (optional)" className="col-span-3 sm:col-span-1"><Select value={portId} onChange={(e) => setPortId(e.target.value)}><option value="">Not sure</option>{station.ports.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.connectorType}</option>)}</Select></Field>
            {(outcome === 'charged' || outcome === 'charging_now') && <Field label="Max kW seen"><Input type="number" min={1} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="e.g. 95" /></Field>}
            {(outcome === 'charged' || outcome === 'charging_now') && <Field label={outcome === 'charging_now' ? 'Minutes left' : 'Minutes'}><Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 30" /></Field>}
          </div>
        )}
        {outcome === 'charging_now' && <p className="text-xs text-muted">Other drivers see the port as occupied (driver report) until your time is up. Stations with a live feed keep their live status.</p>}
        <Field label={outcome === 'comment' ? 'Comment' : 'Comment (optional)'}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tips for other drivers: access, parking, speed, nearby food…" maxLength={1000} /></Field>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Camera className="size-4" />{photo ? 'Change photo' : 'Add a photo'}</Button>
          {photo && <span className="text-xs text-muted truncate">{photo.name}</span>}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </div>
      </div>
    </Modal>
  );
}

export function CommunitySection({ station, onChanged }: { station: Station; onChanged?: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch<any>(`/stations/${station.id}/checkins`);
  const [open, setOpen] = useState(false);
  const r = station.reliability;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <ReliabilityBadge score={r.score} checkins={r.checkins} size="lg" showLabel />
        {me.user ? <Button onClick={() => setOpen(true)}><ShieldCheck className="size-4" /> Check in</Button> : <Link href={`/login?next=/stations/${station.id}`}><Button variant="outline">Sign in to check in</Button></Link>}
      </div>
      {data?.stats && data.stats.total > 0 && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <Tile n={data.stats.ok} label="successful" cls="text-accent" />
          <Tile n={data.stats.fail} label="couldn't charge" cls="text-danger" />
          <Tile n={data.stats.waiting} label="had to wait" cls="text-warning" />
          <Tile n={data.stats.avg_kw ? `${data.stats.avg_kw}` : '—'} label="avg kW reported" cls="" />
        </div>
      )}
      {r.lastSuccessAt && <p className="text-[13px] text-muted flex items-center gap-1.5"><Clock className="size-3.5" />Last successful charge reported {timeAgo(r.lastSuccessAt)}</p>}
      {loading ? <SkeletonList rows={2} /> : !data?.checkins.length ? (
        <EmptyState icon={<Users className="size-6" />} title="No check-ins yet" body="Be the first to tell other drivers how charging went here." className="py-6" />
      ) : (
        <ul className="space-y-3">
          {data.checkins.slice(0, 20).map((c: any) => {
            const S = OUTCOME_STYLE[c.outcome as CheckinOutcome];
            return (
              <li key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                <span className={cn('size-9 shrink-0 rounded-xl grid place-items-center', S.cls)}><S.icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-medium">{CHECKIN_OUTCOMES[c.outcome as CheckinOutcome]}{c.problem && <span className="text-danger font-normal"> · {CHECKIN_PROBLEMS[c.problem as CheckinProblem]}</span>}</span>
                    <span className="text-xs text-subtle">{timeAgo(c.created_at)}</span>
                  </div>
                  <div className="text-xs text-muted">{c.author}{c.user_checkins > 1 ? ` · ${c.user_checkins} check-ins` : ''}{c.vehicle_label ? ` · ${c.vehicle_label}` : ''}{c.port_label ? ` · ${c.port_label}` : ''}{c.kw_observed ? ` · ${c.kw_observed} kW` : ''}{c.duration_min ? ` · ${c.duration_min} min` : ''}</div>
                  {c.comment && <p className="text-sm mt-1">{c.comment}</p>}
                  {c.photo_url && <img src={c.photo_url} alt="Check-in photo" className="mt-2 h-28 rounded-lg object-cover" />}
                  {me.user && (me.user.id === c.user_id || me.user.role === 'admin') && (
                    <button className="text-[11px] text-subtle hover:text-danger mt-1 inline-flex items-center gap-1" onClick={async () => { await api.del(`/checkins/${c.id}`); toast('success', 'Check-in removed'); reload(true); onChanged?.(); }}><Trash2 className="size-3" />Delete</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <CheckinModal open={open} onClose={() => setOpen(false)} station={station} onDone={() => { reload(true); onChanged?.(); }} />
    </div>
  );
}

function Tile({ n, label, cls }: { n: number | string; label: string; cls: string }) {
  return <div className="rounded-xl bg-surface-2 p-2"><div className={cn('text-lg font-semibold tabular', cls)}>{n}</div><div className="text-[11px] text-muted leading-tight">{label}</div></div>;
}

export function PhotoGallery({ station }: { station: Station }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch<any>(`/stations/${station.id}/photos`);
  const ref = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<string | null>(null);
  const all = [...station.images.map((url) => ({ id: url, url, author: station.operator.name, caption: '' })), ...(data?.photos ?? [])];
  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try { await api.post(`/stations/${station.id}/photos`, fd); toast('success', 'Photo added'); reload(true); } catch (e: any) { toast('error', 'Upload failed', e.message); }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted">{all.length} photo{all.length === 1 ? '' : 's'} from the operator and drivers</span>
        {me.user && <Button size="sm" variant="outline" onClick={() => ref.current?.click()}><ImagePlus className="size-4" />Add photo</Button>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {all.length === 0 ? <p className="text-sm text-muted">No photos yet. Photos of the entrance and chargers help drivers find the bays.</p> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {all.slice(0, 12).map((p: any) => (
            <button key={p.id} onClick={() => setView(p.url)} className="aspect-square rounded-lg overflow-hidden bg-surface-2"><img src={p.url} alt={p.caption || 'Station photo'} className="w-full h-full object-cover hover:scale-105 transition" /></button>
          ))}
        </div>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title="Photo" wide>{view && <img src={view} alt="" className="w-full rounded-xl" />}</Modal>
    </div>
  );
}
