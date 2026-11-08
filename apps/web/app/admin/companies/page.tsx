'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, Building2, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { dateTime, timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader, Segmented, SkeletonList, Textarea } from '@/components/ui';

const TONE: Record<string, any> = { verified: 'green', pending: 'amber', rejected: 'red', suspended: 'red' };

function Companies() {
  const params = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const { data, error, loading, reload } = useFetch<any>(`/admin/companies${status ? `?status=${status}` : ''}`);
  const [review, setReview] = useState<{ c: any; decision: string; notes: string } | null>(null);
  const decide = async () => {
    if (!review) return;
    try { await api.post(`/admin/companies/${review.c.id}/verify`, { decision: review.decision, notes: review.notes || undefined }); toast('success', `Company ${review.decision}`); setReview(null); reload(true); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <>
      <PageHeader title="Charging companies" subtitle="Verify operators before their stations go live." />
      <Segmented value={status} onChange={setStatus} className="mb-4" options={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }, { value: 'suspended', label: 'Suspended' }]} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonList /> : !data.companies.length ? <EmptyState icon={<Building2 className="size-6" />} title="No companies" /> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {data.companies.map((c: any) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-xl grid place-items-center text-white font-semibold" style={{ background: c.brand_color }}>{c.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{c.name}</span><Badge tone={TONE[c.verification_status]}>{c.verification_status === 'verified' && <BadgeCheck className="size-3" />}{c.verification_status}</Badge>{c.is_demo && <Badge tone="outline">demo</Badge>}</div>
                  <div className="text-xs text-muted">{c.legal_name} · {c.country} · registered {timeAgo(c.created_at)}</div>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-[13px]">
                <dt className="text-muted">Registration no.</dt><dd>{c.registration_number ?? '—'}</dd>
                <dt className="text-muted">Tax ID</dt><dd>{c.tax_id ?? '—'}</dd>
                <dt className="text-muted">Contact</dt><dd className="truncate">{c.email} · {c.phone}</dd>
                <dt className="text-muted">Owner account</dt><dd className="truncate">{c.owner_email ?? '—'}</dd>
                <dt className="text-muted">Stations</dt><dd>{c.stations} ({c.pending_stations} pending)</dd>
                {c.verified_at && <><dt className="text-muted">Verified</dt><dd>{dateTime(c.verified_at)}</dd></>}
              </dl>
              <div className="mt-3 space-y-1">{(c.documents ?? []).map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[13px]"><FileText className="size-3.5 text-muted" />{d.path ? <a href={`/api/uploads/${d.path}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">{d.name}</a> : <span>{d.name}</span>}<span className="text-xs text-muted">{d.kind}</span></div>
              ))}{!c.documents?.length && <p className="text-xs text-warning">No documents uploaded</p>}</div>
              {c.verification_notes && <p className="text-xs text-muted mt-2">Note: {c.verification_notes}</p>}
              <div className="flex flex-wrap gap-2 mt-4">
                {c.verification_status !== 'verified' && <Button size="sm" onClick={() => setReview({ c, decision: 'verified', notes: '' })}><BadgeCheck className="size-4" />Verify</Button>}
                {c.verification_status === 'pending' && <Button size="sm" variant="outline" onClick={() => setReview({ c, decision: 'rejected', notes: '' })}>Reject</Button>}
                {c.verification_status === 'verified' && <Button size="sm" variant="outline" className="text-danger" onClick={() => setReview({ c, decision: 'suspended', notes: '' })}>Suspend</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!review} onClose={() => setReview(null)} title={review ? `${review.decision === 'verified' ? 'Verify' : review.decision === 'rejected' ? 'Reject' : 'Suspend'} ${review.c.name}` : ''}
        footer={<><Button variant="ghost" onClick={() => setReview(null)}>Cancel</Button><Button variant={review?.decision === 'verified' ? 'primary' : 'danger'} onClick={decide}>Confirm</Button></>}>
        <p className="text-sm text-muted mb-3">{review?.decision === 'verified' ? 'Draft stations will be submitted for listing review automatically.' : review?.decision === 'suspended' ? 'All live listings of this company will be hidden from drivers.' : 'The operator will be notified with your note and can re-submit documents.'}</p>
        <Field label="Note to the operator"><Textarea value={review?.notes ?? ''} onChange={(e) => review && setReview({ ...review, notes: e.target.value })} /></Field>
      </Modal>
    </>
  );
}
export default function CompaniesPage() { return <Suspense><Companies /></Suspense>; }
